import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Download, FileArchive, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { fmtMoeda } from "@/lib/format";
import { periodoDe, resumoFechamento } from "@/modules/contador/consultas";

export const metadata: Metadata = { title: "Fechamento mensal" };

type Props = { searchParams: Promise<{ competencia?: string }> };

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="tabular mt-0.5 text-lg font-semibold">{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("fiscal:ver");
  const { competencia } = await searchParams;
  const p = periodoDe(competencia);
  const r = await resumoFechamento(p);
  const mes = (delta: number) => {
    const d = new Date(Date.UTC(p.ano, p.mes - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const financeiro = pode(u.papel, "financeiro:ver");
  const csv = (tipo: string) => `/api/contador/csv?tipo=${tipo}&competencia=${p.competencia}`;
  return (
    <>
      <PageHeader titulo="Fechamento mensal" descricao={`Tudo o que o contador precisa da competência, das empresas que você acessa: ${r.empresas.map((e) => e.nomeFantasia || e.razaoSocial).join(", ")}.`} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/contador?competencia=${mes(-1)}`} aria-label="Mês anterior">
            <ArrowLeft />
          </Link>
        </Button>
        <span className="min-w-44 text-center text-lg font-semibold">{p.rotulo}</span>
        <Button asChild variant="outline" size="sm">
          <Link href={`/contador?competencia=${mes(1)}`} aria-label="Mês seguinte">
            <ArrowRight />
          </Link>
        </Button>
        <form className="ml-2 flex items-center gap-2" action="/contador">
          <input type="month" name="competencia" defaultValue={p.competencia} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs" aria-label="Competência" />
          <Button type="submit" variant="outline" size="sm">
            Ir
          </Button>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="NF-e emitidas" valor={fmtMoeda(r.nfe.autorizadas.valor)} detalhe={`${r.nfe.autorizadas.quantidade} autorizada(s) · ${r.nfe.canceladas.quantidade} cancelada(s)`} />
        <Indicador rotulo="NFS-e emitidas" valor={fmtMoeda(r.nfse.geradas.valor)} detalhe={`${r.nfse.geradas.quantidade} gerada(s) · ${r.nfse.canceladas.quantidade} cancelada(s)`} />
        <Indicador rotulo="Notas recebidas" valor={fmtMoeda(r.recebidas.nfe.valor + r.recebidas.cte.valor + r.recebidas.nfse.valor)} detalhe={`${r.recebidas.nfe.quantidade} NF-e · ${r.recebidas.cte.quantidade} CT-e · ${r.recebidas.nfse.quantidade} NFS-e`} />
        {financeiro ? <Indicador rotulo="Recebido e pago no mês" valor={`${fmtMoeda(r.recebimentos)} / ${fmtMoeda(r.pagamentos)}`} detalhe={`em aberto: ${fmtMoeda(r.emAberto.receber.valor)} a receber, ${fmtMoeda(r.emAberto.pagar.valor)} a pagar`} /> : <Indicador rotulo="Financeiro" valor="—" detalhe="sem acesso ao financeiro" />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileArchive className="size-4 text-muted-foreground" aria-hidden /> XML da competência
            </CardTitle>
            <CardDescription>Um ZIP com os XML das notas emitidas (NF-e com eventos, NFS-e com cancelamentos) e recebidas (NF-e, CT-e, NFS-e), separados por empresa, mais um índice em CSV.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href={`/api/contador/xml?competencia=${p.competencia}`}>
                <Download /> Baixar XML de {p.rotulo}
              </a>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden /> Relatórios em CSV
            </CardTitle>
            <CardDescription>Abrem no Excel (separador ponto e vírgula, acentos preservados).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={csv("nfe")}>NF-e emitidas</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={csv("nfse")}>NFS-e emitidas</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={csv("recebidas")}>Notas recebidas</a>
            </Button>
            {financeiro && (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={csv("recebimentos")}>Recebimentos</a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={csv("pagamentos")}>Pagamentos</a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/financeiro/dre?ano=${p.ano}`}>DRE do ano</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
