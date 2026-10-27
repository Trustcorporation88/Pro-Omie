import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Selo } from "@/components/selos";
import { AcoesRecebimento, BotaoRemoverDocumento } from "@/components/armazem/recebimento";
import { AcoesVolume } from "@/components/armazem/acoes-volume";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { fmtData, fmtDocumento, fmtMoeda } from "@/lib/format";
import { obterRecebimento } from "@/modules/armazem/consultas";
import { ROTULO_SITUACAO_COMPARATIVO, ROTULO_STATUS_RECEBIMENTO, fmtQuantidade, numeroRecebimento, situacaoVolume, type SituacaoComparativo } from "@/modules/armazem/tipos";

export const metadata: Metadata = { title: "Recebimento" };

type Props = { params: Promise<{ id: string }> };

const TOM_SITUACAO: Record<SituacaoComparativo, "sucesso" | "alerta" | "perigo" | "roxo"> = { OK: "sucesso", FALTA: "perigo", SOBRA: "alerta", NAO_PREVISTO: "roxo" };

export default async function Pagina({ params }: Props) {
  const u = await exigirUsuario("armazem:ver");
  const { id } = await params;
  const r = await obterRecebimento(id);
  if (!r) notFound();
  const podeEditar = pode(u.papel, "armazem:editar");
  const codigo = numeroRecebimento(r.numero);
  const aberto = r.status === "CONFERENCIA";
  const { linhas, resumo } = r.comparativo;
  const temConteudo = r.volumes.some((v) => v.conteudo.some((c) => c.recebimentoId === r.id));

  return (
    <>
      <Link href="/servicos/armazem/recebimentos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Recebimentos
      </Link>
      <PageHeader
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            Recebimento {codigo}
            <Selo tom={aberto ? "roxo" : "sucesso"}>{ROTULO_STATUS_RECEBIMENTO[r.status]}</Selo>
          </span>
        }
        descricao={`${r.depositante.nome}${r.depositante.documento ? ` · ${fmtDocumento(r.depositante.documento)}` : ""} · chegada ${fmtData(r.chegadaEm)} · ${r.estabelecimento.nome}`}
      >
        {podeEditar && <AcoesRecebimento recebimento={{ id: r.id, numero: r.numero, codigo, status: r.status }} resumo={resumo} temVolumes={r.volumes.length > 0} temConteudo={temConteudo} />}
      </PageHeader>

      <div className="space-y-4">
        {aberto && podeEditar && (
          <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <strong>Conferência:</strong> crie as caixas e os pallets, lance em cada um o que está dentro (código, lote e quantidade) e acompanhe o quadro
              esperado × conferido. Ao concluir, endereçe os volumes (dá para endereçar vários de uma vez em Caixas e pallets).
            </span>
          </div>
        )}

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="py-4">
            <CardTitle className="text-base">Documentos ({r.documentos.length})</CardTitle>
            {!r.documentos.length && <CardDescription>Recebimento sem documento: o que vale é o que for lançado nas caixas e pallets.</CardDescription>}
          </CardHeader>
          {r.documentos.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-4">Documento</TableHead>
                  <TableHead>Emitente</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="pr-4">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.documentos.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="max-w-80 min-w-60 pl-4 whitespace-normal">
                      <span className="flex items-center gap-2 text-sm font-medium whitespace-nowrap">
                        <Selo tom={d.tipo === "NFE" ? "info" : "roxo"}>{d.tipo === "NFE" ? "NF-e" : "CT-e"}</Selo>
                        nº {d.numero ?? "—"}
                        {d.serie ? ` · série ${d.serie}` : ""}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] break-all text-muted-foreground">{d.chave}</span>
                      {d.tipo === "NFE" && <span className="block text-xs text-muted-foreground">{d.itens} {d.itens === 1 ? "item esperado" : "itens esperados"}</span>}
                      {d.tipo === "CTE" && (
                        <span className="block text-xs text-muted-foreground">
                          {[d.pesoKg ? `${fmtQuantidade(d.pesoKg)} kg` : null, d.volumesDeclarados ? `${d.volumesDeclarados} volumes` : null, d.nfesReferenciadas.length ? `${d.nfesReferenciadas.length} NF-e transportada(s)` : null].filter(Boolean).join(" · ") ||
                            "transporte"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-56 min-w-44 whitespace-normal text-sm">
                      {d.emitenteNome ?? "—"}
                      {d.emitenteDocumento && <span className="block text-xs text-muted-foreground">{fmtDocumento(d.emitenteDocumento)}</span>}
                    </TableCell>
                    <TableCell className="text-sm">{d.emitidoEm ? fmtData(d.emitidoEm) : "—"}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{d.valor !== null ? fmtMoeda(d.valor) : "—"}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <span className="flex items-center justify-end gap-1">
                        {d.documentoRecebidoId && (
                          <Link href={`/fiscal/recebidas/${d.documentoRecebidoId}`} className="text-xs text-muted-foreground hover:underline">
                            ver nota
                          </Link>
                        )}
                        {aberto && podeEditar && <BotaoRemoverDocumento documentoId={d.id} rotulo={`${d.tipo === "NFE" ? "NF-e" : "CT-e"} ${d.numero ?? ""}`} />}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="py-4">
            <CardTitle className="text-base">Esperado × conferido</CardTitle>
            <CardDescription>
              {r.esperados.length
                ? "O que os documentos dizem contra o que foi lançado nas caixas e pallets. Nota sem lote: compara o total do código."
                : "Sem itens esperados: a lista abaixo é o que foi conferido."}
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-1">
              <Selo tom="sucesso">{resumo.ok} confere</Selo>
              {resumo.falta > 0 && <Selo tom="perigo">{resumo.falta} com falta</Selo>}
              {resumo.sobra > 0 && <Selo tom="alerta">{resumo.sobra} com sobra</Selo>}
              {resumo.naoPrevisto > 0 && <Selo tom="roxo">{resumo.naoPrevisto} fora da nota</Selo>}
              <span className="text-xs text-muted-foreground">
                total esperado {fmtQuantidade(resumo.esperado)} · conferido {fmtQuantidade(resumo.conferido)}
              </span>
            </div>
          </CardHeader>
          {linhas.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-4">Código</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-right">Esperado</TableHead>
                  <TableHead className="text-right">Conferido</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead className="pr-4">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={`${l.produtoId}-${l.lote ?? "*"}`}>
                    <TableCell className="max-w-72 min-w-40 pl-4 whitespace-normal">
                      <span className="block text-sm font-medium">{l.codigo}</span>
                      <span className="block text-xs text-muted-foreground">{l.descricao}</span>
                    </TableCell>
                    <TableCell className="max-w-48 whitespace-normal text-sm">
                      {l.lote === null ? (l.lotesConferidos.length ? <span className="text-muted-foreground">conferidos: {l.lotesConferidos.join(", ")}</span> : <span className="text-muted-foreground">—</span>) : l.lote || <span className="text-muted-foreground">sem lote</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{fmtQuantidade(l.esperado, l.unidade)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{fmtQuantidade(l.conferido, l.unidade)}</TableCell>
                    <TableCell className={`text-right text-sm tabular-nums ${l.diferenca < 0 ? "text-destructive" : l.diferenca > 0 ? "text-[oklch(0.5_0.13_65)]" : "text-muted-foreground"}`}>
                      {l.diferenca === 0 ? "—" : `${l.diferenca > 0 ? "+" : "−"}${fmtQuantidade(Math.abs(l.diferenca))}`}
                    </TableCell>
                    <TableCell className="pr-4">
                      <Selo tom={TOM_SITUACAO[l.situacao]}>{ROTULO_SITUACAO_COMPARATIVO[l.situacao]}</Selo>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <CardContent className="pb-4 text-sm text-muted-foreground">Nada lançado ainda.</CardContent>
          )}
        </Card>

        <div>
          <h2 className="mb-3 text-base font-semibold">
            Caixas e pallets <span className="font-normal text-muted-foreground">({r.volumes.length})</span>
          </h2>
          {!r.volumes.length ? (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum volume ainda. Use <strong>Nova caixa</strong> ou <strong>Novo pallet</strong> para começar a conferência.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {r.volumes.map((v) => {
                const s = situacaoVolume(v.status, !!v.endereco);
                const total = v.conteudo.reduce((a, c) => a + c.quantidade, 0);
                return (
                  <Card key={v.id} className="gap-3 py-4">
                    <CardHeader className="px-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Link href={`/servicos/armazem/volumes/${v.id}`} className="hover:underline">
                            {v.codigo}
                          </Link>
                          <Selo tom={s.tom}>{s.rotulo}</Selo>
                        </CardTitle>
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="size-3.5" aria-hidden />
                          {v.endereco ? (
                            <Link href={`/servicos/armazem/enderecos/${v.endereco.id}`} className="font-medium text-foreground hover:underline">
                              {v.endereco.codigo}
                            </Link>
                          ) : (
                            "sem endereço"
                          )}
                        </span>
                      </div>
                      {(v.referenciaDepositante || v.deOutroRecebimento) && (
                        <CardDescription>
                          {[v.referenciaDepositante ? `ref. do depositante: ${v.referenciaDepositante}` : null, v.deOutroRecebimento ? "volume de outro recebimento, com itens deste" : null].filter(Boolean).join(" · ")}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3 px-4">
                      {v.conteudo.length ? (
                        <ul className="divide-y rounded-md border text-sm">
                          {v.conteudo.map((c) => (
                            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                              <span className="min-w-0">
                                <span className="font-medium">{c.codigo}</span>
                                {c.lote ? <span className="text-muted-foreground"> · lote {c.lote}</span> : null}
                                {c.recebimentoId !== r.id && <span className="text-xs text-muted-foreground"> · {numeroRecebimento(c.recebimentoNumero)}</span>}
                                <span className="block truncate text-xs text-muted-foreground">{c.descricao}</span>
                              </span>
                              <span className="shrink-0 tabular-nums">{fmtQuantidade(c.quantidade, c.unidade)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">Vazio: lance os itens.</p>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {v.conteudo.length} {v.conteudo.length === 1 ? "linha" : "linhas"}
                          {v.conteudo.length > 0 && new Set(v.conteudo.map((c) => c.unidade)).size === 1 ? ` · ${fmtQuantidade(total, v.conteudo[0].unidade)}` : ""}
                        </span>
                        {podeEditar && (
                          <AcoesVolume
                            compacto
                            volume={{ id: v.id, codigo: v.codigo, status: v.status, empresaId: r.estabelecimento.id, depositanteId: r.depositante.id, endereco: v.endereco }}
                            conteudo={v.conteudo}
                            produtos={r.produtos}
                            lotesPorCodigo={r.lotesPorCodigo}
                            restantes={v.status === "ABERTO" && !v.deOutroRecebimento ? r.restantes : 0}
                          />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {r.observacao && (
          <Card className="py-4">
            <CardContent className="px-4 text-sm whitespace-pre-line">
              <span className="mb-1 block text-xs text-muted-foreground">Observação</span>
              {r.observacao}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
