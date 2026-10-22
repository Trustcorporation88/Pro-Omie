import { headers } from "next/headers";
import { prisma, Prisma, type DB } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/sessao";
import { escopoEmpresa } from "@/lib/auth/empresa";

/**
 * `empresaId`: empresa (matriz) do evento. Sem ela, vale a empresa ativa do pedido; `null` marca evento do grupo
 * (visível só ao administrador do grupo). Nunca chamar dentro de transação sem informar `empresaId`.
 */
type Opcoes = { db?: DB; usuarioId?: string | null; empresaId?: string | null };

const SENSIVEIS = /senha|password|token|secret|hash/i;

function ocultar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ocultar);
  if (valor && typeof valor === "object" && !(valor instanceof Date)) {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, SENSIVEIS.test(k) ? "[oculto]" : ocultar(v)]));
  }
  return valor;
}

/** Registra uma ação na trilha de auditoria. Nunca interrompe o fluxo principal. */
export async function auditar(
  acao: string,
  entidade: string,
  entidadeId?: string | null,
  resumo?: string,
  dados?: unknown,
  opcoes: Opcoes = {},
) {
  try {
    const usuarioId = opcoes.usuarioId !== undefined ? opcoes.usuarioId : (await usuarioAtual())?.id ?? null;
    const empresaId =
      opcoes.empresaId !== undefined ? opcoes.empresaId : await escopoEmpresa().then((e) => e.ativa.id).catch(() => null);
    let ip: string | null = null;
    try {
      const h = await headers();
      ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
    } catch {
      ip = null;
    }
    await (opcoes.db ?? prisma).auditoria.create({
      data: {
        usuarioId,
        acao,
        entidade,
        entidadeId: entidadeId ?? null,
        empresaId,
        resumo: resumo ?? null,
        dados: dados === undefined ? undefined : (ocultar(JSON.parse(JSON.stringify(dados))) as Prisma.InputJsonValue),
        ip,
      },
    });
  } catch (e) {
    console.error("[auditoria] falha ao registrar", e);
  }
}
