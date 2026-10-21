// Sugestões automáticas para itens PENDENTE do extrato: movimento existente, título em aberto ou regra.
import { Prisma, type DB } from "@/lib/db";
import { addDias, diffDias, isoParaDate } from "@/lib/datas";
import { isoReq, num } from "@/lib/serial";
import { normalizarTexto } from "./utils";
import type { SugestaoMovimento, SugestaoRegra, SugestaoTitulo, SugestoesItem } from "./tipos";

/** Janela (em dias) para sugerir um movimento já lançado. */
export const JANELA_MOVIMENTO = 5;
/** Janela (em dias) em torno do vencimento para sugerir um título em aberto. */
export const JANELA_TITULO = 10;
/** Distância máxima (em dias) aplicada pelo "Conciliar automaticamente". */
export const JANELA_AUTO = 3;

export type ItemBase = { id: string; data: string; valor: number; descricao: string };

const centavos = (v: number) => Math.round(Math.abs(v) * 100);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function faixaDatas(itens: ItemBase[], janela: number) {
  const datas = itens.map((i) => i.data).sort();
  return { gte: isoParaDate(addDias(datas[0], -janela)), lte: isoParaDate(addDias(datas[datas.length - 1], janela)) };
}

/** Decimal exato a partir de centavos: comparar coluna Decimal com número JS (ex.: 89.9) falha na igualdade. */
const decimal = (cents: number) => new Prisma.Decimal(cents).dividedBy(100);

function valoresDistintos(itens: ItemBase[]): Prisma.Decimal[] {
  return Array.from(new Set(itens.map((i) => centavos(i.valor)))).map(decimal);
}

/**
 * Movimentos da mesma conta, mesmo sentido e mesmo valor ao centavo, ainda não conciliados e sem item
 * vinculado, com data a até ±5 dias. Atribuição gulosa pela menor distância: cada movimento é sugerido
 * para no máximo um item.
 */
export async function sugerirMovimentos(db: DB, contaBancariaId: string, itens: ItemBase[]): Promise<Map<string, SugestaoMovimento>> {
  const out = new Map<string, SugestaoMovimento>();
  const validos = itens.filter((i) => centavos(i.valor) > 0);
  if (!validos.length) return out;

  const movimentos = await db.movimento.findMany({
    where: {
      contaBancariaId,
      conciliado: false,
      extratoItem: null,
      data: faixaDatas(validos, JANELA_MOVIMENTO),
      valor: { in: valoresDistintos(validos) },
    },
    select: { id: true, data: true, tipo: true, valor: true, descricao: true, origem: true },
    orderBy: [{ data: "asc" }, { createdAt: "asc" }],
  });

  type Mov = { id: string; data: string; valor: number; descricao: string; origem: SugestaoMovimento["origem"] };
  const porChave = new Map<string, Mov[]>();
  for (const m of movimentos) {
    const valor = num(m.valor);
    const chave = `${m.tipo}:${centavos(valor)}`;
    const lista = porChave.get(chave) ?? [];
    lista.push({ id: m.id, data: isoReq(m.data), valor: m.tipo === "CREDITO" ? valor : -valor, descricao: m.descricao, origem: m.origem });
    porChave.set(chave, lista);
  }

  const pares: { item: ItemBase; mov: Mov; dist: number }[] = [];
  for (const item of validos) {
    const chave = `${item.valor > 0 ? "CREDITO" : "DEBITO"}:${centavos(item.valor)}`;
    for (const mov of porChave.get(chave) ?? []) {
      const dist = Math.abs(diffDias(item.data, mov.data));
      if (dist <= JANELA_MOVIMENTO) pares.push({ item, mov, dist });
    }
  }
  pares.sort(
    (a, b) =>
      a.dist - b.dist ||
      cmp(a.item.data, b.item.data) ||
      cmp(a.mov.data, b.mov.data) ||
      cmp(a.item.id, b.item.id) ||
      cmp(a.mov.id, b.mov.id),
  );

  const usados = new Set<string>();
  for (const p of pares) {
    if (out.has(p.item.id) || usados.has(p.mov.id)) continue;
    usados.add(p.mov.id);
    out.set(p.item.id, {
      movimentoId: p.mov.id,
      data: p.mov.data,
      valor: p.mov.valor,
      descricao: p.mov.descricao,
      origem: p.mov.origem,
      distancia: p.dist,
    });
  }
  return out;
}

