import type { Metadata } from "next";
import { PaginaListaVendas } from "@/components/vendas/pagina-lista";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";

export const metadata: Metadata = { title: "Pedidos de venda" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("vendas:ver");
  return <PaginaListaVendas tipo="pedido" searchParams={await searchParams} podeEditar={pode(u.papel, "vendas:editar")} />;
}
