// Cálculos de propostas e pedidos. Seguro para client e server (o servidor sempre recalcula).
import { arred2, normalizarNumeroBR } from "@/lib/format";

export type ItemCalculo = { quantidade: number; precoUnitario: number; descontoPercentual: number };

/** Valor bruto do item (quantidade × preço), em centavos. */
export function brutoItem(i: ItemCalculo): number {
  return arred2(i.quantidade * i.precoUnitario);
}

/** Valor do item com o desconto percentual aplicado, em centavos. */
export function totalItem(i: ItemCalculo): number {
  return arred2(i.quantidade * i.precoUnitario * (1 - i.descontoPercentual / 100));
}

/** Subtotal (bruto), desconto (diferença) e total do documento. */
export function totaisDocumento(itens: ItemCalculo[]): { subtotal: number; desconto: number; total: number } {
  const subtotal = arred2(itens.reduce((a, i) => a + brutoItem(i), 0));
  const total = arred2(itens.reduce((a, i) => a + totalItem(i), 0));
  return { subtotal, desconto: arred2(subtotal - total), total };
}

/** Lê número digitado em português ("1.250,500"), com até `casas` decimais. Vazio ou inválido = NaN. */
export function lerDecimal(entrada: string | number | null | undefined, casas = 4): number {
  if (typeof entrada === "number") return entrada;
  const s = normalizarNumeroBR(String(entrada ?? ""));
  if (!s) return Number.NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return Number.NaN;
  const f = 10 ** casas;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Formata número em português com no mínimo `min` e no máximo `max` casas (ex.: 1.250,5 kg → "1.250,5"). */
export function fmtDecimal(n: number, min = 0, max = 3): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });
}

/** Preço unitário: 2 casas, ou até 4 quando houver (R$ 0,8530 / kg). */
export function fmtPrecoUnitario(n: number): string {
  return `R$ ${fmtDecimal(n, 2, 4)}`;
}

/** Número do documento com zeros à esquerda: 1 → "0001". */
export const fmtNumeroDoc = (n: number) => String(n).padStart(4, "0");

/**
 * Rateio do faturamento por tipo de item: a parte de produtos vai para a categoria de produtos e a de serviços
 * para a de serviços, com percentuais de 4 casas que somam exatamente 100.
 */
export function rateioPorTipo(
  itens: { tipo: "PRODUTO" | "SERVICO"; total: number }[],
  categorias: { PRODUTO?: string | null; SERVICO?: string | null },
  centroCustoId: string | null,
): { categoriaId: string; centroCustoId: string | null; percentual: number }[] {
  const total = itens.reduce((a, i) => a + i.total, 0);
  const porTipo = (t: "PRODUTO" | "SERVICO") => itens.filter((i) => i.tipo === t).reduce((a, i) => a + i.total, 0);
  const partes = (["PRODUTO", "SERVICO"] as const)
    .map((t) => ({ tipo: t, valor: porTipo(t), categoriaId: categorias[t] ?? null }))
    .filter((p) => p.valor > 0);
  if (!partes.length || total <= 0) return [];
  // mesma categoria para os dois tipos: um rateio só
  const unicas = new Set(partes.map((p) => p.categoriaId));
  if (unicas.size === 1) return [{ categoriaId: partes[0].categoriaId as string, centroCustoId, percentual: 100 }];
  const linhas = partes.map((p) => ({
    categoriaId: p.categoriaId as string,
    centroCustoId,
    percentual: Math.round((p.valor / total) * 1_000_000) / 10_000,
  }));
  const soma = linhas.reduce((a, l) => a + l.percentual, 0);
  linhas[linhas.length - 1].percentual = Math.round((linhas[linhas.length - 1].percentual + (100 - soma)) * 10_000) / 10_000;
  return linhas;
}
