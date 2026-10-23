import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FormularioDocumento } from "@/components/vendas/formulario-documento";
import { exigirUsuario } from "@/lib/auth/sessao";
import { hojeISO } from "@/lib/datas";
import { oportunidadeParaNovaProposta } from "@/modules/crm/consultas";
import { itemInicialDoProduto } from "@/modules/estoque/consultas";
import { carregarOpcoesVenda } from "@/modules/vendas/consultas";
import { valoresNovos } from "@/modules/vendas/valores";

export const metadata: Metadata = { title: "Nova proposta" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("vendas:editar");
  const sp = await searchParams;
  const oportunidadeId = typeof sp.oportunidade === "string" ? sp.oportunidade : null;
  const produtoId = typeof sp.produto === "string" ? sp.produto : null;
  const [opcoes, oportunidade, item] = await Promise.all([
    carregarOpcoesVenda(),
    oportunidadeId ? oportunidadeParaNovaProposta(oportunidadeId) : null,
    produtoId ? itemInicialDoProduto(produtoId) : null,
  ]);
  const iniciais = valoresNovos(opcoes, hojeISO(), u.id);
  if (item) iniciais.itens = [item];
  if (oportunidade) {
    // veio do funil: cliente, responsável e vínculo já preenchidos
    Object.assign(iniciais, {
      oportunidadeId: oportunidade.id,
      oportunidadeTitulo: oportunidade.titulo,
      pessoaId: oportunidade.pessoaId,
      pessoaNome: oportunidade.pessoaNome,
      ...(oportunidade.responsavelId && opcoes.vendedores.some((x) => x.valor === oportunidade.responsavelId) ? { vendedorId: oportunidade.responsavelId } : {}),
    });
  }
  const voltar = oportunidade ? { href: `/crm/oportunidades/${oportunidade.id}`, rotulo: oportunidade.titulo } : { href: "/vendas/propostas", rotulo: "Propostas" };
  return (
    <>
      <Link href={voltar.href} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {voltar.rotulo}
      </Link>
      <PageHeader titulo="Nova proposta" />
      <FormularioDocumento tipo="proposta" id={null} opcoes={opcoes} iniciais={iniciais} />
    </>
  );
}
