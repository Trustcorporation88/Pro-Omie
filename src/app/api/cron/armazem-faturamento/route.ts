import { timingSafeEqual } from "node:crypto";
import { faturarArmazenagemAutomatica } from "@/modules/armazem/automatico";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function autorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) return false;
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/**
 * Cron diário da Vercel (6h40 de Brasília): fatura sozinho os períodos vencidos das tarifas com "Faturar sozinho" (no mês do
 * calendário, no dia 1º; o que falhar é tentado de novo no dia seguinte) e avisa os administradores por e-mail.
 */
export async function GET(request: Request) {
  if (!autorizado(request)) return Response.json({ erro: "Não autorizado." }, { status: 401 });
  const url = new URL(request.url);
  const base = process.env.APP_URL?.trim() || `${url.protocol}//${request.headers.get("x-forwarded-host") ?? url.host}`;
  const r = await faturarArmazenagemAutomatica({ urlBase: base.replace(/\/$/, "") });
  console.log(`[armazem] faturamento automático: ${JSON.stringify(r)}`);
  return Response.json(r);
}
