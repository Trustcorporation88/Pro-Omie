import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Package, Receipt, Scale, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { SelectFiltro } from "@/components/filtros";
import { CartaoKpi } from "@/components/relatorios/cartao-kpi";
import { BotaoExportarCsv } from "@/components/relatorios/exportar-csv";
import { FiltroPeriodo } from "@/components/estoque/filtro-periodo";
import { exigirUsuario } from "@/lib/auth/sessao";
import { fmtData, fmtMoeda } from "@/lib/format";
import { PERIODOS_VENDAS, lerFiltrosVendasMaterial, vendasPorMaterial } from "@/modules/estoque/consultas";
import { fmtPeso, fmtQtd, rotuloGrupo } from "@/modules/estoque/tipos";

export const metadata: Metadata = { title: "Vendas por material" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

export default async function Pagina({ searchParams }: Props) {
  await exigirUsuario("estoque:ver");
  const f = lerFiltrosVendasMaterial(await searchParams);
  const r = await vendasPorMaterial(f);
  const periodo = PERIODOS_VENDAS.some((p) => p.valor === f.periodo) ? f.periodo : "personalizado";
  const csv = r.linhas.map((l) => [
    l.codigo ?? "",
    l.descricao,
    rotuloGrupo(l.grupo),
    l.produtoId ? l.quantidade : "",
    l.produtoId ? l.unidade : "",
    l.kg || "",
    l.receita,
    l.precoMedio ?? "",
    l.pedidos,
  ]);

  return (
    <>
      <Link href="/estoque" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Estoque
      </Link>
      <PageHeader
        titulo="Vendas por material"
        descricao={`Pedidos faturados de ${fmtData(r.de)} a ${fmtData(r.ate)}, pela data do faturamento. Quanto saiu de cada material, por quanto e para quem.`}
      >
        <BotaoExportarCsv
          arquivo={`vendas-por-material-${r.de}-a-${r.ate}.csv`}
          cabecalho={["Código", "Material", "Grupo", "Quantidade", "Unidade", "Peso (kg)", "Receita (R$)", "Preço médio (R$)", "Vendas"]}
          linhas={csv}
        />
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FiltroPeriodo periodo={periodo} de={r.de} ate={r.ate} opcoes={PERIODOS_VENDAS} />
        {r.estabelecimentos.length > 1 && (
          <SelectFiltro parametro="estab" rotuloTodos="Todos os estabelecimentos" opcoes={r.estabelecimentos.map((e) => ({ valor: e.id, rotulo: e.nome }))} />
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoKpi titulo="Receita" valor={fmtMoeda(r.totais.receita)} icone={Receipt} tom="sucesso">
          materiais vendidos no período
        </CartaoKpi>
        <CartaoKpi titulo="Peso vendido" valor={fmtPeso(r.totais.kg)} icone={Scale} tom="info">
          soma dos itens em kg, t ou g
        </CartaoKpi>
        <CartaoKpi titulo="Vendas" valor={String(r.totais.pedidos)} icone={Package}>
          pedidos faturados
        </CartaoKpi>
        <CartaoKpi titulo="Compradores" valor={String(r.compradores.length)} icone={Users} tom="roxo">
          {plural(r.totais.materiais, "material vendido", "materiais vendidos")}
        </CartaoKpi>
      </div>

      {r.linhas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma venda faturada no período" descricao="As vendas entram aqui quando o pedido é faturado. Escolha outro período." />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="min-w-0 gap-0 overflow-hidden py-0">
            <div className="px-4 py-3">
              <h2 className="text-base font-semibold">Por material</h2>
            </div>
            <Table>
              <TableCaption className="sr-only">Vendas por material</TableCaption>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-4">Material</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Preço médio</TableHead>
                  <TableHead className="pr-4 text-right">Vendas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.linhas.map((l) => (
                  <TableRow key={l.chave}>
                    <TableCell className="pl-4">
                      {l.produtoId ? (
                        <Link href={`/estoque/materiais/${l.produtoId}`} className="font-medium hover:underline">
                          {l.descricao}
                        </Link>
                      ) : (
                        <span className="font-medium text-muted-foreground">{l.descricao}</span>
                      )}
                      <div className="mt-1 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(2, l.participacao * 100)}%` }} />
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-right">{l.produtoId ? fmtQtd(l.quantidade, l.unidade) : l.kg ? fmtPeso(l.kg) : "—"}</TableCell>
                    <TableCell className="tabular text-right font-medium">
                      {fmtMoeda(l.receita)}
                      <div className="text-xs font-normal text-muted-foreground">{`${Math.round(l.participacao * 100)}%`}</div>
                    </TableCell>
                    <TableCell className="tabular text-right">{l.precoMedio !== null ? `${fmtMoeda(l.precoMedio)}/${l.unidade.toLowerCase()}` : "—"}</TableCell>
                    <TableCell className="tabular pr-4 text-right">{l.pedidos}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <Card className="h-fit gap-2">
            <CardHeader>
              <CardTitle className="text-base">Compradores</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {r.compradores.map((c) => (
                  <li key={c.pessoaId} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.nome}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{[c.kg ? fmtPeso(c.kg) : null, plural(c.pedidos, "venda", "vendas")].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className="tabular shrink-0 font-medium">{fmtMoeda(c.receita)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
