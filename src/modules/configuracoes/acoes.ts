"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao, hashSenha } from "@/lib/auth/sessao";
import { ROTULO_PAPEL } from "@/lib/auth/permissoes";
import { auditar } from "@/lib/auditoria";
import { fmtDocumento } from "@/lib/format";
import { esquemaEdicaoUsuario, esquemaEmpresa, esquemaNovoUsuario } from "./esquemas";
import { gerarSenhaProvisoria } from "./senha";
import type { TipoEmpresa } from "./tipos";

// Regras desta tela (todas as ações exigem "config:admin"):
//  • senhas provisórias (e hashes) NUNCA vão para a auditoria nem para logs;
//  • o usuário não inativa a si mesmo nem altera o próprio papel;
//  • sempre sobra ao menos um ADMIN ativo (verificado dentro de transação serializável).

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

async function exigirOutroAdminAtivo(tx: Prisma.TransactionClient, id: string) {
  const outros = await tx.usuario.count({ where: { papel: "ADMIN", ativo: true, id: { not: id } } });
  if (outros < 1) {
    throw new ErroAcao("O sistema precisa de pelo menos um administrador ativo. Promova outro usuário a administrador antes de continuar.");
  }
}

// ───────────── Empresa e filiais ─────────────

const ERRO_CNPJ_DUPLICADO = () =>
  new ErroAcao("Já existe uma empresa cadastrada com este CNPJ.", { cnpj: "CNPJ já cadastrado." });

