import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoDoUsuario } from "@/lib/auth/empresa";

export const dynamic = "force-dynamic";

/** XML da NF-e emitida: o autorizado (nfeProc) ou, antes da autorização, o assinado. `?evento=<id>` baixa o evento. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  if (!pode(u.papel, "fiscal:ver") && !pode(u.papel, "vendas:ver")) return Response.json({ erro: "Sem permissão." }, { status: 403 });
  let ids: string[];
  try {
    ids = (await escopoDoUsuario(u)).ids;
  } catch {
    return Response.json({ erro: "Sem acesso a empresas." }, { status: 403 });
  }
  const { id } = await params;
  const nota = await prisma.notaFiscal.findFirst({ where: { id, empresaId: { in: ids } }, select: { chave: true, numero: true, serie: true, xml: true, xmlAutorizado: true } });
  if (!nota) return Response.json({ erro: "Nota não encontrada." }, { status: 404 });
  const eventoId = new URL(request.url).searchParams.get("evento");
  let xml: string | null;
  let nome: string;
  if (eventoId) {
    const ev = await prisma.eventoNotaFiscal.findFirst({ where: { id: eventoId, notaId: id }, select: { xml: true, tipoEvento: true, sequencia: true } });
    xml = ev?.xml ?? null;
    nome = `${nota.chave ?? nota.numero}-evento-${ev?.tipoEvento ?? ""}-${ev?.sequencia ?? ""}.xml`;
  } else {
    xml = nota.xmlAutorizado ?? nota.xml;
    nome = `${nota.chave ?? `NFe-${nota.serie}-${nota.numero}`}${nota.xmlAutorizado ? "-procNFe" : "-assinada"}.xml`;
  }
  if (!xml) return Response.json({ erro: "XML não disponível." }, { status: 404 });
  const corpo = Buffer.from(xml.startsWith("<?xml") ? xml : `<?xml version="1.0" encoding="UTF-8"?>${xml}`, "utf8");
  return new Response(corpo, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Length": String(corpo.byteLength),
      "Content-Disposition": `attachment; filename="${nome.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
