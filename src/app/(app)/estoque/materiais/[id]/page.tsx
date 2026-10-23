import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, Plus, Scale, ShoppingCart, SlidersHorizontal, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { SelectFiltro } from "@/components/filtros";
import { CartaoKpi } from "@/components/relatorios/cartao-kpi";
import { Selo } from "@/components/selos";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { fmtData, fmtMesAno, fmtMoeda } from "@/lib/format";
import { extratoMaterial } from "@/modules/estoque/consultas";
import { MOTIVOS_AJUSTE, ROTULO_TIPO_LANC, TOM_TIPO_LANC, fmtQtd, rotuloGrupo, type MotivoAjuste } from "@/modules/estoque/tipos";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const e = await extratoMaterial(id, "").catch(() => null);
  return { title: e ? e.produto.descricao : "Material não encontrado" };
}

const fmtNcm = (n: string | null) => (n ? `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6)}` : null);
const num4 = (n: number) => String(n).padStart(4, "0");

export default async function Pagina({ params, searchParams }: Props) {
  const u = await exigirUsuario("estoque:ver");
  const { id } = await params;
  const sp = await searchParams;
  const estab = typeof sp.estab === "string" ? sp.estab : "";
  const e = await extratoMaterial(id, estab);
  if (!e) notFound();
  const p = e.produto;
  const podeEditar = pode(u.papel, "estoque:editar");
  const podeVender = pode(u.papel, "vendas:editar");
  const variosEstabs = e.estabelecimentos.length > 1;
  const mostrados = e.movimentos.slice(0, 300);
  const ncm = fmtNcm(p.ncm);

  return (
    <>
      <Link href="/estoque" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Estoque
      </Link>
      <PageHeader
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {p.descricao}
            <Selo tom="neutro">{rotuloGrupo(p.grupo)}</Selo>
            {!p.ativo && <Selo tom="alerta">inativo</Selo>}
            {!p.controlaEstoque && <Selo tom="alerta">não controla estoque</Selo>}
          </span>
        }
        descricao={[p.codigo, p.precoVenda ? `${fmtMoeda(p.precoVenda)}/${p.unidade.toLowerCase()}` : "sem preço de venda", ncm ? `NCM ${ncm}` : null].filter(Boolean).join(" · ")}
      >
        {podeEditar && (
          <Button variant="outline" asChild>
            <Link href={`/estoque/ajuste?material=${p.id}`}>
              <SlidersHorizontal /> Ajustar
            </Link>
          </Button>
        )}
        {podeEditar && (
          <Button variant="outline" asChild>
            <Link href="/estoque/entradas/nova">
              <Plus /> Entrada
            </Link>
          </Button>
        )}
        {podeVender && p.ativo && e.saldo > 0 && (
          <Button asChild>
            <Link href={`/vendas/pedidos/novo?produto=${p.id}`}>
              <ShoppingCart /> Vender
            </Link>
          </Button>
        )}
      </PageHeader>

      {variosEstabs && (
        <div className="mb-4">
          <SelectFiltro parametro="estab" rotuloTodos="Todos os estabelecimentos" opcoes={e.estabelecimentos.map((x) => ({ valor: x.id, rotulo: x.nome }))} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoKpi titulo="Saldo" valor={fmtQtd(e.saldo, p.unidade)} icone={Scale} tom="info">
          {variosEstabs && !estab
            ? e.estabelecimentos
                .filter((x) => (e.saldos[x.id] ?? 0) !== 0)
                .map((x) => `${x.nome}: ${fmtQtd(e.saldos[x.id] ?? 0, p.unidade)}`)
                .join(" · ") || "sem saldo"
            : p.precoVenda && e.saldo > 0
              ? `${fmtMoeda(e.saldo * p.precoVenda)} a preço de venda`
              : "—"}
        </CartaoKpi>
        <CartaoKpi titulo="Entrou em 90 dias" valor={fmtQtd(e.resumo90.entrou, p.unidade)} icone={ArrowDownToLine} tom="sucesso">
          {e.resumo90.ajustes ? `ajustes ${e.resumo90.ajustes > 0 ? "+" : "−"}${fmtQtd(Math.abs(e.resumo90.ajustes), p.unidade)}` : "produção e triagem"}
        </CartaoKpi>
        <CartaoKpi titulo="Vendido em 90 dias" valor={fmtQtd(e.resumo90.vendido, p.unidade)} icone={ShoppingCart} tom="roxo">
          baixa pelos pedidos faturados
        </CartaoKpi>
        <CartaoKpi titulo="Preço médio de venda" valor={e.resumo90.precoMedio !== null ? `${fmtMoeda(e.resumo90.precoMedio)}/${p.unidade.toLowerCase()}` : "—"} icone={TrendingUp}>
          últimos 90 dias
        </CartaoKpi>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0 gap-0 overflow-hidden py-0">
          <div className="px-4 py-3">
            <h2 className="text-base font-semibold">Movimentos</h2>
            <p className="text-xs text-muted-foreground">Do mais recente ao mais antigo, com o saldo depois de cada um.</p>
          </div>
          {mostrados.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">Nenhum movimento ainda.</p>
          ) : (
            <Table>
              <TableCaption className="sr-only">Movimentos de {p.descricao}</TableCaption>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-4">Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Histórico</TableHead>
                  <TableHead className="text-right">Entrada</TableHead>
                  <TableHead className="text-right">Saída</TableHead>
                  <TableHead className="pr-4 text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mostrados.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="tabular pl-4 text-sm whitespace-nowrap">
                      {fmtData(m.data)}
                      <div className="text-xs text-muted-foreground">{`nº ${num4(m.numero)}`}</div>
                    </TableCell>
                    <TableCell>
                      <Selo tom={TOM_TIPO_LANC[m.tipo]}>{ROTULO_TIPO_LANC[m.tipo]}</Selo>
                    </TableCell>
                    <TableCell className="max-w-72 min-w-44 text-sm whitespace-normal">
                      {m.pedidoId ? (
                        <Link href={`/vendas/pedidos/${m.pedidoId}`} className="hover:underline">
                          {m.historico}
                        </Link>
                      ) : m.tipo === "AJUSTE" ? (
                        <span>
                          {m.motivo ? (MOTIVOS_AJUSTE[m.motivo as MotivoAjuste] ?? m.motivo) : "Ajuste"}
                          {m.saldoContado !== null && <span className="text-muted-foreground">{` · contado ${fmtQtd(m.saldoContado, p.unidade)}`}</span>}
                        </span>
                      ) : (
                        <span>{m.historico ?? "Produção / triagem"}</span>
                      )}
                      <div className="text-xs text-muted-foreground">{[variosEstabs ? m.empresaNome : null, m.usuarioNome].filter(Boolean).join(" · ")}</div>
                    </TableCell>
                    <TableCell className="tabular text-right text-success">{m.quantidade > 0 ? fmtQtd(m.quantidade, p.unidade) : ""}</TableCell>
                    <TableCell className="tabular text-right text-destructive">{m.quantidade < 0 ? fmtQtd(-m.quantidade, p.unidade) : ""}</TableCell>
                    <TableCell className={cn("tabular pr-4 text-right font-medium", m.saldoApos < 0 && "text-destructive")}>{fmtQtd(m.saldoApos, p.unidade)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {e.movimentos.length > mostrados.length && (
            <p className="px-4 py-3 text-xs text-muted-foreground">{`Mostrando os ${mostrados.length} movimentos mais recentes de ${e.movimentos.length}.`}</p>
          )}
        </Card>

        <Card className="h-fit gap-2">
          <CardHeader>
            <CardTitle className="text-base">Vendas nos últimos 6 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-0">Mês</TableHead>
                  <TableHead className="text-right">Vendido</TableHead>
                  <TableHead className="pr-0 text-right">Preço médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.meses.map((m) => (
                  <TableRow key={m.mes}>
                    <TableCell className="pl-0 text-sm capitalize">{fmtMesAno(`${m.mes}-01`)}</TableCell>
                    <TableCell className="tabular text-right text-sm">
                      {m.quantidade ? fmtQtd(m.quantidade, p.unidade) : <span className="text-muted-foreground">—</span>}
                      {m.receita > 0 && <div className="text-xs text-muted-foreground">{fmtMoeda(m.receita)}</div>}
                    </TableCell>
                    <TableCell className="tabular pr-0 text-right text-sm">{m.quantidade > 0 ? `${fmtMoeda(m.receita / m.quantidade)}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
