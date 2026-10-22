import { usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { prisma } from "@/lib/db";
import { obterDocumento } from "@/modules/vendas/consultas";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { gerarPdfDocumento } from "@/modules/vendas/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** PDF da proposta ou do pedido (só da empresa ativa). `?baixar=1` força o download. */
export async function GET(request: Request, { params }: { params: Promise<{ tipo: string; id: string }> }) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  if (!pode(u.papel, "vendas:ver")) return Response.json({ erro: "Sem permissão." }, { status: 403 });
  const { tipo, id } = await params;
  if (tipo !== "propostas" && tipo !== "pedidos") return Response.json({ erro: "Documento inválido." }, { status: 404 });
  const doc = await obterDocumento(tipo === "propostas" ? "proposta" : "pedido", id).catch(() => null);
  if (!doc) return Response.json({ erro: "Documento não encontrado." }, { status: 404 });

  const emitente = await prisma.empresa.findUnique({
    where: { id: doc.empresaId },
    select: {
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true,
      inscricaoEstadual: true,
      logradouro: true,
      numero: true,
      complemento: true,
      bairro: true,
      cidade: true,
      uf: true,
      cep: true,
      email: true,
      telefone: true,
    },
  });
  if (!emitente) return Response.json({ erro: "Empresa não encontrada." }, { status: 404 });

  const pdf = await gerarPdfDocumento(doc, emitente);
  const arquivo = `${doc.tipo === "proposta" ? "Proposta" : "Pedido"}-${fmtNumeroDoc(doc.numero)}.pdf`;
  const baixar = new URL(request.url).searchParams.get("baixar") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${arquivo}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
