// Consultas do financeiro (somente servidor). Tudo o que sai daqui é serializável (sem Decimal/Date).
import { escopoEmpresa } from "@/lib/auth/empresa";
import { prisma, Prisma } from "@/lib/db";
import { addDias, dateParaISO, ehISOValido, fimMes, hojeISO, inicioMes, isoParaDate } from "@/lib/datas";
import { arred2 } from "@/lib/format";
import { isoReq, num } from "@/lib/serial";
import type { StatusTitulo, TipoTitulo } from "@/generated/prisma/enums";
import { saldosContas } from "./servicos";
import {
  POR_PAGINA_TITULOS,
  STATUS_FILTRO,
  type CondicaoOpcao,
  type Extrato,
  type ExtratoLinha,
  type FiltrosTitulos,
  type ListagemTitulos,
  type RateioForm,
  type ResumoTitulos,
  type StatusFiltro,
  type TituloDetalhe,
  type TituloLinha,
} from "@/components/financeiro/tipos";

type ParametrosBusca = Record<string, string | string[] | undefined>;

const ABERTOS: StatusTitulo[] = ["ABERTO", "PARCIAL"];
const LIMITE_EXTRATO = 3000;

function texto(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** Lê os filtros da lista a partir dos searchParams (status, de, ate, q, categoria, conta, pagina). */
export function lerFiltrosTitulos(sp: ParametrosBusca): FiltrosTitulos {
  const status = texto(sp.status) as StatusFiltro;
  const de = texto(sp.de);
  const ate = texto(sp.ate);
  return {
    status: STATUS_FILTRO.includes(status) ? status : "abertos",
    de: ehISOValido(de) ? de : null,
    ate: ehISOValido(ate) ? ate : null,
    q: texto(sp.q).slice(0, 100),
    categoria: texto(sp.categoria) || null,
    conta: texto(sp.conta) || null,
    pagina: Math.max(1, Math.floor(Number(texto(sp.pagina))) || 1),
    porPagina: POR_PAGINA_TITULOS,
  };
}

function whereStatus(status: StatusFiltro, hoje: string): Prisma.TituloWhereInput {
  switch (status) {
    case "abertos":
      return { status: { in: ABERTOS } };
    case "vencidos":
      return { status: { in: ABERTOS }, vencimento: { lt: isoParaDate(hoje) } };
    case "quitados":
      return { status: "QUITADO" };
    case "cancelados":
      return { status: "CANCELADO" };
    case "todos":
      return {};
  }
}

/** Filtros da lista sem o status (usado também nos contadores das abas). */
function whereFiltros(tipo: TipoTitulo, f: FiltrosTitulos): Prisma.TituloWhereInput {
  const and: Prisma.TituloWhereInput[] = [{ tipo }];
  if (f.de || f.ate) {
    and.push({
      vencimento: {
        ...(f.de ? { gte: isoParaDate(f.de) } : {}),
        ...(f.ate ? { lte: isoParaDate(f.ate) } : {}),
      },
    });
  }
  const q = f.q.trim();
  if (q) {
    const ins = { contains: q, mode: "insensitive" as const };
    const numero = /^#?\d{1,9}$/.test(q) ? Number(q.replace("#", "")) : null;
    and.push({
      OR: [
        { descricao: ins },
        { documento: ins },
        { pessoa: { is: { nome: ins } } },
        { pessoa: { is: { nomeFantasia: ins } } },
        ...(numero !== null ? [{ numero }] : []),
      ],
    });
  }
  if (f.categoria) and.push({ OR: [{ categoriaId: f.categoria }, { rateios: { some: { categoriaId: f.categoria } } }] });
  if (f.conta) {
    and.push({ OR: [{ contaBancariaId: f.conta }, { baixas: { some: { contaBancariaId: f.conta, estornada: false } } }] });
  }
  return { AND: and };
}

const incluirLinha = {
  pessoa: { select: { nome: true, nomeFantasia: true } },
  categoria: { select: { nome: true, codigo: true } },
  rateios: { select: { categoriaId: true, centroCustoId: true, percentual: true } },
  _count: { select: { baixas: true } },
} satisfies Prisma.TituloInclude;

type TituloComLinha = Prisma.TituloGetPayload<{ include: typeof incluirLinha }>;

function nomePessoa(p: { nome: string; nomeFantasia: string | null } | null): string | null {
  return p ? p.nomeFantasia || p.nome : null;
}

function nomeCategoria(c: { nome: string; codigo: string | null } | null): string | null {
  return c ? `${c.codigo ? `${c.codigo} · ` : ""}${c.nome}` : null;
}

function paraLinha(t: TituloComLinha): TituloLinha {
  const valor = num(t.valor);
  const valorPago = num(t.valorPago);
  // a categoria principal do título vem primeiro (é a usada na edição simples)
  const rateios: RateioForm[] = t.rateios
    .map((r) => ({ categoriaId: r.categoriaId, centroCustoId: r.centroCustoId, percentual: num(r.percentual) }))
    .sort((a, b) => Number(b.categoriaId === t.categoriaId) - Number(a.categoriaId === t.categoriaId));
  return {
    id: t.id,
    numero: t.numero,
    tipo: t.tipo,
    status: t.status,
    empresaId: t.empresaId,
    pessoaId: t.pessoaId,
    pessoaNome: nomePessoa(t.pessoa),
    descricao: t.descricao,
    documento: t.documento,
    categoriaId: t.categoriaId,
    categoriaNome: nomeCategoria(t.categoria),
    centroCustoId: t.centroCustoId,
    contaBancariaId: t.contaBancariaId,
    formaPagamentoId: t.formaPagamentoId,
    emissao: isoReq(t.emissao),
    competencia: isoReq(t.competencia),
    vencimento: isoReq(t.vencimento),
    valor,
    valorPago,
    saldo: t.status === "CANCELADO" ? 0 : arred2(valor - valorPago),
    parcela: t.parcela,
    totalParcelas: t.totalParcelas,
    observacoes: t.observacoes,
    rateios,
    qtdBaixas: t._count.baixas,
  };
}

/** Lista paginada de títulos de um tipo com os filtros da URL e os contadores das abas. */
export async function listarTitulos(tipo: TipoTitulo, f: FiltrosTitulos): Promise<ListagemTitulos> {
  const hoje = hojeISO();
  const escopo = await escopoEmpresa();
  const base: Prisma.TituloWhereInput = { AND: [whereFiltros(tipo, f), { empresaId: { in: escopo.ids } }] };
  const where: Prisma.TituloWhereInput = { AND: [base, whereStatus(f.status, hoje)] };
  const desc = f.status === "quitados" || f.status === "cancelados";
  const [rows, total, grupos, vencidos] = await Promise.all([
    prisma.titulo.findMany({
      where,
      include: incluirLinha,
      orderBy: [{ vencimento: desc ? "desc" : "asc" }, { numero: desc ? "desc" : "asc" }],
      skip: (f.pagina - 1) * f.porPagina,
      take: f.porPagina,
    }),
    prisma.titulo.count({ where }),
    prisma.titulo.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.titulo.count({ where: { AND: [base, whereStatus("vencidos", hoje)] } }),
  ]);
  const porStatus = (s: StatusTitulo) => grupos.find((g) => g.status === s)?._count._all ?? 0;
  const contadores: Record<StatusFiltro, number> = {
    abertos: porStatus("ABERTO") + porStatus("PARCIAL"),
    vencidos,
    quitados: porStatus("QUITADO"),
    cancelados: porStatus("CANCELADO"),
    todos: grupos.reduce((a, g) => a + g._count._all, 0),
  };
  return { linhas: rows.map(paraLinha), total, contadores };
}

/** Cartões de resumo do tipo (independentes de filtros e paginação). */
export async function resumoTitulos(tipo: TipoTitulo): Promise<ResumoTitulos> {
  const hoje = hojeISO();
  const escopo = await escopoEmpresa();
  const abertos: Prisma.TituloWhereInput = { tipo, status: { in: ABERTOS }, empresaId: { in: escopo.ids } };
  const soma = (where: Prisma.TituloWhereInput) =>
    prisma.titulo
      .aggregate({ where, _sum: { valor: true, valorPago: true }, _count: { _all: true } })
      .then((r) => ({ valor: arred2(num(r._sum.valor) - num(r._sum.valorPago)), qtd: r._count._all }));
  const [aberto, vencido, venceHoje, proximos7, quitadoMes] = await Promise.all([
    soma(abertos),
    soma({ ...abertos, vencimento: { lt: isoParaDate(hoje) } }),
    soma({ ...abertos, vencimento: isoParaDate(hoje) }),
    soma({ ...abertos, vencimento: { gt: isoParaDate(hoje), lte: isoParaDate(addDias(hoje, 7)) } }),
    prisma.baixa
      .aggregate({
        where: {
          estornada: false,
          data: { gte: isoParaDate(inicioMes(hoje)), lte: isoParaDate(fimMes(hoje)) },
          titulo: { is: { tipo, empresaId: { in: escopo.ids } } },
        },
        _sum: { valorTotal: true },
        _count: { _all: true },
      })
      .then((r) => ({ valor: arred2(num(r._sum.valorTotal)), qtd: r._count._all })),
  ]);
  return { aberto, vencido, venceHoje, proximos7, quitadoMes };
}

/** Condições de pagamento ativas (para o parcelamento no formulário). */
export async function listarCondicoesPagamento(): Promise<CondicaoOpcao[]> {
  const rows = await prisma.condicaoPagamento.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } });
  return rows.map((c) => ({ id: c.id, nome: c.nome, dias: c.dias }));
}

