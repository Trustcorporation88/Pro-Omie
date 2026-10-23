import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetalheDocumento } from "@/components/vendas/detalhe-documento";
import { exigirUsuario } from "@/lib/auth/sessao";
import { alvoEmailDoDocumento } from "@/modules/email/consultas";
import { pode } from "@/lib/auth/permissoes";
import { carregarOpcoesVenda, obterDocumento } from "@/modules/vendas/consultas";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { NfePedido } from "@/components/fiscal/nfe-pedido";
import { NfsePedido } from "@/components/fiscal/nfse-pedido";
import { painelNfePedido } from "@/modules/fiscal/nfe/consultas";
import { painelNfsePedido } from "@/modules/fiscal/nfse/consultas";

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
  const email = await alvoEmailDoDocumento(doc);
  // painéis fiscais: pedido faturado (ou que já teve nota). NF-e para os produtos, NFS-e para os serviços.
  const fiscal = doc.status === "FATURADO" || doc.status === "CANCELADO";
  const [painel, painelServicos] = fiscal ? await Promise.all([painelNfePedido(id).catch(() => null), painelNfsePedido(id).catch(() => null)]) : [null, null];
  const mostrarNfe = !!painel && (painel.pedidoFaturado || painel.notas.length > 0) && (painel.resumo.itens.length > 0 || painel.notas.length > 0);
  const mostrarNfse = !!painelServicos && (painelServicos.temServicos || painelServicos.notas.length > 0);
  const podeFiscal = pode(u.papel, "fiscal:editar");
  return (
    <DetalheDocumento
      doc={doc}
      opcoes={opcoes}
      podeEditar={pode(u.papel, "vendas:editar")}
      podeFaturar={pode(u.papel, "vendas:editar") && pode(u.papel, "financeiro:editar")}
      podeVerFinanceiro={pode(u.papel, "financeiro:ver")}
      email={email}
      painelNfe={
        mostrarNfe || mostrarNfse ? (
          <>
            {mostrarNfe && painel && <NfePedido pedidoId={id} painel={painel} podeEditar={podeFiscal} />}
            {mostrarNfse && painelServicos && <NfsePedido pedidoId={id} painel={painelServicos} podeEditar={podeFiscal} />}
          </>
        ) : null
      }
    />
  );
}
