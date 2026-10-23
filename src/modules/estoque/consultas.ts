import "server-only";
import { prisma, type Prisma } from "@/lib/db";
import { escopoEmpresa, type EscopoEmpresa } from "@/lib/auth/empresa";
import { addDias, addMeses, ehISOValido, fimMes, hojeISO, inicioMes, isoParaDate } from "@/lib/datas";
import { iso, isoReq, num } from "@/lib/serial";
import { fmtDecimal } from "@/modules/vendas/calculos";
import type { LinhaDocumentoForm } from "@/modules/vendas/valores";
import { ORDEM_GRUPOS, fatorKg, type GrupoMaterial, type LancamentoLista, type LinhaSaldo, type MaterialEstoque, type TipoLancamentoT } from "./tipos";

type Busca = Record<string, string | string[] | undefined>;
const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const nomePessoa = (p: { nome: string; nomeFantasia: string | null }) => p.nomeFantasia || p.nome;
const nomeEmpresa = (e: { nomeFantasia: string | null; razaoSocial: string }) => e.nomeFantasia || e.razaoSocial;
const arred3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const arred2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const kgDe = (q: number, unidade: string) => {
  const f = fatorKg(unidade);
  return f === null ? 0 : q * f;
};

export const POR_PAGINA_ESTOQUE = 30;

export type Estabelecimento = { id: string; nome: string; matriz: boolean; ativo: boolean };

