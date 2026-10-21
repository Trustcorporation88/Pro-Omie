// Geração de parcelas e recorrências. Seguro para client e server.
import { addDias, addMeses } from "@/lib/datas";
import { arred2 } from "@/lib/format";

export type Intervalo = "mensal" | "quinzenal" | "semanal" | "anual";
export type Parcela = { vencimento: string; valor: number };

export function proximaData(iso: string, intervalo: Intervalo, n: number): string {
  switch (intervalo) {
    case "mensal":
      return addMeses(iso, n);
    case "anual":
      return addMeses(iso, 12 * n);
    case "quinzenal":
      return addDias(iso, 15 * n);
    case "semanal":
      return addDias(iso, 7 * n);
  }
}

/** Divide o total em n parcelas; a última absorve a diferença de centavos. */
export function dividirValor(total: number, n: number): number[] {
  if (n <= 1) return [arred2(total)];
  const base = Math.floor((total / n) * 100) / 100;
  const valores = Array.from({ length: n }, () => base);
  valores[n - 1] = arred2(total - base * (n - 1));
  return valores;
}

export function gerarParcelas(total: number, n: number, primeiroVencimento: string, intervalo: Intervalo = "mensal"): Parcela[] {
  return dividirValor(total, n).map((valor, i) => ({ vencimento: proximaData(primeiroVencimento, intervalo, i), valor }));
}

/** Parcelas a partir de uma condição de pagamento como "30,60,90" contada da emissão. */
export function parcelasPorCondicao(total: number, dias: string, emissao: string): Parcela[] {
  const prazos = dias
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isFinite(d) && d >= 0);
  if (!prazos.length) return [{ vencimento: emissao, valor: arred2(total) }];
  return dividirValor(total, prazos.length).map((valor, i) => ({ vencimento: addDias(emissao, prazos[i]), valor }));
}

/** Distribui um valor entre rateios por percentual; o último absorve a diferença. */
export function distribuirRateio<T extends { percentual: number }>(valor: number, rateios: T[]): (T & { valor: number })[] {
  let acumulado = 0;
  return rateios.map((r, i) => {
    const v = i === rateios.length - 1 ? arred2(valor - acumulado) : arred2((valor * r.percentual) / 100);
    acumulado = arred2(acumulado + v);
    return { ...r, valor: v };
  });
}
