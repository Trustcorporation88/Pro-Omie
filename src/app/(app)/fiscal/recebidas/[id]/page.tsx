import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Selo } from "@/components/selos";
import { AcoesNota, LinkTitulo } from "@/components/fiscal/acoes-nota";
import { SeloSituacaoNota, SeloTipoDoc } from "@/components/fiscal/selos-fiscais";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { dateParaISO, hojeISO } from "@/lib/datas";
import { fmtData, fmtDataHora, fmtDocumento, fmtMoeda, fmtNumero } from "@/lib/format";
import { obterRecebida, opcoesLancamento } from "@/modules/fiscal/consultas";
import { ROTULO_DIRECAO, ROTULO_EVENTO, ROTULO_MANIFESTACAO, ROTULO_MOTOR, ROTULO_TIPO_DOC } from "@/modules/fiscal/tipos";

export const metadata: Metadata = { title: "Nota recebida" };

type Props = { params: Promise<{ id: string }> };

const chaveEmBlocos = (chave: string) => chave.replace(/(.{4})/g, "$1 ").trim();

function Dado({ rotulo, children, className }: { rotulo: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children || <span className="font-normal text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export default async function Pagina({ params }: Props) {
  const u = await exigirUsuario("fiscal:ver");
  const { id } = await params;
  const n = await obterRecebida(id);
  if (!n) notFound();

  const entrada = n.direcao === "ENTRADA";
  const autorizada = n.situacao === "AUTORIZADO";
  const recusada = n.manifestacao === "DESCONHECIMENTO" || n.manifestacao === "NAO_REALIZADA";
  const podeManifestar = pode(u.papel, "fiscal:editar") && n.tipo === "NFE" && entrada && autorizada;
  const podeLancar = pode(u.papel, "fiscal:editar") && pode(u.papel, "financeiro:editar") && entrada && autorizada && !n.lancadoEm && !recusada && (n.valor ?? 0) > 0;
  const opcoes = podeLancar ? await opcoesLancamento(n.estabelecimento.matrizId) : null;
  const titulo = `${ROTULO_TIPO_DOC[n.tipo]}${n.numero ? ` nº ${n.numero}` : ""}${n.serie ? ` · série ${n.serie}` : ""}`;
  const emissao = n.emitidoEm ? dateParaISO(new Date(n.emitidoEm)) : hojeISO();

  return (
    <>
      <Link href="/fiscal/recebidas" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Notas recebidas
      </Link>
      <PageHeader
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {titulo}
            <SeloTipoDoc tipo={n.tipo} />
            <SeloSituacaoNota tipo={n.tipo} situacao={n.situacao} manifestacao={n.manifestacao} direcao={n.direcao} />
          </span>
        }
        descricao={`${n.emitenteNome ?? "Emitente não informado"}${n.emitenteDocumento ? ` · ${fmtDocumento(n.emitenteDocumento)}` : ""}`}
      >
        <AcoesNota
          id={n.id}
          podeManifestar={podeManifestar}
          manifestacao={n.manifestacao}
          podeLancar={podeLancar}
          temXml={!!n.completo || n.tipo === "NFE"}
          completo={n.completo}
          lancamento={
            opcoes
              ? {
                  descricao: `${titulo} · ${n.emitenteNome ?? fmtDocumento(n.emitenteDocumento)}`.slice(0, 200),
                  valor: n.valor ?? 0,
                  emissao,
                  duplicatas: n.detalhe?.duplicatas ?? [],
                  categorias: opcoes.categorias.map((c) => ({ valor: c.id, rotulo: c.nome })),
                  centros: opcoes.centros.map((c) => ({ valor: c.id, rotulo: c.nome })),
                }
              : null
          }
        />
      </PageHeader>

      <div className="space-y-4">
        {n.manifestacaoErro && (
          <div role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              A SEFAZ recusou a última manifestação: {n.manifestacaoErro}. A ciência automática não tenta de novo nesta nota; use os botões acima.
            </span>
          </div>
        )}
        {n.tipo === "NFE" && entrada && !n.completo && autorizada && (
          <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              Por enquanto só chegou o resumo da nota. A SEFAZ libera o XML completo (itens, impostos e duplicatas) depois da ciência ou da confirmação; ele
              aparece aqui na busca seguinte.
            </span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da nota</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Dado rotulo="Emitente">
                {n.emitenteNome}
                {n.emitenteDocumento && <span className="tabular block text-xs font-normal text-muted-foreground">{fmtDocumento(n.emitenteDocumento)}</span>}
                {n.emitenteIe && <span className="block text-xs font-normal text-muted-foreground">IE {n.emitenteIe}</span>}
              </Dado>
              <Dado rotulo={n.tipo === "NFE" ? "Destinatário" : "Tomador"}>
                {n.estabelecimento.nome}
                <span className="tabular block text-xs font-normal text-muted-foreground">{fmtDocumento(n.destinatarioDocumento ?? n.estabelecimento.cnpj)}</span>
                {!entrada && <span className="block text-xs font-normal text-muted-foreground">{ROTULO_DIRECAO[n.direcao]}</span>}
              </Dado>
              <Dado rotulo="Emissão">{n.emitidoEm ? fmtDataHora(n.emitidoEm) : null}</Dado>
              <Dado rotulo="Valor total">{n.valor === null ? null : <span className="tabular text-base">{fmtMoeda(n.valor)}</span>}</Dado>
              <Dado rotulo="Chave de acesso" className="sm:col-span-2">
                <span className="tabular font-mono text-xs tracking-tight">{chaveEmBlocos(n.chave)}</span>
              </Dado>
              <Dado rotulo="Protocolo de autorização">{n.protocolo}</Dado>
              <Dado rotulo="Manifestação">
                {n.manifestacao ? ROTULO_MANIFESTACAO[n.manifestacao] : n.tipo === "NFE" && entrada ? "Nenhuma ainda" : "Não se aplica"}
                {n.manifestadoEm && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {fmtDataHora(n.manifestadoEm)}
                    {n.manifestacaoProtocolo ? ` · protocolo ${n.manifestacaoProtocolo}` : ""}
                  </span>
                )}
              </Dado>
              <Dado rotulo="Fornecedor no cadastro">
                {n.fornecedor ? (
                  <Link href={`/cadastros/pessoas?q=${encodeURIComponent(n.fornecedor.documento ?? n.fornecedor.nome)}`} className="hover:underline">
                    {n.fornecedor.nome}
                  </Link>
                ) : (
                  <span className="font-normal text-muted-foreground">Ainda não cadastrado (é criado ao lançar)</span>
                )}
              </Dado>
              <Dado rotulo="Capturada">
                {fmtDataHora(n.capturadoEm)}
                <span className="block text-xs font-normal text-muted-foreground">via {ROTULO_MOTOR[n.motor]}</span>
              </Dado>
            </dl>
            {n.detalhe?.naturezaOperacao && <p className="mt-4 text-xs text-muted-foreground">Natureza da operação: {n.detalhe.naturezaOperacao}</p>}
          </CardContent>
        </Card>

        {n.detalhe && n.detalhe.itens.length > 0 && (
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="py-4">
              <CardTitle className="text-base">Itens ({n.detalhe.itens.length})</CardTitle>
            </CardHeader>
            <Table>
              <TableCaption className="sr-only">Itens da nota</TableCaption>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-10 pl-4">#</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>NCM</TableHead>
                  <TableHead>CFOP</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Unitário</TableHead>
                  <TableHead className="pr-4 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {n.detalhe.itens.map((i) => (
                  <TableRow key={i.numero} className="align-top">
                    <TableCell className="tabular pl-4 text-xs text-muted-foreground">{i.numero}</TableCell>
                    <TableCell className="min-w-56 whitespace-normal text-sm">
                      {i.descricao}
                      {i.codigo && <span className="block text-xs text-muted-foreground">Cód. {i.codigo}</span>}
                    </TableCell>
                    <TableCell className="tabular text-xs">{i.ncm}</TableCell>
                    <TableCell className="tabular text-xs">{i.cfop}</TableCell>
                    <TableCell className="tabular text-right text-sm whitespace-nowrap">
                      {fmtNumero(i.quantidade, i.quantidade % 1 ? 3 : 0)} {i.unidade}
                    </TableCell>
                    <TableCell className="tabular text-right text-sm whitespace-nowrap">{fmtMoeda(i.valorUnitario)}</TableCell>
                    <TableCell className="tabular pr-4 text-right text-sm font-medium whitespace-nowrap">{fmtMoeda(i.valorTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {n.detalhe && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Totais e duplicatas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Dado rotulo="Produtos">{n.detalhe.totais.produtos !== undefined ? fmtMoeda(n.detalhe.totais.produtos) : null}</Dado>
                  <Dado rotulo="Frete">{n.detalhe.totais.frete ? fmtMoeda(n.detalhe.totais.frete) : null}</Dado>
                  <Dado rotulo="Desconto">{n.detalhe.totais.desconto ? fmtMoeda(n.detalhe.totais.desconto) : null}</Dado>
                  <Dado rotulo="ICMS">{n.detalhe.totais.icms ? fmtMoeda(n.detalhe.totais.icms) : null}</Dado>
                  <Dado rotulo="IPI">{n.detalhe.totais.ipi ? fmtMoeda(n.detalhe.totais.ipi) : null}</Dado>
                  <Dado rotulo="Total da nota">{n.detalhe.totais.total !== undefined ? fmtMoeda(n.detalhe.totais.total) : null}</Dado>
                </dl>
                {n.detalhe.duplicatas.length > 0 ? (
                  <ul className="divide-y rounded-lg border text-sm">
                    {n.detalhe.duplicatas.map((d) => (
                      <li key={`${d.numero}-${d.vencimento}`} className="flex justify-between gap-3 px-3 py-2">
                        <span>
                          Duplicata {d.numero || "—"} · vence {fmtData(d.vencimento)}
                        </span>
                        <span className="tabular font-medium">{fmtMoeda(d.valor)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">A nota não traz duplicatas (pagamento à vista ou combinado à parte).</p>
                )}
                {n.detalhe.informacoes && <p className="text-xs whitespace-pre-line text-muted-foreground">{n.detalhe.informacoes}</p>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contas a pagar</CardTitle>
            </CardHeader>
            <CardContent>
              {n.titulos.length > 0 ? (
                <ul className="divide-y rounded-lg border text-sm">
                  {n.titulos.map((t) => (
                    <li key={t.id} className="flex justify-between gap-3 px-3 py-2">
                      <LinkTitulo id={t.id}>
                        Título #{t.numero}
                        {t.totalParcelas > 1 ? ` (${t.parcela}/${t.totalParcelas})` : ""} · vence {fmtData(t.vencimento)}
                      </LinkTitulo>
                      <span className="flex items-center gap-2">
                        <span className="tabular font-medium">{fmtMoeda(t.valor)}</span>
                        {t.status === "QUITADO" && <Selo tom="sucesso">Pago</Selo>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {!entrada
                    ? "Nota emitida pela empresa ou em que ela aparece como terceiro: não vai para o contas a pagar."
                    : !autorizada
                      ? "Nota cancelada ou denegada: não deve ser paga."
                      : recusada
                        ? "A empresa recusou esta nota: não vai para o contas a pagar."
                        : "Ainda não lançada."}
                </p>
              )}
            </CardContent>
          </Card>

          {n.eventos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Eventos</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3 text-sm">
                  {n.eventos.map((e) => (
                    <li key={e.id} className="border-l-2 pl-3">
                      <p className="font-medium">
                        {ROTULO_EVENTO[e.tipoEvento] ?? e.descricao ?? `Evento ${e.tipoEvento}`}
                        {e.sequencia > 1 ? ` nº ${e.sequencia}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {e.ocorridoEm ? fmtDataHora(e.ocorridoEm) : "data não informada"}
                        {e.protocolo ? ` · protocolo ${e.protocolo}` : ""}
                      </p>
                      {e.detalhe && <p className="mt-1 text-xs whitespace-pre-line">{e.detalhe}</p>}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
