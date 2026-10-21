// Datas "somente dia" (vencimento, competência, emissão) são tratadas como strings ISO 'YYYY-MM-DD'
// e gravadas no banco como DATE (meia-noite UTC). "Hoje" é sempre calculado no fuso de São Paulo.

export const FUSO = "America/Sao_Paulo";

export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
}

export function isoParaDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

export function dateParaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function hojeDate(): Date {
  return isoParaDate(hojeISO());
}

export function addDias(iso: string, n: number): string {
  const d = isoParaDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return dateParaISO(d);
}

/** Soma meses preservando o dia quando possível (31/01 + 1 mês = 28 ou 29/02). */
export function addMeses(iso: string, n: number): string {
  const [y, m, dia] = iso.slice(0, 10).split("-").map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + n, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return dateParaISO(alvo);
}

export function inicioMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function fimMes(iso: string): string {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  return dateParaISO(new Date(Date.UTC(y, m, 0)));
}

export function inicioSemana(iso: string): string {
  const d = isoParaDate(iso);
  const dow = d.getUTCDay(); // 0 = domingo
  const delta = dow === 0 ? -6 : 1 - dow; // semana começa na segunda
  return addDias(iso, delta);
}

export function diffDias(a: string, b: string): number {
  return Math.round((isoParaDate(b).getTime() - isoParaDate(a).getTime()) / 86_400_000);
}

export function ehISOValido(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = isoParaDate(s);
  return !Number.isNaN(d.getTime()) && dateParaISO(d) === s;
}

/** Lista de meses 'YYYY-MM' entre duas datas (inclusive). */
export function mesesEntre(inicio: string, fim: string): string[] {
  const out: string[] = [];
  let atual = inicioMes(inicio);
  while (atual <= fim) {
    out.push(atual.slice(0, 7));
    atual = addMeses(atual, 1);
  }
  return out;
}
