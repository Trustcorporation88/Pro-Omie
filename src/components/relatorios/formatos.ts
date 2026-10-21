// Formatação usada nos relatórios e gráficos. Seguro para client e server.
import { fmtNumero } from "@/lib/format";

const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** "R$ 12,5 mil", "R$ 1,2 mi" — para eixos de gráfico (espaços não separáveis: o rótulo não quebra). */
export function fmtMoedaCompacta(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return `${v < 0 ? "−" : ""}R$\u00A0${compacto.format(Math.abs(v)).replace(/ /g, "\u00A0")}`;
}

/** Percentual com vírgula: "12,3%". */
export function fmtPct(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${fmtNumero(v, casas)}%`;
}

/** Classe de cor pelo sinal (negativo em vermelho). */
export function corSinal(v: number | null | undefined): string {
  return v !== null && v !== undefined && v < -0.004 ? "text-destructive" : "";
}
