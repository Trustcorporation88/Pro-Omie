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
import { fmtDocumento } from "@/lib/format";
import { esquemaEdicaoUsuario, esquemaEmpresa, esquemaNovoUsuario } from "./esquemas";
import { gerarSenhaProvisoria } from "./senha";
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
export async function criarUsuario(
  valores: Record<string, unknown>,
): Promise<Resultado<{ id: string; nome: string; email: string; senhaProvisoria: string }>> {
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
    revalidar("/configuracoes/usuarios");
    return { id: criado.id, nome: d.nome, email: d.email, senhaProvisoria: senha };
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
): Promise<Resultado<{ nome: string; email: string; senhaProvisoria: string }>> {
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
    revalidar("/configuracoes/usuarios");
    return { nome: alvo.nome, email: alvo.email, senhaProvisoria: senha };
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
