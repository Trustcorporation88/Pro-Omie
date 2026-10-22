import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FormularioDocumento } from "@/components/vendas/formulario-documento";
import { exigirUsuario } from "@/lib/auth/sessao";
import { hojeISO } from "@/lib/datas";
import { carregarOpcoesVenda, obterDocumento } from "@/modules/vendas/consultas";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { valoresDoDocumento } from "@/modules/vendas/valores";

export const metadata: Metadata = { title: "Editar pedido" };

type Props = { params: Promise<{ id: string }> };

export default async function Pagina({ params }: Props) {
  await exigirUsuario("vendas:editar");
  const { id } = await params;
  const [doc, opcoes] = await Promise.all([obterDocumento("pedido", id), carregarOpcoesVenda()]);
  if (!doc) notFound();
  if (!(["ABERTO"] as string[]).includes(doc.status)) redirect(`/vendas/pedidos/${id}`);
  return (
    <>
      <Link href={`/vendas/pedidos/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pedido nº {fmtNumeroDoc(doc.numero)}
      </Link>
      <PageHeader titulo={`Editar pedido nº ${fmtNumeroDoc(doc.numero)}`} />
      <FormularioDocumento tipo="pedido" id={doc.id} numero={doc.numero} opcoes={opcoes} iniciais={valoresDoDocumento(doc, hojeISO())} />
    </>
  );
}
