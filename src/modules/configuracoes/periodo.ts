// Conversão de dias de São Paulo em limites UTC para consultas por `createdAt`.
// Seguro para client e server (sem dependências de servidor).
import { FUSO, addDias } from "@/lib/datas";

/** Diferença, em minutos, entre o horário de São Paulo e o UTC no instante dado (ex.: -180). */
function deslocamentoFusoMin(instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  const localComoUtc = Date.UTC(valor("year"), valor("month") - 1, valor("day"), valor("hour"), valor("minute"), valor("second"));
  const instanteEmSegundos = Math.floor(instante.getTime() / 1000) * 1000;
  return Math.round((localComoUtc - instanteEmSegundos) / 60_000);
}

/** Instante UTC em que o dia `iso` (AAAA-MM-DD) começa no fuso de São Paulo. */
export function inicioDoDiaUtc(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const meiaNoite = Date.UTC(ano, mes - 1, dia);
  // Duas passagens: a primeira acha o deslocamento aproximado; a segunda corrige mudanças de horário de verão.
  let alvo = meiaNoite - deslocamentoFusoMin(new Date(meiaNoite)) * 60_000;
  alvo = meiaNoite - deslocamentoFusoMin(new Date(alvo)) * 60_000;
  return new Date(alvo);
}

/** Limites UTC de `createdAt` para um intervalo de dias de São Paulo: [início de `de`, início do dia seguinte a `ate`). */
export function limitesCriadoEm(de: string, ate: string): { gte?: Date; lt?: Date } | undefined {
  if (!de && !ate) return undefined;
  return {
    ...(de ? { gte: inicioDoDiaUtc(de) } : {}),
    ...(ate ? { lt: inicioDoDiaUtc(addDias(ate, 1)) } : {}),
  };
}
