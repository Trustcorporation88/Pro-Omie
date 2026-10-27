// Cobrança da armazenagem por palete: fotografia diária dos paletes de cada depositante, ocupação dia a dia
// da competência, tela do mês, geração do pedido faturado (conta a receber e cobrança) e desfazer. Só servidor.
// Nada aqui chama escopoEmpresa() ou auditar() dentro de transação.
import "server-only";
import { prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { hojeISO, isoParaDate } from "@/lib/datas";
import { num } from "@/lib/serial";
import { categoriaReceitaPadrao, criarPedidoServicoFaturado } from "@/modules/servicos/recorrencia";
import { cancelarCobranca, gerarCobranca } from "@/modules/cobranca/servicos";
import { excluirTitulo } from "@/modules/financeiro/servicos";
import {
  calcularArmazenagem,
  dataBr,
  ehMetodo,
  descricaoArmazenagem,
  diasDoIntervalo,
  ehDataISO,
  ocupacaoDiaADia,
  periodosDaTarifa,
  rotuloPeriodo,
  somarDias,
  vencimentoArmazenagem,
  type CalculoArmazenagem,
  type DiaOcupacao,
  type EstadoOcupacao,
  type MetodoArmazenagem,
  type Periodo,
  type TarifaCalculo,
  type TipoPeriodo,
} from "./tipos";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const nomePessoa = (p: { nome: string; nomeFantasia?: string | null }) => p.nomeFantasia || p.nome;
const nomeEmpresa = (e: { nomeFantasia: string | null; razaoSocial: string }) => e.nomeFantasia || e.razaoSocial;

// ───────────────────────── Fotografia ─────────────────────────

/** Estabelecimentos que usam o armazém (algum endereço ou volume). */
export async function estabelecimentosComArmazem(ids?: string[]): Promise<string[]> {
  const where = ids ? { empresaId: { in: ids } } : {};
  const [e, v] = await Promise.all([
    prisma.enderecoArmazem.findMany({ where, distinct: ["empresaId"], select: { empresaId: true } }),
    prisma.volumeArmazem.findMany({ where, distinct: ["empresaId"], select: { empresaId: true } }),
  ]);
  return [...new Set([...e, ...v].map((x) => x.empresaId))];
}

/**
 * Paletes de cada depositante agora: cada palete conferido conta (em posição, sem endereço ou na doca) e cada posição
 * (que não seja doca) só com caixas dele vale um. Palete em conferência conta pela posição, se já estiver numa.
 * Caixa conferida sem endereço ou na doca não conta (fica como "fora de posição"). Posições reservadas vazias à parte.
 */
export async function ocupacaoAtual(empresaId: string): Promise<Map<string, EstadoOcupacao>> {
  const [volumes, reservas] = await Promise.all([
    prisma.volumeArmazem.findMany({
      where: { empresaId, status: { not: "EXPEDIDO" } },
      select: { depositanteId: true, tipo: true, status: true, enderecoId: true, endereco: { select: { codigo: true, tipo: true } }, _count: { select: { conteudo: true } } },
    }),
    prisma.enderecoArmazem.findMany({ where: { empresaId, ativo: true, depositanteId: { not: null }, tipo: { not: "DOCA" } }, select: { id: true, depositanteId: true } }),
  ]);
  type Acc = { posicoes: Map<string, { codigo: string; paletes: number }>; soltos: number; volumes: number; caixasFora: number; reservadas: Set<string> };
  const acc = new Map<string, Acc>();
  const de = (id: string) => {
    if (!acc.has(id)) acc.set(id, { posicoes: new Map(), soltos: 0, volumes: 0, caixasFora: 0, reservadas: new Set() });
    return acc.get(id)!;
  };
  for (const v of volumes) {
    if (!v._count.conteudo) continue;
    const a = de(v.depositanteId);
    a.volumes++;
    const fechadoPalete = v.tipo === "PALLET" && v.status === "FECHADO";
    if (v.enderecoId && v.endereco && v.endereco.tipo !== "DOCA") {
      const pos = a.posicoes.get(v.enderecoId) ?? { codigo: v.endereco.codigo, paletes: 0 };
      if (fechadoPalete) pos.paletes++;
      a.posicoes.set(v.enderecoId, pos);
    } else if (v.status === "FECHADO") {
      if (fechadoPalete) a.soltos++;
      else a.caixasFora++;
    }
  }
  for (const r of reservas) de(r.depositanteId!).reservadas.add(r.id);
  return new Map(
    [...acc].map(([dep, a]) => [
      dep,
      {
        posicoes: [...a.posicoes.values()].reduce((t, p) => t + Math.max(1, p.paletes), 0) + a.soltos,
        reservadasVazias: [...a.reservadas].filter((id) => !a.posicoes.has(id)).length,
        volumes: a.volumes,
        volumesForaPosicao: a.caixasFora,
        enderecos: [...a.posicoes.values()].map((p) => p.codigo).sort((x, y) => x.localeCompare(y, "pt-BR", { numeric: true })).concat(a.soltos ? [`${a.soltos} sem posição`] : []),
      },
    ]),
  );
}

/** Fotografa o dia (por padrão, hoje): grava as posições de cada depositante e marca o dia como fotografado. Pode rodar várias vezes: vale a última. */
export async function fotografarOcupacao(opcoes: { empresaIds?: string[]; dia?: string } = {}) {
  const dia = opcoes.dia ?? hojeISO();
  const data = isoParaDate(dia);
  const estabelecimentos = await estabelecimentosComArmazem(opcoes.empresaIds);
  let depositantes = 0;
  let posicoes = 0;
  for (const empresaId of estabelecimentos) {
    const estados = await ocupacaoAtual(empresaId);
    const deps = [...estados.keys()];
    await prisma.$transaction([
      prisma.ocupacaoArmazem.deleteMany({ where: { empresaId, dia: data, depositanteId: { notIn: deps } } }),
      ...[...estados].map(([depositanteId, e]) => {
        const dados = { posicoes: e.posicoes, reservadasVazias: e.reservadasVazias, volumes: e.volumes, volumesForaPosicao: e.volumesForaPosicao, enderecos: e.enderecos };
        return prisma.ocupacaoArmazem.upsert({ where: { empresaId_depositanteId_dia: { empresaId, depositanteId, dia: data } }, create: { empresaId, depositanteId, dia: data, ...dados }, update: dados });
      }),
      prisma.fotografiaArmazem.upsert({ where: { empresaId_dia: { empresaId, dia: data } }, create: { empresaId, dia: data }, update: { feitaEm: new Date() } }),
    ]);
    depositantes += deps.length;
    posicoes += [...estados.values()].reduce((a, e) => a + e.posicoes, 0);
  }
  return { dia, estabelecimentos: estabelecimentos.length, depositantes, posicoes };
}

const estadoDe = (r: { posicoes: number; reservadasVazias: number; volumes: number; volumesForaPosicao: number; enderecos: string[] }): EstadoOcupacao => ({
  posicoes: r.posicoes,
  reservadasVazias: r.reservadasVazias,
  volumes: r.volumes,
  volumesForaPosicao: r.volumesForaPosicao,
  enderecos: r.enderecos,
});

/** Ocupação dia a dia de `de` a `ate`, por estabelecimento e depositante (dia sem fotografia repete o último fotografado). */
export async function ocupacaoDoIntervalo(empresaIds: string[], de: string, ate: string): Promise<Map<string, Map<string, DiaOcupacao[]>>> {
  const saida = new Map<string, Map<string, DiaOcupacao[]>>();
  if (!empresaIds.length || de > ate) return saida;
  const dias = diasDoIntervalo(de, ate);
  const inicio = isoParaDate(de);
  const fim = isoParaDate(ate);
  const [marcas, linhas] = await Promise.all([
    prisma.fotografiaArmazem.findMany({ where: { empresaId: { in: empresaIds }, dia: { gte: inicio, lte: fim } }, select: { empresaId: true, dia: true } }),
    prisma.ocupacaoArmazem.findMany({ where: { empresaId: { in: empresaIds }, dia: { gte: inicio, lte: fim } } }),
  ]);
  for (const empresaId of empresaIds) {
    const ultima = await prisma.fotografiaArmazem.findFirst({ where: { empresaId, dia: { lt: inicio } }, orderBy: { dia: "desc" }, select: { dia: true } });
    const anterior = ultima ? new Map((await prisma.ocupacaoArmazem.findMany({ where: { empresaId, dia: ultima.dia } })).map((r) => [r.depositanteId, estadoDe(r)])) : null;
    saida.set(
      empresaId,
      ocupacaoDiaADia(
        dias,
        new Set(marcas.filter((m) => m.empresaId === empresaId).map((m) => iso(m.dia))),
        linhas.filter((l) => l.empresaId === empresaId).map((l) => ({ dia: iso(l.dia), depositanteId: l.depositanteId, estado: estadoDe(l) })),
        anterior,
      ),
    );
  }
  return saida;
}

// ───────────────────────── Tela de faturamento ─────────────────────────

type TarifaBanco = {
  id: string;
  empresaId: string;
  depositanteId: string;
  valorPosicao: unknown;
  metodo: string;
  minimoPosicoes: number | null;
  cobrarReservadas: boolean;
  inicio: Date;
  periodo: string;
  prazoPagamento: number;
  ativo: boolean;
};
export const tarifaCalculo = (t: TarifaBanco): TarifaCalculo => ({
  valorPosicao: num(t.valorPosicao as number),
  metodo: ehMetodo(t.metodo) ? t.metodo : "FIM_PERIODO",
  minimoPosicoes: t.minimoPosicoes,
  cobrarReservadas: t.cobrarReservadas,
  inicio: iso(t.inicio),
  periodo: (t.periodo === "MES" ? "MES" : "DIAS30") as TipoPeriodo,
});

export type SituacaoLinha = "SEM_TARIFA" | "PENDENTE" | "FATURADO" | "EM_ANDAMENTO";
export type AbaFaturamento = "pendentes" | "andamento" | "faturados" | "sem-tarifa";
export const ABAS_FATURAMENTO: AbaFaturamento[] = ["pendentes", "andamento", "faturados", "sem-tarifa"];

export type LinhaFaturamento = {
  chave: string;
  empresaId: string;
  estabelecimento: string;
  depositanteId: string;
  depositante: string;
  documento: string | null;
  /** período cobrado (nulo em "sem tarifa": os últimos 30 dias) */
  periodo: { numero: number; inicio: string; fim: string; rotulo: string; tipo: TipoPeriodo } | null;
  dias: DiaOcupacao[];
  /** soma dos volumes-dia fora de posição (sem endereço ou na doca) */
  foraPosicaoDia: number;
  tarifa: { id: string; valorPosicao: number; metodo: MetodoArmazenagem; minimoPosicoes: number | null; cobrarReservadas: boolean; periodo: TipoPeriodo; ativo: boolean } | null;
  calculo: CalculoArmazenagem | null;
  /** posições-dia e pico quando não há cálculo (sem tarifa) */
  bruto: { posicoesDia: number; pico: number };
  vencimento: string | null;
  faturamento: {
    id: string;
    valor: number;
    posicoesDia: number;
    pico: number;
    posicoesCobradas: number;
    vencimento: string;
    pedido: { id: string; numero: number; status: string } | null;
    titulo: { id: string; status: string; pago: number } | null;
    cobrancaId: string | null;
    erro: string | null;
    criadoEm: string;
    metodo: MetodoArmazenagem;
    apurado: number;
  } | null;
  situacao: SituacaoLinha;
};

export type FiltrosFaturamento = { aba: AbaFaturamento; estab: string; depositante: string };

export function lerFiltrosFaturamento(sp: Record<string, string | string[] | undefined>): FiltrosFaturamento {
  const v = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x) ?? "";
  const aba = v(sp.aba) as AbaFaturamento;
  return { aba: ABAS_FATURAMENTO.includes(aba) ? aba : "pendentes", estab: v(sp.estab), depositante: v(sp.depositante) };
}

