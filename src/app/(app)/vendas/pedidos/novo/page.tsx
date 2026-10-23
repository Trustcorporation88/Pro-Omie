import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FormularioDocumento } from "@/components/vendas/formulario-documento";
import { exigirUsuario } from "@/lib/auth/sessao";
import { hojeISO } from "@/lib/datas";
import { itemInicialDoProduto } from "@/modules/estoque/consultas";
import { carregarOpcoesVenda } from "@/modules/vendas/consultas";
import { valoresNovos } from "@/modules/vendas/valores";

export const metadata: Metadata = { title: "Novo pedido" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("vendas:editar");
  const sp = await searchParams;
  const produtoId = typeof sp.produto === "string" ? sp.produto : null;
  const [opcoes, item] = await Promise.all([carregarOpcoesVenda(), produtoId ? itemInicialDoProduto(produtoId) : null]);
  const iniciais = valoresNovos(opcoes, hojeISO(), u.id);
  // botão Vender do estoque: o material já entra no pedido com o saldo e o preço por kg
  if (item) iniciais.itens = [item];
  const voltar = item && produtoId ? { href: `/estoque/materiais/${produtoId}`, rotulo: item.descricao } : { href: "/vendas/pedidos", rotulo: "Pedidos de venda" };
  return (
    <>
      <Link href={voltar.href} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {voltar.rotulo}
      </Link>
      <PageHeader titulo="Novo pedido" />
      <FormularioDocumento tipo="pedido" id={null} opcoes={opcoes} iniciais={iniciais} />
    </>
  );
}
