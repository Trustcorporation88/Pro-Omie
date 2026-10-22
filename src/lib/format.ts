// Formatação e validação no padrão brasileiro. Seguro para client e server.

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtMoeda(v: number | string | null | undefined): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return moeda.format(n);
}

export function fmtNumero(v: number | null | undefined, casas = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (casas === 2) return numero2.format(v);
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v);
}

/** Converte "1.234,56", "1234,56", "1234.56" ou "R$ 1.234,56" em número. */
/**
 * Número digitado no padrão brasileiro → texto no padrão JS ("1.234,56" → "1234.56").
 * Com vírgula e ponto, o último separador é o decimal. Só com ponto: grupos de 3 dígitos são milhar
 * ("5.400" = 5400, "1.250.000" = 1250000); fora isso o ponto é decimal ("5.4", "6.80", "0.500").
 */
export function normalizarNumeroBR(entrada: string): string {
  let s = entrada.replace(/[^\d,.-]/g, "").trim();
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (temVirgula) s = s.replace(/\./g, "").replace(",", ".");
  else if (temPonto && /^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return s;
}

export function parseMoeda(input: string | number | null | undefined): number {
  if (typeof input === "number") return input;
  if (!input) return 0;
  const s = normalizarNumeroBR(String(input));
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function arred2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Datas "somente dia" trafegam como 'YYYY-MM-DD' e são exibidas sem conversão de fuso. */
export function fmtData(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const iso = typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  const [y, m, dia] = iso.split("-");
  return `${dia}/${m}/${y}`;
}

export function fmtDataHora(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(dt);
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function fmtMesAno(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MESES[Number(m) - 1]}/${y.slice(2)}`;
}

export function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

export function fmtDocumento(doc: string | null | undefined): string {
  const d = soDigitos(doc);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc ?? "";
}

export function fmtCep(cep: string | null | undefined): string {
  const d = soDigitos(cep);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, "$1-$2") : (cep ?? "");
}

export function fmtTelefone(t: string | null | undefined): string {
  const d = soDigitos(t);
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return t ?? "";
}

export function validarCPF(cpf: string): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function validarCNPJ(cnpj: string): boolean {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function validarDocumento(doc: string): boolean {
  const d = soDigitos(doc);
  return d.length === 11 ? validarCPF(d) : d.length === 14 ? validarCNPJ(d) : false;
}

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
  "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
