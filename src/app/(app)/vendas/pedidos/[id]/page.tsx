import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetalheDocumento } from "@/components/vendas/detalhe-documento";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { carregarOpcoesVenda, obterDocumento } from "@/modules/vendas/consultas";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const doc = await obterDocumento("pedido", id).catch(() => null);
  return { title: doc ? `Pedido ${fmtNumeroDoc(doc.numero)}` : "Pedido não encontrado" };
}

export default async function Pagina({ params }: Props) {
  const u = await exigirUsuario("vendas:ver");
  const { id } = await params;
  const [doc, opcoes] = await Promise.all([obterDocumento("pedido", id), carregarOpcoesVenda()]);
  if (!doc) notFound();
  return (
    <DetalheDocumento
      doc={doc}
      opcoes={opcoes}
      podeEditar={pode(u.papel, "vendas:editar")}
      podeFaturar={pode(u.papel, "vendas:editar") && pode(u.papel, "financeiro:editar")}
      podeVerFinanceiro={pode(u.papel, "financeiro:ver")}
    />
  );
}
