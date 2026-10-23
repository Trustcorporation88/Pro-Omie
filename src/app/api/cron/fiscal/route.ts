import { timingSafeEqual } from "node:crypto";
import { capturarTodos, descreverResumo } from "@/modules/fiscal/captacao";

export const dynamic = "force-dynamic";
// A captação respeita a regra da SEFAZ (1 hora entre consultas sem novidade); a função para antes de estourar o tempo.
export const maxDuration = 300;

function autorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET?.trim();
  if (!segredo) return false;
  const recebido = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

/** Chamado pelo Cron da Vercel de hora em hora (vercel.json). A Vercel manda Authorization: Bearer CRON_SECRET. */
export async function GET(request: Request) {
  if (!autorizado(request)) return Response.json({ erro: "Não autorizado." }, { status: 401 });
  const inicio = Date.now();
  const resumos = await capturarTodos(250_000);
  const saida = resumos.map((r) => ({ empresaId: r.empresaId, ok: r.ok, resumo: descreverResumo(r) }));
  for (const s of saida) console.log(`[fiscal] cron ${s.empresaId}: ${s.resumo}`);
  return Response.json({ estabelecimentos: saida.length, segundos: Math.round((Date.now() - inicio) / 1000), resumos: saida });
}
