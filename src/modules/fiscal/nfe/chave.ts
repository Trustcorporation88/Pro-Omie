// Chave de acesso da NF-e (44 posições): cUF AAMM CNPJ mod série nNF tpEmis cNF cDV. Só servidor.
import "server-only";
import { randomInt } from "node:crypto";

/** Dígito verificador módulo 11 (pesos 2 a 9 da direita para a esquerda; resto 0 ou 1 → 0). */
export function dvChave(base43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    const c = base43.charCodeAt(i) - 48; // CNPJ alfanumérico: valor ASCII − 48 (NT conjunta 2025.001)
    soma += c * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Código numérico aleatório de 8 dígitos, diferente do número da nota. */
export function gerarCNF(numero: number): string {
  let cnf = "";
  do cnf = String(randomInt(0, 100_000_000)).padStart(8, "0");
  while (Number(cnf) === numero || /^(\d)\1{7}$/.test(cnf));
  return cnf;
}

/** AAMM da emissão no horário de Brasília. */
export function aammBrasilia(d: Date): string {
  const sp = new Date(d.getTime() - 3 * 3_600_000).toISOString();
  return sp.slice(2, 4) + sp.slice(5, 7);
}

export function montarChave(p: { cUF: string; emissao: Date; cnpj: string; modelo?: number; serie: number; numero: number; tpEmis: number; cNF: string }) {
  const base =
    p.cUF +
    aammBrasilia(p.emissao) +
    p.cnpj.toUpperCase().replace(/[^0-9A-Z]/g, "").padStart(14, "0") +
    String(p.modelo ?? 55) +
    String(p.serie).padStart(3, "0") +
    String(p.numero).padStart(9, "0") +
    String(p.tpEmis) +
    p.cNF;
  const dv = dvChave(base);
  return { chave: base + dv, dv };
}
