import { usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { periodoDe, zipXmlFechamento } from "@/modules/contador/consultas";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** ZIP com todos os XML da competência (?competencia=AAAA-MM) das empresas do escopo. */
export async function GET(request: Request) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  if (!pode(u.papel, "fiscal:ver")) return Response.json({ erro: "Sem permissão." }, { status: 403 });
  const p = periodoDe(new URL(request.url).searchParams.get("competencia") ?? undefined);
  const { zip } = await zipXmlFechamento(p);
  return new Response(new Uint8Array(zip), {
    headers: { "Content-Type": "application/zip", "Content-Length": String(zip.byteLength), "Content-Disposition": `attachment; filename="xml-${p.competencia}.zip"`, "Cache-Control": "private, no-store" },
  });
}