async function garantirCnpjDisponivel(cnpj: string, ignorarId?: string) {
  const existente = await prisma.empresa.findFirst({
    where: { cnpj, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { id: true },
  });
  if (existente) throw ERRO_CNPJ_DUPLICADO();
}

/**
 * Salva a matriz ou uma filial.
 * - `id` informado: edita (matriz ou filial, conforme o registro).
 * - sem `id` e tipo "filial": cria uma filial vinculada à matriz (o vínculo é decidido aqui, nunca pelo cliente).
 * - sem `id` e tipo "matriz": cadastra a matriz, apenas se ela ainda não existir.
 */
export async function salvarEmpresa(
  id: string | null,
  tipo: TipoEmpresa,
  valores: Record<string, unknown>,
): Promise<Resultado<{ id: string }>> {
  const mensagem =
    tipo === "filial"
      ? id
        ? "Filial atualizada."
        : "Filial criada."
      : id
        ? "Dados da matriz atualizados."
        : "Matriz cadastrada.";

  return executar(async () => {
    await exigirPermissao("config:admin");
    if (tipo !== "matriz" && tipo !== "filial") throw new ErroAcao("Tipo de empresa inválido.");
    const dados = esquemaEmpresa.parse(valores);
    const nome = dados.nomeFantasia || dados.razaoSocial;

    if (id) {
      const atual = await prisma.empresa.findUnique({ where: { id } });
      if (!atual) throw new ErroAcao("Empresa não encontrada.");
      await garantirCnpjDisponivel(dados.cnpj, id);
      const salva = await gravar(() => prisma.empresa.update({ where: { id }, data: dados }), ERRO_CNPJ_DUPLICADO());
      const antes = Object.fromEntries(Object.keys(dados).map((k) => [k, atual[k as keyof typeof atual]]));
      await auditar("atualizar", "empresa", id, `${atual.matrizId ? "Filial" : "Matriz"} ${nome} (${fmtDocumento(dados.cnpj)})`, {
        antes,
        depois: dados,
      });
      revalidar("/configuracoes/empresa");
      return { id: salva.id };
    }

    const matriz = await prisma.empresa.findFirst({ where: { matrizId: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (tipo === "filial" && !matriz) throw new ErroAcao("Cadastre a matriz antes de criar filiais.");
    if (tipo === "matriz" && matriz) throw new ErroAcao("A matriz já está cadastrada. Edite os dados dela.");
    await garantirCnpjDisponivel(dados.cnpj);
    const matrizId = tipo === "filial" ? (matriz?.id ?? null) : null;
    const criada = await gravar(() => prisma.empresa.create({ data: { ...dados, matrizId } }), ERRO_CNPJ_DUPLICADO());
    await auditar("criar", "empresa", criada.id, `${matrizId ? "Filial" : "Matriz"} ${nome} (${fmtDocumento(dados.cnpj)})`, { ...dados, matrizId });
    revalidar("/configuracoes/empresa");
    return { id: criada.id };
  }, mensagem);
}

/** Ativa ou inativa uma filial (idempotente). A matriz não pode ser inativada. */
export async function definirAtivoFilial(id: string, ativo: boolean): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("config:admin");
    const atual = await prisma.empresa.findUnique({ where: { id }, select: { id: true, matrizId: true, ativo: true, razaoSocial: true, nomeFantasia: true } });
    if (!atual) throw new ErroAcao("Filial não encontrada.");
    if (!atual.matrizId) throw new ErroAcao("A matriz não pode ser inativada.");
    if (atual.ativo === ativo) return undefined;
    await gravar(() => prisma.empresa.update({ where: { id }, data: { ativo } }));
    await auditar(ativo ? "ativar" : "inativar", "empresa", id, `Filial ${atual.nomeFantasia || atual.razaoSocial}`, {
      antes: { ativo: atual.ativo },
      depois: { ativo },
    });
    revalidar("/configuracoes/empresa");
    return undefined;
  }, ativo ? "Filial reativada." : "Filial inativada.");
}

// ───────────── Usuários ─────────────

/** Cria o usuário com senha provisória aleatória (hash no banco, trocarSenha = true). A senha só volta nesta resposta. */
export async function criarUsuario(
  valores: Record<string, unknown>,
): Promise<Resultado<{ id: string; nome: string; email: string; senhaProvisoria: string }>> {
  return executar(async () => {
    await exigirPermissao("config:admin");
    const d = esquemaNovoUsuario.parse(valores);
    const erroDuplicado = () => new ErroAcao("Já existe um usuário com este e-mail.", { email: "E-mail já cadastrado." });
    const existente = await prisma.usuario.findUnique({ where: { email: d.email }, select: { id: true } });
    if (existente) throw erroDuplicado();

    const senha = gerarSenhaProvisoria();
    const senhaHash = await hashSenha(senha);
    const criado = await gravar(
      () =>
        prisma.usuario.create({
          data: { nome: d.nome, email: d.email, papel: d.papel, senhaHash, trocarSenha: true },
          select: { id: true },
        }),
      erroDuplicado(),
    );
    // Auditoria SEM senha e SEM hash.
    await auditar("criar", "usuario", criado.id, `${d.nome} (${d.email}) · ${ROTULO_PAPEL[d.papel]}`, {
      nome: d.nome,
      email: d.email,
      papel: d.papel,
    });
    revalidar("/configuracoes/usuarios");
    return { id: criado.id, nome: d.nome, email: d.email, senhaProvisoria: senha };
  }, "Usuário criado.");
}

/** Edita nome e papel. Ninguém altera o próprio papel e o último administrador ativo não pode ser rebaixado. */
export async function editarUsuario(id: string, valores: Record<string, unknown>): Promise<Resultado> {
  return executar(async () => {
    const eu = await exigirPermissao("config:admin");
    const d = esquemaEdicaoUsuario.parse(valores);

    const { alvo, alterou } = await emTransacao(async (tx) => {
      const atual = await tx.usuario.findUnique({ where: { id }, select: { id: true, nome: true, email: true, papel: true, ativo: true } });
      if (!atual) throw new ErroAcao("Usuário não encontrado.");
      if (atual.id === eu.id && d.papel !== atual.papel) {
        throw new ErroAcao("Você não pode alterar o seu próprio papel. Peça a outro administrador.", {
          papel: "Não é possível alterar o próprio papel.",
        });
      }
      if (atual.papel === "ADMIN" && atual.ativo && d.papel !== "ADMIN") await exigirOutroAdminAtivo(tx, atual.id);
      if (atual.nome === d.nome && atual.papel === d.papel) return { alvo: atual, alterou: false };
      await tx.usuario.update({ where: { id }, data: { nome: d.nome, papel: d.papel } });
      return { alvo: atual, alterou: true };
    });

    if (alterou) {
      await auditar("atualizar", "usuario", id, `${d.nome} (${alvo.email})`, {
        antes: { nome: alvo.nome, papel: alvo.papel },
        depois: { nome: d.nome, papel: d.papel },
      });
      revalidar("/configuracoes/usuarios");
    }
    return undefined;
  }, "Alterações salvas.");
}

/**
 * Gera nova senha provisória: exige troca no próximo acesso, derruba as sessões abertas (versaoSessao + 1)
 * e zera tentativas falhas e bloqueio. A senha só volta nesta resposta; a auditoria não a registra.
 */
export async function redefinirSenhaUsuario(
  id: string,
): Promise<Resultado<{ nome: string; email: string; senhaProvisoria: string }>> {
  return executar(async () => {
    const eu = await exigirPermissao("config:admin");
    if (id === eu.id) {
      // Redefinir a própria senha derrubaria a sessão atual antes de ela ser anotada.
      throw new ErroAcao("Para trocar a sua própria senha, use “Trocar senha” no menu do seu perfil.");
    }
    const alvo = await prisma.usuario.findUnique({ where: { id }, select: { id: true, nome: true, email: true } });
    if (!alvo) throw new ErroAcao("Usuário não encontrado.");

    const senha = gerarSenhaProvisoria();
    const senhaHash = await hashSenha(senha);
    await gravar(() =>
      prisma.usuario.update({
        where: { id },
        data: { senhaHash, trocarSenha: true, versaoSessao: { increment: 1 }, tentativasFalhas: 0, bloqueadoAte: null },
      }),
    );
    await auditar("redefinir_senha", "usuario", id, `Senha redefinida: ${alvo.nome} (${alvo.email})`);
    revalidar("/configuracoes/usuarios");
    return { nome: alvo.nome, email: alvo.email, senhaProvisoria: senha };
  }, "Senha redefinida.");
}

/** Zera as tentativas falhas e o bloqueio temporário de login. */
export async function desbloquearUsuario(id: string): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("config:admin");
    const alvo = await prisma.usuario.findUnique({ where: { id }, select: { id: true, nome: true, email: true } });
    if (!alvo) throw new ErroAcao("Usuário não encontrado.");
    await gravar(() => prisma.usuario.update({ where: { id }, data: { tentativasFalhas: 0, bloqueadoAte: null } }));
    await auditar("desbloquear", "usuario", id, `${alvo.nome} (${alvo.email})`);
    revalidar("/configuracoes/usuarios");
    return undefined;
  }, "Usuário desbloqueado.");
}

