import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Ban, CircleCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { Selo } from "@/components/selos";
import { AcoesDetalheTitulo } from "@/components/financeiro/acoes-detalhe-titulo";
import { BotaoEstornarBaixa } from "@/components/financeiro/botao-estornar";
import { SecaoAnexos } from "@/components/financeiro/secao-anexos";
import { SeloSituacao } from "@/components/financeiro/selo-situacao";
import { TEXTOS, estaAberto, rotuloAcao, type TituloDetalhe, type TituloLinha } from "@/components/financeiro/tipos";
import { listarCondicoesPagamento, obterTitulo } from "@/modules/financeiro/consultas";
import { carregarOpcoesFinanceiras } from "@/modules/financeiro/opcoes";
import { exigirUsuario, usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { prisma } from "@/lib/db";
import { diffDias, hojeISO } from "@/lib/datas";
import { arred2, fmtData, fmtDataHora, fmtDocumento, fmtMoeda, fmtNumero } from "@/lib/format";
import { ROTULOS } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const u = await usuarioAtual();
  if (!u || !pode(u.papel, "financeiro:ver")) return { title: "Título" };
  const escopo = await escopoEmpresa().catch(() => null);
  const t = escopo ? await prisma.titulo.findFirst({ where: { id, empresaId: { in: escopo.ids } }, select: { numero: true, tipo: true } }) : null;
  return { title: t ? `${t.tipo === "RECEBER" ? "A receber" : "A pagar"} #${t.numero}` : "Título não encontrado" };
}

/** Só os campos de lista (o detalhe completo não precisa ir para os componentes client). */
function paraLinha(t: TituloDetalhe): TituloLinha {
  return {
    id: t.id,
    numero: t.numero,
    tipo: t.tipo,
    status: t.status,
    empresaId: t.empresaId,
    pessoaId: t.pessoaId,
    pessoaNome: t.pessoaNome,
    descricao: t.descricao,
    documento: t.documento,
    categoriaId: t.categoriaId,
    categoriaNome: t.categoriaNome,
    centroCustoId: t.centroCustoId,
    contaBancariaId: t.contaBancariaId,
    formaPagamentoId: t.formaPagamentoId,
    emissao: t.emissao,
    competencia: t.competencia,
    vencimento: t.vencimento,
    valor: t.valor,
    valorPago: t.valorPago,
    saldo: t.saldo,
    parcela: t.parcela,
    totalParcelas: t.totalParcelas,
    observacoes: t.observacoes,
    rateios: t.rateios,
    qtdBaixas: t.qtdBaixas,
  };
}

