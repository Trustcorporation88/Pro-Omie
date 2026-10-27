import { timingSafeEqual } from "node:crypto";
import { fotografarOcupacao } from "@/modules/armazem/faturamento";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function autorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) return false;
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/** Cron da Vercel, de hora em hora: fotografa os paletes de cada depositante (vale a última do dia; base da apuração mensal da armazenagem). */
export async function GET(request: Request) {
  if (!autorizado(request)) return Response.json({ erro: "Não autorizado." }, { status: 401 });
  const r = await fotografarOcupacao();
  console.log(`[armazem] fotografia: ${JSON.stringify(r)}`);
  return Response.json(r);
}