/**
 * Títulos ABERTO/PARCIAL (RECEBER para créditos, PAGAR para débitos) cujo saldo restante é igual ao
 * valor do extrato, com vencimento a até ±10 dias. Prioriza a conta prevista igual à do extrato,
 * depois a menor distância; cada título é sugerido para no máximo um item.
 */
export async function sugerirTitulos(db: DB, contaBancariaId: string, itens: ItemBase[]): Promise<Map<string, SugestaoTitulo>> {
  const out = new Map<string, SugestaoTitulo>();
  const validos = itens.filter((i) => centavos(i.valor) > 0);
  if (!validos.length) return out;

  const tipos = new Set<"RECEBER" | "PAGAR">(validos.map((i) => (i.valor > 0 ? "RECEBER" : "PAGAR")));
  const menorValor = Math.min(...validos.map((i) => Math.abs(i.valor)));
  const titulos = await db.titulo.findMany({
    where: {
      status: { in: ["ABERTO", "PARCIAL"] },
      tipo: { in: Array.from(tipos) },
      vencimento: faixaDatas(validos, JANELA_TITULO),
      valor: { gte: decimal(Math.max(0, Math.round(menorValor * 100) - 1)) },
    },
    select: {
      id: true,
      numero: true,
      tipo: true,
      descricao: true,
      valor: true,
      valorPago: true,
      vencimento: true,
      contaBancariaId: true,
      contaBancaria: { select: { nome: true } },
      pessoa: { select: { nome: true, nomeFantasia: true } },
    },
  });

  type Tit = SugestaoTitulo & { prioridade: number };
  const porChave = new Map<string, Tit[]>();
  for (const t of titulos) {
    const saldo = Math.round((num(t.valor) - num(t.valorPago)) * 100) / 100;
    if (!(saldo > 0)) continue;
    const chave = `${t.tipo}:${centavos(saldo)}`;
    const lista = porChave.get(chave) ?? [];
    lista.push({
      tituloId: t.id,
      numero: t.numero,
      tipo: t.tipo,
      descricao: t.descricao,
      pessoa: t.pessoa ? t.pessoa.nomeFantasia || t.pessoa.nome : null,
      vencimento: isoReq(t.vencimento),
      saldo,
      distancia: 0,
      mesmaConta: t.contaBancariaId === contaBancariaId,
      outraConta: t.contaBancariaId && t.contaBancariaId !== contaBancariaId ? (t.contaBancaria?.nome ?? "outra conta") : null,
      // 0 = mesma conta prevista; 1 = sem conta prevista; 2 = outra conta
      prioridade: t.contaBancariaId === contaBancariaId ? 0 : t.contaBancariaId ? 2 : 1,
    });
    porChave.set(chave, lista);
  }

  const pares: { item: ItemBase; tit: Tit; dist: number }[] = [];
  for (const item of validos) {
    const chave = `${item.valor > 0 ? "RECEBER" : "PAGAR"}:${centavos(item.valor)}`;
    for (const tit of porChave.get(chave) ?? []) {
      const dist = Math.abs(diffDias(item.data, tit.vencimento));
      if (dist <= JANELA_TITULO) pares.push({ item, tit, dist });
    }
  }
  pares.sort(
    (a, b) =>
      a.tit.prioridade - b.tit.prioridade ||
      a.dist - b.dist ||
      cmp(a.item.data, b.item.data) ||
      cmp(a.tit.vencimento, b.tit.vencimento) ||
      a.tit.numero - b.tit.numero ||
      cmp(a.item.id, b.item.id),
  );

  const usados = new Set<string>();
  for (const p of pares) {
    if (out.has(p.item.id) || usados.has(p.tit.tituloId)) continue;
    usados.add(p.tit.tituloId);
    const { prioridade: _p, ...sugestao } = p.tit;
    out.set(p.item.id, { ...sugestao, distancia: p.dist });
  }
  return out;
}

