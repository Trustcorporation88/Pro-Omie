import "server-only";
// Consultas da DRE gerencial (agregação no banco por categoria × mês) + montagem em montarDre.
import { prisma, Prisma } from "@/lib/db";
import { hojeISO } from "@/lib/datas";
import { fmtDocumento } from "@/lib/format";
import { num } from "@/lib/serial";
import type { TipoTitulo } from "@/generated/prisma/enums";
import { montarDre, type EncargoMes, type ResultadoDre, type ValorCategoriaMes } from "./dre-calculo";
import { param } from "./periodos";
import { tabela } from "./sql";

type SearchParams = Record<string, string | string[] | undefined>;

export type RegimeDre = "competencia" | "caixa";

export type FiltrosDre = {
  ano: number;
  regime: RegimeDre;
  centro: string | null;
  empresa: string | null;
  /** 'YYYY-MM-DD' de hoje (fuso de São Paulo) */
  hoje: string;
};

export type DadosDre = {
  filtros: FiltrosDre;
  resultado: ResultadoDre;
  centros: { valor: string; rotulo: string }[];
  empresas: { valor: string; rotulo: string }[];
  avisos: string[];
};

export function lerFiltrosDre(sp: SearchParams, hoje = hojeISO()): FiltrosDre {
  const anoAtual = Number(hoje.slice(0, 4));
  const ano = Number(param(sp.ano));
  return {
    ano: Number.isInteger(ano) && ano >= 2000 && ano <= 2100 ? ano : anoAtual,
    regime: param(sp.regime) === "caixa" ? "caixa" : "competencia",
    centro: param(sp.centro)?.trim() || null,
    empresa: param(sp.empresa)?.trim() || null,
    hoje,
  };
}

type Dec = Prisma.Decimal | number | string | null;
type LinhaValor = { categoriaId: string | null; tipo: string; mes: number; valor: Dec };
type LinhaEncargo = { tipo: string; mes: number; encargos: Dec; desconto: Dec };

const tipoTitulo = (t: string): TipoTitulo => (t === "RECEBER" ? "RECEBER" : "PAGAR");

// Títulos sem rateio (não deveria ocorrer) caem na categoria/centro do próprio título, com 100%.
const CATEGORIA = Prisma.sql`CASE WHEN r.id IS NULL THEN t."categoriaId" ELSE r."categoriaId" END`;
const CENTRO = Prisma.sql`CASE WHEN r.id IS NULL THEN t."centroCustoId" ELSE r."centroCustoId" END`;

/** Regime de competência: rateios dos títulos não cancelados, pela data de competência. */
function valoresCompetencia(f: FiltrosDre, inicio: string, fim: string) {
  return prisma.$queryRaw<LinhaValor[]>`
    SELECT ${CATEGORIA} AS "categoriaId",
           t.tipo::text AS tipo,
           EXTRACT(MONTH FROM t.competencia)::int AS mes,
           SUM(COALESCE(r.valor, t.valor)) AS valor
      FROM ${tabela("titulos")} t
      LEFT JOIN ${tabela("titulo_rateios")} r ON r."tituloId" = t.id
     WHERE t.status::text <> 'CANCELADO'
       AND t.competencia BETWEEN ${inicio}::date AND ${fim}::date
       ${f.centro ? Prisma.sql`AND ${CENTRO} = ${f.centro}` : Prisma.empty}
       ${f.empresa ? Prisma.sql`AND t."empresaId" = ${f.empresa}` : Prisma.empty}
     GROUP BY 1, 2, 3`;
}

/**
 * Baixas não estornadas do ano, uma linha por baixa × rateio. Principal, juros + multa e desconto são
 * distribuídos por rateio.percentual / 100, arredondados em centavos; o último rateio de cada baixa
 * absorve a diferença (como em distribuirRateio), então a soma das partes bate com a baixa.
 * Título sem rateio (não deveria ocorrer) usa a categoria/centro do próprio título, com 100%.
 */
