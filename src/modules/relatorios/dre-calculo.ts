// Montagem da DRE gerencial a partir de valores agregados por categoria e mês. Função pura (sem banco).
//
// Convenção de sinal: o valor exibido é sempre "efeito no resultado" — títulos a RECEBER somam (+) e
// títulos a PAGAR subtraem (−), seja qual for o grupo. Assim receitas aparecem positivas, deduções,
// custos e despesas aparecem negativas, e cada subtotal é a soma simples das linhas acima dele.
import type { GrupoDRE, TipoTitulo } from "@/generated/prisma/enums";
import { ROTULOS } from "@/lib/rotulos";

export type CategoriaDre = { id: string; nome: string; codigo: string | null; grupoDre: GrupoDRE };
/** Valor principal por categoria/mês (mes = 1..12). categoriaId null = título sem categoria. */
export type ValorCategoriaMes = { categoriaId: string | null; tipo: TipoTitulo; mes: number; valor: number };
/** Juros + multa e descontos das baixas do mês, por tipo de título. */
export type EncargoMes = { tipo: TipoTitulo; mes: number; encargos: number; desconto: number };

type Base = { id: string; rotulo: string; valores: number[]; total: number; pct: number | null };
export type LinhaDetalhe = Base & { tipo: "linha"; codigo?: string | null; sintetica?: boolean; dica?: string };
export type LinhaDre =
  | (Base & { tipo: "grupo"; filhos: LinhaDetalhe[] })
  | LinhaDetalhe
  | (Base & { tipo: "subtotal"; final?: boolean })
  | { tipo: "margem"; id: string; rotulo: string; valores: (number | null)[]; total: number | null; dica?: string };

export type ResumoDre = {
  receitaBruta: number;
  receitaLiquida: number;
  lucroBruto: number;
  ebitda: number;
  lucroLiquido: number;
  margemBruta: number | null;
  margemEbitda: number | null;
  margemLiquida: number | null;
};

export type ResultadoDre = {
  linhas: LinhaDre[];
  foraDre: LinhaDre[];
  resumo: ResumoDre;
  /** Há algum valor no ano (DRE ou fora dela)? */
  temDados: boolean;
};

const MESES = 12;
const zeros = () => Array.from({ length: MESES }, () => 0);
const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);
const somaVetores = (...vs: number[][]) => zeros().map((_, i) => vs.reduce((a, v) => a + v[i], 0));
const cent = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;

const SEM_CATEGORIA = {
  RECEBER: { id: "__sem_categoria_receber", nome: "Sem categoria (a receber)", codigo: null, grupoDre: "OUTRAS_RECEITAS" },
  PAGAR: { id: "__sem_categoria_pagar", nome: "Sem categoria (a pagar)", codigo: null, grupoDre: "OUTRAS_DESPESAS" },
} as const satisfies Record<TipoTitulo, CategoriaDre>;

const DICA_BAIXAS = "Apurado nas baixas do mês (juros, multas e descontos).";

/** Ordena códigos como "1.02" < "1.10" < "2.01"; sem código vai para o fim. */
function compararCategorias(a: CategoriaDre, b: CategoriaDre) {
  if (a.codigo && b.codigo) {
    const c = a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true });
    if (c) return c;
  } else if (a.codigo || b.codigo) {
    return a.codigo ? -1 : 1;
  }
  return a.nome.localeCompare(b.nome, "pt-BR");
}

