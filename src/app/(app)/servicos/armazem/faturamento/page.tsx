import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarRange, CircleAlert, Download, FileCheck2, Info, ReceiptText, TriangleAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { SelectFiltro } from "@/components/filtros";
import { CartaoKpi } from "@/components/relatorios/cartao-kpi";
import { Selo } from "@/components/selos";
import { AcoesTarifa, BotaoAtualizarFotografia, BotaoFaturar, BotaoGerarTodos, BotaoNovaTarifa, MenuLinhaFaturamento, SeloSituacao, type OpcoesTarifa } from "@/components/armazem/faturamento";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { prisma } from "@/lib/db";
import { fmtData, fmtDataHora, fmtDocumento, fmtMoeda } from "@/lib/format";
import { carregarOpcoesFinanceiras } from "@/modules/financeiro/opcoes";
import { carregarFaturamento, lerFiltrosFaturamento } from "@/modules/armazem/faturamento";
import { ROTULO_METODO_CURTO, mudarCompetencia } from "@/modules/armazem/tipos";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";

export const metadata: Metadata = { title: "Faturamento da armazenagem" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const num = (n: number, casas = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const ROTULO_TITULO: Record<string, string> = { ABERTO: "a receber", PARCIAL: "recebido em parte", QUITADO: "recebido", CANCELADO: "título cancelado" };

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("armazem:ver");
  const f = lerFiltrosFaturamento(await searchParams);
  const dados = await carregarFaturamento(f);
  const podeFaturar = pode(u.papel, "financeiro:editar");
  const podeFotografar = pode(u.papel, "armazem:editar");
  let opcoes: OpcoesTarifa | null = null;
  if (podeFaturar) {
    const escopo = await escopoEmpresa();
    const [fin, servicos] = await Promise.all([
      carregarOpcoesFinanceiras(),
      prisma.produto.findMany({ where: { empresaId: escopo.ativa.id, tipo: "SERVICO", ativo: true }, orderBy: { descricao: "asc" }, select: { id: true, codigo: true, descricao: true } }),
    ]);
    opcoes = {
      estabelecimentos: dados.estabelecimentos.filter((e) => e.ativo).map((e) => ({ valor: e.id, rotulo: e.nome })),
      servicos: servicos.map((s) => ({ valor: s.id, rotulo: `${s.codigo} · ${s.descricao}` })),
      categorias: fin.categoriasReceita,
      contas: fin.contas,
      formas: fin.formas,
      inicioPadrao: `${dados.competencia}-01`,
    };
  }
  const link = (extra: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ competencia: dados.competencia, estab: f.estab, ...extra }).filter(([, v]) => v));
    return `/servicos/armazem/faturamento?${p.toString()}`;
  };
  const csv = (depositante?: string) => {
    const p = new URLSearchParams(Object.entries({ competencia: dados.competencia, estab: f.estab, depositante: depositante ?? "" }).filter(([, v]) => v));
    return `/api/armazem/ocupacao?${p.toString()}`;
  };
  const varios = dados.estabelecimentos.length > 1;
  const primeiroDoMesSeguinte = `${mudarCompetencia(dados.competencia, 1)}-01`;

  return (
    <>
      <Link href="/servicos/armazem" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Itens armazenados
      </Link>
      <PageHeader
        titulo="Faturamento da armazenagem"
        descricao="Cobrança por posição-pallet: todo dia o sistema fotografa as posições ocupadas por depositante; no fim do mês, a tarifa vira o pedido, a conta a receber e o boleto ou Pix."
      >
        {podeFotografar && <BotaoAtualizarFotografia />}
        {podeFaturar && dados.liberada && <BotaoGerarTodos competencia={dados.competencia} estab={f.estab} pendentes={dados.totais.pendentes} total={dados.totais.aFaturar} />}
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={link({ competencia: mudarCompetencia(dados.competencia, -1) })} aria-label="Mês anterior">
            <ArrowLeft />
          </Link>
        </Button>
        <span className="min-w-48 text-center text-lg font-semibold first-letter:uppercase">{dados.rotulo}</span>
        <Button asChild variant="outline" size="sm">
          <Link href={link({ competencia: mudarCompetencia(dados.competencia, 1) })} aria-label="Mês seguinte">
            <ArrowRight />
          </Link>
        </Button>
        {varios && <SelectFiltro parametro="estab" rotuloTodos="Todos os estabelecimentos" opcoes={dados.estabelecimentos.map((e) => ({ valor: e.id, rotulo: e.nome }))} />}
        <Button asChild variant="ghost" size="sm" className="sm:ml-auto">
          <a href={csv()}>
            <Download /> Extrato do mês (CSV)
          </a>
        </Button>
      </div>

      <div className="mb-5 space-y-2">
        {dados.emAndamento && (
          <div className="flex gap-2 rounded-lg border border-chart-5/30 bg-chart-5/5 p-3 text-sm">
            <CalendarRange className="mt-0.5 size-4 shrink-0 text-chart-5" aria-hidden />
            <span>
              <strong>Mês em andamento:</strong> os números vão até hoje ({fmtData(dados.hoje)}). O faturamento fica liberado em {fmtData(primeiroDoMesSeguinte)}.
            </span>
          </div>
        )}
        {dados.futura && (
          <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>Este mês ainda não começou.</span>
          </div>
        )}
        {dados.totais.diasRepetidos > 0 && (
          <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[oklch(0.5_0.13_65)]" aria-hidden />
            <span>
              {dados.totais.diasRepetidos} {dados.totais.diasRepetidos === 1 ? "dia ficou" : "dias ficaram"} sem fotografia e {dados.totais.diasRepetidos === 1 ? "repetiu" : "repetiram"} o último dia fotografado. Confira no dia a dia de cada depositante.
            </span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {dados.ultimaFotografia ? `Última fotografia: ${fmtDataHora(dados.ultimaFotografia.em)}. ` : "Nenhuma fotografia ainda. "}O sistema fotografa de hora em hora; vale a última de cada dia.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoKpi titulo="Posições-dia no mês" valor={num(dados.totais.posicoesDia, 0)} icone={CalendarRange} tom="info">
          soma das posições ocupadas de cada dia
        </CartaoKpi>
        <CartaoKpi titulo={dados.emAndamento ? "Acumulado até hoje" : "A faturar"} valor={fmtMoeda(dados.emAndamento ? dados.linhas.reduce((a, l) => a + (l.calculo?.valor ?? 0), 0) : dados.totais.aFaturar)} icone={ReceiptText} tom={dados.totais.pendentes ? "alerta" : "neutro"}>
          {dados.emAndamento ? "parcial: o valor final sai no fim do mês" : `${dados.totais.pendentes} ${dados.totais.pendentes === 1 ? "depositante" : "depositantes"}`}
        </CartaoKpi>
        <CartaoKpi titulo="Faturado" valor={fmtMoeda(dados.totais.faturado)} icone={FileCheck2} tom="sucesso">
          {dados.linhas.filter((l) => l.faturamento).length} pedido(s) gerado(s)
        </CartaoKpi>
        <CartaoKpi titulo="Sem tarifa" valor={String(dados.totais.semTarifa)} icone={Users} tom={dados.totais.semTarifa ? "perigo" : "neutro"}>
          ocupam posições, mas não têm preço
        </CartaoKpi>
      </div>

      {dados.linhas.length === 0 ? (
        <EstadoVazio
          titulo={`Nenhuma posição ocupada em ${dados.rotulo}`}
          descricao="A cobrança usa a fotografia diária das posições ocupadas por depositante. Endereçe as caixas e os pallets e cadastre a tarifa de cada depositante."
        />
      ) : (
        <Card className="mb-6 overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-3">Depositante</TableHead>
                <TableHead>Tarifa</TableHead>
                <TableHead className="text-right">Posições-dia</TableHead>
                <TableHead className="text-right">Média · pico</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="pr-3 text-right">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.linhas.map((l) => {
                const brutoDia = l.dias.reduce((a, d) => a + d.posicoes, 0);
                const brutoPico = l.dias.reduce((a, d) => Math.max(a, d.posicoes), 0);
                const fat = l.faturamento;
                const posDia = fat ? fat.posicoesDia : (l.calculo?.posicoesDia ?? brutoDia);
                const pico = fat ? fat.pico : (l.calculo?.pico ?? brutoPico);
                const media = l.calculo?.media ?? Math.round((brutoDia / Math.max(1, l.calculo?.diasMes ?? l.dias.length)) * 100) / 100;
                const valor = fat?.valor ?? l.calculo?.valor ?? null;
                return (
                  <TableRow key={l.chave}>
                    <TableCell className="max-w-72 min-w-52 pl-3 whitespace-normal">
                      <span className="block text-sm font-medium">{l.depositante}</span>
                      <span className="block text-xs text-muted-foreground">
                        {l.documento ? fmtDocumento(l.documento) : ""}
                        {varios ? ` · ${l.estabelecimento}` : ""}
                      </span>
                      {l.foraPosicaoDia > 0 && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-[oklch(0.5_0.13_65)]">
                          <CircleAlert className="size-3" aria-hidden /> {l.foraPosicaoDia} {l.foraPosicaoDia === 1 ? "volume-dia" : "volumes-dia"} fora de posição (não cobrados)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {l.tarifa ? (
                        <>
                          {fmtMoeda(l.tarifa.valorPosicao)}
                          <span className="block text-xs text-muted-foreground">
                            {ROTULO_METODO_CURTO[l.tarifa.metodo]}
                            {l.tarifa.minimoPosicoes ? ` · mín. ${l.tarifa.minimoPosicoes}` : ""}
                            {!l.tarifa.ativo ? " · suspensa" : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {num(posDia, 0)}
                      {l.calculo && l.calculo.reservadasDia > 0 && <span className="block text-xs text-muted-foreground">{l.calculo.reservadasDia} de reservadas</span>}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {num(media)} · {pico}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {valor !== null ? (
                        <>
                          <span className="font-medium">{fmtMoeda(valor)}</span>
                          {l.calculo?.minimoAplicado && !fat && <span className="block text-xs text-muted-foreground">mínimo contratado</span>}
                          {(fat?.vencimento ?? l.vencimento) && <span className="block text-xs text-muted-foreground">vence {fmtData(fat?.vencimento ?? l.vencimento!)}</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <SeloSituacao situacao={l.situacao} />
                      {fat?.pedido && (
                        <Link href={`/vendas/pedidos/${fat.pedido.id}`} className="mt-0.5 block text-xs text-muted-foreground hover:underline">
                          pedido nº {fmtNumeroDoc(fat.pedido.numero)}
                          {fat.titulo ? ` · ${ROTULO_TITULO[fat.titulo.status] ?? fat.titulo.status}` : ""}
                        </Link>
                      )}
                      {fat?.erro && <span className="mt-0.5 block max-w-52 text-xs text-destructive">{fat.erro}</span>}
                    </TableCell>
                    <TableCell className="pr-3">
                      <span className="flex items-center justify-end gap-1">
                        {podeFaturar && l.situacao === "PENDENTE" && l.calculo && <BotaoFaturar empresaId={l.empresaId} depositanteId={l.depositanteId} competencia={dados.competencia} depositante={l.depositante} valor={l.calculo.valor} />}
                        {podeFaturar && opcoes && l.situacao === "SEM_TARIFA" && !l.tarifa && (
                          <BotaoNovaTarifa opcoes={opcoes} depositante={{ id: l.depositanteId, nome: l.depositante, empresaId: l.empresaId }} rotulo="Tarifa" tamanho="sm" />
                        )}
                        <MenuLinhaFaturamento
                          depositante={l.depositante}
                          competencia={dados.competencia}
                          csv={csv(l.depositanteId)}
                          dias={l.dias}
                          faturamento={fat ? { id: fat.id, pedidoId: fat.pedido?.id ?? null } : null}
                          podeFaturar={podeFaturar}
                        />
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 py-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Tarifas</CardTitle>
            <CardDescription>Preço por posição-pallet/mês de cada depositante. O faturamento guarda a tarifa usada: mudar o preço não muda o que já foi faturado.</CardDescription>
          </div>
          {podeFaturar && opcoes && <BotaoNovaTarifa opcoes={opcoes} />}
        </CardHeader>
        {dados.tarifas.length === 0 ? (
          <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma tarifa cadastrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-4">Depositante</TableHead>
                <TableHead className="text-right">Por posição/mês</TableHead>
                <TableHead>Como conta</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Serviço (NFS-e)</TableHead>
                <TableHead className="pr-4 text-right">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.tarifas.map((t) => (
                <TableRow key={t.id} className={t.ativo ? undefined : "opacity-60"}>
                  <TableCell className="max-w-64 min-w-48 pl-4 whitespace-normal">
                    <span className="block text-sm font-medium">
                      {t.depositante} {!t.ativo && <Selo className="ml-1">Suspensa</Selo>}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      desde {fmtData(t.inicio)}
                      {varios ? ` · ${t.estabelecimento}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{fmtMoeda(t.valorPosicao)}</TableCell>
                  <TableCell className="text-sm">
                    {ROTULO_METODO_CURTO[t.metodo]}
                    <span className="block text-xs text-muted-foreground">
                      {[t.minimoPosicoes ? `mínimo ${t.minimoPosicoes}` : null, t.cobrarReservadas ? "reservadas contam" : "reservadas não contam"].filter(Boolean).join(" · ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    dia {t.diaVencimento}
                    <span className="block text-xs text-muted-foreground">{t.gerarCobranca ? "com boleto/Pix" : "sem boleto/Pix"}</span>
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-sm">{t.produto ?? <span className="text-[oklch(0.5_0.13_65)]">sem serviço: a NFS-e não sai</span>}</TableCell>
                  <TableCell className="pr-4 text-right">{podeFaturar && opcoes && <AcoesTarifa tarifa={t} opcoes={opcoes} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
