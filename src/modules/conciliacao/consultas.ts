// Leituras da tela de conciliação bancária (somente servidor).
import { prisma } from "@/lib/db";
import { isoParaDate } from "@/lib/datas";
import { arred2 } from "@/lib/format";
import { isoReq, num } from "@/lib/serial";
import { saldosContas } from "@/modules/financeiro/servicos";
import { calcularSugestoes, JANELA_AUTO } from "./sugestoes";
import type { ContaConciliacao, ItemExtrato, LinhaConciliada, LinhaPendente, RegraResumo, ResumoConta, StatusItem } from "./tipos";

export type Periodo = { de?: string; ate?: string };

/** Página dentro do intervalo existente (ex.: após conciliar os itens da última página). */
function paginaValida(pagina: number, total: number, porPagina: number): number {
  return Math.min(Math.max(1, pagina), Math.max(1, Math.ceil(total / porPagina)));
}

function filtroData(p: Periodo) {
  if (!p.de && !p.ate) return undefined;
  return { ...(p.de ? { gte: isoParaDate(p.de) } : {}), ...(p.ate ? { lte: isoParaDate(p.ate) } : {}) };
}

/** Contas ativas disponíveis para conciliação. */
export async function listarContasConciliacao(): Promise<ContaConciliacao[]> {
  const contas = await prisma.contaBancaria.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, tipo: true, bancoCodigo: true, bancoNome: true, agencia: true, numero: true },
  });
  return contas;
}

/** Conta da URL (?conta=) ou a primeira conta ativa que não seja caixa; senão a primeira. */
export function escolherConta(contas: ContaConciliacao[], id?: string): ContaConciliacao | null {
  return contas.find((c) => c.id === id) ?? contas.find((c) => c.tipo !== "CAIXA") ?? contas[0] ?? null;
}

async function contarPorStatus(contaBancariaId: string, periodo: Periodo = {}) {
  const grupos = await prisma.extratoItem.groupBy({
    by: ["status"],
    where: { contaBancariaId, data: filtroData(periodo) },
    _count: { _all: true },
  });
  const qtd = (s: StatusItem) => grupos.find((g) => g.status === s)?._count._all ?? 0;
  return { pendentes: qtd("PENDENTE"), conciliados: qtd("CONCILIADO"), ignorados: qtd("IGNORADO") };
}

export async function contadoresPeriodo(contaBancariaId: string, periodo: Periodo) {
  return contarPorStatus(contaBancariaId, periodo);
}

