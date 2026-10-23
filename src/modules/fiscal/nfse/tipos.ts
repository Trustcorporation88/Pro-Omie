// Tipos e textos da NFS-e pelo emissor nacional. Seguro para client e server.
import type { StatusNota } from "../nfe/tipos";

export type { StatusNota };

export const ROTULO_AMBIENTE_NFSE: Record<1 | 2, string> = { 1: "Produção", 2: "Produção restrita (testes)" };

/** Motivos de cancelamento aceitos pelo emissor nacional (cMotivo do evento e101101). */
export const MOTIVOS_CANCELAMENTO_NFSE = [
  { valor: "1", rotulo: "Erro na emissão" },
  { valor: "2", rotulo: "Serviço não prestado" },
  { valor: "9", rotulo: "Outros" },
] as const;

export const TEXTO_SIMPLES_NFSE = "Documento emitido por ME ou EPP optante pelo Simples Nacional.";

/** URL pública de consulta de uma NFS-e pela chave (vai no QR code da DANFSe). */
export const urlConsultaPublicaNfse = (chave: string) => `https://www.nfse.gov.br/consultapublica/?tpc=1&chave=${chave}`;

/**
 * Código de tributação nacional (6 dígitos) a partir do item da LC 116 do cadastro ("01.07" → "010701").
 * O desdobro "01" é o mais comum na lista nacional; o produto pode informar outro código.
 */
export function codigoTributacaoNacionalDe(codigoServico: string | null | undefined): string | null {
  const d = (codigoServico ?? "").replace(/\D/g, "");
  if (d.length === 6) return d;
  if (d.length === 4) return `${d}01`;
  if (d.length === 3) return `0${d}01`;
  return null;
}

/** Descrição curta do serviço para a lista (a xDescServ pode ter 2.000 caracteres). */
export function resumoServico(descricao: string, max = 90): string {
  const s = descricao.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export type ProblemaNfse = { campo: string; mensagem: string; link?: string };