const resumoTarifa = (t: TarifaBanco) => {
  const c = tarifaCalculo(t);
  return { id: t.id, valorPosicao: c.valorPosicao, metodo: c.metodo, minimoPosicoes: c.minimoPosicoes, cobrarReservadas: c.cobrarReservadas, periodo: c.periodo, ativo: t.ativo };
};

/** Períodos da tarifa ainda não faturados que já começaram: os fechados (a faturar) e o em andamento. */
function periodosAbertos(t: TarifaBanco, faturados: Set<string>, hoje: string): { periodo: Periodo; fechado: boolean }[] {
  const c = tarifaCalculo(t);
  return periodosDaTarifa({ periodo: c.periodo, inicio: c.inicio }, hoje)
    .filter((p) => !faturados.has(p.inicio))
    .map((p) => ({ periodo: p, fechado: p.fim < hoje }));
}

export async function carregarFaturamento(f: FiltrosFaturamento) {
  const escopo = await escopoEmpresa();
  const estabelecimentos = (
    await prisma.empresa.findMany({ where: { id: { in: escopo.ids } }, select: { id: true, razaoSocial: true, nomeFantasia: true, matrizId: true, ativo: true } })
  )
    .map((e) => ({ id: e.id, nome: nomeEmpresa(e), matriz: !e.matrizId, ativo: e.ativo }))
    .sort((a, b) => Number(b.matriz) - Number(a.matriz) || a.nome.localeCompare(b.nome, "pt-BR"));
  const ids = f.estab && escopo.ids.includes(f.estab) ? [f.estab] : escopo.ids;
  const hoje = hojeISO();
  const [tarifas, faturamentos, ultima] = await Promise.all([
    prisma.tarifaArmazem.findMany({
      where: { empresaId: { in: ids } },
      include: { depositante: { select: { nome: true, nomeFantasia: true, documento: true } }, produto: { select: { codigo: true, descricao: true } }, empresa: { select: { nomeFantasia: true, razaoSocial: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.faturamentoArmazem.findMany({
      where: { empresaId: { in: ids } },
      include: { pedido: { select: { id: true, numero: true, status: true } }, depositante: { select: { nome: true, nomeFantasia: true, documento: true } } },
      orderBy: [{ periodoFim: "desc" }, { createdAt: "desc" }],
    }),
    prisma.fotografiaArmazem.findFirst({ where: { empresaId: { in: ids } }, orderBy: { feitaEm: "desc" }, select: { feitaEm: true, dia: true } }),
  ]);
  const nomeEstab = new Map(estabelecimentos.map((e) => [e.id, e.nome]));
  const faturadosDe = (empresaId: string, depositanteId: string) => new Set(faturamentos.filter((x) => x.empresaId === empresaId && x.depositanteId === depositanteId).map((x) => iso(x.periodoInicio)));

  // períodos a calcular: os não faturados das tarifas ativas (fechados e em andamento)
  const alvos = tarifas.filter((t) => t.ativo).flatMap((t) => periodosAbertos(t, faturadosDe(t.empresaId, t.depositanteId), hoje).map((a) => ({ t, ...a })));
  const janela = somarDias(hoje, -29);
  const de = alvos.reduce((m, a) => (a.periodo.inicio < m ? a.periodo.inicio : m), janela);
  const ocupacao = await ocupacaoDoIntervalo(ids, de, hoje);
  const diasDe = (empresaId: string, depositanteId: string, inicio: string, fim: string) => (ocupacao.get(empresaId)?.get(depositanteId) ?? []).filter((d) => d.dia >= inicio && d.dia <= fim);
  const bruto = (dias: DiaOcupacao[]) => ({ posicoesDia: dias.reduce((a, d) => a + d.posicoes, 0), pico: dias.reduce((a, d) => Math.max(a, d.posicoes), 0) });

  const linhasPeriodos: LinhaFaturamento[] = alvos.map(({ t, periodo, fechado }) => {
    const tc = tarifaCalculo(t);
    const dias = diasDe(t.empresaId, t.depositanteId, periodo.inicio, periodo.fim);
    const calculo = calcularArmazenagem(dias, tc, periodo);
    return {
      chave: `${t.empresaId}|${t.depositanteId}|${periodo.inicio}`,
      empresaId: t.empresaId,
      estabelecimento: nomeEstab.get(t.empresaId) ?? "",
      depositanteId: t.depositanteId,
      depositante: nomePessoa(t.depositante),
      documento: t.depositante.documento,
      periodo: { numero: periodo.numero, inicio: periodo.inicio, fim: periodo.fim, rotulo: rotuloPeriodo(periodo, tc.periodo, tc.metodo), tipo: tc.periodo },
      dias,
      foraPosicaoDia: dias.reduce((a, d) => a + d.volumesForaPosicao, 0),
      tarifa: resumoTarifa(t),
      calculo,
      bruto: bruto(dias),
      vencimento: vencimentoArmazenagem(periodo.fim, t.prazoPagamento, hoje),
      faturamento: null,
      situacao: fechado ? "PENDENTE" : "EM_ANDAMENTO",
    };
  });
  // período fechado sem nada a cobrar não precisa de ação: fica fora da lista
  const pendentes = linhasPeriodos.filter((l) => l.situacao === "PENDENTE" && (l.calculo?.valor ?? 0) > 0);
  const andamento = linhasPeriodos.filter((l) => l.situacao === "EM_ANDAMENTO");

  const titulos = await prisma.titulo.findMany({ where: { id: { in: faturamentos.map((x) => x.tituloId).filter((x): x is string => !!x) } }, select: { id: true, status: true, valorPago: true } });
  const tarifaDe = (empresaId: string, depositanteId: string) => tarifas.find((t) => t.empresaId === empresaId && t.depositanteId === depositanteId) ?? null;
  const faturados: LinhaFaturamento[] = faturamentos.slice(0, 200).map((x) => {
    const t = tarifaDe(x.empresaId, x.depositanteId);
    const titulo = x.tituloId ? titulos.find((y) => y.id === x.tituloId) : undefined;
    const inicio = iso(x.periodoInicio);
    const fim = iso(x.periodoFim);
    return {
      chave: `${x.empresaId}|${x.depositanteId}|${inicio}`,
      empresaId: x.empresaId,
      estabelecimento: nomeEstab.get(x.empresaId) ?? "",
      depositanteId: x.depositanteId,
      depositante: nomePessoa(x.depositante),
      documento: x.depositante.documento,
      periodo: { numero: 0, inicio, fim, rotulo: rotuloPeriodo({ inicio, fim }, x.tipoPeriodo === "MES" ? "MES" : "DIAS30", ehMetodo(x.metodo) ? x.metodo : undefined), tipo: (x.tipoPeriodo === "MES" ? "MES" : "DIAS30") as TipoPeriodo },
      dias: [],
      foraPosicaoDia: 0,
      tarifa: t ? resumoTarifa(t) : null,
      calculo: null,
      bruto: { posicoesDia: x.posicoesDia, pico: x.pico },
      vencimento: iso(x.vencimento),
      faturamento: {
        id: x.id,
        valor: num(x.valor),
        posicoesDia: x.posicoesDia,
        pico: x.pico,
        posicoesCobradas: num(x.posicoesCobradas),
        vencimento: iso(x.vencimento),
        pedido: x.pedido,
        titulo: titulo ? { id: titulo.id, status: titulo.status, pago: num(titulo.valorPago) } : null,
        cobrancaId: x.cobrancaId,
        erro: x.erro,
        // horário de Brasília (o mês do "faturado este mês" não vira às 21h)
        criadoEm: new Date(x.createdAt.getTime() - 3 * 3_600_000).toISOString(),
        metodo: ehMetodo(x.metodo) ? x.metodo : "PRO_RATA",
        apurado: x.apurado,
      },
      situacao: "FATURADO",
    };
  });

  // sem tarifa: ocupou posições nos últimos 30 dias e não tem tarifa ativa no estabelecimento
  const semTarifaLinhas: LinhaFaturamento[] = [];
  for (const [empresaId, deps] of ocupacao) {
    for (const [depositanteId, todos] of deps) {
      const t = tarifaDe(empresaId, depositanteId);
      if (t?.ativo) continue;
      const dias = todos.filter((d) => d.dia >= janela);
      if (!dias.some((d) => d.posicoes || d.reservadasVazias)) continue;
      semTarifaLinhas.push({
        chave: `${empresaId}|${depositanteId}|sem-tarifa`,
        empresaId,
        estabelecimento: nomeEstab.get(empresaId) ?? "",
        depositanteId,
        depositante: "",
        documento: null,
        periodo: null,
        dias,
        foraPosicaoDia: dias.reduce((a, d) => a + d.volumesForaPosicao, 0),
        tarifa: t ? resumoTarifa(t) : null,
        calculo: null,
        bruto: bruto(dias),
        vencimento: null,
        faturamento: null,
        situacao: "SEM_TARIFA",
      });
    }
  }
  if (semTarifaLinhas.length) {
    const pessoas = await prisma.pessoa.findMany({ where: { id: { in: semTarifaLinhas.map((l) => l.depositanteId) } }, select: { id: true, nome: true, nomeFantasia: true, documento: true } });
    for (const l of semTarifaLinhas) {
      const p = pessoas.find((x) => x.id === l.depositanteId);
      l.depositante = p ? nomePessoa(p) : "Depositante";
      l.documento = p?.documento ?? null;
    }
  }
  const primeiraEntrada = new Map(
    (
      await prisma.recebimentoArmazem.groupBy({ by: ["empresaId", "depositanteId"], where: { empresaId: { in: ids }, depositanteId: { in: semTarifaLinhas.map((l) => l.depositanteId) } }, _min: { chegadaEm: true } })
    ).map((g) => [`${g.empresaId}|${g.depositanteId}`, g._min.chegadaEm ? iso(g._min.chegadaEm) : null]),
  );

  const filtrar = (ls: LinhaFaturamento[]) =>
    ls.filter((l) => !f.depositante || l.depositanteId === f.depositante).sort((a, b) => a.depositante.localeCompare(b.depositante, "pt-BR") || (a.periodo?.inicio ?? "").localeCompare(b.periodo?.inicio ?? ""));
  const listas = { pendentes: filtrar(pendentes), andamento: filtrar(andamento), faturados: faturados.filter((l) => !f.depositante || l.depositanteId === f.depositante), "sem-tarifa": filtrar(semTarifaLinhas) };
  const mesAtual = hoje.slice(0, 7);
  const soma = (ls: LinhaFaturamento[]) => Math.round(ls.reduce((a, l) => a + (l.faturamento?.valor ?? l.calculo?.valor ?? 0), 0) * 100) / 100;
  const faturadosNoMes = faturados.filter((l) => l.faturamento && l.faturamento.criadoEm.slice(0, 7) === mesAtual);
  return {
    aba: f.aba,
    hoje,
    estabelecimentos,
    linhas: listas[f.aba],
    contagem: { pendentes: listas.pendentes.length, andamento: listas.andamento.length, faturados: listas.faturados.length, "sem-tarifa": listas["sem-tarifa"].length },
    totais: {
      aFaturar: soma(listas.pendentes),
      emAndamento: soma(listas.andamento),
      faturadoNoMes: soma(faturadosNoMes),
      faturadosNoMes: faturadosNoMes.length,
      diasRepetidos: Math.max(0, ...listas[f.aba].map((l) => l.dias.filter((d) => d.origem === "REPETIDO").length)),
    },
    primeiraEntrada: Object.fromEntries(primeiraEntrada),
    depositantes: [...new Map([...linhasPeriodos, ...faturados, ...semTarifaLinhas].map((l) => [l.depositanteId, l.depositante])).entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    ultimaFotografia: ultima ? { em: ultima.feitaEm.toISOString(), dia: iso(ultima.dia) } : null,
    tarifas: tarifas.map((t) => ({
      id: t.id,
      empresaId: t.empresaId,
      estabelecimento: nomeEmpresa(t.empresa),
      depositanteId: t.depositanteId,
      depositante: nomePessoa(t.depositante),
      documento: t.depositante.documento,
      valorPosicao: num(t.valorPosicao),
      metodo: (ehMetodo(t.metodo) ? t.metodo : "FIM_PERIODO") as MetodoArmazenagem,
      minimoPosicoes: t.minimoPosicoes,
      cobrarReservadas: t.cobrarReservadas,
      periodo: (t.periodo === "MES" ? "MES" : "DIAS30") as TipoPeriodo,
      inicio: iso(t.inicio),
      produtoId: t.produtoId,
      produto: t.produto ? `${t.produto.codigo} · ${t.produto.descricao}` : null,
      descricao: t.descricao,
      prazoPagamento: t.prazoPagamento,
      categoriaId: t.categoriaId,
      contaBancariaId: t.contaBancariaId,
      formaPagamentoId: t.formaPagamentoId,
      gerarCobranca: t.gerarCobranca,
      observacoes: t.observacoes,
      ativo: t.ativo,
      ultimoFaturado: (() => {
        const ult = faturamentos.find((x) => x.empresaId === t.empresaId && x.depositanteId === t.depositanteId);
        return ult ? iso(ult.periodoFim) : null;
      })(),
    })),
  };
}

export type DadosFaturamento = Awaited<ReturnType<typeof carregarFaturamento>>;
export type TarifaTela = DadosFaturamento["tarifas"][number];

/** Data sugerida para o início da tarifa: a primeira entrada do depositante no estabelecimento (ou hoje). */
export async function primeiraEntradaDepositante(empresaId: string, depositanteId: string): Promise<string> {
  const r = await prisma.recebimentoArmazem.findFirst({ where: { empresaId, depositanteId }, orderBy: { chegadaEm: "asc" }, select: { chegadaEm: true } });
  return r ? iso(r.chegadaEm) : hojeISO();
}

// ───────────────────────── Gerar e desfazer ─────────────────────────

/** Fatura um período fechado: pedido faturado (serviço) + conta a receber + boleto/Pix opcional. */
export async function gerarFaturamentoArmazem(p: { empresaId: string; depositanteId: string; periodoInicio: string; usuarioId: string | null; urlBase: string }) {
  if (!ehDataISO(p.periodoInicio)) throw new ErroAcao("Período inválido.");
  const hoje = hojeISO();
  const t = await prisma.tarifaArmazem.findUnique({
    where: { empresaId_depositanteId: { empresaId: p.empresaId, depositanteId: p.depositanteId } },
    include: { depositante: { select: { nome: true, nomeFantasia: true } }, produto: { select: { id: true, unidade: true, ativo: true } }, empresa: { select: { id: true, matrizId: true, ativo: true } } },
  });
  if (!t || !t.ativo) throw new ErroAcao("Cadastre (ou reative) a tarifa de armazenagem deste depositante.");
  if (!t.empresa.ativo) throw new ErroAcao("O estabelecimento está inativo.");
  const tarifa = tarifaCalculo(t);
  const periodo = periodosDaTarifa({ periodo: tarifa.periodo, inicio: tarifa.inicio }, p.periodoInicio).find((x) => x.inicio === p.periodoInicio);
  if (!periodo) throw new ErroAcao(`${dataBr(p.periodoInicio)} não é o começo de um período desta tarifa.`);
  const rotulo = rotuloPeriodo(periodo, tarifa.periodo, tarifa.metodo);
  if (periodo.fim >= hoje) throw new ErroAcao(`O período de ${rotulo} ainda não terminou: a cobrança é feita vencida, a partir de ${dataBr(somarDias(periodo.fim, 1))}.`);
  const ja = await prisma.faturamentoArmazem.findUnique({ where: { empresaId_depositanteId_periodoInicio: { empresaId: p.empresaId, depositanteId: p.depositanteId, periodoInicio: isoParaDate(periodo.inicio) } }, include: { pedido: { select: { numero: true } } } });
  if (ja) throw new ErroAcao(`O período de ${rotulo} já foi faturado${ja.pedido ? ` (pedido nº ${String(ja.pedido.numero).padStart(4, "0")})` : ""}.`);
  const matrizId = t.empresa.matrizId ?? t.empresa.id;
  const dias = (await ocupacaoDoIntervalo([p.empresaId], periodo.inicio, periodo.fim)).get(p.empresaId)?.get(p.depositanteId) ?? [];
  const calculo = calcularArmazenagem(dias, tarifa, periodo);
  if (calculo.valor <= 0) throw new ErroAcao(`Nada a cobrar no período de ${rotulo}: o depositante não tinha paletes armazenados.`);
  const categoriaId = await categoriaReceitaPadrao(matrizId, t.categoriaId);
  if (!categoriaId) throw new ErroAcao("Cadastre uma categoria de receita (ou escolha a da tarifa).");
  const vencimento = vencimentoArmazenagem(periodo.fim, t.prazoPagamento, hoje);
  const cliente = nomePessoa(t.depositante);
  let r: { faturamentoId: string; pedidoId: string; numero: number; tituloId: string };
  try {
    r = await prisma.$transaction(async (tx) => {
      const pedido = await criarPedidoServicoFaturado(tx, {
        empresaId: p.empresaId,
        pessoaId: p.depositanteId,
        cliente,
        produto: t.produto && t.produto.ativo ? { id: t.produto.id, unidade: t.produto.unidade } : null,
        itemDescricao: descricaoArmazenagem(t.descricao, periodo, tarifa.periodo, calculo, tarifa),
        observacoes: `Armazenagem - ${tarifa.periodo === "MES" ? "" : "período de "}${rotulo}${t.observacoes ? `\n${t.observacoes}` : ""}`,
        tituloComplemento: `${t.descricao} ${rotulo}`,
        valor: calculo.valor,
        formaPagamentoId: t.formaPagamentoId,
        contaBancariaId: t.contaBancariaId,
        categoriaId,
        competencia: periodo.fim,
        vencimento,
        usuarioId: p.usuarioId,
      });
      const fat = await tx.faturamentoArmazem.create({
        data: {
          empresaId: p.empresaId,
          depositanteId: p.depositanteId,
          tarifaId: t.id,
          periodoInicio: isoParaDate(periodo.inicio),
          periodoFim: isoParaDate(periodo.fim),
          tipoPeriodo: tarifa.periodo,
          metodo: tarifa.metodo,
          valorPosicao: tarifa.valorPosicao,
          minimoPosicoes: tarifa.minimoPosicoes,
          cobrarReservadas: tarifa.cobrarReservadas,
          diasPeriodo: calculo.diasPeriodo,
          diasVigencia: calculo.diasVigencia,
          diasRepetidos: calculo.diasRepetidos,
          posicoesDia: calculo.posicoesDia,
          reservadasDia: calculo.reservadasDia,
          pico: calculo.pico,
          posicoesCobradas: calculo.posicoesCobradas,
          apurado: calculo.apurado,
          valor: calculo.valor,
          vencimento: isoParaDate(vencimento),
          pedidoId: pedido.pedidoId,
          tituloId: pedido.tituloId,
          criadoPorId: p.usuarioId,
        },
        select: { id: true },
      });
      return { faturamentoId: fat.id, ...pedido };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new ErroAcao(`O período de ${rotulo} acabou de ser faturado por outra pessoa.`);
    throw e;
  }
  let cobrancaId: string | null = null;
  let erroCobranca: string | null = null;
  if (t.gerarCobranca) {
    try {
      const g = await gerarCobranca(r.tituloId, { tipo: null, enviarEmail: true, usuarioId: p.usuarioId ?? "", escopoIds: [p.empresaId], urlBase: p.urlBase });
      cobrancaId = g.cobranca.id;
      await prisma.faturamentoArmazem.update({ where: { id: r.faturamentoId }, data: { cobrancaId } });
    } catch (e) {
      erroCobranca = (e instanceof Error ? e.message : String(e)).slice(0, 400);
      await prisma.faturamentoArmazem.update({ where: { id: r.faturamentoId }, data: { erro: `Cobrança não gerada: ${erroCobranca}` } });
    }
  }
  return { ...r, cliente, valor: calculo.valor, vencimento, calculo, periodo, rotulo, cobrancaId, erroCobranca };
}

/** Desfaz o faturamento: cancela a cobrança em aberto no Asaas, exclui a conta a receber e cancela o pedido. Bloqueado com recebimento ou nota emitida. */
export async function desfazerFaturamentoArmazem(id: string, escopoIds: string[]) {
  const f = await prisma.faturamentoArmazem.findFirst({ where: { id, empresaId: { in: escopoIds } }, include: { pedido: { select: { id: true, numero: true, status: true } }, depositante: { select: { nome: true, nomeFantasia: true } } } });
  if (!f) throw new ErroAcao("Faturamento não encontrado nesta empresa.");
  const periodo = { inicio: iso(f.periodoInicio), fim: iso(f.periodoFim) };
  const rotulo = rotuloPeriodo(periodo, f.tipoPeriodo === "MES" ? "MES" : "DIAS30", ehMetodo(f.metodo) ? f.metodo : undefined);
  const pedidoId = f.pedido?.id ?? null;
  if (pedidoId) {
    const [nfse, nfe] = await Promise.all([
      prisma.notaServico.count({ where: { pedidoId, status: { in: ["AUTORIZADA", "PROCESSANDO"] } } }),
      prisma.notaFiscal.count({ where: { pedidoId, status: { in: ["AUTORIZADA", "PROCESSANDO"] } } }),
    ]);
    if (nfse || nfe) throw new ErroAcao("O pedido tem nota fiscal emitida (ou em processamento). Cancele a nota antes de desfazer o faturamento.");
  }
  const titulos = pedidoId
    ? await prisma.titulo.findMany({ where: { origem: "VENDA", origemId: pedidoId }, select: { id: true, numero: true, baixas: { select: { estornada: true } } } })
    : [];
  const ativas = titulos.filter((t) => t.baixas.some((b) => !b.estornada));
  if (ativas.length) throw new ErroAcao(`Há recebimento registrado (título nº ${ativas.map((t) => t.numero).join(", ")}). Estorne o recebimento antes de desfazer.`);
  const estornadas = titulos.filter((t) => t.baixas.length > 0);
  if (estornadas.length)
    throw new ErroAcao(`O título nº ${estornadas.map((t) => t.numero).join(", ")} teve baixa (estornada) e fica no histórico: cancele o título no contas a receber e o pedido em Vendas, se precisar refazer.`);
  const abertas = await prisma.cobranca.findMany({ where: { tituloId: { in: titulos.map((t) => t.id) }, status: { in: ["PENDING", "OVERDUE"] } }, select: { id: true } });
  for (const c of abertas) await cancelarCobranca(c.id, escopoIds);
  await prisma.$transaction(async (tx) => {
    for (const t of titulos) await excluirTitulo(tx, t.id);
    if (pedidoId) await tx.pedido.update({ where: { id: pedidoId }, data: { status: "CANCELADO", canceladoEm: new Date(), motivoCancelamento: `Faturamento da armazenagem de ${rotulo} desfeito` } });
    await tx.faturamentoArmazem.delete({ where: { id: f.id } });
  });
  return { periodo, rotulo, numero: f.pedido?.numero ?? null, depositante: nomePessoa(f.depositante), cobrancasCanceladas: abertas.length, valor: num(f.valor) };
}