export type RegraAtiva = SugestaoRegra & { tipo: "RECEBER" | "PAGAR" | null; tipoCategoria: "RECEITA" | "DESPESA"; termoNorm: string };

/** Regras ativas, das mais específicas (termo mais longo, com tipo definido) para as mais genéricas. */
export async function carregarRegrasAtivas(db: DB): Promise<RegraAtiva[]> {
  const regras = await db.regraConciliacao.findMany({
    where: { ativo: true, categoria: { ativo: true } },
    include: {
      categoria: { select: { nome: true, codigo: true, tipo: true } },
      pessoa: { select: { nome: true, nomeFantasia: true, ativo: true } },
      centroCusto: { select: { nome: true, ativo: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return regras
    .map((r) => ({
      regraId: r.id,
      termo: r.termo,
      termoNorm: normalizarTexto(r.termo),
      tipo: r.tipo,
      tipoCategoria: r.categoria.tipo,
      categoriaId: r.categoriaId,
      categoria: `${r.categoria.codigo ? `${r.categoria.codigo} · ` : ""}${r.categoria.nome}`,
      pessoaId: r.pessoa?.ativo ? r.pessoaId : null,
      pessoa: r.pessoa?.ativo ? r.pessoa.nomeFantasia || r.pessoa.nome : null,
      centroCustoId: r.centroCusto?.ativo ? r.centroCustoId : null,
      centroCusto: r.centroCusto?.ativo ? r.centroCusto.nome : null,
    }))
    .filter((r) => r.termoNorm.length > 0)
    .sort((a, b) => b.termoNorm.length - a.termoNorm.length || Number(b.tipo !== null) - Number(a.tipo !== null));
}

/** Primeira regra compatível: termo contido na descrição, tipo e categoria coerentes com o sinal. */
export function aplicarRegras(regras: RegraAtiva[], item: Pick<ItemBase, "valor" | "descricao">): SugestaoRegra | null {
  const credito = item.valor > 0;
  const desc = normalizarTexto(item.descricao);
  const r = regras.find(
    (x) =>
      (x.tipo === null || x.tipo === (credito ? "RECEBER" : "PAGAR")) &&
      x.tipoCategoria === (credito ? "RECEITA" : "DESPESA") &&
      desc.includes(x.termoNorm),
  );
  if (!r) return null;
  return {
    regraId: r.regraId,
    termo: r.termo,
    categoriaId: r.categoriaId,
    categoria: r.categoria,
    pessoaId: r.pessoaId,
    pessoa: r.pessoa,
    centroCustoId: r.centroCustoId,
    centroCusto: r.centroCusto,
  };
}

/** Todas as sugestões para os itens pendentes de uma conta (movimento › título › regra). */
export async function calcularSugestoes(db: DB, contaBancariaId: string, itens: ItemBase[]): Promise<Map<string, SugestoesItem>> {
  const out = new Map<string, SugestoesItem>();
  if (!itens.length) return out;
  const movimentos = await sugerirMovimentos(db, contaBancariaId, itens);
  const titulos = await sugerirTitulos(
    db,
    contaBancariaId,
    itens.filter((i) => !movimentos.has(i.id)),
  );
  const regras = await carregarRegrasAtivas(db);
  for (const item of itens) {
    out.set(item.id, {
      movimento: movimentos.get(item.id) ?? null,
      titulo: titulos.get(item.id) ?? null,
      regra: aplicarRegras(regras, item),
    });
  }
  return out;
}
