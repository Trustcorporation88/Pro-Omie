import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, DataFiltro, Paginacao, SelectFiltro } from "@/components/filtros";
import { Selo } from "@/components/selos";
import { BotaoExcluirLancamento } from "@/components/estoque/botao-excluir-lancamento";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { fmtData } from "@/lib/format";
import { POR_PAGINA_ESTOQUE, listarLancamentos, lerFiltrosLancamentos } from "@/modules/estoque/consultas";
import { MOTIVOS_AJUSTE, ROTULO_TIPO_LANC, TOM_TIPO_LANC, fmtPeso, fmtQtd, type MotivoAjuste } from "@/modules/estoque/tipos";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Movimentações do estoque" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const num4 = (n: number) => String(n).padStart(4, "0");

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("estoque:ver");
  const f = lerFiltrosLancamentos(await searchParams);
  const { total, contadores, linhas, materiais, estabelecimentos } = await listarLancamentos(f);
  const podeEditar = pode(u.papel, "estoque:editar");
  const variosEstabs = estabelecimentos.length > 1;

  return (
    <>
      <Link href="/estoque" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Estoque
      </Link>
      <PageHeader titulo="Movimentações do estoque" descricao="Entradas da produção, saídas por venda (feitas ao faturar o pedido) e ajustes de inventário.">
        {podeEditar && (
          <Button asChild>
            <Link href="/estoque/entradas/nova">
              <Plus /> Nova entrada
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="mb-4 flex flex-col items-start gap-3">
        <AbasFiltro
          parametro="tipo"
          padrao=""
          opcoes={[
            { valor: "", rotulo: "Todas", contador: contadores[""] },
            { valor: "entrada", rotulo: "Entradas", contador: contadores.ENTRADA },
            { valor: "venda", rotulo: "Vendas", contador: contadores.VENDA },
            { valor: "ajuste", rotulo: "Ajustes", contador: contadores.AJUSTE },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <SelectFiltro parametro="material" rotuloTodos="Todos os materiais" opcoes={materiais.map((m) => ({ valor: m.id, rotulo: m.descricao }))} />
          {variosEstabs && (
            <SelectFiltro parametro="estab" rotuloTodos="Todos os estabelecimentos" opcoes={estabelecimentos.map((e) => ({ valor: e.id, rotulo: e.nome }))} />
          )}
          <DataFiltro parametro="de" rotulo="De" />
          <DataFiltro parametro="ate" rotulo="Até" />
        </div>
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma movimentação" descricao="As entradas da produção, as vendas faturadas e os ajustes aparecem aqui." />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableCaption className="sr-only">Movimentações do estoque</TableCaption>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-16 pl-3">Nº</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Materiais</TableHead>
                <TableHead className="text-right">Peso</TableHead>
                <TableHead>Origem ou destino</TableHead>
                <TableHead className="w-12 pr-3">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id} className="align-top">
                  <TableCell className="tabular pl-3 font-medium">{num4(l.numero)}</TableCell>
                  <TableCell className="tabular text-sm whitespace-nowrap">{fmtData(l.data)}</TableCell>
                  <TableCell>
                    <Selo tom={TOM_TIPO_LANC[l.tipo]}>{ROTULO_TIPO_LANC[l.tipo]}</Selo>
                  </TableCell>
                  <TableCell className="min-w-56">
                    <ul className="space-y-0.5 text-sm">
                      {l.itens.map((i) => (
                        <li key={i.produtoId} className="flex justify-between gap-3">
                          <Link href={`/estoque/materiais/${i.produtoId}`} className="truncate hover:underline">
                            {i.descricao}
                          </Link>
                          <span className={cn("tabular shrink-0", i.quantidade > 0 ? "text-success" : "text-destructive")}>
                            {`${i.quantidade > 0 ? "+" : "−"}${fmtQtd(Math.abs(i.quantidade), i.unidade)}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell className={cn("tabular text-right text-sm font-medium whitespace-nowrap", l.pesoKg < 0 && "text-destructive")}>
                    {l.pesoKg ? `${l.pesoKg > 0 ? "+" : "−"}${fmtPeso(Math.abs(l.pesoKg))}` : "—"}
                  </TableCell>
                  <TableCell className="max-w-72 min-w-48 text-sm whitespace-normal">
                    {l.pedido ? (
                      <Link href={`/vendas/pedidos/${l.pedido.id}`} className="hover:underline">
                        {`Pedido nº ${num4(l.pedido.numero)} · ${l.pedido.cliente}`}
                      </Link>
                    ) : l.tipo === "AJUSTE" ? (
                      <span>{l.motivo ? (MOTIVOS_AJUSTE[l.motivo as MotivoAjuste] ?? l.motivo) : "Ajuste"}</span>
                    ) : (
                      <span>{[l.pessoaNome, l.referencia].filter(Boolean).join(" · ") || "Produção / triagem"}</span>
                    )}
                    {l.observacao && <div className="line-clamp-2 text-xs text-muted-foreground">{l.observacao}</div>}
                    <div className="text-xs text-muted-foreground">
                      {[variosEstabs ? l.empresaNome : null, l.usuarioNome].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className="pr-3 text-right">
                    {podeEditar && l.tipo !== "VENDA" && <BotaoExcluirLancamento id={l.id} rotulo={`${ROTULO_TIPO_LANC[l.tipo].toLowerCase()} nº ${num4(l.numero)}`} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <div className="mt-4">
        <Paginacao pagina={f.pagina} total={total} porPagina={POR_PAGINA_ESTOQUE} />
      </div>
    </>
  );
}
