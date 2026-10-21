import type { Metadata } from "next";
import Link from "next/link";
import { CircleArrowDown, CircleArrowUp, Landmark, TrendingDown, TrendingUp, TriangleAlert, Wallet } from "lucide-react";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/selos";
import { CartaoKpi } from "@/components/relatorios/cartao-kpi";
import { BotaoExportarCsv, type CelulaCsv } from "@/components/relatorios/exportar-csv";
import { BarraFiltros, FiltroAbas, FiltroData, FiltroSelect } from "@/components/relatorios/filtros-relatorio";
import { GraficoFluxo, type PontoFluxo } from "@/components/relatorios/grafico-fluxo";
import { exigirUsuario } from "@/lib/auth/sessao";
import { addDias } from "@/lib/datas";
import { fmtData, fmtMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { consultarFluxo, lerFiltrosFluxo } from "@/modules/relatorios/fluxo-caixa";
import type { LinhaFluxo } from "@/modules/relatorios/fluxo-calculo";

export const metadata: Metadata = { title: "Fluxo de caixa" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ROTULO_AGRUPAMENTO = { dia: "Dia", semana: "Semana", mes: "Mês" } as const;

function Valor({ v, classe }: { v: number; classe?: string }) {
  if (Math.abs(v) < 0.005) return <span className="text-muted-foreground/40">—</span>;
  return <span className={classe}>{fmtMoeda(v)}</span>;
}

const qtd = (n: number) => `${n} ${n === 1 ? "título" : "títulos"}`;

export default async function FluxoDeCaixaPage({ searchParams }: Props) {
  await exigirUsuario("relatorios:ver");
  const sp = await searchParams;
  const { filtros: f, contas, contaNome, resultado: r, atrasados } = await consultarFluxo(lerFiltrosFluxo(sp));
  const t = r.totais;
  const temAberturas = t.aberturas !== 0;
  const projetaFuturo = f.ate >= f.hoje;
  const semDados =
    !r.saldoInicial && !t.aberturas && !t.entradasRealizadas && !t.saidasRealizadas && !t.entradasPrevistas && !t.saidasPrevistas;

  const pontos: PontoFluxo[] = r.linhas.map((l) => ({
    chave: l.chave,
    rotulo: l.rotulo,
    rotuloCurto: l.rotuloCurto,
    entradasRealizadas: l.entradasRealizadas,
    entradasPrevistas: l.entradasPrevistas,
    saidasRealizadas: l.saidasRealizadas,
    saidasPrevistas: l.saidasPrevistas,
    resultado: l.resultado,
    saldo: l.saldo,
    contemHoje: l.contemHoje,
  }));

  const cabecalhoCsv = [
    "Período",
    "Início",
    "Fim",
    "Entradas realizadas",
    "Saídas realizadas",
    "Entradas previstas",
    "Saídas previstas",
    ...(temAberturas ? ["Saldo de abertura de contas"] : []),
    "Resultado",
    "Saldo acumulado",
  ];
  const linhaCsv = (l: LinhaFluxo): CelulaCsv[] => [
    l.rotulo,
    fmtData(l.inicio),
    fmtData(l.fim),
    l.entradasRealizadas,
    l.saidasRealizadas,
    l.entradasPrevistas,
    l.saidasPrevistas,
    ...(temAberturas ? [l.aberturas] : []),
    l.resultado,
    l.saldo,
  ];
  const vazioCsv = (n: number): CelulaCsv[] => Array.from({ length: n }, () => null);
  const linhasCsv: CelulaCsv[][] = [
    ["Saldo inicial", "", fmtData(addDias(f.de, -1)), ...vazioCsv(cabecalhoCsv.length - 4), r.saldoInicial],
    ...r.linhas.map(linhaCsv),
    [
      "Total",
      fmtData(f.de),
      fmtData(f.ate),
      t.entradasRealizadas,
      t.saidasRealizadas,
      t.entradasPrevistas,
      t.saidasPrevistas,
      ...(temAberturas ? [t.aberturas] : []),
      t.resultado,
      r.saldoFinal,
    ],
  ];

  const descricao = [
    `${fmtData(f.de)} a ${fmtData(f.ate)}`,
    contaNome ?? "Todas as contas ativas",
    `por ${ROTULO_AGRUPAMENTO[f.agrupamento].toLowerCase()}`,
  ].join(" · ");

  const filtroConta = f.conta ? `&conta=${encodeURIComponent(f.conta)}` : "";
  const menor = r.menorSaldo;
  const atrasadosNaProjecao = r.atrasadosProjetados;
  const situacaoAtrasados = !atrasadosNaProjecao
    ? "fora da projeção"
    : atrasadosNaProjecao.onde === "hoje"
      ? "na projeção de hoje"
      : "no saldo inicial projetado";

  return (
    <>
      <PageHeader titulo="Fluxo de caixa" descricao={descricao}>
        <BotaoExportarCsv arquivo={`fluxo-de-caixa_${f.de}_${f.ate}.csv`} cabecalho={cabecalhoCsv} linhas={linhasCsv} desabilitado={semDados} />
      </PageHeader>

      <BarraFiltros>
        <FiltroData parametro="de" rotulo="De" valor={f.de} padrao={f.padrao.de} />
        <FiltroData parametro="ate" rotulo="Até" valor={f.ate} padrao={f.padrao.ate} />
        <FiltroAbas
          parametro="agrupamento"
          rotulo="Agrupar por"
          valor={f.agrupamento}
          padrao="semana"
          opcoes={[
            { valor: "dia", rotulo: "Dia" },
            { valor: "semana", rotulo: "Semana" },
            { valor: "mes", rotulo: "Mês" },
          ]}
        />
        <FiltroSelect parametro="conta" rotulo="Conta" valor={f.conta ?? ""} rotuloTodos="Todas as contas ativas" opcoes={contas} />
        <FiltroAbas
          parametro="vencidos"
          rotulo="Atrasados na projeção"
          valor={f.incluirVencidos ? "incluir" : "excluir"}
          padrao="incluir"
          opcoes={[
            { valor: "incluir", rotulo: "Incluir" },
            { valor: "excluir", rotulo: "Excluir" },
          ]}
        />
      </BarraFiltros>

      {f.avisos.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[oklch(0.5_0.13_65)] dark:text-warning" />
          <div>{f.avisos.join(" ")}</div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <CartaoKpi titulo={r.saldoInicialProjetado ? "Saldo inicial projetado" : "Saldo inicial"} valor={fmtMoeda(r.saldoInicial)} icone={Wallet} tom="info" tomValor={r.saldoInicial < 0 ? "perigo" : "neutro"}>
          {r.saldoInicialProjetado ? `Saldo atual + previsões até ${fmtData(addDias(f.de, -1))}` : `Saldo em ${fmtData(addDias(f.de, -1))}`}
        </CartaoKpi>
        <CartaoKpi titulo="Entradas" valor={fmtMoeda(t.entradasRealizadas + t.entradasPrevistas)} icone={TrendingUp} tom="sucesso" tomValor="sucesso">
          <span className="tabular">Realizado {fmtMoeda(t.entradasRealizadas)}</span>
          <br />
          <span className="tabular">Previsto {fmtMoeda(t.entradasPrevistas)}</span>
        </CartaoKpi>
        <CartaoKpi titulo="Saídas" valor={fmtMoeda(t.saidasRealizadas + t.saidasPrevistas)} icone={TrendingDown} tom="perigo" tomValor="perigo">
          <span className="tabular">Realizado {fmtMoeda(t.saidasRealizadas)}</span>
          <br />
          <span className="tabular">Previsto {fmtMoeda(t.saidasPrevistas)}</span>
        </CartaoKpi>
        <CartaoKpi
          titulo={projetaFuturo ? "Saldo final projetado" : "Saldo final"}
          valor={fmtMoeda(r.saldoFinal)}
          icone={Landmark}
          tom="info"
          tomValor={r.saldoFinal < 0 ? "perigo" : "neutro"}
        >
          Em {fmtData(f.ate)}
          {menor && projetaFuturo && menor.valor < r.saldoFinal - 0.004 && (
            <>
              <br />
              <span className={cn("tabular", menor.valor < 0 && "font-medium text-destructive")}>
                Menor: {fmtMoeda(menor.valor)} ({menor.rotulo})
              </span>
            </>
          )}
        </CartaoKpi>
        <CartaoKpi
          titulo="A receber em atraso"
          valor={fmtMoeda(atrasados.receber)}
          icone={CircleArrowDown}
          tom="alerta"
          tomValor={atrasados.receber > 0 ? "alerta" : "neutro"}
          href={`/financeiro/receber?status=vencidos${filtroConta}`}
        >
          {qtd(atrasados.qtdReceber)}
          {atrasados.qtdReceber > 0 && <> · {situacaoAtrasados}</>}
        </CartaoKpi>
        <CartaoKpi
          titulo="A pagar em atraso"
          valor={fmtMoeda(atrasados.pagar)}
          icone={CircleArrowUp}
          tom="perigo"
          tomValor={atrasados.pagar > 0 ? "perigo" : "neutro"}
          href={`/financeiro/pagar?status=vencidos${filtroConta}`}
        >
          {qtd(atrasados.qtdPagar)}
          {atrasados.qtdPagar > 0 && <> · {situacaoAtrasados}</>}
        </CartaoKpi>
      </div>

      {semDados ? (
        <EstadoVazio
          titulo="Nada para mostrar neste período"
          descricao={
            contas.length
              ? "Não há saldo, movimentos nem títulos em aberto no intervalo escolhido. Ajuste as datas ou lance contas a pagar e a receber."
              : "Cadastre uma conta bancária com o saldo inicial e lance suas contas a pagar e a receber para ver o fluxo de caixa."
          }
        >
          <div className="flex flex-wrap justify-center gap-2">
            {!contas.length && (
              <Button asChild size="sm" variant="outline">
                <Link href="/cadastros/contas-bancarias">Cadastrar conta bancária</Link>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href="/financeiro/receber">Contas a receber</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/financeiro/pagar">Contas a pagar</Link>
            </Button>
          </div>
        </EstadoVazio>
      ) : (
        <>
          <Card className="mb-4 gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Entradas, saídas e saldo acumulado</CardTitle>
              <CardDescription className="text-xs">Barras sólidas = realizado (movimentos); claras = previsto (títulos em aberto pelo vencimento).</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <GraficoFluxo pontos={pontos} />
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <Table className="text-[13px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40 [&>th]:h-8">
                  <TableHead rowSpan={2} className="min-w-[170px] align-bottom">
                    Período
                  </TableHead>
                  <TableHead colSpan={2} className="border-l text-center text-xs font-medium text-muted-foreground">
                    Realizado
                  </TableHead>
                  <TableHead colSpan={2} className="border-l text-center text-xs font-medium text-muted-foreground">
                    Previsto
                  </TableHead>
                  {temAberturas && (
                    <TableHead rowSpan={2} className="border-l text-right align-bottom" title="Saldo inicial de contas cadastradas dentro do período">
                      Abertura de contas
                    </TableHead>
                  )}
                  <TableHead rowSpan={2} className="border-l text-right align-bottom">
                    Resultado
                  </TableHead>
                  <TableHead rowSpan={2} className="text-right align-bottom">
                    Saldo acumulado
                  </TableHead>
                </TableRow>
                <TableRow className="bg-muted/40 hover:bg-muted/40 [&>th]:h-8">
                  <TableHead className="border-l text-right">Entradas</TableHead>
                  <TableHead className="text-right">Saídas</TableHead>
                  <TableHead className="border-l text-right">Entradas</TableHead>
                  <TableHead className="text-right">Saídas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="text-muted-foreground hover:bg-transparent">
                  <TableCell>
                    {r.saldoInicialProjetado ? "Saldo inicial projetado" : "Saldo inicial"}
                    <span className="ml-1.5 text-xs">({fmtData(addDias(f.de, -1))})</span>
                  </TableCell>
                  <TableCell colSpan={temAberturas ? 6 : 5} />
                  <TableCell className={cn("text-right font-medium tabular", r.saldoInicial < 0 ? "text-destructive" : "text-foreground")}>
                    {fmtMoeda(r.saldoInicial)}
                  </TableCell>
                </TableRow>
                {r.linhas.map((l) => (
                  <TableRow key={l.chave} className={cn("tabular", l.contemHoje && "bg-primary/5 hover:bg-primary/10")}>
                    <TableCell>
                      <span className={cn(l.contemHoje && "font-medium")}>{l.rotulo}</span>
                      {l.contemHoje && (
                        <Selo tom="info" className="ml-2 px-1.5 py-0 text-[11px]">
                          hoje
                        </Selo>
                      )}
                      {l.parcial && f.agrupamento === "mes" && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          ({fmtData(l.inicio).slice(0, 5)}–{fmtData(l.fim).slice(0, 5)})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="border-l text-right">
                      <Valor v={l.entradasRealizadas} classe="text-success" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Valor v={l.saidasRealizadas} classe="text-destructive" />
                    </TableCell>
                    <TableCell className="border-l text-right">
                      <Valor v={l.entradasPrevistas} classe="text-success/80" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Valor v={l.saidasPrevistas} classe="text-destructive/80" />
                    </TableCell>
                    {temAberturas && (
                      <TableCell className="border-l text-right">
                        <Valor v={l.aberturas} classe="text-primary" />
                      </TableCell>
                    )}
                    <TableCell className="border-l text-right">
                      <Valor v={l.resultado} classe={l.resultado < 0 ? "text-destructive" : "text-success"} />
                    </TableCell>
                    <TableCell className={cn("text-right font-medium", l.saldo < 0 && "text-destructive")}>{fmtMoeda(l.saldo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="tabular hover:bg-transparent">
                  <TableCell className="font-semibold">Total do período</TableCell>
                  <TableCell className="border-l text-right font-semibold text-success">{fmtMoeda(t.entradasRealizadas)}</TableCell>
                  <TableCell className="text-right font-semibold text-destructive">{fmtMoeda(t.saidasRealizadas)}</TableCell>
                  <TableCell className="border-l text-right font-semibold text-success/80">{fmtMoeda(t.entradasPrevistas)}</TableCell>
                  <TableCell className="text-right font-semibold text-destructive/80">{fmtMoeda(t.saidasPrevistas)}</TableCell>
                  {temAberturas && <TableCell className="border-l text-right font-semibold text-primary">{fmtMoeda(t.aberturas)}</TableCell>}
                  <TableCell className={cn("border-l text-right font-semibold", t.resultado < 0 ? "text-destructive" : "text-success")}>
                    {fmtMoeda(t.resultado)}
                  </TableCell>
                  <TableCell className={cn("text-right font-semibold", r.saldoFinal < 0 && "text-destructive")}>{fmtMoeda(r.saldoFinal)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>

          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            <li>Realizado = movimentos das contas na data. Previsto = saldo em aberto dos títulos pelo vencimento, de hoje em diante.</li>
            {atrasadosNaProjecao && (
              <li>
                Atrasados ({fmtMoeda(atrasadosNaProjecao.receber)} a receber e {fmtMoeda(atrasadosNaProjecao.pagar)} a pagar){" "}
                {atrasadosNaProjecao.onde === "hoje" ? "entram como previstos de hoje." : "entram no saldo inicial projetado."}
              </li>
            )}
            {!f.incluirVencidos && (atrasados.receber > 0 || atrasados.pagar > 0) && <li>Atrasados estão fora da projeção (filtro).</li>}
            {temAberturas && <li>Abertura de contas = saldo inicial de contas cadastradas dentro do período; entra no saldo, não nas entradas.</li>}
            {f.conta ? (
              <li>Com uma conta escolhida, as transferências entram e os previstos consideram só títulos com essa conta prevista.</li>
            ) : (
              <li>Transferências entre contas não entram na visão de todas as contas (são internas).</li>
            )}
          </ul>
        </>
      )}
    </>
  );
}