function Dado({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function Indicador({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string; detalhe?: React.ReactNode; cor?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground">{rotulo}</div>
      <div className={cn("mt-1 truncate text-xl font-semibold tracking-tight tabular", cor)}>{valor}</div>
      {detalhe && <div className="mt-0.5 text-xs text-muted-foreground">{detalhe}</div>}
    </div>
  );
}

const vazio = <span className="text-muted-foreground">—</span>;

export default async function TituloPage({ params }: Props) {
  const u = await exigirUsuario("financeiro:ver");
  const { id } = await params;
  const podeEditar = pode(u.papel, "financeiro:editar");
  const hoje = hojeISO();
  const [t, opcoesFinanceiras, condicoes] = await Promise.all([
    obterTitulo(id),
    podeEditar ? carregarOpcoesFinanceiras() : Promise.resolve(null),
    podeEditar ? listarCondicoesPagamento() : Promise.resolve([]),
  ]);
  // estado amigável (e não notFound): após excluir pelo detalhe, a action re-renderiza esta rota antes do redirecionamento
  if (!t) {
    return (
      <EstadoVazio titulo="Título não encontrado" descricao="Ele pode ter sido excluído ou o link está incorreto.">
        <div className="flex gap-4 text-sm font-medium">
          <Link href="/financeiro/receber" className="text-primary underline">
            Contas a receber
          </Link>
          <Link href="/financeiro/pagar" className="text-primary underline">
            Contas a pagar
          </Link>
        </div>
      </EstadoVazio>
    );
  }

  const tx = TEXTOS[t.tipo];
  const aberto = estaAberto(t.status);
  const atraso = aberto && t.vencimento < hoje ? diffDias(t.vencimento, hoje) : 0;
  const faltam = aberto && t.vencimento > hoje ? diffDias(hoje, t.vencimento) : 0;
  const baixasAtivas = t.baixas.filter((b) => !b.estornada);
  const totalBaixado = arred2(baixasAtivas.reduce((a, b) => a + b.valorTotal, 0));
  const corEntradaSaida = t.tipo === "RECEBER" ? "text-success" : "text-destructive";

  return (
    <>
      <Link href={tx.rota} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {tx.plural}
      </Link>
      <PageHeader
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {tx.Singular} <span className="tabular text-muted-foreground">#{t.numero}</span>
            <SeloSituacao status={t.status} vencimento={t.vencimento} hoje={hoje} />
          </span>
        }
        descricao={
          <>
            {t.descricao}
            {t.pessoaNome && <> · {t.pessoaNome}</>}
          </>
        }
      >
        {podeEditar && opcoesFinanceiras && <AcoesDetalheTitulo titulo={paraLinha(t)} opcoes={{ ...opcoesFinanceiras, condicoes }} hoje={hoje} />}
      </PageHeader>

      {t.status === "CANCELADO" && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border bg-muted/50 p-3 text-sm">
          <Ban className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            Título cancelado{t.canceladoEm && ` em ${fmtDataHora(t.canceladoEm)}`}.
            {t.motivoCancelamento && <span className="text-muted-foreground"> Motivo: {t.motivoCancelamento}</span>}
          </div>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Valor" valor={fmtMoeda(t.valor)} detalhe={t.totalParcelas > 1 ? `parcela ${t.parcela} de ${t.totalParcelas}` : undefined} />
        <Indicador
          rotulo={tx.baixado}
          valor={fmtMoeda(t.valorPago)}
          cor={t.valorPago > 0 ? corEntradaSaida : undefined}
          detalhe={baixasAtivas.length ? `${baixasAtivas.length} baixa(s) ativa(s)` : "nenhuma baixa"}
        />
        <Indicador
          rotulo="Saldo"
          valor={t.status === "CANCELADO" ? "—" : fmtMoeda(t.saldo)}
          cor={atraso > 0 ? "text-destructive" : undefined}
          detalhe={t.status === "QUITADO" && t.quitadoEm ? `quitado em ${fmtData(t.quitadoEm)}` : undefined}
        />
        <Indicador
          rotulo="Vencimento"
          valor={fmtData(t.vencimento)}
          cor={atraso > 0 ? "text-destructive" : undefined}
          detalhe={
            atraso > 0
              ? `${atraso} dia${atraso > 1 ? "s" : ""} em atraso`
              : aberto && t.vencimento === hoje
                ? "vence hoje"
                : faltam > 0
                  ? `vence em ${faltam} dia${faltam > 1 ? "s" : ""}`
                  : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="text-base">Dados</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                <Dado rotulo={tx.pessoa}>
                  {t.pessoaNome ?? vazio}
                  {t.pessoaDocumento && <span className="block text-xs text-muted-foreground tabular">{fmtDocumento(t.pessoaDocumento)}</span>}
                </Dado>
                <Dado rotulo="Empresa">{t.empresaNome}</Dado>
                <Dado rotulo="Documento">{t.documento ?? vazio}</Dado>
                <Dado rotulo="Emissão">
                  <span className="tabular">{fmtData(t.emissao)}</span>
                </Dado>
                <Dado rotulo="Competência">
                  <span className="tabular">{fmtData(t.competencia)}</span>
                </Dado>
                <Dado rotulo="Vencimento">
                  <span className={cn("tabular", atraso > 0 && "text-destructive")}>{fmtData(t.vencimento)}</span>
                </Dado>
                <Dado rotulo="Conta prevista">{t.contaNome ?? vazio}</Dado>
                <Dado rotulo="Forma de pagamento">{t.formaNome ?? vazio}</Dado>
                <Dado rotulo="Origem">{ROTULOS.origemTitulo[t.origem]}</Dado>
                <Dado rotulo="Parcela">
                  {t.totalParcelas > 1 ? (
                    <span className="tabular">
                      {t.parcela}/{t.totalParcelas}
                    </span>
                  ) : (
                    "Única"
                  )}
                </Dado>
                <Dado rotulo="Criado em">
                  <span className="tabular">{fmtDataHora(t.createdAt)}</span>
                  {t.criadoPorNome && <span className="text-muted-foreground"> · {t.criadoPorNome}</span>}
                </Dado>
                {t.quitadoEm && (
                  <Dado rotulo="Quitado em">
                    <span className="tabular">{fmtData(t.quitadoEm)}</span>
                  </Dado>
                )}
                {t.observacoes && (
                  <Dado rotulo="Observações" className="sm:col-span-2 xl:col-span-3">
                    <p className="whitespace-pre-wrap">{t.observacoes}</p>
                  </Dado>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="py-4">
              <CardTitle className="text-base">Rateio</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-6">Categoria</TableHead>
                  <TableHead>Centro de custo</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="pr-6 text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.rateiosDetalhe.length === 0 ? (
                  <TableRow>
                    <TableCell className="pl-6">{t.categoriaNome ?? vazio}</TableCell>
                    <TableCell>{t.centroCustoNome ?? vazio}</TableCell>
                    <TableCell className="text-right tabular">100,00%</TableCell>
                    <TableCell className="pr-6 text-right tabular">{fmtMoeda(t.valor)}</TableCell>
                  </TableRow>
                ) : (
                  t.rateiosDetalhe.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="pl-6">{r.categoriaNome}</TableCell>
                      <TableCell>{r.centroNome ?? vazio}</TableCell>
                      <TableCell className="text-right tabular">{fmtNumero(r.percentual)}%</TableCell>
                      <TableCell className="pr-6 text-right tabular">{fmtMoeda(r.valor)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="py-4">
              <CardTitle className="text-base">Baixas</CardTitle>
              <CardDescription>
                {tx.baixa}s registrados, com juros, multa e desconto. Estornar remove o movimento da conta.
              </CardDescription>
            </CardHeader>
            {t.baixas.length === 0 ? (
              <p className="border-t px-6 py-8 text-center text-sm text-muted-foreground">
                Nenhuma baixa registrada{aberto && podeEditar ? `. Use “${tx.baixar}” para registrar.` : "."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-6">Data</TableHead>
                    <TableHead>Conta / forma</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Juros</TableHead>
                    <TableHead className="text-right">Multa</TableHead>
                    <TableHead className="text-right">Desconto</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Situação</TableHead>
                    {podeEditar && <TableHead className="w-24 pr-6" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {t.baixas.map((b) => (
                    <TableRow key={b.id} className={cn(b.estornada && "text-muted-foreground")}>
                      <TableCell className="pl-6 tabular">{fmtData(b.data)}</TableCell>
                      <TableCell className="max-w-56 whitespace-normal">
                        <div className="truncate">{b.contaNome}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[b.formaNome, b.observacao, b.criadoPorNome && `por ${b.criadoPorNome}`].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular">{fmtMoeda(b.valor)}</TableCell>
                      <TableCell className="text-right tabular">{b.juros ? fmtMoeda(b.juros) : "—"}</TableCell>
                      <TableCell className="text-right tabular">{b.multa ? fmtMoeda(b.multa) : "—"}</TableCell>
                      <TableCell className="text-right tabular">{b.desconto ? fmtMoeda(b.desconto) : "—"}</TableCell>
                      <TableCell className={cn("text-right font-medium tabular", b.estornada ? "line-through" : corEntradaSaida)}>
                        {fmtMoeda(b.valorTotal)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {b.estornada ? (
                            <Selo tom="neutro">Estornada{b.estornadaEm && ` em ${fmtDataHora(b.estornadaEm)}`}</Selo>
                          ) : (
                            <Selo tom="sucesso">Ativa</Selo>
                          )}
                          {b.conciliada && !b.estornada && (
                            <Selo tom="info">
                              <CircleCheck className="size-3" /> Conciliada
                            </Selo>
                          )}
                        </div>
                      </TableCell>
                      {podeEditar && (
                        <TableCell className="pr-6 text-right">
                          {!b.estornada && (
                            <BotaoEstornarBaixa
                              baixaId={b.id}
                              conciliada={b.conciliada}
                              resumo={`${tx.baixa} de ${fmtMoeda(b.valorTotal)} em ${fmtData(b.data)} · ${b.contaNome}`}
                            />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="pl-6 text-xs text-muted-foreground">
                      Total das baixas ativas
                    </TableCell>
                    <TableCell className={cn("text-right tabular", corEntradaSaida)}>{fmtMoeda(totalBaixado)}</TableCell>
                    <TableCell colSpan={podeEditar ? 2 : 1} />
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          {t.parcelasGrupo.length > 1 && (
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-base">Parcelas</CardTitle>
                <CardDescription>
                  {t.parcelasGrupo.length} títulos do mesmo lançamento · total{" "}
                  <span className="tabular">{fmtMoeda(arred2(t.parcelasGrupo.reduce((a, p) => a + p.valor, 0)))}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3">
                <ul className="space-y-0.5">
                  {t.parcelasGrupo.map((p) => {
                    const atual = p.id === t.id;
                    return (
                      <li key={p.id}>
                        <Link
                          href={`/financeiro/titulos/${p.id}`}
                          aria-current={atual ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted",
                            atual && "bg-muted font-medium",
                          )}
                        >
                          <span className="w-12 tabular text-muted-foreground">
                            {p.parcela}/{p.totalParcelas}
                          </span>
                          <span className="tabular">{fmtData(p.vencimento)}</span>
                          <span className="ml-auto tabular">{fmtMoeda(p.valor)}</span>
                          <SeloSituacao status={p.status} vencimento={p.vencimento} hoje={hoje} className="shrink-0" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          <SecaoAnexos tituloId={t.id} anexos={t.anexos} podeEditar={podeEditar} />

          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="text-base">Histórico</CardTitle>
              <CardDescription>Alterações, baixas e anexos, do mais recente ao mais antigo.</CardDescription>
            </CardHeader>
            <CardContent>
              {t.historico.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registros.</p>
              ) : (
                <ol className="relative space-y-4 border-l pl-4">
                  {t.historico.map((h) => (
                    <li key={h.id} className="relative">
                      <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary/70 ring-4 ring-card" aria-hidden />
                      <div className="text-sm font-medium">{rotuloAcao(h.entidade, h.acao)}</div>
                      {h.resumo && <div className="text-xs break-words text-muted-foreground">{h.resumo}</div>}
                      <div className="mt-0.5 text-xs text-muted-foreground tabular">
                        {fmtDataHora(h.createdAt)} · {h.usuarioNome ?? "Sistema"}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