export function montarDre(categorias: CategoriaDre[], valores: ValorCategoriaMes[], encargos: EncargoMes[]): ResultadoDre {
  const porId = new Map<string, CategoriaDre>(categorias.map((c) => [c.id, c]));
  // centavos por categoria (12 meses), com sinal de efeito no resultado
  const porCategoria = new Map<string, number[]>();
  for (const v of valores) {
    if (v.mes < 1 || v.mes > MESES) continue;
    let cat = v.categoriaId ? porId.get(v.categoriaId) : undefined;
    if (!cat) {
      cat = SEM_CATEGORIA[v.tipo];
      porId.set(cat.id, cat);
    }
    const vetor = porCategoria.get(cat.id) ?? zeros();
    vetor[v.mes - 1] += (v.tipo === "RECEBER" ? 1 : -1) * cent(v.valor);
    porCategoria.set(cat.id, vetor);
  }

  const jurosRecebidos = zeros();
  const jurosPagos = zeros();
  const descontosConcedidos = zeros();
  const descontosObtidos = zeros();
  for (const e of encargos) {
    if (e.mes < 1 || e.mes > MESES) continue;
    const i = e.mes - 1;
    if (e.tipo === "RECEBER") {
      jurosRecebidos[i] += cent(e.encargos);
      descontosConcedidos[i] -= cent(e.desconto);
    } else {
      jurosPagos[i] -= cent(e.encargos);
      descontosObtidos[i] += cent(e.desconto);
    }
  }
  const sinteticas: Partial<Record<GrupoDRE, { id: string; rotulo: string; centavos: number[] }[]>> = {
    RECEITAS_FINANCEIRAS: [
      { id: "__juros_recebidos", rotulo: "Juros e multas recebidos", centavos: jurosRecebidos },
      { id: "__descontos_obtidos", rotulo: "Descontos obtidos", centavos: descontosObtidos },
    ],
    DESPESAS_FINANCEIRAS: [
      { id: "__juros_pagos", rotulo: "Juros e multas pagos", centavos: jurosPagos },
      { id: "__descontos_concedidos", rotulo: "Descontos concedidos", centavos: descontosConcedidos },
    ],
  };

  // Linhas de detalhe (em centavos) por grupo.
  type Detalhe = { cat: CategoriaDre | null; id: string; rotulo: string; centavos: number[]; sintetica?: boolean };
  const detalhesPorGrupo = new Map<GrupoDRE, Detalhe[]>();
  const cats = [...porCategoria.keys()].map((id) => porId.get(id)!).sort(compararCategorias);
  for (const cat of cats) {
    const centavos = porCategoria.get(cat.id)!;
    if (centavos.every((c) => c === 0)) continue;
    const lista = detalhesPorGrupo.get(cat.grupoDre) ?? [];
    lista.push({ cat, id: cat.id, rotulo: cat.nome, centavos });
    detalhesPorGrupo.set(cat.grupoDre, lista);
  }
  for (const [grupo, linhas] of Object.entries(sinteticas) as [GrupoDRE, { id: string; rotulo: string; centavos: number[] }[]][]) {
    for (const s of linhas) {
      if (s.centavos.every((c) => c === 0)) continue;
      const lista = detalhesPorGrupo.get(grupo) ?? [];
      lista.push({ cat: null, id: s.id, rotulo: s.rotulo, centavos: s.centavos, sintetica: true });
      detalhesPorGrupo.set(grupo, lista);
    }
  }
  const centavosGrupo = (g: GrupoDRE) => somaVetores(zeros(), ...(detalhesPorGrupo.get(g) ?? []).map((d) => d.centavos));

  const rb = centavosGrupo("RECEITA_BRUTA");
  const rbTotal = soma(rb);
  const pct = (totalCent: number) => (rbTotal ? (totalCent / rbTotal) * 100 : null);
  const detalhe = (d: Detalhe): LinhaDetalhe => {
    const total = soma(d.centavos);
    return {
      tipo: "linha",
      id: d.id,
      rotulo: d.rotulo,
      codigo: d.cat?.codigo ?? null,
      valores: d.centavos.map(reais),
      total: reais(total),
      pct: pct(total),
      ...(d.sintetica ? { sintetica: true, dica: DICA_BAIXAS } : {}),
    };
  };

  const linhas: LinhaDre[] = [];
  const grupo = (g: GrupoDRE, prefixo: string) => {
    const centavos = centavosGrupo(g);
    const total = soma(centavos);
    linhas.push({
      tipo: "grupo",
      id: g,
      rotulo: `${prefixo}${ROTULOS.grupoDre[g]}`,
      valores: centavos.map(reais),
      total: reais(total),
      pct: pct(total),
      filhos: (detalhesPorGrupo.get(g) ?? []).map(detalhe),
    });
    return centavos;
  };
  const subtotal = (id: string, rotulo: string, centavos: number[], final = false) => {
    const total = soma(centavos);
    linhas.push({ tipo: "subtotal", id, rotulo, valores: centavos.map(reais), total: reais(total), pct: pct(total), ...(final ? { final } : {}) });
    return centavos;
  };
  const razao = (a: number, b: number) => (b ? (a / b) * 100 : null);
  const margem = (id: string, rotulo: string, numerador: number[], base: number[], dica: string) => {
    linhas.push({
      tipo: "margem",
      id,
      rotulo,
      valores: numerador.map((n, i) => razao(n, base[i])),
      total: razao(soma(numerador), soma(base)),
      dica,
    });
  };

  const MENOS = "(−) ";
  const MAIS = "(+) ";
  grupo("RECEITA_BRUTA", "");
  const ded = grupo("DEDUCOES", MENOS);
  const rl = subtotal("receita_liquida", "= Receita líquida", somaVetores(rb, ded));
  const custos = grupo("CUSTOS", MENOS);
  const lb = subtotal("lucro_bruto", "= Lucro bruto", somaVetores(rl, custos));
  margem("margem_bruta", "Margem bruta", lb, rl, "Lucro bruto ÷ receita líquida");
  const pessoal = grupo("DESPESAS_PESSOAL", MENOS);
  const adm = grupo("DESPESAS_ADMINISTRATIVAS", MENOS);
  const com = grupo("DESPESAS_COMERCIAIS", MENOS);
  const ebitda = subtotal("ebitda", "= Resultado operacional (EBITDA)", somaVetores(lb, pessoal, adm, com));
  const recFin = grupo("RECEITAS_FINANCEIRAS", MAIS);
  const despFin = grupo("DESPESAS_FINANCEIRAS", MENOS);
  const outRec = grupo("OUTRAS_RECEITAS", MAIS);
  const outDesp = grupo("OUTRAS_DESPESAS", MENOS);
  const lair = subtotal("resultado_antes_ir", "= Resultado antes do IR/CSLL", somaVetores(ebitda, recFin, despFin, outRec, outDesp));
  const ir = grupo("IMPOSTOS_LUCRO", MENOS);
  const ll = subtotal("lucro_liquido", "= Lucro líquido", somaVetores(lair, ir), true);
  margem("margem_liquida", "Margem líquida", ll, rl, "Lucro líquido ÷ receita líquida");

  // Fora da DRE: categorias não operacionais (aportes, empréstimos, investimentos, distribuição de lucros).
  const naoOper = detalhesPorGrupo.get("NAO_OPERACIONAL") ?? [];
  const foraDre: LinhaDre[] = naoOper.map((d) => ({ ...detalhe(d), pct: null }));
  if (naoOper.length) {
    const c = somaVetores(zeros(), ...naoOper.map((d) => d.centavos));
    foraDre.push({ tipo: "subtotal", id: "saldo_nao_operacional", rotulo: "= Saldo não operacional", valores: c.map(reais), total: reais(soma(c)), pct: null, final: true });
  }

  const totalRl = soma(rl);
  return {
    linhas,
    foraDre,
    resumo: {
      receitaBruta: reais(rbTotal),
      receitaLiquida: reais(totalRl),
      lucroBruto: reais(soma(lb)),
      ebitda: reais(soma(ebitda)),
      lucroLiquido: reais(soma(ll)),
      margemBruta: razao(soma(lb), totalRl),
      margemEbitda: razao(soma(ebitda), totalRl),
      margemLiquida: razao(soma(ll), totalRl),
    },
    temDados: detalhesPorGrupo.size > 0,
  };
}
