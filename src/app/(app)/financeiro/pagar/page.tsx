import type { Metadata } from "next";
import { PaginaTitulos } from "@/components/financeiro/pagina-titulos";
import { exigirUsuario } from "@/lib/auth/sessao";

export const metadata: Metadata = { title: "Contas a pagar" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ContasPagarPage({ searchParams }: Props) {
  const u = await exigirUsuario("financeiro:ver");
  return <PaginaTitulos tipo="PAGAR" usuario={u} searchParams={await searchParams} />;
}
