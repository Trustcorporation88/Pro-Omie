"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, hashSenha } from "@/lib/auth/sessao";
import { exigirAdmin, exigirAdminDoGrupo, exigirMatrizAdministrada, type ContextoAdmin } from "@/lib/auth/empresa";
import { hojeDate } from "@/lib/datas";
import { criarDadosPadrao } from "@/modules/setup/dados-padrao";
import { ROTULO_PAPEL } from "@/lib/auth/permissoes";
import { auditar } from "@/lib/auditoria";
import { configuracaoEmail } from "@/modules/email/provedor";
import { enfileirar } from "@/modules/email/fila";
import { modeloSenhaProvisoria } from "@/modules/email/modelos";
import { urlBase } from "@/modules/email/acoes";
import { fmtDocumento } from "@/lib/format";
import { esquemaEdicaoUsuario, esquemaEmpresa, esquemaNovoUsuario } from "./esquemas";
import { gerarSenhaProvisoria } from "./senha";
import { imagemSaiNoPdf, lerImagemLogo } from "./logotipo";
import { LIMITE_CERTIFICADO_BYTES, abrirCertificadoGuardado, cifrarCertificado, conferirComEmpresa, lerCertificado } from "./certificado";
import { diaSP, situacaoCertificado } from "./certificado-tipos";
import type { TipoEmpresa } from "./tipos";

// Regras desta tela (todas as ações exigem "config:admin"):
//  • senhas provisórias (e hashes) NUNCA vão para a auditoria nem para logs;
//  • o usuário não inativa a si mesmo nem altera o próprio papel ou o próprio acesso;
//  • administrador do grupo (todas as empresas) faz tudo; administrador de empresa só mexe nas empresas dele,
//    nas filiais delas e nos usuários restritos a elas, e só libera acesso a essas empresas;
//  • sempre sobra ao menos um administrador do grupo ativo (verificado dentro de transação serializável).

function revalidar(...caminhos: string[]) {
  for (const c of caminhos) revalidatePath(c);
  revalidatePath("/configuracoes/auditoria");
}

/**
 * Executa uma gravação sem deixar a mensagem original do Prisma subir: ela pode conter os dados gravados
 * (inclusive o hash da senha) e `executar` a escreveria no log. Erros de negócio passam intactos.
 */
async function gravar<T>(fn: () => Promise<T>, aoDuplicar?: ErroAcao): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErroAcao) throw e;
    const codigo = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined;
    if (codigo === "P2002" && aoDuplicar) throw aoDuplicar;
    if (codigo === "P2025") throw new ErroAcao("Registro não encontrado.");
    console.error("[configuracoes] falha ao gravar", { erro: e instanceof Error ? e.name : typeof e, codigo });
    throw new ErroAcao("Não foi possível salvar. Tente novamente em instantes.");
  }
}

/** Transação serializável: duas alterações simultâneas não conseguem, juntas, deixar o sistema sem administrador. */
async function emTransacao<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      throw new ErroAcao("Outra alteração foi feita ao mesmo tempo. Tente novamente.");
    }
    throw e;
  }
}

const ERRO_CNPJ_DUPLICADO = () =>
  new ErroAcao("Já existe uma empresa cadastrada com este CNPJ.", { cnpj: "CNPJ já cadastrado." });

