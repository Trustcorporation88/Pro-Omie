import "server-only";
// Consultas do fluxo de caixa. Agregações feitas no banco (groupBy por dia); o agrupamento em
// semanas/meses e o saldo acumulado ficam em calcularFluxo (função pura).
import { escopoEmpresa } from "@/lib/auth/empresa";
import { prisma } from "@/lib/db";
import { addDias, diffDias, hojeISO, isoParaDate } from "@/lib/datas";
import { arred2, fmtData } from "@/lib/format";
import { isoReq, num } from "@/lib/serial";
import { saldosContas } from "@/modules/financeiro/servicos";
import { calcularFluxo, type Atrasados, type ResultadoFluxo, type ValorDia } from "./fluxo-calculo";
import { AGRUPAMENTOS, dataValida, param, type Agrupamento } from "./periodos";

type SearchParams = Record<string, string | string[] | undefined>;

/** Intervalo máximo aceito (≈ 3 anos). */
export const MAX_DIAS_FLUXO = 1096;

export type FiltrosFluxo = {
  hoje: string;
  de: string;
  ate: string;
  agrupamento: Agrupamento;
  conta: string | null;
  incluirVencidos: boolean;
  padrao: { de: string; ate: string };
  avisos: string[];
};

export type DadosFluxo = {
  filtros: FiltrosFluxo;
  contas: { valor: string; rotulo: string }[];
  contaNome: string | null;
  resultado: ResultadoFluxo;
  atrasados: Atrasados;
};

export function lerFiltrosFluxo(sp: SearchParams, hoje = hojeISO()): FiltrosFluxo {
  const padrao = { de: addDias(hoje, -30), ate: addDias(hoje, 60) };
  const avisos: string[] = [];
  const deP = param(sp.de);
  const ateP = param(sp.ate);
  let de = dataValida(deP) ? deP : padrao.de;
  let ate = dataValida(ateP) ? ateP : padrao.ate;
  if (de > ate) [de, ate] = [ate, de];
  if (diffDias(de, ate) > MAX_DIAS_FLUXO) {
    ate = addDias(de, MAX_DIAS_FLUXO);
    avisos.push(`O intervalo foi limitado a 3 anos (até ${fmtData(ate)}).`);
  }
  const ag = param(sp.agrupamento) ?? "";
  const agrupamento: Agrupamento = (AGRUPAMENTOS as readonly string[]).includes(ag) ? (ag as Agrupamento) : "semana";
  return {
    hoje,
    de,
    ate,
    agrupamento,
    conta: param(sp.conta)?.trim() || null,
    incluirVencidos: param(sp.vencidos) !== "excluir",
    padrao,
    avisos,
  };
}

const ABERTOS: ("ABERTO" | "PARCIAL")[] = ["ABERTO", "PARCIAL"];

/** Movimentos do período por dia. Todas as contas: ignora transferências (são internas). */
async function realizadoPorDia(de: string, ate: string, conta: string | null, empresaIds: string[]) {
  const grupos = await prisma.movimento.groupBy({
    by: ["data", "tipo"],
    where: {
      data: { gte: isoParaDate(de), lte: isoParaDate(ate) },
      ...(conta
        ? { contaBancariaId: conta }
        : { contaBancaria: { ativo: true, empresaId: { in: empresaIds } }, origem: { not: "TRANSFERENCIA" } }),
    },
    _sum: { valor: true },
  });
  const entradas: ValorDia[] = [];
  const saidas: ValorDia[] = [];
  for (const g of grupos) (g.tipo === "CREDITO" ? entradas : saidas).push({ data: isoReq(g.data), valor: num(g._sum.valor) });
  return { entradas, saidas };
}