function baixasRateadas(inicio: string, fim: string) {
  return Prisma.sql`
    SELECT z."categoriaId", z."centroCustoId", z."empresaId", z.tipo, z.mes,
           z.pp + CASE WHEN z.ultimo THEN z.vp - SUM(z.pp) OVER (PARTITION BY z.baixa) ELSE 0 END AS principal,
           z.pe + CASE WHEN z.ultimo THEN z.ve - SUM(z.pe) OVER (PARTITION BY z.baixa) ELSE 0 END AS encargos,
           z.pd + CASE WHEN z.ultimo THEN z.vd - SUM(z.pd) OVER (PARTITION BY z.baixa) ELSE 0 END AS desconto
      FROM (
        SELECT ${CATEGORIA} AS "categoriaId",
               ${CENTRO} AS "centroCustoId",
               t."empresaId" AS "empresaId",
               t.tipo::text AS tipo,
               EXTRACT(MONTH FROM b.data)::int AS mes,
               b.id AS baixa,
               b.valor AS vp,
               b.juros + b.multa AS ve,
               b.desconto AS vd,
               ROUND(b.valor * COALESCE(r.percentual, 100) / 100, 2) AS pp,
               ROUND((b.juros + b.multa) * COALESCE(r.percentual, 100) / 100, 2) AS pe,
               ROUND(b.desconto * COALESCE(r.percentual, 100) / 100, 2) AS pd,
               ROW_NUMBER() OVER (PARTITION BY b.id ORDER BY r.id DESC) = 1 AS ultimo
          FROM ${tabela("baixas")} b
          JOIN ${tabela("titulos")} t ON t.id = b."tituloId"
          LEFT JOIN ${tabela("titulo_rateios")} r ON r."tituloId" = t.id
         WHERE b.estornada = false
           AND b.data BETWEEN ${inicio}::date AND ${fim}::date
      ) z`;
}

/** Filtros de centro/empresa aplicados depois da distribuição (a parte de cada rateio não muda). */
function filtroBaixas(f: FiltrosDre) {
  return Prisma.sql`WHERE TRUE
    ${f.centro ? Prisma.sql`AND y."centroCustoId" = ${f.centro}` : Prisma.empty}
    ${f.empresa ? Prisma.sql`AND y."empresaId" = ${f.empresa}` : Prisma.empty}`;
}

/** Regime de caixa: principal das baixas distribuído pelos rateios, pela data da baixa. */
function valoresCaixa(f: FiltrosDre, inicio: string, fim: string) {
  return prisma.$queryRaw<LinhaValor[]>`
    SELECT y."categoriaId", y.tipo, y.mes, SUM(y.principal) AS valor
      FROM (${baixasRateadas(inicio, fim)}) y
     ${filtroBaixas(f)}
     GROUP BY 1, 2, 3`;
}

/** Juros + multa e descontos das baixas (usados nos dois regimes), por tipo de título e mês. */
function encargosBaixas(f: FiltrosDre, inicio: string, fim: string) {
  return prisma.$queryRaw<LinhaEncargo[]>`
    SELECT y.tipo, y.mes, SUM(y.encargos) AS encargos, SUM(y.desconto) AS desconto
      FROM (${baixasRateadas(inicio, fim)}) y
     ${filtroBaixas(f)}
     GROUP BY 1, 2`;
}

export async function consultarDre(filtrosLidos: FiltrosDre): Promise<DadosDre> {
  const avisos: string[] = [];
  const [categorias, centros, empresas] = await Promise.all([
    prisma.categoria.findMany({ select: { id: true, nome: true, codigo: true, grupoDre: true } }),
    prisma.centroCusto.findMany({ orderBy: [{ codigo: "asc" }, { nome: "asc" }], select: { id: true, nome: true, ativo: true } }),
    prisma.empresa.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true } }),
  ]);
  const f: FiltrosDre = { ...filtrosLidos };
  if (f.centro && !centros.some((c) => c.id === f.centro)) {
    f.centro = null;
    avisos.push("O centro de custo escolhido não existe. Exibindo todos os centros.");
  }
  if (f.empresa && !empresas.some((e) => e.id === f.empresa)) {
    f.empresa = null;
    avisos.push("A empresa escolhida não existe. Exibindo todas as empresas.");
  }

  const inicio = `${f.ano}-01-01`;
  const fim = `${f.ano}-12-31`;
  const [linhasValor, linhasEncargo] = await Promise.all([
    f.regime === "competencia" ? valoresCompetencia(f, inicio, fim) : valoresCaixa(f, inicio, fim),
    encargosBaixas(f, inicio, fim),
  ]);

  const valores: ValorCategoriaMes[] = linhasValor.map((l) => ({
    categoriaId: l.categoriaId,
    tipo: tipoTitulo(l.tipo),
    mes: Number(l.mes),
    valor: num(l.valor),
  }));
  const encargos: EncargoMes[] = linhasEncargo.map((l) => ({
    tipo: tipoTitulo(l.tipo),
    mes: Number(l.mes),
    encargos: num(l.encargos),
    desconto: num(l.desconto),
  }));

  return {
    filtros: f,
    resultado: montarDre(categorias, valores, encargos),
    centros: centros.map((c) => ({ valor: c.id, rotulo: c.ativo ? c.nome : `${c.nome} (inativo)` })),
    empresas: empresas.map((e) => ({ valor: e.id, rotulo: `${e.nomeFantasia || e.razaoSocial} · ${fmtDocumento(e.cnpj)}` })),
    avisos,
  };
}
