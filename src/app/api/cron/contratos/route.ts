import { timingSafeEqual } from "node:crypto";
import { gerarContratosPendentes } from "@/modules/servicos/recorrencia";
import { auditar } from "@/lib/auditoria";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function autorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) return false;
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/** Cron diário da Vercel: gera as competências dos contratos que entraram na janela de antecedência. */
export async function GET(request: Request) {
  if (!autorizado(request)) return Response.json({ erro: "Não autorizado." }, { status: 401 });
  const url = new URL(request.url);
  const base = process.env.APP_URL?.trim() || `${url.protocol}//${request.headers.get("x-forwarded-host") ?? url.host}`;
  const r = await gerarContratosPendentes({ usuarioId: null, urlBase: base.replace(/\/$/, "") });
  for (const g of r.gerados) await auditar("gerar_contrato", "contrato", String(g.contrato), `Contrato ${String(g.contrato).padStart(4, "0")}: competência ${g.competencia} → pedido nº ${String(g.pedido).padStart(4, "0")} (automático)`, g, {});
  console.log(`[contratos] cron: ${JSON.stringify(r)}`);
  return Response.json(r);
}
