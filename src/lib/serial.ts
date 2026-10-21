// Conversões para passar dados do servidor para componentes client (sem Decimal/Date).
type DecimalLike = { toString(): string } | number | string | null | undefined;

export function num(d: DecimalLike): number {
  if (d === null || d === undefined) return 0;
  const n = typeof d === "number" ? d : Number(d.toString());
  return Number.isFinite(n) ? n : 0;
}

export function numOuNull(d: DecimalLike): number | null {
  return d === null || d === undefined ? null : num(d);
}

export function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function isoReq(d: Date): string {
  return d.toISOString().slice(0, 10);
}
