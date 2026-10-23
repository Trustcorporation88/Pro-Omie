// Interface comum dos motores de captação (SEFAZ direto e Focus NFe). Só servidor.
import "server-only";
import type { Motor, PaginaCaptura, ResultadoManifestacao, TipoDoc, TipoManifestacao } from "./tipos";

export interface MotorCaptacao {
  readonly motor: Motor;
  /** espera obrigatória depois de "nenhum documento novo" (regra da SEFAZ e do ADN), em ms */
  esperaSemNovidade(tipo: TipoDoc): number;
  /** uma página da distribuição a partir do NSU (SEFAZ) ou da versão (Focus) */
  consultar(tipo: TipoDoc, nsu: string): Promise<PaginaCaptura>;
  manifestar(chave: string, tipo: TipoManifestacao, justificativa?: string): Promise<ResultadoManifestacao>;
  /** fecha conexões abertas */
  encerrar(): void;
}

/** Espera depois de "nenhum documento" no DistDFe e no ADN (1 h + 1 min de folga) e depois de 656 (consumo indevido). */
export const ESPERA_SEFAZ_MS = 61 * 60_000;
