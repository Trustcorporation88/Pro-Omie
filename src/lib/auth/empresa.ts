import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { ErroAcao, usuarioAtual, type UsuarioSessao } from "./sessao";

/** Cookie com a empresa (matriz) escolhida no seletor do menu. Só uma preferência: o acesso é conferido a cada pedido. */
export const COOKIE_EMPRESA = "pro_omie_empresa";

export type EmpresaResumo = { id: string; nome: string; razaoSocial: string; cnpj: string };

export type EscopoEmpresa = {
  /** Matriz ativa (a escolhida no menu). */
  ativa: EmpresaResumo;
  /** Filiais da matriz ativa (inclusive inativas: o histórico delas continua no escopo). */
  filiais: EmpresaResumo[];
  /** Ids da matriz ativa e das filiais: é por eles que títulos, contas e relatórios são filtrados. */
  ids: string[];
  /** Matrizes que o usuário pode escolher no seletor. */
  disponiveis: EmpresaResumo[];
};

const resumo = (e: { id: string; razaoSocial: string; nomeFantasia: string | null; cnpj: string }): EmpresaResumo => ({
  id: e.id,
  nome: e.nomeFantasia || e.razaoSocial,
  razaoSocial: e.razaoSocial,
  cnpj: e.cnpj,
});

/** Matrizes ativas que o usuário pode ver (admin e quem tem `todasEmpresas` veem todas). */
export async function matrizesAcessiveis(usuarioId: string): Promise<EmpresaResumo[]> {
  const [u, matrizes] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: usuarioId }, select: { papel: true, todasEmpresas: true, empresas: true } }),
    prisma.empresa.findMany({
      where: { matrizId: null, ativo: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true },
    }),
  ]);
  if (!u) return [];
  const todas = u.papel === "ADMIN" || u.todasEmpresas;
  return matrizes.filter((m) => todas || u.empresas.includes(m.id)).map(resumo);
}

/**
 * Empresa ativa do pedido atual, memoizada por requisição.
 * Regra: a matriz do cookie, se o usuário puder vê-la; senão a primeira acessível.
 * Lança erro se o usuário não tiver nenhuma empresa liberada (ou se não houver empresa cadastrada).
 */
export const escopoEmpresa = cache(async (): Promise<EscopoEmpresa> => {
  const u = await usuarioAtual();
  if (!u) throw new ErroAcao("Sua sessão expirou. Entre novamente.");
  return escopoDoUsuario(u);
});

export async function escopoDoUsuario(u: Pick<UsuarioSessao, "id">): Promise<EscopoEmpresa> {
  const disponiveis = await matrizesAcessiveis(u.id);
  if (disponiveis.length === 0) throw new ErroAcao("Você não tem acesso a nenhuma empresa. Peça a um administrador para liberar.");
  const jar = await cookies();
  const pedida = jar.get(COOKIE_EMPRESA)?.value;
  const ativa = disponiveis.find((e) => e.id === pedida) ?? disponiveis[0];
  const filiais = await prisma.empresa.findMany({
    where: { matrizId: ativa.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true },
  });
  return { ativa, filiais: filiais.map(resumo), ids: [ativa.id, ...filiais.map((f) => f.id)], disponiveis };
}

/** Garante que a empresa informada num formulário pertence ao escopo ativo (matriz ou filial dela). */
export function exigirEmpresaNoEscopo(escopo: EscopoEmpresa, empresaId: string | null | undefined, mensagem = "Empresa fora do escopo atual.") {
  if (!empresaId || !escopo.ids.includes(empresaId)) throw new ErroAcao(mensagem, { empresaId: mensagem });
  return empresaId;
}

/** Garante que uma conta bancária pertence à empresa ativa. Devolve a conta (id e empresaId). */
export async function exigirContaNoEscopo(escopo: EscopoEmpresa, contaId: string | null | undefined, campo = "contaBancariaId") {
  if (!contaId) throw new ErroAcao("Selecione a conta.", { [campo]: "Selecione a conta." });
  const conta = await prisma.contaBancaria.findFirst({ where: { id: contaId, empresaId: { in: escopo.ids } }, select: { id: true, empresaId: true, ativo: true } });
  if (!conta) throw new ErroAcao("Conta bancária não encontrada nesta empresa.", { [campo]: "Conta não encontrada nesta empresa." });
  return conta;
}

/** Filtro Prisma para registros que pertencem a uma conta bancária da empresa ativa (movimentos, baixas, extratos). */
export const porConta = (escopo: EscopoEmpresa) => ({ contaBancaria: { empresaId: { in: escopo.ids } } });

/** Grava a preferência de empresa (o acesso é conferido de novo a cada pedido). */
export async function gravarCookieEmpresa(empresaId: string) {
  const jar = await cookies();
  jar.set(COOKIE_EMPRESA, empresaId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
