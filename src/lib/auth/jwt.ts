import { SignJWT, jwtVerify } from "jose";

export const COOKIE_SESSAO = "pro_omie_sessao";
export const DURACAO_SESSAO_SEG = 60 * 60 * 12; // 12 horas

export type PayloadSessao = { sub: string; v: number };

function chave() {
  const segredo = process.env.AUTH_SECRET;
  if (!segredo || segredo.length < 32) {
    throw new Error("AUTH_SECRET ausente ou curto demais (mínimo 32 caracteres).");
  }
  return new TextEncoder().encode(segredo);
}

export async function assinarSessao(payload: PayloadSessao): Promise<string> {
  return new SignJWT({ v: payload.v })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SESSAO_SEG}s`)
    .sign(chave());
}

export async function verificarSessao(token: string | undefined): Promise<PayloadSessao | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chave(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.v !== "number") return null;
    return { sub: payload.sub, v: payload.v };
  } catch {
    return null;
  }
}
