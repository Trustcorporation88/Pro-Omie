"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Selo } from "@/components/selos";
import { fmtDataHora, fmtMoeda } from "@/lib/format";
import { lancarEntradaNotaAcao } from "@/modules/estoque/acoes";
import type { SugestoesEntradaNota } from "@/modules/estoque/entrada-nota";

const MOTIVO: Record<string, string> = { vinculo: "já usado com este fornecedor", gtin: "mesmo código de barras", ncm: "mesmo NCM" };
const fmtQ = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Bloco "Entrada no estoque" da NF-e recebida: de-para item → produto, quantidade e lançamento com custo. */
export function EntradaNota({ dados, podeEditar }: { dados: SugestoesEntradaNota; podeEditar: boolean }) {
  const router = useRouter();
  const [escolhas, setEscolhas] = useState<Record<number, { produtoId: string; quantidade: string }>>(() => Object.fromEntries(dados.itens.map((i) => [i.numero, { produtoId: i.sugestaoProdutoId ?? "", quantidade: fmtQ(i.quantidade) }])));
  const [pendente, iniciar] = useTransition();
  const selecionados = dados.itens.filter((i) => escolhas[i.numero]?.produtoId);
  if (dados.lancado)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PackagePlus className="size-4 text-muted-foreground" aria-hidden /> Entrada no estoque
            <Selo tom="sucesso">Lançada</Selo>
          </CardTitle>
          <CardDescription>
            Entrada nº {String(dados.lancado.numero).padStart(4, "0")} em {fmtDataHora(dados.lancado.em)}. Veja em{" "}
            <Link href="/estoque/movimentacoes" className="underline">
              Estoque › Movimentações
            </Link>
            .
          </CardDescription>
        </CardHeader>
      </Card>
    );
  if (!dados.podeLancar) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PackagePlus className="size-4 text-muted-foreground" aria-hidden /> Entrada no estoque
        </CardTitle>
        <CardDescription>
          Escolha o produto do cadastro de cada item comprado e confira a quantidade na unidade do estoque. O custo unitário vai para o custo médio do produto. Itens sem produto não entram (serviços, materiais de consumo).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {dados.produtos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum produto que controla estoque. Cadastre os materiais em Estoque › Saldos.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>#</TableHead>
                <TableHead>Item da nota</TableHead>
                <TableHead className="text-right">Qtd. na nota</TableHead>
                <TableHead>Produto do cadastro</TableHead>
                <TableHead className="text-right">Qtd. que entra</TableHead>
                <TableHead className="text-right">Custo unitário</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.itens.map((i) => {
                const e = escolhas[i.numero];
                const q = Number(e.quantidade.replace(/\./g, "").replace(",", ".")) || 0;
                const prod = dados.produtos.find((p) => p.id === e.produtoId);
                return (
                  <TableRow key={i.numero} className="align-top">
                    <TableCell className="tabular text-xs">{i.numero}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal">
                      <span className="block text-sm font-medium">{i.descricao}</span>
                      <span className="text-xs text-muted-foreground">
                        cód. {i.codigo}
                        {i.ncm ? ` · NCM ${i.ncm}` : ""}
                        {i.gtin ? ` · GTIN ${i.gtin}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="tabular text-right text-sm whitespace-nowrap">
                      {fmtQ(i.quantidade)} {i.unidade}
                      <span className="block text-xs text-muted-foreground">{fmtMoeda(i.valorTotal)}</span>
                    </TableCell>
                    <TableCell className="min-w-64 max-w-96 whitespace-normal">
                      <select
                        aria-label={`Produto do item ${i.numero}`}
                        value={e.produtoId}
                        disabled={!podeEditar}
                        onChange={(ev) => setEscolhas({ ...escolhas, [i.numero]: { ...e, produtoId: ev.target.value } })}
                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
                      >
                        <option value="">— não entra no estoque</option>
                        {dados.produtos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.codigo} · {p.descricao} ({p.unidade})
                          </option>
                        ))}
                      </select>
                      {i.motivoSugestao && e.produtoId === i.sugestaoProdutoId && <span className="mt-1 block text-xs text-muted-foreground">Sugerido: {MOTIVO[i.motivoSugestao]}.</span>}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Input aria-label={`Quantidade do item ${i.numero}`} inputMode="decimal" className="ml-auto w-28 text-right" value={e.quantidade} disabled={!podeEditar || !e.produtoId} onChange={(ev) => setEscolhas({ ...escolhas, [i.numero]: { ...e, quantidade: ev.target.value } })} />
                      {prod && <span className="block text-xs text-muted-foreground">{prod.unidade}</span>}
                    </TableCell>
                    <TableCell className="tabular text-right text-sm whitespace-nowrap">{e.produtoId && q > 0 ? fmtMoeda(i.valorTotal / q) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {podeEditar && dados.produtos.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {selecionados.length} de {dados.itens.length} item(ns) vão entrar no estoque{selecionados.length ? ` (${fmtMoeda(selecionados.reduce((a, i) => a + i.valorTotal, 0))} ao custo)` : ""}.
            </p>
            <Button
              disabled={pendente || selecionados.length === 0}
              onClick={() =>
                iniciar(async () => {
                  const r = await lancarEntradaNotaAcao(
                    dados.documentoId,
                    dados.itens.map((i) => ({ numero: i.numero, produtoId: escolhas[i.numero].produtoId || null, quantidade: Number(escolhas[i.numero].quantidade.replace(/\./g, "").replace(",", ".")) || 0 })),
                  );
                  if (r.ok) toast.success(r.mensagem ?? "Entrada registrada.", { duration: 9000 });
                  else toast.error(r.erro, { duration: 10000 });
                  router.refresh();
                })
              }
            >
              {pendente ? <LoaderCircle className="animate-spin" /> : <PackagePlus />} Lançar entrada no estoque
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
