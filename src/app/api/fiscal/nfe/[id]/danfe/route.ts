import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoDoUsuario } from "@/lib/auth/empresa";
import { gerarDanfe } from "@/modules/fiscal/nfe/danfe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** DANFE em PDF da NF-e autorizada (vendas também baixa, para mandar ao cliente). `?baixar=1` força o download. */
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
  const nota = await prisma.notaFiscal.findFirst({ where: { id, empresaId: { in: ids } }, select: { numero: true, serie: true, status: true, xmlAutorizado: true, canceladaEm: true, cancelamentoProtocolo: true } });
  if (!nota) return Response.json({ erro: "Nota não encontrada." }, { status: 404 });
  if (!nota.xmlAutorizado) return Response.json({ erro: "A nota ainda não foi autorizada: não há DANFE." }, { status: 409 });
  const cancelada = nota.status === "CANCELADA";
  const pdf = await gerarDanfe(nota.xmlAutorizado, { cancelada, cancelamento: cancelada ? { protocolo: nota.cancelamentoProtocolo, em: nota.canceladaEm } : null });
  const nome = `DANFE-${nota.serie}-${nota.numero}.pdf`;
  const baixar = new URL(request.url).searchParams.get("baixar") === "1";
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${nome}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