/** Título completo para a página de detalhe (rateio, baixas, anexos, parcelas do grupo e histórico). */
export async function obterTitulo(id: string): Promise<TituloDetalhe | null> {
  const escopo = await escopoEmpresa();
  const t = await prisma.titulo.findFirst({
    where: { id, empresaId: { in: escopo.ids } },
    include: {
      ...incluirLinha,
      pessoa: { select: { nome: true, nomeFantasia: true, documento: true } },
      empresa: { select: { razaoSocial: true, nomeFantasia: true } },
      centroCusto: { select: { nome: true } },
      contaBancaria: { select: { nome: true } },
      formaPagamento: { select: { nome: true } },
      rateios: {
        select: {
          categoriaId: true,
          centroCustoId: true,
          percentual: true,
          valor: true,
          categoria: { select: { nome: true, codigo: true } },
          centroCusto: { select: { nome: true } },
        },
        orderBy: { valor: "desc" },
      },
      baixas: {
        orderBy: [{ data: "asc" }, { createdAt: "asc" }],
        include: {
          contaBancaria: { select: { nome: true } },
          formaPagamento: { select: { nome: true } },
          movimento: { select: { conciliado: true } },
        },
      },
      anexos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, nome: true, mimeType: true, tamanho: true, criadoPorId: true, createdAt: true },
      },
    },
  });
  if (!t) return null;

  const [parcelas, historico] = await Promise.all([
    t.grupoId
      ? prisma.titulo.findMany({
          where: { grupoId: t.grupoId },
          orderBy: { parcela: "asc" },
          select: { id: true, numero: true, parcela: true, totalParcelas: true, vencimento: true, valor: true, status: true },
        })
      : Promise.resolve([]),
    prisma.auditoria.findMany({
      where: {
        OR: [
          { entidade: "titulo", entidadeId: id },
          // baixas e anexos guardam o tituloId nos dados da auditoria
          { entidade: { in: ["baixa", "anexo"] }, dados: { path: ["tituloId"], equals: id } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { usuario: { select: { nome: true } } },
    }),
  ]);

  const idsUsuarios = [t.criadoPorId, ...t.baixas.map((b) => b.criadoPorId), ...t.anexos.map((a) => a.criadoPorId)].filter(
    (x): x is string => !!x,
  );
  const usuarios = idsUsuarios.length
    ? await prisma.usuario.findMany({ where: { id: { in: [...new Set(idsUsuarios)] } }, select: { id: true, nome: true } })
    : [];
  const nomeUsuario = (uid: string | null) => (uid ? (usuarios.find((u) => u.id === uid)?.nome ?? null) : null);

  const linha = paraLinha({
    ...t,
    rateios: t.rateios.map((r) => ({ categoriaId: r.categoriaId, centroCustoId: r.centroCustoId, percentual: r.percentual })),
  });

  return {
    ...linha,
    origem: t.origem,
    origemId: t.origemId,
    grupoId: t.grupoId,
    empresaNome: t.empresa.nomeFantasia || t.empresa.razaoSocial,
    pessoaDocumento: t.pessoa?.documento ?? null,
    contaNome: t.contaBancaria?.nome ?? null,
    formaNome: t.formaPagamento?.nome ?? null,
    centroCustoNome: t.centroCusto?.nome ?? null,
    quitadoEm: t.quitadoEm ? isoReq(t.quitadoEm) : null,
    canceladoEm: t.canceladoEm ? t.canceladoEm.toISOString() : null,
    motivoCancelamento: t.motivoCancelamento,
    criadoPorNome: nomeUsuario(t.criadoPorId),
    createdAt: t.createdAt.toISOString(),
    rateiosDetalhe: t.rateios.map((r) => ({
      categoriaNome: nomeCategoria(r.categoria) ?? "—",
      centroNome: r.centroCusto?.nome ?? null,
      percentual: num(r.percentual),
      valor: num(r.valor),
    })),
    baixas: t.baixas.map((b) => ({
      id: b.id,
      data: isoReq(b.data),
      contaNome: b.contaBancaria.nome,
      formaNome: b.formaPagamento?.nome ?? null,
      valor: num(b.valor),
      juros: num(b.juros),
      multa: num(b.multa),
      desconto: num(b.desconto),
      valorTotal: num(b.valorTotal),
      observacao: b.observacao,
      estornada: b.estornada,
      estornadaEm: b.estornadaEm ? b.estornadaEm.toISOString() : null,
      conciliada: b.movimento?.conciliado ?? false,
      criadoPorNome: nomeUsuario(b.criadoPorId),
      createdAt: b.createdAt.toISOString(),
    })),
    anexos: t.anexos.map((a) => ({
      id: a.id,
      nome: a.nome,
      mimeType: a.mimeType,
      tamanho: a.tamanho,
      criadoPorNome: nomeUsuario(a.criadoPorId),
      createdAt: a.createdAt.toISOString(),
    })),
    parcelasGrupo: parcelas.map((p) => ({
      id: p.id,
      numero: p.numero,
      parcela: p.parcela,
      totalParcelas: p.totalParcelas,
      vencimento: isoReq(p.vencimento),
      valor: num(p.valor),
      status: p.status,
    })),
    historico: historico.map((h) => ({
      id: h.id,
      acao: h.acao,
      entidade: h.entidade,
      resumo: h.resumo,
      usuarioNome: h.usuario?.nome ?? null,
      createdAt: h.createdAt.toISOString(),
    })),
  };
}

/** Extrato de uma conta no período: saldo anterior, movimentos com saldo acumulado e totais. */
export async function extratoConta(contaId: string, de: string, ate: string): Promise<Extrato | null> {
  const escopo = await escopoEmpresa();
  const conta = await prisma.contaBancaria.findFirst({ where: { id: contaId, empresaId: { in: escopo.ids } } });
  if (!conta) return null;
  const periodo = { gte: isoParaDate(de), lte: isoParaDate(ate) };
  const [anteriores, movimentos, somas] = await Promise.all([
    saldosContas(prisma, addDias(de, -1), true, escopo.ids),
    prisma.movimento.findMany({
      where: { contaBancariaId: contaId, data: periodo },
      orderBy: [{ data: "asc" }, { createdAt: "asc" }],
      take: LIMITE_EXTRATO + 1,
      include: {
        baixa: {
          select: {
            tituloId: true,
            titulo: { select: { numero: true, pessoa: { select: { nome: true, nomeFantasia: true } } } },
          },
        },
        transferencia: {
          select: {
            contaOrigemId: true,
            contaOrigem: { select: { nome: true } },
            contaDestino: { select: { nome: true } },
          },
        },
      },
    }),
    prisma.movimento.groupBy({ by: ["tipo"], where: { contaBancariaId: contaId, data: periodo }, _sum: { valor: true } }),
  ]);

  const saldoAnterior = anteriores.find((s) => s.id === contaId)?.saldo ?? 0;
  const entradas = arred2(num(somas.find((s) => s.tipo === "CREDITO")?._sum.valor));
  const saidas = arred2(num(somas.find((s) => s.tipo === "DEBITO")?._sum.valor));
  const dataInicial = dateParaISO(conta.dataSaldoInicial);
  const saldoInicial = num(conta.saldoInicial);
  // saldo inicial com data dentro do período não entra no "saldo anterior": vira uma linha do extrato
  const inicialNoPeriodo = dataInicial >= de && dataInicial <= ate && saldoInicial !== 0 ? { data: dataInicial, valor: saldoInicial } : null;

  const truncado = movimentos.length > LIMITE_EXTRATO;
  let saldo = saldoAnterior;
  const linhas: ExtratoLinha[] = [];
  let inicialInserido = !inicialNoPeriodo;
  const inserirInicial = () => {
    if (inicialInserido || !inicialNoPeriodo) return;
    inicialInserido = true;
    saldo = arred2(saldo + inicialNoPeriodo.valor);
    linhas.push({
      id: `inicial-${conta.id}`,
      data: inicialNoPeriodo.data,
      tipo: inicialNoPeriodo.valor >= 0 ? "CREDITO" : "DEBITO",
      valor: Math.abs(inicialNoPeriodo.valor),
      descricao: "Saldo inicial da conta",
      origem: "INICIAL",
      conciliado: false,
      tituloId: null,
      tituloNumero: null,
      pessoaNome: null,
      transferenciaId: null,
      contraparte: null,
      saldo,
    });
  };

  for (const m of movimentos.slice(0, LIMITE_EXTRATO)) {
    const data = isoReq(m.data);
    if (inicialNoPeriodo && data >= inicialNoPeriodo.data) inserirInicial();
    const valor = num(m.valor);
    saldo = arred2(saldo + (m.tipo === "CREDITO" ? valor : -valor));
    const tr = m.transferencia;
    linhas.push({
      id: m.id,
      data,
      tipo: m.tipo,
      valor,
      descricao: m.descricao,
      origem: m.origem,
      conciliado: m.conciliado,
      tituloId: m.baixa?.tituloId ?? null,
      tituloNumero: m.baixa?.titulo.numero ?? null,
      pessoaNome: nomePessoa(m.baixa?.titulo.pessoa ?? null),
      transferenciaId: m.transferenciaId,
      contraparte: tr ? (tr.contaOrigemId === contaId ? tr.contaDestino.nome : tr.contaOrigem.nome) : null,
      saldo,
    });
  }
  if (!truncado) inserirInicial();

  return {
    conta: {
      id: conta.id,
      nome: conta.nome,
      tipo: conta.tipo,
      ativo: conta.ativo,
      banco: [conta.bancoNome, conta.agencia && `ag. ${conta.agencia}`, conta.numero && `cc ${conta.numero}`].filter(Boolean).join(" · ") || null,
    },
    de,
    ate,
    saldoAnterior,
    entradas,
    saidas,
    saldoFinal: arred2(saldoAnterior + (inicialNoPeriodo?.valor ?? 0) + entradas - saidas),
    saldoInicialNoPeriodo: inicialNoPeriodo,
    linhas,
    truncado,
  };
}
