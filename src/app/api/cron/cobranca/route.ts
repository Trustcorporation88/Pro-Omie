import { timingSafeEqual } from "node:crypto";
import { conferirPendentes } from "@/modules/cobranca/servicos";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function autorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) return false;
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/** Cron da Vercel: confere no Asaas as cobranças em aberto sem atualização recente (rede de segurança do webhook). */
export async function GET(request: Request) {
  if (!autorizado(request)) return Response.json({ erro: "Não autorizado." }, { status: 401 });
  const r = await conferirPendentes(100);
  console.log(`[cobranca] cron: ${JSON.stringify(r)}`);
  return Response.json(r);
}
