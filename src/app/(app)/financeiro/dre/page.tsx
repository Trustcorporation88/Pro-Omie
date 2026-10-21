import type { Metadata } from "next";
import Link from "next/link";
import { ChartColumn, Landmark, TrendingUp, TriangleAlert, Wallet } from "lucide-react";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CartaoKpi } from "@/components/relatorios/cartao-kpi";
import { BotaoExportarCsv, type CelulaCsv } from "@/components/relatorios/exportar-csv";
import { BarraFiltros, FiltroAbas, FiltroSelect } from "@/components/relatorios/filtros-relatorio";
import { fmtPct } from "@/components/relatorios/formatos";
import { TabelaDre } from "@/components/relatorios/tabela-dre";
import { exigirUsuario } from "@/lib/auth/sessao";
import { fmtMesAno, fmtMoeda } from "@/lib/format";
import { consultarDre, lerFiltrosDre } from "@/modules/relatorios/dre";
import type { LinhaDre } from "@/modules/relatorios/dre-calculo";

export const metadata: Metadata = { title: "DRE gerencial" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const EXPLICACAO = {
  competencia: "Lançamentos pela data de competência (títulos não cancelados). Juros, multas e descontos entram pela data da baixa.",
  caixa: "Pagamentos e recebimentos pela data da baixa, distribuídos pelo rateio de cada título. Juros, multas e descontos à parte.",
} as const;

/** Achata a DRE em linhas de CSV (categorias recuadas sob o grupo). */
function linhasCsv(linhas: LinhaDre[], comPct: boolean): CelulaCsv[][] {
  const out: CelulaCsv[][] = [];
  for (const l of linhas) {
    if (l.tipo === "margem") {
      out.push([`${l.rotulo} (%)`, ...l.valores, l.total, ...(comPct ? [null] : [])]);
      continue;
    }
    out.push([l.rotulo, ...l.valores, l.total, ...(comPct ? [l.pct] : [])]);
    if (l.tipo === "grupo") {
      for (const c of l.filhos) {
        out.push([`    ${c.codigo ? `${c.codigo} ` : ""}${c.rotulo}`, ...c.valores, c.total, ...(comPct ? [c.pct] : [])]);
      }
    }
  }
  return out;
}

export default async function DrePage({ searchParams }: Props) {
  await exigirUsuario("relatorios:ver");
  const sp = await searchParams;
  const { filtros: f, resultado: r, centros, empresas, avisos } = await consultarDre(lerFiltrosDre(sp));

  const anoAtual = Number(f.hoje.slice(0, 4));
  const mesAtual = Number(f.hoje.slice(5, 7));
  const meses = Array.from({ length: 12 }, (_, i) => fmtMesAno(`${f.ano}-${String(i + 1).padStart(2, "0")}-01`));
  const futuros = meses.map((_, i) => f.ano > anoAtual || (f.ano === anoAtual && i + 1 > mesAtual));
  const anos = [...new Set([...Array.from({ length: 7 }, (_, i) => anoAtual + 1 - i), f.ano])].sort((a, b) => b - a);
  const regime = f.regime === "caixa" ? "caixa" : "competência";
  const centroNome = f.centro ? centros.find((c) => c.valor === f.centro)?.rotulo : null;
  const empresaNome = f.empresa ? empresas.find((e) => e.valor === f.empresa)?.rotulo : null;
  const res = r.resumo;

  const cabecalhoCsv = ["Linha", ...meses, "Total", "% da receita bruta"];
  const csv: CelulaCsv[][] = [...linhasCsv(r.linhas, true)];
  if (r.foraDre.length) {
    csv.push([], ["Fora da DRE (não operacional)"], ...linhasCsv(r.foraDre, true));
  }
  const arquivo = `dre_${f.ano}_${f.regime}${f.centro ? "_centro" : ""}${f.empresa ? "_empresa" : ""}.csv`;

  return (
    <>
      <PageHeader
        titulo="DRE gerencial"
        descricao={[`${f.ano}`, `regime de ${regime}`, centroNome ?? "todos os centros de custo", ...(empresaNome ? [empresaNome] : [])].join(" · ")}
      >
        <BotaoExportarCsv arquivo={arquivo} cabecalho={cabecalhoCsv} linhas={csv} desabilitado={!r.temDados} />
      </PageHeader>

      <BarraFiltros>
        <FiltroSelect
          parametro="ano"
          rotulo="Ano"
          valor={String(f.ano)}
          padrao={String(anoAtual)}
          opcoes={anos.map((a) => ({ valor: String(a), rotulo: String(a) }))}
          className="w-24"
        />
        <FiltroAbas
          parametro="regime"
          rotulo="Regime"
          valor={f.regime}
          padrao="competencia"
          opcoes={[
            { valor: "competencia", rotulo: "Competência" },
            { valor: "caixa", rotulo: "Caixa" },
          ]}
        />
        <FiltroSelect parametro="centro" rotulo="Centro de custo" valor={f.centro ?? ""} rotuloTodos="Todos os centros" opcoes={centros} />
        {empresas.length > 1 && (
          <FiltroSelect parametro="empresa" rotulo="Empresa" valor={f.empresa ?? ""} rotuloTodos="Todas as empresas" opcoes={empresas} />
        )}
      </BarraFiltros>

      {avisos.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[oklch(0.5_0.13_65)] dark:text-warning" />
          <div>{avisos.join(" ")}</div>
        </div>
      )}

      {!r.temDados ? (
        <EstadoVazio
          titulo={`Nenhum valor em ${f.ano}`}
          descricao={
            f.regime === "caixa"
              ? "Não há pagamentos ou recebimentos (baixas) neste ano com os filtros escolhidos."
              : "Não há lançamentos com competência neste ano com os filtros escolhidos."
          }
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/financeiro/receber">Contas a receber</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/financeiro/pagar">Contas a pagar</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/cadastros/categorias">Categorias e grupos da DRE</Link>
            </Button>
          </div>
        </EstadoVazio>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CartaoKpi titulo="Receita bruta" valor={fmtMoeda(res.receitaBruta)} icone={TrendingUp} tom="sucesso">
              Receita líquida <span className="tabular">{fmtMoeda(res.receitaLiquida)}</span>
            </CartaoKpi>
            <CartaoKpi titulo="Lucro bruto" valor={fmtMoeda(res.lucroBruto)} icone={ChartColumn} tom="info" tomValor={res.lucroBruto < 0 ? "perigo" : "neutro"}>
              Margem bruta <span className="tabular">{fmtPct(res.margemBruta)}</span>
            </CartaoKpi>
            <CartaoKpi titulo="EBITDA" valor={fmtMoeda(res.ebitda)} icone={Landmark} tom="roxo" tomValor={res.ebitda < 0 ? "perigo" : "neutro"}>
              Resultado operacional · margem <span className="tabular">{fmtPct(res.margemEbitda)}</span>
            </CartaoKpi>
            <CartaoKpi
              titulo="Lucro líquido"
              valor={fmtMoeda(res.lucroLiquido)}
              icone={Wallet}
              tom={res.lucroLiquido < 0 ? "perigo" : "sucesso"}
              tomValor={res.lucroLiquido < 0 ? "perigo" : "sucesso"}
            >
              Margem líquida <span className="tabular">{fmtPct(res.margemLiquida)}</span>
            </CartaoKpi>
          </div>

          <Card className="mb-4 gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Demonstração do resultado · {f.ano}</CardTitle>
              <CardDescription className="text-xs">
                Valores em R$. {EXPLICACAO[f.regime]} Margens sobre a receita líquida; % RB sobre a receita bruta do ano.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <TabelaDre linhas={r.linhas} meses={meses} futuros={futuros} />
            </CardContent>
          </Card>

          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Fora da DRE (não operacional)</CardTitle>
              <CardDescription className="text-xs">
                Aportes, empréstimos, investimentos e distribuição de lucros: mexem no caixa, mas não no resultado.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              {r.foraDre.length ? (
                <TabelaDre linhas={r.foraDre} meses={meses} futuros={futuros} mostrarPct={false} controles={false} rotuloConta="Categoria" />
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum lançamento em categorias não operacionais em {f.ano}.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