/** Matriz ativa e filiais (inclusive inativas, para o histórico). */
export async function carregarEstabelecimentos(escopo?: EscopoEmpresa): Promise<Estabelecimento[]> {
  const e = escopo ?? (await escopoEmpresa());
  const empresas = await prisma.empresa.findMany({
    where: { id: { in: e.ids } },
    select: { id: true, razaoSocial: true, nomeFantasia: true, matrizId: true, ativo: true },
  });
  return empresas
    .map((x) => ({ id: x.id, nome: nomeEmpresa(x), matriz: !x.matrizId, ativo: x.ativo }))
    .sort((a, b) => Number(b.matriz) - Number(a.matriz) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Materiais (produtos com controle de estoque) da empresa ativa, com o saldo em cada estabelecimento. */
export async function carregarMateriais(escopo?: EscopoEmpresa): Promise<MaterialEstoque[]> {
  const e = escopo ?? (await escopoEmpresa());
  const produtos = await prisma.produto.findMany({
    where: { empresaId: e.ativa.id, tipo: "PRODUTO", controlaEstoque: true },
    select: {
      id: true,
      codigo: true,
      descricao: true,
      unidade: true,
      grupoMaterial: true,
      precoVenda: true,
      ativo: true,
      saldosEstoque: { where: { empresaId: { in: e.ids } }, select: { empresaId: true, quantidade: true } },
    },
  });
  const ordem = (g: string | null) => {
    const i = ORDEM_GRUPOS.indexOf(g as GrupoMaterial);
    return i < 0 ? ORDEM_GRUPOS.length : i;
  };
  return produtos
    .map((p) => ({
      id: p.id,
      codigo: p.codigo,
      descricao: p.descricao,
      unidade: p.unidade,
      grupo: p.grupoMaterial,
      precoVenda: num(p.precoVenda),
      ativo: p.ativo,
      saldos: Object.fromEntries(p.saldosEstoque.map((s) => [s.empresaId, num(s.quantidade)])),
    }))
    .filter((m) => m.ativo || Object.values(m.saldos).some((q) => q > 0))
    .sort((a, b) => ordem(a.grupo) - ordem(b.grupo) || a.descricao.localeCompare(b.descricao, "pt-BR"));
}

const somaSaldos = (m: MaterialEstoque, estabs: string[]) => arred3(estabs.reduce((a, id) => a + (m.saldos[id] ?? 0), 0));

/** Estabelecimento escolhido no filtro (vazio ou fora do escopo = todos). */
function estabsDoFiltro(escopo: EscopoEmpresa, estab: string) {
  return estab && escopo.ids.includes(estab) ? [estab] : escopo.ids;
}

export type FiltrosSaldo = { estab: string; grupo: string; q: string; comSaldo: boolean };

export function lerFiltrosSaldo(sp: Busca): FiltrosSaldo {
  return { estab: primeiro(sp.estab), grupo: primeiro(sp.grupo), q: primeiro(sp.q).trim().slice(0, 100), comSaldo: primeiro(sp.saldo) === "com" };
}

/** Tela de saldos: materiais com saldo, valor estimado (saldo × preço de venda), última entrada e vendido em 30 dias. */
export async function carregarSaldos(f: FiltrosSaldo) {
  const escopo = await escopoEmpresa();
  const estabs = estabsDoFiltro(escopo, f.estab);
  const [materiais, estabelecimentos] = await Promise.all([carregarMateriais(escopo), carregarEstabelecimentos(escopo)]);
  const ids = materiais.map((m) => m.id);
  const hoje = hojeISO();
  const inicio = isoParaDate(inicioMes(hoje));
  const [entradas, vendidos, entradasMes, vendasMes] = await Promise.all([
    prisma.lancamentoEstoque.findMany({
      where: { empresaId: { in: estabs }, tipo: "ENTRADA", data: { gte: isoParaDate(addDias(hoje, -365)) } },
      select: { data: true, itens: { select: { produtoId: true } } },
      orderBy: { data: "desc" },
    }),
    ids.length
      ? prisma.itemEstoque.groupBy({
          by: ["produtoId"],
          where: { produtoId: { in: ids }, lancamento: { tipo: "VENDA", empresaId: { in: estabs }, data: { gte: isoParaDate(addDias(hoje, -30)) } } },
          _sum: { quantidade: true },
        })
      : Promise.resolve([]),
    prisma.itemEstoque.findMany({
      where: { lancamento: { tipo: "ENTRADA", empresaId: { in: estabs }, data: { gte: inicio } } },
      select: { quantidade: true, produto: { select: { unidade: true } } },
    }),
    ids.length
      ? prisma.pedidoItem.findMany({
          where: { produtoId: { in: ids }, pedido: { status: "FATURADO", empresaId: { in: estabs }, dataFaturamento: { gte: inicio } } },
          select: { quantidade: true, total: true, unidade: true },
        })
      : Promise.resolve([]),
  ]);
  const ultima = new Map<string, string>();
  for (const l of entradas) for (const i of l.itens) if (!ultima.has(i.produtoId)) ultima.set(i.produtoId, isoReq(l.data));
  const vendido = new Map(vendidos.map((v) => [v.produtoId, Math.abs(num(v._sum.quantidade ?? 0))]));

  const termo = semAcento(f.q);
  const todas: LinhaSaldo[] = materiais.map((m) => {
    const saldo = somaSaldos(m, estabs);
    return { ...m, saldo, valorEstimado: arred2(saldo * m.precoVenda), ultimaEntrada: ultima.get(m.id) ?? null, vendido30: vendido.get(m.id) ?? 0 };
  });
  const linhas = todas.filter(
    (l) =>
      (!f.grupo || (f.grupo === "SEM" ? !l.grupo : l.grupo === f.grupo)) &&
      (!termo || semAcento(`${l.codigo} ${l.descricao}`).includes(termo)) &&
      (!f.comSaldo || l.saldo > 0),
  );
  return {
    linhas,
    estabelecimentos,
    totais: {
      materiais: todas.length,
      comSaldo: todas.filter((l) => l.saldo > 0).length,
      pesoKg: arred3(todas.reduce((a, l) => a + kgDe(l.saldo, l.unidade), 0)),
      valor: arred2(todas.reduce((a, l) => a + l.valorEstimado, 0)),
      semPreco: todas.filter((l) => l.saldo > 0 && !l.precoVenda).length,
    },
    entradasMesKg: arred3(entradasMes.reduce((a, i) => a + kgDe(num(i.quantidade), i.produto.unidade), 0)),
    vendidoMes: {
      kg: arred3(vendasMes.reduce((a, i) => a + kgDe(num(i.quantidade), i.unidade), 0)),
      valor: arred2(vendasMes.reduce((a, i) => a + num(i.total), 0)),
    },
  };
}

// ───────────────────────── Movimentações ─────────────────────────

export type FiltrosLancamentos = { tipo: "" | TipoLancamentoT; produto: string; estab: string; de: string; ate: string; pagina: number };

export function lerFiltrosLancamentos(sp: Busca): FiltrosLancamentos {
  const tipo = primeiro(sp.tipo).toUpperCase();
  const data = (v: string) => (ehISOValido(v) ? v : "");
  return {
    tipo: tipo === "ENTRADA" || tipo === "VENDA" || tipo === "AJUSTE" ? tipo : "",
    produto: primeiro(sp.material),
    estab: primeiro(sp.estab),
    de: data(primeiro(sp.de)),
    ate: data(primeiro(sp.ate)),
    pagina: Math.max(1, Number(primeiro(sp.pagina)) || 1),
  };
}

const incluirLancamento = {
  empresa: { select: { nomeFantasia: true, razaoSocial: true } },
  pessoa: { select: { nome: true, nomeFantasia: true } },
  pedido: { select: { id: true, numero: true, pessoa: { select: { nome: true, nomeFantasia: true } } } },
  itens: { include: { produto: { select: { codigo: true, descricao: true, unidade: true } } } },
} as const;
type LancamentoDb = Prisma.LancamentoEstoqueGetPayload<{ include: typeof incluirLancamento }>;

async function nomesUsuarios(ids: (string | null)[]) {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map<string, string>();
  const us = await prisma.usuario.findMany({ where: { id: { in: unicos } }, select: { id: true, nome: true } });
  return new Map(us.map((u) => [u.id, u.nome]));
}

function paraLista(l: LancamentoDb, usuarios: Map<string, string>): LancamentoLista {
  const itens = l.itens.map((i) => ({
    produtoId: i.produtoId,
    codigo: i.produto.codigo,
    descricao: i.produto.descricao,
    unidade: i.produto.unidade,
    quantidade: num(i.quantidade),
    saldoContado: i.saldoContado === null ? null : num(i.saldoContado),
  }));
  return {
    id: l.id,
    numero: l.numero,
    tipo: l.tipo,
    data: isoReq(l.data),
    empresaId: l.empresaId,
    empresaNome: nomeEmpresa(l.empresa),
    pessoaNome: l.pessoa ? nomePessoa(l.pessoa) : null,
    referencia: l.referencia,
    motivo: l.motivo,
    observacao: l.observacao,
    pedido: l.pedido ? { id: l.pedido.id, numero: l.pedido.numero, cliente: nomePessoa(l.pedido.pessoa) } : null,
    usuarioNome: l.criadoPorId ? (usuarios.get(l.criadoPorId) ?? null) : null,
    itens,
    pesoKg: arred3(itens.reduce((a, i) => a + kgDe(i.quantidade, i.unidade), 0)),
  };
}

export async function listarLancamentos(f: FiltrosLancamentos) {
  const escopo = await escopoEmpresa();
  const estabs = estabsDoFiltro(escopo, f.estab);
  const where: Prisma.LancamentoEstoqueWhereInput = {
    empresaId: { in: estabs },
    ...(f.tipo ? { tipo: f.tipo } : {}),
    ...(f.produto ? { itens: { some: { produtoId: f.produto } } } : {}),
    ...(f.de || f.ate ? { data: { ...(f.de ? { gte: isoParaDate(f.de) } : {}), ...(f.ate ? { lte: isoParaDate(f.ate) } : {}) } } : {}),
  };
  const [total, contagem, linhas, materiais, estabelecimentos] = await Promise.all([
    prisma.lancamentoEstoque.count({ where }),
    prisma.lancamentoEstoque.groupBy({ by: ["tipo"], where: { ...where, tipo: undefined }, _count: { _all: true } }),
    prisma.lancamentoEstoque.findMany({
      where,
      include: incluirLancamento,
      // a numeração é de cada estabelecimento: entre eles, quem decide a ordem é a data e o momento do registro
      orderBy: [{ data: "desc" }, { createdAt: "desc" }],
      skip: (f.pagina - 1) * POR_PAGINA_ESTOQUE,
      take: POR_PAGINA_ESTOQUE,
    }),
    carregarMateriais(escopo),
    carregarEstabelecimentos(escopo),
  ]);
  const usuarios = await nomesUsuarios(linhas.map((l) => l.criadoPorId));
  const porTipo = Object.fromEntries(contagem.map((c) => [c.tipo, c._count._all])) as Partial<Record<TipoLancamentoT, number>>;
  return {
    total,
    contadores: { "": contagem.reduce((a, c) => a + c._count._all, 0), ENTRADA: porTipo.ENTRADA ?? 0, VENDA: porTipo.VENDA ?? 0, AJUSTE: porTipo.AJUSTE ?? 0 },
    linhas: linhas.map((l) => paraLista(l, usuarios)),
    materiais,
    estabelecimentos,
  };
}

// ───────────────────────── Extrato do material ─────────────────────────

/** Extrato (kardex) de um material: movimentos com saldo acumulado, resumo de 90 dias e vendas dos últimos 6 meses. */
export async function extratoMaterial(produtoId: string, estab: string) {
  const escopo = await escopoEmpresa();
  const produto = await prisma.produto.findFirst({
    where: { id: produtoId, empresaId: escopo.ativa.id, tipo: "PRODUTO" },
    select: {
      id: true,
      codigo: true,
      descricao: true,
      unidade: true,
      grupoMaterial: true,
      precoVenda: true,
      ncm: true,
      ativo: true,
      controlaEstoque: true,
      saldosEstoque: { where: { empresaId: { in: escopo.ids } }, select: { empresaId: true, quantidade: true } },
    },
  });
  if (!produto) return null;
  const estabs = estabsDoFiltro(escopo, estab);
  const hoje = hojeISO();
  const desde6 = isoParaDate(inicioMes(addMeses(hoje, -5)));
  const [itens, vendas, estabelecimentos] = await Promise.all([
    prisma.itemEstoque.findMany({
      where: { produtoId, lancamento: { empresaId: { in: estabs } } },
      include: { lancamento: { include: { empresa: incluirLancamento.empresa, pessoa: incluirLancamento.pessoa, pedido: incluirLancamento.pedido } } },
      orderBy: [{ lancamento: { data: "asc" } }, { lancamento: { createdAt: "asc" } }],
    }),
    prisma.pedidoItem.findMany({
      where: { produtoId, pedido: { status: "FATURADO", empresaId: { in: estabs }, dataFaturamento: { gte: desde6 } } },
      select: { quantidade: true, total: true, pedido: { select: { id: true, dataFaturamento: true } } },
    }),
    carregarEstabelecimentos(escopo),
  ]);
  const usuarios = await nomesUsuarios(itens.map((i) => i.lancamento.criadoPorId));
  let saldo = 0;
  const movimentos = itens.map((i) => {
    const q = num(i.quantidade);
    saldo = arred3(saldo + q);
    const l = i.lancamento;
    return {
      id: i.id,
      lancamentoId: l.id,
      numero: l.numero,
      tipo: l.tipo as TipoLancamentoT,
      data: isoReq(l.data),
      empresaNome: nomeEmpresa(l.empresa),
      historico: l.pedido
        ? `Pedido nº ${String(l.pedido.numero).padStart(4, "0")} · ${nomePessoa(l.pedido.pessoa)}`
        : [l.pessoa ? nomePessoa(l.pessoa) : null, l.referencia, l.observacao].filter(Boolean).join(" · ") || null,
      pedidoId: l.pedido?.id ?? null,
      motivo: l.motivo,
      quantidade: q,
      saldoContado: i.saldoContado === null ? null : num(i.saldoContado),
      saldoApos: saldo,
      usuarioNome: l.criadoPorId ? (usuarios.get(l.criadoPorId) ?? null) : null,
    };
  });
  const corte90 = addDias(hoje, -90);
  const recentes = movimentos.filter((m) => m.data >= corte90);
  const meses: { mes: string; quantidade: number; receita: number; vendas: number }[] = [];
  for (let k = 5; k >= 0; k--) meses.push({ mes: inicioMes(addMeses(hoje, -k)).slice(0, 7), quantidade: 0, receita: 0, vendas: 0 });
  const pedidosPorMes = new Map<string, Set<string>>();
  for (const v of vendas) {
    const mes = iso(v.pedido.dataFaturamento)?.slice(0, 7);
    const linha = meses.find((m) => m.mes === mes);
    if (!linha || !mes) continue;
    linha.quantidade = arred3(linha.quantidade + num(v.quantidade));
    linha.receita = arred2(linha.receita + num(v.total));
    if (!pedidosPorMes.has(mes)) pedidosPorMes.set(mes, new Set());
    pedidosPorMes.get(mes)!.add(v.pedido.id);
  }
  for (const m of meses) m.vendas = pedidosPorMes.get(m.mes)?.size ?? 0;
  const vendido90 = Math.abs(recentes.filter((m) => m.tipo === "VENDA").reduce((a, m) => a + m.quantidade, 0));
  const receita90 = vendas.filter((v) => (iso(v.pedido.dataFaturamento) ?? "") >= corte90).reduce((a, v) => a + num(v.total), 0);
  const qtd90 = vendas.filter((v) => (iso(v.pedido.dataFaturamento) ?? "") >= corte90).reduce((a, v) => a + num(v.quantidade), 0);
  const saldos = Object.fromEntries(produto.saldosEstoque.map((s) => [s.empresaId, num(s.quantidade)]));
  return {
    produto: {
      id: produto.id,
      codigo: produto.codigo,
      descricao: produto.descricao,
      unidade: produto.unidade,
      grupo: produto.grupoMaterial,
      precoVenda: num(produto.precoVenda),
      ncm: produto.ncm,
      ativo: produto.ativo,
      controlaEstoque: produto.controlaEstoque,
    },
    saldos,
    saldo: arred3(estabs.reduce((a, id) => a + (saldos[id] ?? 0), 0)),
    estabelecimentos,
    movimentos: movimentos.reverse(),
    resumo90: {
      entrou: arred3(recentes.filter((m) => m.tipo === "ENTRADA").reduce((a, m) => a + m.quantidade, 0)),
      vendido: arred3(vendido90),
      ajustes: arred3(recentes.filter((m) => m.tipo === "AJUSTE").reduce((a, m) => a + m.quantidade, 0)),
      precoMedio: qtd90 > 0 ? arred2(receita90 / qtd90) : null,
    },
    meses,
  };
}

// ───────────────────────── Vendas por material ─────────────────────────

export const PERIODOS_VENDAS = [
  { valor: "mes", rotulo: "Este mês" },
  { valor: "mes-passado", rotulo: "Mês passado" },
  { valor: "3m", rotulo: "3 meses" },
  { valor: "12m", rotulo: "12 meses" },
  { valor: "ano", rotulo: "Este ano" },
] as const;

export type FiltrosVendasMaterial = { periodo: string; de: string; ate: string; estab: string };

export function lerFiltrosVendasMaterial(sp: Busca): FiltrosVendasMaterial {
  const hoje = hojeISO();
  const periodo = primeiro(sp.periodo) || "mes";
  const deP = primeiro(sp.de);
  const ateP = primeiro(sp.ate);
  let de = inicioMes(hoje);
  let ate = hoje;
  if (periodo === "mes-passado") {
    de = inicioMes(addMeses(hoje, -1));
    ate = fimMes(addMeses(hoje, -1));
  } else if (periodo === "3m") de = inicioMes(addMeses(hoje, -2));
  else if (periodo === "12m") de = inicioMes(addMeses(hoje, -11));
  else if (periodo === "ano") de = `${hoje.slice(0, 4)}-01-01`;
  else if (periodo === "personalizado" && ehISOValido(deP) && ehISOValido(ateP) && deP <= ateP) {
    de = deP;
    ate = ateP;
  }
  return { periodo, de, ate, estab: primeiro(sp.estab) };
}

/** Vendas faturadas no período, por material e por comprador (kg, receita, preço médio e número de vendas). */
export async function vendasPorMaterial(f: FiltrosVendasMaterial) {
  const escopo = await escopoEmpresa();
  const estabs = estabsDoFiltro(escopo, f.estab);
  const [itens, estabelecimentos] = await Promise.all([
    prisma.pedidoItem.findMany({
      where: { tipo: "PRODUTO", pedido: { status: "FATURADO", empresaId: { in: estabs }, dataFaturamento: { gte: isoParaDate(f.de), lte: isoParaDate(f.ate) } } },
      select: {
        produtoId: true,
        unidade: true,
        quantidade: true,
        total: true,
        produto: { select: { codigo: true, descricao: true, grupoMaterial: true, unidade: true } },
        pedido: { select: { id: true, pessoaId: true, pessoa: { select: { nome: true, nomeFantasia: true } } } },
      },
    }),
    carregarEstabelecimentos(escopo),
  ]);
  type Linha = { chave: string; produtoId: string | null; codigo: string | null; descricao: string; grupo: string | null; unidade: string; quantidade: number; kg: number; receita: number; pedidos: Set<string> };
  const materiais = new Map<string, Linha>();
  const compradores = new Map<string, { pessoaId: string; nome: string; kg: number; receita: number; pedidos: Set<string> }>();
  for (const i of itens) {
    const chave = i.produtoId ?? "avulso";
    const unidade = i.produto?.unidade ?? i.unidade;
    const q = num(i.quantidade);
    const kg = kgDe(q, i.unidade);
    const receita = num(i.total);
    let m = materiais.get(chave);
    if (!m) {
      m = {
        chave,
        produtoId: i.produtoId,
        codigo: i.produto?.codigo ?? null,
        descricao: i.produto?.descricao ?? "Itens sem cadastro",
        grupo: i.produto?.grupoMaterial ?? null,
        unidade,
        quantidade: 0,
        kg: 0,
        receita: 0,
        pedidos: new Set(),
      };
      materiais.set(chave, m);
    }
    m.quantidade = arred3(m.quantidade + q);
    m.kg = arred3(m.kg + kg);
    m.receita = arred2(m.receita + receita);
    m.pedidos.add(i.pedido.id);
    let c = compradores.get(i.pedido.pessoaId);
    if (!c) {
      c = { pessoaId: i.pedido.pessoaId, nome: nomePessoa(i.pedido.pessoa), kg: 0, receita: 0, pedidos: new Set() };
      compradores.set(i.pedido.pessoaId, c);
    }
    c.kg = arred3(c.kg + kg);
    c.receita = arred2(c.receita + receita);
    c.pedidos.add(i.pedido.id);
  }
  const receitaTotal = arred2([...materiais.values()].reduce((a, m) => a + m.receita, 0));
  const linhas = [...materiais.values()]
    .map((m) => ({
      ...m,
      pedidos: m.pedidos.size,
      precoMedio: m.produtoId && m.quantidade > 0 ? arred2(m.receita / m.quantidade) : null,
      participacao: receitaTotal > 0 ? m.receita / receitaTotal : 0,
    }))
    .sort((a, b) => Number(!a.produtoId) - Number(!b.produtoId) || b.receita - a.receita);
  return {
    de: f.de,
    ate: f.ate,
    estabelecimentos,
    linhas,
    compradores: [...compradores.values()].map((c) => ({ ...c, pedidos: c.pedidos.size })).sort((a, b) => b.receita - a.receita),
    totais: {
      receita: receitaTotal,
      kg: arred3(linhas.reduce((a, l) => a + l.kg, 0)),
      pedidos: new Set(itens.map((i) => i.pedido.id)).size,
      materiais: linhas.filter((l) => l.produtoId).length,
    },
  };
}

// ───────────────────────── Integração com vendas ─────────────────────────

/** Saldo somado (matriz e filiais) dos produtos informados, para o seletor de produto. */
export async function saldosParaBusca(produtoIds: string[], escopo: EscopoEmpresa) {
  if (!produtoIds.length) return new Map<string, number>();
  const saldos = await prisma.saldoEstoque.groupBy({ by: ["produtoId"], where: { produtoId: { in: produtoIds }, empresaId: { in: escopo.ids } }, _sum: { quantidade: true } });
  return new Map(saldos.map((s) => [s.produtoId, num(s._sum.quantidade ?? 0)]));
}

/** Item de proposta ou pedido já preenchido a partir do material (botão Vender): saldo da matriz como quantidade. */
export async function itemInicialDoProduto(produtoId: string): Promise<LinhaDocumentoForm | null> {
  const escopo = await escopoEmpresa();
  const p = await prisma.produto.findFirst({
    where: { id: produtoId, empresaId: escopo.ativa.id, ativo: true },
    select: { id: true, codigo: true, descricao: true, tipo: true, unidade: true, precoVenda: true, controlaEstoque: true },
  });
  if (!p) return null;
  const saldo = p.tipo === "PRODUTO" && p.controlaEstoque ? await prisma.saldoEstoque.findUnique({ where: { empresaId_produtoId: { empresaId: escopo.ativa.id, produtoId } } }) : null;
  const q = saldo ? num(saldo.quantidade) : 0;
  return {
    produtoId: p.id,
    produtoRotulo: `${p.codigo} · ${p.descricao}`,
    tipo: p.tipo,
    descricao: p.descricao,
    unidade: p.unidade,
    quantidade: q > 0 ? fmtDecimal(q, 0, 3) : "1",
    precoUnitario: num(p.precoVenda) > 0 ? fmtDecimal(num(p.precoVenda), 2, 4) : "",
    descontoPercentual: "",
  };
}
