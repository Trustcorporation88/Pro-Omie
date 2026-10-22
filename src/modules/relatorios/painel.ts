import "server-only";
// Dados do painel inicial (widgets financeiros). Todas as consultas rodam em paralelo.
import { escopoEmpresa } from "@/lib/auth/empresa";
import { prisma } from "@/lib/db";
import { addDias, addMeses, fimMes, inicioMes, isoParaDate, mesesEntre } from "@/lib/datas";
import { arred2, fmtMesAno } from "@/lib/format";
import { isoReq, num } from "@/lib/serial";
import { saldosContas, type SaldoConta } from "@/modules/financeiro/servicos";
import { atrasadosPorTipo } from "./fluxo-caixa";
import type { Atrasados } from "./fluxo-calculo";

export type ResumoJanela = { total: number; hoje: number; quantidade: number };
export type MesFluxo = { mes: string; rotulo: string; entradas: number; saidas: number; resultado: number };
export type ProximoTitulo = {
  id: string;
  numero: number;
  tipo: "RECEBER" | "PAGAR";
  pessoa: string | null;
  descricao: string;
  vencimento: string;
  saldo: number;
  parcial: boolean;
};
export type DespesaCategoria = { nome: string; valor: number; outras?: boolean };
export type PrimeirosPassos = { contas: boolean; pessoas: boolean; categorias: boolean; lancamento: boolean; extrato: boolean };

export type DadosPainel = {
  hoje: string;
  ate7: string;
  saldos: { total: number; contas: SaldoConta[] };
  receber: ResumoJanela;
  pagar: ResumoJanela;
  atrasados: Atrasados;
  meses: MesFluxo[];
  proximos: ProximoTitulo[];
  despesas: { mes: string; total: number; categorias: DespesaCategoria[] };
  /** Preenchido só enquanto não existe nenhum título (implantação). */
  primeirosPassos: PrimeirosPassos | null;
};

const ABERTOS: ("ABERTO" | "PARCIAL")[] = ["ABERTO", "PARCIAL"];
const TOP_CATEGORIAS = 6;

async function primeirosPassos(empresaIds: string[]): Promise<PrimeirosPassos> {
  const [contaBanco, pessoa, categorias, extrato] = await Promise.all([
    prisma.contaBancaria.findFirst({ where: { tipo: { not: "CAIXA" }, empresaId: { in: empresaIds } }, select: { id: true } }),
    prisma.pessoa.findFirst({ select: { id: true } }),
    prisma.categoria.aggregate({ _min: { createdAt: true }, _max: { updatedAt: true } }),
    prisma.extratoImportacao.findFirst({ where: { contaBancaria: { empresaId: { in: empresaIds } } }, select: { id: true } }),
  ]);
  const criadas = categorias._min.createdAt?.getTime();
  const alteradas = categorias._max.updatedAt?.getTime();
  return {
    contas: !!contaBanco,
    pessoas: !!pessoa,
    // plano padrão é criado de uma vez na implantação; qualquer inclusão/edição posterior conta como revisão
    categorias: criadas !== undefined && alteradas !== undefined && alteradas - criadas > 60_000,
    lancamento: false,
    extrato: !!extrato,
  };
}

