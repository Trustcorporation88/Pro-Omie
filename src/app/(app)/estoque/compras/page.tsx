import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileClock, PackageCheck, ReceiptText, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, CampoBusca, SelectFiltro } from "@/components/filtros";
import { CartaoKpi } from "@/components/relatorios/cartao-kpi";
import { Selo } from "@/components/selos";
import { exigirUsuario } from "@/lib/auth/sessao";
import { fmtData, fmtDocumento, fmtMoeda } from "@/lib/format";
import { carregarCompras, lerFiltrosCompras, type LinhaCompra } from "@/modules/estoque/compras";

export const metadata: Metadata = { title: "Compras" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
const recusada = (l: LinhaCompra) => l.manifestacao === "DESCONHECIMENTO" || l.manifestacao === "NAO_REALIZADA";

function SituacaoPagar({ l }: { l: LinhaCompra }) {
  if (l.situacao !== "AUTORIZADO") return <Selo>{l.situacao === "CANCELADO" ? "Cancelada" : "Denegada"}</Selo>;
  if (recusada(l)) return <Selo>Recusada</Selo>;
  if (l.contasAPagar) return <Selo tom="sucesso">Lançada</Selo>;
  if (l.valor <= 0) return <span className="text-xs text-muted-foreground">sem valor</span>;
  return <Selo tom="alerta">Pendente</Selo>;
}

function SituacaoEstoque({ l }: { l: LinhaCompra }) {
  if (l.situacao !== "AUTORIZADO" || recusada(l)) return <span className="text-muted-foreground">—</span>;
  if (l.entradaEstoque) return <Selo tom="sucesso">Entrada nº {String(l.entradaEstoque.numero).padStart(4, "0")}</Selo>;
  if (!l.completo) return <Selo tom="info">Aguardando XML</Selo>;
  return <Selo tom="alerta">Pendente</Selo>;
}

export default async function Pagina({ searchParams }: Props) {
  await exigirUsuario("fiscal:ver");
  const sp = await searchParams;
  const f = lerFiltrosCompras(sp);
  const { periodo, linhas, totais, estabelecimentos } = await carregarCompras(f);
  const mes = (delta: number) => {
    const d = new Date(Date.UTC(periodo.ano, periodo.mes - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const link = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ competencia: periodo.competencia, situacao: f.situacao, q: f.q, estab: f.estab, ...extra })) if (v && !(k === "situacao" && v === "todas")) p.set(k, v);
    return `/estoque/compras?${p.toString()}`;
  };
  return (
    <>
      <PageHeader titulo="Compras" descricao="NF-e dos fornecedores emitidas contra o CNPJ: lance no contas a pagar e dê entrada no estoque, com o custo de cada material.">
        <Button variant="outline" asChild>
          <Link href="/fiscal/recebidas">
            <ReceiptText /> Todas as notas recebidas
          </Link>
        </Button>
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={link({ competencia: mes(-1) })} aria-label="Mês anterior">
            <ArrowLeft />
          </Link>
        </Button>
        <span className="min-w-44 text-center text-lg font-semibold">{periodo.rotulo}</span>
        <Button asChild variant="outline" size="sm">
          <Link href={link({ competencia: mes(1) })} aria-label="Mês seguinte">
            <ArrowRight />
          </Link>
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoKpi titulo="Compras no mês" valor={fmtMoeda(totais.valor)} icone={ShoppingBag} tom="info" href={link({ situacao: "todas" })}>
          {plural(totais.notas, "nota", "notas")}
        </CartaoKpi>
        <CartaoKpi titulo="Sem entrada no estoque" valor={String(totais.semEstoque)} icone={PackageCheck} tom={totais.semEstoque ? "alerta" : "sucesso"} href={link({ situacao: "estoque" })}>
          com o XML completo
        </CartaoKpi>
        <CartaoKpi titulo="Sem conta a pagar" valor={String(totais.semPagar)} icone={ReceiptText} tom={totais.semPagar ? "alerta" : "sucesso"} href={link({ situacao: "pagar" })}>
          lance com as duplicatas da nota
        </CartaoKpi>
        <CartaoKpi titulo="Aguardando XML" valor={String(totais.aguardandoXml)} icone={FileClock} tom="roxo" href={link({ situacao: "xml" })}>
          a SEFAZ manda depois da ciência
        </CartaoKpi>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <AbasFiltro
            parametro="situacao"
            padrao="todas"
            opcoes={[
              { valor: "todas", rotulo: "Todas" },
              { valor: "estoque", rotulo: "Sem estoque", contador: totais.semEstoque },
              { valor: "pagar", rotulo: "Sem conta a pagar", contador: totais.semPagar },
              { valor: "xml", rotulo: "Aguardando XML", contador: totais.aguardandoXml },
            ]}
          />
          {estabelecimentos.length > 1 && <SelectFiltro parametro="estab" rotuloTodos="Todos os estabelecimentos" opcoes={estabelecimentos.map((e) => ({ valor: e.id, rotulo: e.nome }))} />}
        </div>
        <CampoBusca placeholder="Fornecedor, CNPJ ou número…" className="lg:w-72" />
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio
          titulo={f.situacao === "todas" && !f.q ? `Nenhuma nota de compra em ${periodo.rotulo.toLowerCase()}` : "Nenhuma nota neste filtro"}
          descricao="As NF-e emitidas contra o CNPJ chegam sozinhas quando a busca de notas está ligada (Configurações › Empresas e filiais › Notas recebidas)."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-3">Emissão</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Contas a pagar</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead className="pr-3">
                  <span className="sr-only">Abrir</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id} className={l.situacao !== "AUTORIZADO" || recusada(l) ? "opacity-60" : undefined}>
                  <TableCell className="pl-3 text-sm whitespace-nowrap">{l.emitidoEm ? fmtData(l.emitidoEm) : "—"}</TableCell>
                  <TableCell className="max-w-72 whitespace-normal">
                    <span className="block text-sm font-medium">{l.fornecedor}</span>
                    {l.documento && <span className="text-xs text-muted-foreground">{fmtDocumento(l.documento)}</span>}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {l.numero ? `nº ${l.numero}` : "—"}
                    {l.serie ? <span className="text-muted-foreground"> · série {l.serie}</span> : null}
                    {estabelecimentos.length > 1 && <span className="block text-xs text-muted-foreground">{l.estabelecimento}</span>}
                  </TableCell>
                  <TableCell className="tabular text-right text-sm">{fmtMoeda(l.valor)}</TableCell>
                  <TableCell>
                    <SituacaoPagar l={l} />
                  </TableCell>
                  <TableCell>
                    <SituacaoEstoque l={l} />
                  </TableCell>
                  <TableCell className="pr-3 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/fiscal/recebidas/${l.id}`}>Abrir</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Na nota: “Lançar no contas a pagar” cria os títulos pelas duplicatas; “Entrada no estoque” escolhe o material de cada item e atualiza o custo médio.</p>
    </>
  );
}
