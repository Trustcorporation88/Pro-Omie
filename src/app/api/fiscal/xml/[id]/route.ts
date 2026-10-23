import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoDoUsuario } from "@/lib/auth/empresa";

export const dynamic = "force-dynamic";

/** XML de uma nota recebida (completo ou, antes da manifestação, o resumo), só para quem vê a empresa dela. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  if (!pode(u.papel, "fiscal:ver")) return Response.json({ erro: "Sem permissão." }, { status: 403 });
  let ids: string[];
  try {
    ids = (await escopoDoUsuario(u)).ids;
  } catch {
    return Response.json({ erro: "Sem acesso a empresas." }, { status: 403 });
  }
  const { id } = await params;
  const doc = await prisma.documentoRecebido.findFirst({ where: { id, empresaId: { in: ids } }, select: { tipo: true, chave: true, xml: true, completo: true } });
  if (!doc) return Response.json({ erro: "Nota não encontrada." }, { status: 404 });
  if (!doc.xml) return Response.json({ erro: "O XML desta nota ainda não chegou (falta a manifestação)." }, { status: 404 });
  const nome = `${doc.tipo}-${doc.chave}${doc.completo ? "" : "-resumo"}.xml`.replace(/[^\w.-]/g, "_");
  const corpo = Buffer.from(doc.xml.startsWith("<?xml") ? doc.xml : `<?xml version="1.0" encoding="UTF-8"?>${doc.xml}`, "utf8");
  return new Response(corpo, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Length": String(corpo.byteLength),
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
