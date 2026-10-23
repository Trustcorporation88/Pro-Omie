import { usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { csvFechamento, periodoDe, type TipoCsv } from "@/modules/contador/consultas";

export const dynamic = "force-dynamic";

const TIPOS: TipoCsv[] = ["nfe", "nfse", "recebidas", "recebimentos", "pagamentos"];

/** CSV da competência (?tipo=nfe|nfse|recebidas|recebimentos|pagamentos&competencia=AAAA-MM). */
export async function GET(request: Request) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo") as TipoCsv | null;
  if (!tipo || !TIPOS.includes(tipo)) return Response.json({ erro: "Tipo inválido." }, { status: 400 });
  const permissao = tipo === "recebimentos" || tipo === "pagamentos" ? "financeiro:ver" : "fiscal:ver";
  if (!pode(u.papel, permissao)) return Response.json({ erro: "Sem permissão." }, { status: 403 });
  const p = periodoDe(url.searchParams.get("competencia") ?? undefined);
  const corpo = Buffer.from(await csvFechamento(tipo, p), "utf8");
  return new Response(corpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Length": String(corpo.byteLength), "Content-Disposition": `attachment; filename="${tipo}-${p.competencia}.csv"`, "Cache-Control": "private, no-store" },
  });
}