export async function carregarPainel(hoje: string): Promise<DadosPainel> {
  const ate7 = addDias(hoje, 7);
  const inicio6 = inicioMes(addMeses(hoje, -5));
  const fim6 = fimMes(hoje);
  const mesIni = inicioMes(hoje);
  const escopo = await escopoEmpresa();
  const ids = escopo.ids;

  const [saldos, janela, atrasados, movimentos, proximos, despesas, categorias, algumTitulo] = await Promise.all([
    saldosContas(prisma, undefined, false, ids),
    prisma.titulo.groupBy({
      by: ["tipo", "vencimento"],
      where: { status: { in: ABERTOS }, empresaId: { in: ids }, vencimento: { gte: isoParaDate(hoje), lte: isoParaDate(ate7) } },
      _sum: { valor: true, valorPago: true },
      _count: { _all: true },
    }),
    atrasadosPorTipo(hoje, ids),
    prisma.movimento.groupBy({
      by: ["data", "tipo"],
      where: {
        data: { gte: isoParaDate(inicio6), lte: isoParaDate(fim6) },
        origem: { not: "TRANSFERENCIA" },
        contaBancaria: { empresaId: { in: ids } },
      },
      _sum: { valor: true },
    }),
    prisma.titulo.findMany({
      where: { status: { in: ABERTOS }, empresaId: { in: ids }, vencimento: { gte: isoParaDate(hoje) } },
      orderBy: [{ vencimento: "asc" }, { numero: "asc" }],
      take: 10,
      select: {
        id: true,
        numero: true,
        tipo: true,
        status: true,
        descricao: true,
        vencimento: true,
        valor: true,
        valorPago: true,
        pessoa: { select: { nome: true, nomeFantasia: true } },
      },
    }),
    prisma.tituloRateio.groupBy({
      by: ["categoriaId"],
      where: {
        titulo: {
          tipo: "PAGAR",
          status: { not: "CANCELADO" },
          empresaId: { in: ids },
          competencia: { gte: isoParaDate(mesIni), lte: isoParaDate(fimMes(hoje)) },
        },
        categoria: { tipo: "DESPESA", grupoDre: { not: "NAO_OPERACIONAL" } },
      },
      _sum: { valor: true },
    }),
    prisma.categoria.findMany({ where: { tipo: "DESPESA" }, select: { id: true, nome: true } }),
    prisma.titulo.findFirst({ where: { empresaId: { in: ids } }, select: { id: true } }),
  ]);

  // A receber / a pagar de hoje até hoje + 7
  const receber: ResumoJanela = { total: 0, hoje: 0, quantidade: 0 };
  const pagar: ResumoJanela = { total: 0, hoje: 0, quantidade: 0 };
  for (const g of janela) {
    const alvo = g.tipo === "RECEBER" ? receber : pagar;
    const saldo = num(g._sum.valor) - num(g._sum.valorPago);
    alvo.total += saldo;
    alvo.quantidade += g._count._all;
    if (isoReq(g.vencimento) === hoje) alvo.hoje += saldo;
  }
  for (const r of [receber, pagar]) {
    r.total = arred2(r.total);
    r.hoje = arred2(r.hoje);
  }

  // Entradas × saídas realizadas dos últimos 6 meses (sem transferências)
  const porMes = new Map(mesesEntre(inicio6, fim6).map((m) => [m, { entradas: 0, saidas: 0 }]));
  for (const g of movimentos) {
    const m = porMes.get(isoReq(g.data).slice(0, 7));
    if (!m) continue;
    if (g.tipo === "CREDITO") m.entradas += num(g._sum.valor);
    else m.saidas += num(g._sum.valor);
  }
  const meses: MesFluxo[] = [...porMes.entries()].map(([mes, v]) => ({
    mes,
    rotulo: fmtMesAno(`${mes}-01`),
    entradas: arred2(v.entradas),
    saidas: arred2(v.saidas),
    resultado: arred2(v.entradas - v.saidas),
  }));

  // Despesas do mês (competência) por categoria: top 6 + outras
  const nomes = new Map(categorias.map((c) => [c.id, c.nome]));
  const ordenadas = despesas
    .map((d) => ({ nome: nomes.get(d.categoriaId) ?? "Categoria", valor: arred2(num(d._sum.valor)) }))
    .filter((d) => d.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  const top: DespesaCategoria[] = ordenadas.slice(0, TOP_CATEGORIAS);
  const resto = ordenadas.slice(TOP_CATEGORIAS);
  if (resto.length) top.push({ nome: `Outras (${resto.length})`, valor: arred2(resto.reduce((a, d) => a + d.valor, 0)), outras: true });

  return {
    hoje,
    ate7,
    saldos: { total: arred2(saldos.reduce((a, s) => a + s.saldo, 0)), contas: saldos },
    receber,
    pagar,
    atrasados,
    meses,
    proximos: proximos.map((t) => ({
      id: t.id,
      numero: t.numero,
      tipo: t.tipo,
      pessoa: t.pessoa ? t.pessoa.nomeFantasia || t.pessoa.nome : null,
      descricao: t.descricao,
      vencimento: isoReq(t.vencimento),
      saldo: arred2(num(t.valor) - num(t.valorPago)),
      parcial: t.status === "PARCIAL",
    })),
    despesas: { mes: mesIni, total: arred2(ordenadas.reduce((a, d) => a + d.valor, 0)), categorias: top },
    primeirosPassos: algumTitulo ? null : await primeirosPassos(ids),
  };
}