/**
 * Ativa ou inativa um usuário (idempotente). Inativar derruba as sessões (versaoSessao + 1);
 * ninguém inativa a si mesmo e o último administrador ativo não pode ser inativado.
 */
export async function definirAtivoUsuario(id: string, ativo: boolean): Promise<Resultado> {
  return executar(async () => {
    const eu = await exigirPermissao("config:admin");
    if (!ativo && id === eu.id) throw new ErroAcao("Você não pode inativar o seu próprio usuário.");

    const { alvo, alterou } = await emTransacao(async (tx) => {
      const atual = await tx.usuario.findUnique({ where: { id }, select: { id: true, nome: true, email: true, papel: true, ativo: true } });
      if (!atual) throw new ErroAcao("Usuário não encontrado.");
      if (atual.ativo === ativo) return { alvo: atual, alterou: false };
      if (!ativo && atual.papel === "ADMIN") await exigirOutroAdminAtivo(tx, atual.id);
      await tx.usuario.update({
        where: { id },
        data: ativo ? { ativo: true } : { ativo: false, versaoSessao: { increment: 1 } },
      });
      return { alvo: atual, alterou: true };
    });

    if (alterou) {
      await auditar(ativo ? "ativar" : "inativar", "usuario", id, `${alvo.nome} (${alvo.email})`, {
        antes: { ativo: alvo.ativo },
        depois: { ativo },
      });
      revalidar("/configuracoes/usuarios");
    }
    return undefined;
  }, ativo ? "Usuário reativado." : "Usuário inativado.");
}
