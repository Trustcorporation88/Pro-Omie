import { timingSafeEqual } from "node:crypto";
import { processarFila } from "@/modules/email/fila";
import { avisarCertificadosVencendo } from "@/modules/email/avisos";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function autorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) return false;
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/** Cron da Vercel (vercel.json): reenvia a fila de e-mails e manda os avisos automáticos (certificado vencendo). */
export async function GET(request: Request) {
  if (!autorizado(request)) return Response.json({ erro: "Não autorizado." }, { status: 401 });
  const url = new URL(request.url);
  const base = process.env.APP_URL?.trim() || `${url.protocol}//${request.headers.get("x-forwarded-host") ?? url.host}`;
  const fila = await processarFila(50);
  const avisos = await avisarCertificadosVencendo(base.replace(/\/$/, ""));
  console.log(`[email] cron: fila ${JSON.stringify(fila)} · avisos ${avisos.avisos}`);
  return Response.json({ fila, ...avisos });
}