async function garantirCnpjDisponivel(cnpj: string, ignorarId?: string) {
  const existente = await prisma.empresa.findFirst({
    where: { cnpj, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { id: true },
  });
  if (existente) throw ERRO_CNPJ_DUPLICADO();
}

/** O grupo nunca fica sem administrador do grupo (papel ADMIN com todas as empresas) ativo. */
async function exigirOutroAdminDoGrupo(tx: Prisma.TransactionClient, id: string) {
  const outros = await tx.usuario.count({ where: { papel: "ADMIN", todasEmpresas: true, ativo: true, id: { not: id } } });
  if (outros < 1) {
    throw new ErroAcao(
      "O grupo precisa de pelo menos um administrador do grupo ativo (administrador com todas as empresas). Promova outro usuário antes de continuar.",
    );
  }
}

const ehAdminDoGrupo = (u: { papel: string; todasEmpresas: boolean }) => u.papel === "ADMIN" && u.todasEmpresas;

/** Empresa do evento de auditoria de um usuário: a única empresa dele, ou nulo (evento do grupo). */
const empresaDoUsuario = (a: { todasEmpresas: boolean; empresas: string[] }) =>
  !a.todasEmpresas && a.empresas.length === 1 ? a.empresas[0] : null;

/** O administrador gerencia este usuário? Grupo: todos. Empresa: só quem tem acesso restrito às empresas dele. */
function administraUsuario(ctx: ContextoAdmin, alvo: { todasEmpresas: boolean; empresas: string[] }) {
  if (ctx.adminDoGrupo) return true;
  return !alvo.todasEmpresas && alvo.empresas.length > 0 && alvo.empresas.every((e) => ctx.matrizes.includes(e));
}

// ───────────── Empresa e filiais ─────────────

/**
 * Salva uma empresa do grupo (matriz) ou uma filial.
 * - `id` informado: edita (matriz ou filial), se a empresa estiver entre as administradas.
 * - sem `id` e tipo "filial": cria uma filial vinculada à matriz `matrizId` (administrada).
 * - sem `id` e tipo "matriz": nova empresa do grupo (só o administrador do grupo). Nasce com o plano padrão
 *   (categorias, centros de custo, formas e condições de pagamento) e a conta Caixa.
 */
export async function salvarEmpresa(
  id: string | null,
  tipo: TipoEmpresa,
  valores: Record<string, unknown>,
  matrizId?: string | null,
): Promise<Resultado<{ id: string }>> {
  const mensagem =
    tipo === "filial"
      ? id
        ? "Filial atualizada."
        : "Filial criada."
      : id
        ? "Dados da empresa atualizados."
        : "Empresa cadastrada com o plano de contas padrão. Ela já aparece no seletor do menu.";

  return executar(async () => {
    const { ctx } = await exigirAdmin();
    if (tipo !== "matriz" && tipo !== "filial") throw new ErroAcao("Tipo de empresa inválido.");
    const dados = esquemaEmpresa.parse(valores);
    const nome = dados.nomeFantasia || dados.razaoSocial;

    if (id) {
      const atual = await prisma.empresa.findUnique({ where: { id } });
      if (!atual) throw new ErroAcao("Empresa não encontrada.");
      const matrizDoRegistro = atual.matrizId ?? atual.id;
      exigirMatrizAdministrada(ctx, matrizDoRegistro);
      await garantirCnpjDisponivel(dados.cnpj, id);
      const salva = await gravar(() => prisma.empresa.update({ where: { id }, data: dados }), ERRO_CNPJ_DUPLICADO());
      const antes = Object.fromEntries(Object.keys(dados).map((k) => [k, atual[k as keyof typeof atual]]));
      await auditar(
        "atualizar",
        "empresa",
        id,
        `${atual.matrizId ? "Filial" : "Empresa"} ${nome} (${fmtDocumento(dados.cnpj)})`,
        { antes, depois: dados },
        { empresaId: matrizDoRegistro },
      );
      revalidar("/configuracoes/empresa", "/");
      return { id: salva.id };
    }

    await garantirCnpjDisponivel(dados.cnpj);
    if (tipo === "filial") {
      const matriz = matrizId ? await prisma.empresa.findFirst({ where: { id: matrizId, matrizId: null }, select: { id: true } }) : null;
      if (!matriz) throw new ErroAcao("Escolha a empresa (matriz) à qual a filial pertence.");
      exigirMatrizAdministrada(ctx, matriz.id, "Você só cria filiais das empresas que administra.");
      const criada = await gravar(() => prisma.empresa.create({ data: { ...dados, matrizId: matriz.id } }), ERRO_CNPJ_DUPLICADO());
      await auditar(
        "criar",
        "empresa",
        criada.id,
        `Filial ${nome} (${fmtDocumento(dados.cnpj)})`,
        { ...dados, matrizId: matriz.id },
        { empresaId: matriz.id },
      );
      revalidar("/configuracoes/empresa", "/");
      return { id: criada.id };
    }

    exigirAdminDoGrupo(ctx, "Só o administrador do grupo cadastra novas empresas.");
    const criada = await gravar(
      () =>
        prisma.$transaction(async (tx) => {
          const e = await tx.empresa.create({ data: { ...dados, matrizId: null } });
          await criarDadosPadrao(tx, e.id, hojeDate());
          return e;
        }),
      ERRO_CNPJ_DUPLICADO(),
    );
    await auditar(
      "criar",
      "empresa",
      criada.id,
      `Empresa ${nome} (${fmtDocumento(dados.cnpj)})`,
      { ...dados, matrizId: null },
      { empresaId: criada.id },
    );
    revalidar("/configuracoes/empresa", "/");
    return { id: criada.id };
  }, mensagem);
}

/**
 * Ativa ou inativa uma empresa ou filial (idempotente).
 * Empresa inativa some do seletor do menu e das seleções, mas o histórico fica. Inativar ou reativar empresa do grupo
 * é com o administrador do grupo (e nunca a última ativa); filiais, com quem administra a matriz.
 */
/** Empresa (matriz) administrada pelo usuário, para mexer no logotipo. Filial usa o logotipo da matriz. */
async function matrizParaLogotipo(ctx: ContextoAdmin, empresaId: string) {
  const empresa = await prisma.empresa.findUnique({
    where: { id: typeof empresaId === "string" ? empresaId : "" },
    select: { id: true, matrizId: true, razaoSocial: true, nomeFantasia: true },
  });
  if (!empresa) throw new ErroAcao("Empresa não encontrada.");
  exigirMatrizAdministrada(ctx, empresa.matrizId ?? empresa.id);
  if (empresa.matrizId) throw new ErroAcao("O logotipo fica na empresa (matriz) e vale também para as filiais.");
  return empresa;
}

/**
 * Grava o logotipo da empresa (data URL PNG ou JPEG, já tratado no navegador).
 * Antes de gravar, gera um PDF de teste com a imagem: o que entra aqui sai nos PDFs.
 */
export async function salvarLogoEmpresa(empresaId: string, dataUrl: string): Promise<Resultado<{ largura: number; altura: number }>> {
  return executar(async () => {
    const { u, ctx } = await exigirAdmin();
    const empresa = await matrizParaLogotipo(ctx, empresaId);
    const img = lerImagemLogo(dataUrl);
    if (!(await imagemSaiNoPdf(img))) throw new ErroAcao("Não foi possível ler a imagem. Exporte o logotipo em PNG e tente de novo.");
    const dados = { imagem: new Uint8Array(img.dados), formato: img.formato, largura: img.largura, altura: img.altura, atualizadoPorId: u.id };
    await prisma.logoEmpresa.upsert({ where: { empresaId: empresa.id }, create: { empresaId: empresa.id, ...dados }, update: dados });
    const kb = Math.max(1, Math.round(img.dados.length / 1024));
    await auditar(
      "logotipo",
      "empresa",
      empresa.id,
      `Logotipo de ${empresa.nomeFantasia || empresa.razaoSocial} (${img.formato.toUpperCase()}, ${img.largura} × ${img.altura} px, ${kb} KB)`,
      { formato: img.formato, largura: img.largura, altura: img.altura, bytes: img.dados.length },
      { empresaId: empresa.id },
    );
    revalidar("/configuracoes/empresa");
    return { largura: img.largura, altura: img.altura };
  }, "Logotipo salvo. Ele já sai nas propostas e pedidos em PDF.");
}

export async function removerLogoEmpresa(empresaId: string): Promise<Resultado> {
  return executar(async () => {
    const { ctx } = await exigirAdmin();
    const empresa = await matrizParaLogotipo(ctx, empresaId);
    const r = await prisma.logoEmpresa.deleteMany({ where: { empresaId: empresa.id } });
    if (!r.count) throw new ErroAcao("Esta empresa não tem logotipo.");
    await auditar("remover_logotipo", "empresa", empresa.id, `Logotipo removido: ${empresa.nomeFantasia || empresa.razaoSocial}`, undefined, {
      empresaId: empresa.id,
    });
    revalidar("/configuracoes/empresa");
    return undefined;
  }, "Logotipo removido. Os PDFs voltam a sair só com o nome da empresa.");
}

// ───────────── Certificado digital ─────────────

/** Estabelecimento (matriz ou filial) que o usuário administra. */
async function estabelecimentoAdministrado(ctx: ContextoAdmin, empresaId: unknown) {
  const empresa = await prisma.empresa.findUnique({
    where: { id: typeof empresaId === "string" ? empresaId : "" },
    select: { id: true, matrizId: true, cnpj: true, razaoSocial: true, nomeFantasia: true },
  });
  if (!empresa) throw new ErroAcao("Empresa não encontrada.");
  exigirMatrizAdministrada(ctx, empresa.matrizId ?? empresa.id);
  return empresa;
}

/**
 * Recebe o certificado A1 (.pfx ou .p12) e a senha: confere a senha, a validade e o CNPJ (mesma empresa) e guarda
 * os dois cifrados. A senha nunca é gravada aberta, nunca vai para a auditoria e nunca volta para a tela.
 */
export async function enviarCertificado(
  formData: FormData,
): Promise<Resultado<{ titular: string; cnpj: string | null; validoAte: string; outroEstabelecimento: boolean }>> {
  const r = await executar(async () => {
    const { u, ctx } = await exigirAdmin();
    const empresa = await estabelecimentoAdministrado(ctx, formData.get("empresaId"));
    const arquivo = formData.get("arquivo");
    const senha = formData.get("senha");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroAcao("Escolha o arquivo do certificado (.pfx ou .p12).", { arquivo: "Escolha o arquivo." });
    if (!/\.(pfx|p12)$/i.test(arquivo.name)) throw new ErroAcao("Envie o arquivo .pfx ou .p12 do certificado A1.", { arquivo: "Use .pfx ou .p12." });
    if (arquivo.size > LIMITE_CERTIFICADO_BYTES) throw new ErroAcao("Arquivo grande demais para um certificado A1 (máximo 100 KB).", { arquivo: "Arquivo grande demais." });
    if (typeof senha !== "string" || !senha) throw new ErroAcao("Informe a senha do certificado.", { senha: "Informe a senha." });
    if (senha.length > 200) throw new ErroAcao("Senha longa demais.", { senha: "Senha longa demais." });
    const pfx = Buffer.from(await arquivo.arrayBuffer());
    const dados = lerCertificado(pfx, senha);
    const { outroEstabelecimento } = conferirComEmpresa(dados, empresa);
    const registro = {
      ...cifrarCertificado(empresa.id, pfx, senha),
      titular: dados.titular.slice(0, 300),
      cnpj: dados.cnpj,
      emissor: dados.emissor?.slice(0, 300) ?? null,
      numeroSerie: dados.numeroSerie.slice(0, 100),
      impressaoDigital: dados.impressaoDigital,
      validoDe: dados.validoDe,
      validoAte: dados.validoAte,
      enviadoPorId: u.id,
    };
    const anterior = await prisma.certificadoDigital.findUnique({ where: { empresaId: empresa.id }, select: { impressaoDigital: true, validoAte: true } });
    await prisma.certificadoDigital.upsert({ where: { empresaId: empresa.id }, create: { empresaId: empresa.id, ...registro }, update: registro });
    const nome = empresa.nomeFantasia || empresa.razaoSocial;
    await auditar(
      anterior ? "trocar_certificado" : "enviar_certificado",
      "empresa",
      empresa.id,
      `Certificado A1 de ${nome}: ${dados.titular}${dados.cnpj ? ` (CNPJ ${fmtDocumento(dados.cnpj)})` : ""}, válido até ${diaSP(dados.validoAte)}`,
      {
        titular: dados.titular,
        cnpj: dados.cnpj,
        emissor: dados.emissor,
        numeroSerie: dados.numeroSerie,
        impressaoDigital: dados.impressaoDigital,
        validoAte: dados.validoAte.toISOString(),
        anterior: anterior ? { impressaoDigital: anterior.impressaoDigital, validoAte: anterior.validoAte.toISOString() } : null,
      },
      { empresaId: empresa.matrizId ?? empresa.id },
    );
    revalidar("/configuracoes/empresa", "/");
    return { titular: dados.titular, cnpj: dados.cnpj, validoAte: dados.validoAte.toISOString(), outroEstabelecimento };
  });
  if (r.ok && r.data) {
    const sit = situacaoCertificado(r.data.validoAte);
    const avisos = [
      r.data.outroEstabelecimento ? "é de outro estabelecimento da mesma empresa (a SEFAZ aceita)" : null,
      sit.tom === "alerta" ? `vence em ${sit.dias} dia(s): providencie a renovação` : null,
    ].filter(Boolean);
    r.mensagem = `Certificado guardado com segurança, válido até ${diaSP(r.data.validoAte)}.${avisos.length ? ` Atenção: ${avisos.join("; ")}.` : ""}`;
  }
  return r;
}

/** Abre o certificado guardado e confere de novo a senha: mostra que está pronto para emitir notas. */
export async function testarCertificado(empresaId: string): Promise<Resultado<{ validoAte: string; dias: number }>> {
  const r = await executar(async () => {
    const { ctx } = await exigirAdmin();
    const empresa = await estabelecimentoAdministrado(ctx, empresaId);
    const guardado = await abrirCertificadoGuardado(empresa.id);
    if (!guardado) throw new ErroAcao("Este estabelecimento não tem certificado próprio.");
    const dados = lerCertificado(guardado.pfx, guardado.senha);
    if (dados.impressaoDigital !== guardado.registro.impressaoDigital) throw new ErroAcao("O certificado guardado não confere com o registro. Envie o certificado de novo.");
    conferirComEmpresa(dados, empresa);
    return { validoAte: dados.validoAte.toISOString(), dias: situacaoCertificado(dados.validoAte).dias };
  });
  if (r.ok && r.data) r.mensagem = `Certificado OK: a senha confere e ele vale até ${diaSP(r.data.validoAte)} (${r.data.dias} dias).`;
  return r;
}

export async function removerCertificado(empresaId: string): Promise<Resultado> {
  return executar(async () => {
    const { ctx } = await exigirAdmin();
    const empresa = await estabelecimentoAdministrado(ctx, empresaId);
    const atual = await prisma.certificadoDigital.findUnique({ where: { empresaId: empresa.id }, select: { titular: true, impressaoDigital: true, validoAte: true } });
    if (!atual) throw new ErroAcao("Este estabelecimento não tem certificado.");
    await prisma.certificadoDigital.delete({ where: { empresaId: empresa.id } });
    await auditar(
      "remover_certificado",
      "empresa",
      empresa.id,
      `Certificado A1 removido: ${empresa.nomeFantasia || empresa.razaoSocial} (${atual.titular})`,
      { impressaoDigital: atual.impressaoDigital, validoAte: atual.validoAte.toISOString() },
      { empresaId: empresa.matrizId ?? empresa.id },
    );
    revalidar("/configuracoes/empresa", "/");
    return undefined;
  }, "Certificado removido.");
}

export async function definirAtivoFilial(id: string, ativo: boolean): Promise<Resultado> {
  const previo = await prisma.empresa.findUnique({ where: { id }, select: { matrizId: true } });
  const rotulo = previo?.matrizId ? "Filial" : "Empresa";
  return executar(async () => {
    const { ctx } = await exigirAdmin();
    const atual = await prisma.empresa.findUnique({
      where: { id },
      select: { id: true, matrizId: true, ativo: true, razaoSocial: true, nomeFantasia: true },
    });
    if (!atual) throw new ErroAcao("Empresa não encontrada.");
    if (atual.matrizId) exigirMatrizAdministrada(ctx, atual.matrizId, "Empresa não encontrada.");
    else exigirAdminDoGrupo(ctx, "Só o administrador do grupo inativa ou reativa empresas.");
    if (atual.ativo === ativo) return undefined;
    if (!ativo && !atual.matrizId) {
      const ativas = await prisma.empresa.count({ where: { matrizId: null, ativo: true } });
      if (ativas <= 1) throw new ErroAcao("Esta é a única empresa ativa. Cadastre ou reative outra antes de inativá-la.");
    }
    await gravar(() => prisma.empresa.update({ where: { id }, data: { ativo } }));
    await auditar(
      ativo ? "ativar" : "inativar",
      "empresa",
      id,
      `${rotulo} ${atual.nomeFantasia || atual.razaoSocial}`,
      { antes: { ativo: atual.ativo }, depois: { ativo } },
      { empresaId: atual.matrizId ?? atual.id },
    );
    revalidar("/configuracoes/empresa", "/");
    return undefined;
  }, ativo ? `${rotulo} reativada.` : `${rotulo} inativada.`);
}

// ───────────── Usuários ─────────────

/**
 * Normaliza e confere o acesso por empresa:
 * - "todas as empresas" só o administrador do grupo libera;
 * - a lista aceita só matrizes existentes e, para administrador de empresa, só as que ele administra;
 * - quem não tem "todas" precisa de ao menos uma empresa.
 */
async function acessoEmpresasValido(
  tx: Prisma.TransactionClient | typeof prisma,
  d: { todasEmpresas: boolean; empresas: string[] },
  ctx: ContextoAdmin,
): Promise<{ todasEmpresas: boolean; empresas: string[] }> {
  if (d.todasEmpresas) {
    exigirAdminDoGrupo(ctx, "Só o administrador do grupo libera todas as empresas.");
    return { todasEmpresas: true, empresas: [] };
  }
  const ids = [...new Set(d.empresas)];
  if (!ids.length) throw new ErroAcao("Libere ao menos uma empresa ou marque “todas as empresas”.", { empresas: "Libere ao menos uma empresa." });
  const existentes = await tx.empresa.findMany({ where: { id: { in: ids }, matrizId: null }, select: { id: true } });
  if (existentes.length !== ids.length) throw new ErroAcao("Empresa não encontrada. Recarregue a página.", { empresas: "Empresa não encontrada." });
  if (!ctx.adminDoGrupo && ids.some((e) => !ctx.matrizes.includes(e))) {
    throw new ErroAcao("Você só pode liberar as empresas que administra.", { empresas: "Empresa fora das que você administra." });
  }
  return { todasEmpresas: false, empresas: ids };
}

/** Usuário que o administrador gerencia (fora dele, responde como se não existisse). */
async function usuarioAdministrado(tx: Prisma.TransactionClient | typeof prisma, ctx: ContextoAdmin, id: string) {
  const alvo = await tx.usuario.findUnique({
    where: { id },
    select: { id: true, nome: true, email: true, papel: true, ativo: true, todasEmpresas: true, empresas: true },
  });
  if (!alvo || !administraUsuario(ctx, alvo)) throw new ErroAcao("Usuário não encontrado.");
  return alvo;
}

/** Cria o usuário com senha provisória aleatória (hash no banco, trocarSenha = true). A senha só volta nesta resposta. */
/** Manda a senha provisória por e-mail quando o envio está configurado (o administrador também vê a senha na tela). */
async function enviarSenhaProvisoria(p: { nome: string; email: string; senha: string }, empresaId: string | null | undefined): Promise<boolean> {
  if (!configuracaoEmail().configurado) return false;
  const emp = empresaId ? await prisma.empresa.findUnique({ where: { id: empresaId }, select: { razaoSocial: true, nomeFantasia: true } }) : null;
  const e = await enfileirar({ empresaId: empresaId ?? null, tipo: "senha_provisoria", origemId: p.email, para: [p.email], ...modeloSenhaProvisoria({ nome: p.nome, email: p.email, senha: p.senha, url: `${await urlBase()}/login`, empresa: emp?.nomeFantasia || emp?.razaoSocial || "Pro Omie" }) });
  return e.status === "ENVIADO";
}

export async function criarUsuario(
  valores: Record<string, unknown>,
): Promise<Resultado<{ id: string; nome: string; email: string; senhaProvisoria: string; emailEnviado: boolean }>> {
  return executar(async () => {
    const { ctx } = await exigirAdmin();
    const d = esquemaNovoUsuario.parse(valores);
    const erroDuplicado = () => new ErroAcao("Já existe um usuário com este e-mail.", { email: "E-mail já cadastrado." });
    const existente = await prisma.usuario.findUnique({ where: { email: d.email }, select: { id: true } });
    if (existente) throw erroDuplicado();
    const acesso = await acessoEmpresasValido(prisma, d, ctx);

    const senha = gerarSenhaProvisoria();
    const senhaHash = await hashSenha(senha);
    const criado = await gravar(
      () =>
        prisma.usuario.create({
          data: { nome: d.nome, email: d.email, papel: d.papel, senhaHash, trocarSenha: true, ...acesso },
          select: { id: true },
        }),
      erroDuplicado(),
    );
    // Auditoria SEM senha e SEM hash.
    await auditar(
      "criar",
      "usuario",
      criado.id,
      `${d.nome} (${d.email}) · ${ROTULO_PAPEL[d.papel]}${d.papel === "ADMIN" && acesso.todasEmpresas ? " do grupo" : ""}`,
      { nome: d.nome, email: d.email, papel: d.papel, ...acesso },
      { empresaId: empresaDoUsuario(acesso) },
    );
    const emailEnviado = await enviarSenhaProvisoria({ nome: d.nome, email: d.email, senha }, empresaDoUsuario(acesso)).catch(() => false);
    revalidar("/configuracoes/usuarios");
    return { id: criado.id, nome: d.nome, email: d.email, senhaProvisoria: senha, emailEnviado };
  }, "Usuário criado.");
}

export async function editarUsuario(id: string, valores: Record<string, unknown>): Promise<Resultado> {
  return executar(async () => {
    const { u: eu, ctx } = await exigirAdmin();
    const d = esquemaEdicaoUsuario.parse(valores);

    const { alvo, alterou, acesso } = await emTransacao(async (tx) => {
      const atual = await usuarioAdministrado(tx, ctx, id);
      const acesso = await acessoEmpresasValido(tx, d, ctx);
      const mesmoAcesso =
        atual.todasEmpresas === acesso.todasEmpresas && [...atual.empresas].sort().join() === [...acesso.empresas].sort().join();
      if (atual.id === eu.id && d.papel !== atual.papel) {
        throw new ErroAcao("Você não pode alterar o seu próprio papel. Peça a outro administrador.", {
          papel: "Não é possível alterar o próprio papel.",
        });
      }
      if (atual.id === eu.id && !mesmoAcesso) {
        throw new ErroAcao("Você não pode alterar o seu próprio acesso às empresas. Peça ao administrador do grupo.", {
          empresas: "Não é possível alterar o próprio acesso.",
        });
      }
      const deixaDeSerAdminDoGrupo = ehAdminDoGrupo(atual) && !(d.papel === "ADMIN" && acesso.todasEmpresas);
      if (deixaDeSerAdminDoGrupo && atual.ativo) await exigirOutroAdminDoGrupo(tx, atual.id);
      if (atual.nome === d.nome && atual.papel === d.papel && mesmoAcesso) return { alvo: atual, alterou: false, acesso };
      await tx.usuario.update({ where: { id }, data: { nome: d.nome, papel: d.papel, ...acesso } });
      return { alvo: atual, alterou: true, acesso };
    });

    if (alterou) {
      await auditar(
        "atualizar",
        "usuario",
        id,
        `${d.nome} (${alvo.email})`,
        {
          antes: { nome: alvo.nome, papel: alvo.papel, todasEmpresas: alvo.todasEmpresas, empresas: alvo.empresas },
          depois: { nome: d.nome, papel: d.papel, ...acesso },
        },
        { empresaId: empresaDoUsuario(acesso) },
      );
      revalidar("/configuracoes/usuarios");
    }
    return undefined;
  }, "Alterações salvas.");
}

/**
 * Gera nova senha provisória: invalida as sessões abertas (versaoSessao + 1), força a troca no próximo acesso
 * e zera o bloqueio. A senha só volta nesta resposta.
 */
export async function redefinirSenhaUsuario(
  id: string,
): Promise<Resultado<{ nome: string; email: string; senhaProvisoria: string; emailEnviado: boolean }>> {
  return executar(async () => {
    const { u: eu, ctx } = await exigirAdmin();
    if (id === eu.id) {
      // Redefinir a própria senha derrubaria a sessão atual antes de ela ser anotada.
      throw new ErroAcao("Para trocar a sua própria senha, use “Trocar senha” no menu do seu perfil.");
    }
    const alvo = await usuarioAdministrado(prisma, ctx, id);

    const senha = gerarSenhaProvisoria();
    const senhaHash = await hashSenha(senha);
    await gravar(() =>
      prisma.usuario.update({
        where: { id },
        data: { senhaHash, trocarSenha: true, versaoSessao: { increment: 1 }, tentativasFalhas: 0, bloqueadoAte: null },
      }),
    );
    await auditar("redefinir_senha", "usuario", id, `Senha redefinida: ${alvo.nome} (${alvo.email})`, undefined, {
      empresaId: empresaDoUsuario(alvo),
    });
    const emailEnviado = await enviarSenhaProvisoria({ nome: alvo.nome, email: alvo.email, senha }, empresaDoUsuario(alvo)).catch(() => false);
    revalidar("/configuracoes/usuarios");
    return { nome: alvo.nome, email: alvo.email, senhaProvisoria: senha, emailEnviado };
  }, "Senha redefinida.");
}

export async function desbloquearUsuario(id: string): Promise<Resultado> {
  return executar(async () => {
    const { ctx } = await exigirAdmin();
    const alvo = await usuarioAdministrado(prisma, ctx, id);
    await gravar(() => prisma.usuario.update({ where: { id }, data: { tentativasFalhas: 0, bloqueadoAte: null } }));
    await auditar("desbloquear", "usuario", id, `${alvo.nome} (${alvo.email})`, undefined, { empresaId: empresaDoUsuario(alvo) });
    revalidar("/configuracoes/usuarios");
    return undefined;
  }, "Usuário desbloqueado.");
}

export async function definirAtivoUsuario(id: string, ativo: boolean): Promise<Resultado> {
  return executar(async () => {
    const { u: eu, ctx } = await exigirAdmin();
    if (!ativo && id === eu.id) throw new ErroAcao("Você não pode inativar o seu próprio usuário.");

    const { alvo, alterou } = await emTransacao(async (tx) => {
      const atual = await usuarioAdministrado(tx, ctx, id);
      if (atual.ativo === ativo) return { alvo: atual, alterou: false };
      if (!ativo && ehAdminDoGrupo(atual)) await exigirOutroAdminDoGrupo(tx, atual.id);
      await tx.usuario.update({
        where: { id },
        data: ativo ? { ativo: true } : { ativo: false, versaoSessao: { increment: 1 } },
      });
      return { alvo: atual, alterou: true };
    });

    if (alterou) {
      await auditar(
        ativo ? "ativar" : "inativar",
        "usuario",
        id,
        `${alvo.nome} (${alvo.email})`,
        { antes: { ativo: alvo.ativo }, depois: { ativo } },
        { empresaId: empresaDoUsuario(alvo) },
      );
      revalidar("/configuracoes/usuarios");
    }
    return undefined;
  }, ativo ? "Usuário reativado." : "Usuário inativado.");
}