/** Cabeçalho: saldo no sistema × último saldo do extrato, contadores e última importação. */
export async function carregarResumo(contaBancariaId: string): Promise<ResumoConta> {
  const [saldos, ultimaComSaldo, ultima, contadores] = await Promise.all([
    saldosContas(prisma),
    prisma.extratoImportacao.findFirst({
      where: { contaBancariaId, saldoFinal: { not: null } },
      orderBy: [{ dataFim: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      select: { saldoFinal: true, dataFim: true, dataSaldo: true, arquivoNome: true },
    }),
    prisma.extratoImportacao.findFirst({
      where: { contaBancariaId },
      orderBy: { createdAt: "desc" },
      select: { arquivoNome: true, createdAt: true, dataInicio: true, dataFim: true, totalItens: true, novosItens: true },
    }),
    contarPorStatus(contaBancariaId),
  ]);
  const saldoAtual = saldos.find((s) => s.id === contaBancariaId)?.saldo ?? 0;

  let extrato: ResumoConta["extrato"] = null;
  let saldoSistemaNaData: number | null = null;
  let diferenca: number | null = null;
  if (ultimaComSaldo?.saldoFinal !== null && ultimaComSaldo?.saldoFinal !== undefined) {
    const dataRef = ultimaComSaldo.dataSaldo ?? ultimaComSaldo.dataFim;
    const data = dataRef ? isoReq(dataRef) : null;
    extrato = { saldo: num(ultimaComSaldo.saldoFinal), data, arquivo: ultimaComSaldo.arquivoNome };
    saldoSistemaNaData = data ? ((await saldosContas(prisma, data)).find((s) => s.id === contaBancariaId)?.saldo ?? 0) : saldoAtual;
    diferenca = arred2(extrato.saldo - saldoSistemaNaData);
  }

  return {
    saldoAtual,
    extrato,
    saldoSistemaNaData,
    diferenca,
    contadores,
    ultimaImportacao: ultima
      ? {
          arquivo: ultima.arquivoNome,
          criadoEm: ultima.createdAt.toISOString(),
          inicio: ultima.dataInicio ? isoReq(ultima.dataInicio) : null,
          fim: ultima.dataFim ? isoReq(ultima.dataFim) : null,
          total: ultima.totalItens,
          novos: ultima.novosItens,
        }
      : null,
  };
}

/**
 * Pendentes da conta com a melhor sugestão de cada um. As sugestões são calculadas sobre todos os
 * pendentes da conta (a atribuição gulosa não depende do filtro); o período e a página só recortam a lista.
 */
export async function carregarPendentes(
  contaBancariaId: string,
  periodo: Periodo,
  pagina: number,
  porPagina: number,
): Promise<{ linhas: LinhaPendente[]; total: number; pagina: number; elegiveisAuto: number }> {
  const itens = await prisma.extratoItem.findMany({
    where: { contaBancariaId, status: "PENDENTE" },
    orderBy: [{ data: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, data: true, valor: true, descricao: true, documento: true },
  });
  const base = itens.map((i) => ({
    id: i.id,
    data: isoReq(i.data),
    valor: num(i.valor),
    descricao: i.descricao,
    documento: i.documento,
  }));
  const sugestoes = await calcularSugestoes(prisma, contaBancariaId, base);
  let elegiveisAuto = 0;
  for (const s of sugestoes.values()) if (s.movimento && s.movimento.distancia <= JANELA_AUTO) elegiveisAuto++;

  const filtrados = base.filter((i) => (!periodo.de || i.data >= periodo.de) && (!periodo.ate || i.data <= periodo.ate));
  const efetiva = paginaValida(pagina, filtrados.length, porPagina);
  const linhas = filtrados.slice((efetiva - 1) * porPagina, efetiva * porPagina).map<LinhaPendente>((i) => ({
    ...i,
    status: "PENDENTE",
    sugestoes: sugestoes.get(i.id) ?? { movimento: null, titulo: null, regra: null },
  }));
  return { linhas, total: filtrados.length, pagina: efetiva, elegiveisAuto };
}

export async function carregarConciliados(
  contaBancariaId: string,
  periodo: Periodo,
  pagina: number,
  porPagina: number,
): Promise<{ linhas: LinhaConciliada[]; total: number; pagina: number }> {
  const where = { contaBancariaId, status: "CONCILIADO" as const, data: filtroData(periodo) };
  const total = await prisma.extratoItem.count({ where });
  const efetiva = paginaValida(pagina, total, porPagina);
  const itens = await prisma.extratoItem.findMany({
    where,
    orderBy: [{ data: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    skip: (efetiva - 1) * porPagina,
    take: porPagina,
    select: {
      id: true,
      data: true,
      valor: true,
      descricao: true,
      documento: true,
      movimento: {
        select: {
          id: true,
          data: true,
          valor: true,
          tipo: true,
          descricao: true,
          origem: true,
          baixa: { select: { titulo: { select: { id: true, numero: true, tipo: true } } } },
        },
      },
    },
  });
  return {
    total,
    pagina: efetiva,
    linhas: itens.map((i) => ({
      id: i.id,
      data: isoReq(i.data),
      valor: num(i.valor),
      descricao: i.descricao,
      documento: i.documento,
      status: "CONCILIADO",
      movimento: i.movimento
        ? {
            id: i.movimento.id,
            data: isoReq(i.movimento.data),
            valor: i.movimento.tipo === "CREDITO" ? num(i.movimento.valor) : -num(i.movimento.valor),
            tipo: i.movimento.tipo,
            descricao: i.movimento.descricao,
            origem: i.movimento.origem,
            titulo: i.movimento.baixa?.titulo ?? null,
          }
        : null,
    })),
  };
}

export async function carregarIgnorados(
  contaBancariaId: string,
  periodo: Periodo,
  pagina: number,
  porPagina: number,
): Promise<{ linhas: ItemExtrato[]; total: number; pagina: number }> {
  const where = { contaBancariaId, status: "IGNORADO" as const, data: filtroData(periodo) };
  const total = await prisma.extratoItem.count({ where });
  const efetiva = paginaValida(pagina, total, porPagina);
  const itens = await prisma.extratoItem.findMany({
    where,
    orderBy: [{ data: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    skip: (efetiva - 1) * porPagina,
    take: porPagina,
    select: { id: true, data: true, valor: true, descricao: true, documento: true },
  });
  return {
    total,
    pagina: efetiva,
    linhas: itens.map((i) => ({
      id: i.id,
      data: isoReq(i.data),
      valor: num(i.valor),
      descricao: i.descricao,
      documento: i.documento,
      status: "IGNORADO",
    })),
  };
}

export async function carregarRegras(): Promise<RegraResumo[]> {
  const regras = await prisma.regraConciliacao.findMany({
    include: {
      categoria: { select: { nome: true, codigo: true } },
      pessoa: { select: { nome: true, nomeFantasia: true } },
      centroCusto: { select: { nome: true } },
    },
    orderBy: [{ ativo: "desc" }, { termo: "asc" }],
  });
  return regras.map((r) => ({
    id: r.id,
    termo: r.termo,
    tipo: r.tipo,
    categoriaId: r.categoriaId,
    categoria: `${r.categoria.codigo ? `${r.categoria.codigo} · ` : ""}${r.categoria.nome}`,
    pessoaId: r.pessoaId,
    pessoa: r.pessoa ? r.pessoa.nomeFantasia || r.pessoa.nome : null,
    centroCustoId: r.centroCustoId,
    centroCusto: r.centroCusto?.nome ?? null,
    ativo: r.ativo,
  }));
}
