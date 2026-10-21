import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { COOKIE_SESSAO, DURACAO_SESSAO_SEG, assinarSessao, verificarSessao } from "./jwt";
import { pode, type Permissao, type PapelUsuario } from "./permissoes";

export type UsuarioSessao = {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  trocarSenha: boolean;
};

export async function hashSenha(senha: string) {
  return bcrypt.hash(senha, 11);
}

export async function conferirSenha(senha: string, hash: string) {
  return bcrypt.compare(senha, hash);
}

export async function criarSessao(usuario: { id: string; versaoSessao: number }) {
  const token = await assinarSessao({ sub: usuario.id, v: usuario.versaoSessao });
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SESSAO_SEG,
  });
}

export async function encerrarSessao() {
  const jar = await cookies();
  jar.delete(COOKIE_SESSAO);
}

/** Usuário logado (ou null). Memoizado por requisição. */
export const usuarioAtual = cache(async (): Promise<UsuarioSessao | null> => {
  const jar = await cookies();
  const payload = await verificarSessao(jar.get(COOKIE_SESSAO)?.value);
  if (!payload) return null;
  const u = await prisma.usuario.findUnique({
    where: { id: payload.sub },
    select: { id: true, nome: true, email: true, papel: true, ativo: true, trocarSenha: true, versaoSessao: true },
  });
  if (!u || !u.ativo || u.versaoSessao !== payload.v) return null;
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel, trocarSenha: u.trocarSenha };
});

/** Exige login (e, opcionalmente, uma permissão). Use em toda página e ação protegida. */
export async function exigirUsuario(permissao?: Permissao, opts?: { permitirTrocaSenha?: boolean }) {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  if (u.trocarSenha && !opts?.permitirTrocaSenha) redirect("/trocar-senha");
  if (permissao && !pode(u.papel, permissao)) redirect("/sem-permissao");
  return u;
}

/** Versão para server actions: lança erro em vez de redirecionar. */
export async function exigirPermissao(permissao?: Permissao): Promise<UsuarioSessao> {
  const u = await usuarioAtual();
  if (!u) throw new ErroAcao("Sua sessão expirou. Entre novamente.");
  if (permissao && !pode(u.papel, permissao)) throw new ErroAcao("Você não tem permissão para esta ação.");
  return u;
}

export class ErroAcao extends Error {
  constructor(
    message: string,
    public campos?: Record<string, string>,
  ) {
    super(message);
    this.name = "ErroAcao";
  }
}
