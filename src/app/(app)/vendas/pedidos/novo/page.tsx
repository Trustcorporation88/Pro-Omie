import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FormularioDocumento } from "@/components/vendas/formulario-documento";
import { exigirUsuario } from "@/lib/auth/sessao";
import { hojeISO } from "@/lib/datas";
import { carregarOpcoesVenda } from "@/modules/vendas/consultas";
import { valoresNovos } from "@/modules/vendas/valores";

export const metadata: Metadata = { title: "Novo pedido" };

export default async function Pagina() {
  const u = await exigirUsuario("vendas:editar");
  const opcoes = await carregarOpcoesVenda();
  return (
    <>
      <Link href="/vendas/pedidos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pedidos de venda
      </Link>
      <PageHeader titulo="Novo pedido" />
      <FormularioDocumento tipo="pedido" id={null} opcoes={opcoes} iniciais={valoresNovos(opcoes, hojeISO(), u.id)} />
    </>
  );
}
