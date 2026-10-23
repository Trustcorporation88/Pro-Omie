// Certificado digital: tipos e situação (seguro para client e server). Nada aqui tem arquivo ou senha.

/** O que a tela sabe de um certificado guardado. */
export type CertificadoResumo = {
  empresaId: string;
  titular: string;
  cnpj: string | null;
  emissor: string | null;
  numeroSerie: string;
  impressaoDigital: string;
  validoDe: string;
  validoAte: string;
  enviadoEm: string;
  enviadoPor: string | null;
};

export const AVISO_CERTIFICADO_DIAS = 30;

/** Data no fuso de São Paulo ("22/10/2027"): a validade é um instante, e às 22h de Brasília já é outro dia em UTC. */
export const diaSP = (d: Date | string) => (typeof d === "string" ? new Date(d) : d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Dias até o vencimento (negativo = vencido) e como mostrar. */
export function situacaoCertificado(validoAte: string | Date, agora = new Date()) {
  const fim = typeof validoAte === "string" ? new Date(validoAte) : validoAte;
  const dias = Math.floor((fim.getTime() - agora.getTime()) / 86_400_000);
  if (fim.getTime() <= agora.getTime()) return { dias, tom: "perigo" as const, rotulo: "Vencido" };
  if (dias <= AVISO_CERTIFICADO_DIAS) return { dias, tom: "alerta" as const, rotulo: dias <= 0 ? "Vence hoje" : dias === 1 ? "Vence amanhã" : `Vence em ${dias} dias` };
  return { dias, tom: "sucesso" as const, rotulo: "Válido" };
}

/** "AB:CD:EF…" (primeiros 8 bytes da impressão digital SHA-256), para conferir com o arquivo. */
export const impressaoCurta = (hex: string) => hex.slice(0, 16).match(/.{2}/g)?.join(":") ?? hex;
