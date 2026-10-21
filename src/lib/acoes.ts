import { ZodError } from "zod";
import { unstable_rethrow } from "next/navigation";
import { Prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";

export type Resultado<T = undefined> =
  | { ok: true; data?: T; mensagem?: string }
  | { ok: false; erro: string; campos?: Record<string, string> };

/** Executa uma server action devolvendo um resultado serializável e mensagens amigáveis. */
export async function executar<T>(fn: () => Promise<T>, mensagem?: string): Promise<Resultado<T>> {
  try {
    const data = await fn();
    return { ok: true, data, mensagem };
  } catch (e) {
    unstable_rethrow(e);
    return tratarErro(e);
  }
}

export function tratarErro(e: unknown): { ok: false; erro: string; campos?: Record<string, string> } {
  if (e instanceof ErroAcao) return { ok: false, erro: e.message, campos: e.campos };
  if (e instanceof ZodError) {
    const campos: Record<string, string> = {};
    for (const issue of e.issues) {
      const k = issue.path.join(".");
      if (!campos[k]) campos[k] = issue.message;
    }
    const primeiro = e.issues[0]?.message;
    return { ok: false, erro: primeiro ? `Revise os campos: ${primeiro}` : "Revise os campos destacados.", campos };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return { ok: false, erro: "Já existe um registro com esses dados (valor duplicado)." };
    if (e.code === "P2003") return { ok: false, erro: "Este registro está vinculado a outros e não pode ser excluído. Inative-o." };
    if (e.code === "P2025") return { ok: false, erro: "Registro não encontrado." };
  }
  console.error("[acao] erro inesperado", e);
  return { ok: false, erro: "Erro inesperado. Tente novamente em instantes." };
}