/** Saldo em aberto (valor − valor pago) dos títulos por vencimento, de hoje até "ate". */
async function previstoPorDia(hoje: string, ate: string, conta: string | null, empresaIds: string[]) {
  const entradas: ValorDia[] = [];
  const saidas: ValorDia[] = [];
  if (ate < hoje) return { entradas, saidas };
  const grupos = await prisma.titulo.groupBy({
    by: ["vencimento", "tipo"],
    where: {
      status: { in: ABERTOS },
      empresaId: { in: empresaIds },
      vencimento: { gte: isoParaDate(hoje), lte: isoParaDate(ate) },
      ...(conta ? { contaBancariaId: conta } : {}),
    },
    _sum: { valor: true, valorPago: true },
  });
  for (const g of grupos) {
    const valor = arred2(num(g._sum.valor) - num(g._sum.valorPago));
    (g.tipo === "RECEBER" ? entradas : saidas).push({ data: isoReq(g.vencimento), valor });
  }
  return { entradas, saidas };
}

/** Títulos em aberto com vencimento anterior a hoje. */
export async function atrasadosPorTipo(hoje: string, empresaIds: string[], conta: string | null = null): Promise<Atrasados> {
  const grupos = await prisma.titulo.groupBy({
    by: ["tipo"],
    where: {
      status: { in: ABERTOS },
      empresaId: { in: empresaIds },
      vencimento: { lt: isoParaDate(hoje) },
      ...(conta ? { contaBancariaId: conta } : {}),
    },
    _sum: { valor: true, valorPago: true },
    _count: { _all: true },
  });
  const r: Atrasados = { receber: 0, qtdReceber: 0, pagar: 0, qtdPagar: 0 };
  for (const g of grupos) {
    const valor = arred2(num(g._sum.valor) - num(g._sum.valorPago));
    if (g.tipo === "RECEBER") {
      r.receber = valor;
      r.qtdReceber = g._count._all;
    } else {
      r.pagar = valor;
      r.qtdPagar = g._count._all;
    }
  }
  return r;
}

export async function consultarFluxo(filtrosLidos: FiltrosFluxo): Promise<DadosFluxo> {
  const filtros: FiltrosFluxo = { ...filtrosLidos, avisos: [...filtrosLidos.avisos] };
  const { de, ate, hoje } = filtros;
  const escopo = await escopoEmpresa();
  const contas = await prisma.contaBancaria.findMany({
    where: { ativo: true, empresaId: { in: escopo.ids } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, saldoInicial: true, dataSaldoInicial: true },
  });
  if (filtros.conta && !contas.some((c) => c.id === filtros.conta)) {
    filtros.conta = null;
    filtros.avisos.push("A conta escolhida não existe ou está inativa. Exibindo todas as contas ativas.");
  }
  const conta = filtros.conta;

  const [saldos, realizado, previsto, atrasados] = await Promise.all([
    saldosContas(prisma, addDias(de, -1), false, escopo.ids),
    realizadoPorDia(de, ate, conta, escopo.ids),
    previstoPorDia(hoje, ate, conta, escopo.ids),
    atrasadosPorTipo(hoje, escopo.ids, conta),
  ]);

  const daConta = <T extends { id: string }>(c: T) => !conta || c.id === conta;
  const saldoInicial = arred2(saldos.filter(daConta).reduce((a, s) => a + s.saldo, 0));
  // Contas cujo saldo inicial passa a valer dentro do período: o saldo de abertura entra no acumulado.
  const aberturas: ValorDia[] = contas
    .filter(daConta)
    .map((c) => ({ data: isoReq(c.dataSaldoInicial), valor: num(c.saldoInicial) }))
    .filter((a) => a.valor !== 0 && a.data >= de && a.data <= ate);

  const resultado = calcularFluxo({
    de,
    ate,
    hoje,
    agrupamento: filtros.agrupamento,
    incluirVencidos: filtros.incluirVencidos,
    saldoInicial,
    aberturas,
    entradasRealizadas: realizado.entradas,
    saidasRealizadas: realizado.saidas,
    entradasPrevistas: previsto.entradas,
    saidasPrevistas: previsto.saidas,
    atrasados,
  });

  return {
    filtros,
    contas: contas.map((c) => ({ valor: c.id, rotulo: c.nome })),
    contaNome: conta ? (contas.find((c) => c.id === conta)?.nome ?? null) : null,
    resultado,
    atrasados,
  };
}
