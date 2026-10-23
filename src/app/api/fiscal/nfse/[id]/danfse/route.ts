import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoDoUsuario } from "@/lib/auth/empresa";
import { gerarDanfse } from "@/modules/fiscal/nfse/danfse";

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
  const nota = await prisma.notaServico.findFirst({ where: { id, empresaId: { in: ids } }, select: { numero: true, serie: true, numeroNfse: true, status: true, xmlAutorizado: true, canceladaEm: true, cancelamentoMotivo: true, cancelamentoCodigo: true } });
  if (!nota) return Response.json({ erro: "Nota não encontrada." }, { status: 404 });
  if (!nota.xmlAutorizado) return Response.json({ erro: "A NFS-e ainda não foi gerada: não há DANFSe." }, { status: 409 });
  const cancelada = nota.status === "CANCELADA";
  const pdf = await gerarDanfse(nota.xmlAutorizado, { cancelada, cancelamento: cancelada ? { motivo: nota.cancelamentoMotivo, codigo: nota.cancelamentoCodigo, em: nota.canceladaEm } : null });
  const nome = `DANFSe-${nota.numeroNfse ?? `${nota.serie}-${nota.numero}`}.pdf`;
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
