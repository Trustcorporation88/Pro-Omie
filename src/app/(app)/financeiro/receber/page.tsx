import type { Metadata } from "next";
import { PaginaTitulos } from "@/components/financeiro/pagina-titulos";
import { exigirUsuario } from "@/lib/auth/sessao";

export const metadata: Metadata = { title: "Contas a receber" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ContasReceberPage({ searchParams }: Props) {
  const u = await exigirUsuario("financeiro:ver");
  return <PaginaTitulos tipo="RECEBER" usuario={u} searchParams={await searchParams} />;
}
