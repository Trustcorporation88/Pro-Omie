// Tipos e rótulos do módulo fiscal (notas recebidas). Seguro para client e server.

export type TipoDoc = "NFE" | "CTE" | "NFSE";
export type Motor = "SEFAZ" | "FOCUS";
export type Direcao = "ENTRADA" | "SAIDA" | "TERCEIRO";
export type Situacao = "AUTORIZADO" | "CANCELADO" | "DENEGADO";
export type TipoManifestacao = "CIENCIA" | "CONFIRMACAO" | "DESCONHECIMENTO" | "NAO_REALIZADA";

export const TIPOS_DOC: TipoDoc[] = ["NFE", "CTE", "NFSE"];

export const ROTULO_TIPO_DOC: Record<TipoDoc, string> = { NFE: "NF-e", CTE: "CT-e", NFSE: "NFS-e" };
export const DESCRICAO_TIPO_DOC: Record<TipoDoc, string> = {
  NFE: "notas de produtos",
  CTE: "conhecimentos de transporte (frete)",
  NFSE: "notas de serviço (padrão nacional)",
};
export const ROTULO_MOTOR: Record<Motor, string> = { SEFAZ: "SEFAZ direto", FOCUS: "Focus NFe" };
export const ROTULO_DIRECAO: Record<Direcao, string> = { ENTRADA: "Recebida", SAIDA: "Emitida pela empresa", TERCEIRO: "Como terceiro" };
export const ROTULO_SITUACAO: Record<Situacao, string> = { AUTORIZADO: "Autorizada", CANCELADO: "Cancelada", DENEGADO: "Denegada" };

export const ROTULO_MANIFESTACAO: Record<TipoManifestacao, string> = {
  CIENCIA: "Ciência da operação",
  CONFIRMACAO: "Operação confirmada",
  DESCONHECIMENTO: "Operação desconhecida",
  NAO_REALIZADA: "Operação não realizada",
};
export const AJUDA_MANIFESTACAO: Record<TipoManifestacao, string> = {
  CIENCIA: "A empresa sabe da nota, mas ainda não confirmou se a compra aconteceu. Libera o XML completo.",
  CONFIRMACAO: "A compra aconteceu e a mercadoria ou o serviço foi recebido.",
  DESCONHECIMENTO: "A empresa não reconhece esta nota (não fez esta compra).",
  NAO_REALIZADA: "A compra era conhecida, mas não aconteceu (devolvida, cancelada pelo fornecedor...). Exige justificativa.",
};

/** Códigos oficiais dos eventos de manifestação do destinatário e a descrição exigida pelo schema. */
export const EVENTO_MANIFESTACAO: Record<TipoManifestacao, { codigo: string; descricao: string }> = {
  CONFIRMACAO: { codigo: "210200", descricao: "Confirmacao da Operacao" },
  CIENCIA: { codigo: "210210", descricao: "Ciencia da Operacao" },
  DESCONHECIMENTO: { codigo: "210220", descricao: "Desconhecimento da Operacao" },
  NAO_REALIZADA: { codigo: "210240", descricao: "Operacao nao Realizada" },
};

/** Manifestações que encerram o ciclo (a ciência é provisória). */
export const MANIFESTACAO_FINAL: TipoManifestacao[] = ["CONFIRMACAO", "DESCONHECIMENTO", "NAO_REALIZADA"];

export const ROTULO_EVENTO: Record<string, string> = {
  "110110": "Carta de correção",
  "110111": "Cancelamento",
  "110112": "Cancelamento por substituição",
  "110140": "EPEC",
  "210200": "Confirmação da operação",
  "210210": "Ciência da operação",
  "210220": "Desconhecimento da operação",
  "210240": "Operação não realizada",
  "610110": "Prestação em desacordo",
  "101101": "Cancelamento de NFS-e",
  "105102": "Cancelamento por substituição",
};

/** Documento devolvido por um motor de captação (SEFAZ ou Focus), já lido. */
export type DocumentoCapturado = {
  /** NSU (SEFAZ/ADN) ou versão (Focus): posição no fluxo de distribuição */
  nsu: string;
  tipo: TipoDoc;
  natureza: "DOCUMENTO" | "RESUMO" | "EVENTO" | "OUTRO";
  /** chave do documento; no evento, a chave do documento a que ele se refere */
  chave: string;
  xml: string;
  direcao?: Direcao;
  numero?: string;
  serie?: string;
  emitenteDocumento?: string;
  emitenteNome?: string;
  emitenteIe?: string;
  destinatarioDocumento?: string;
  /** reais, duas casas */
  valor?: number;
  emitidoEm?: Date;
  protocolo?: string;
  situacao?: Situacao;
  /** a Focus informa a manifestação atual da nota */
  manifestacao?: TipoManifestacao | null;
  evento?: { codigo: string; sequencia: number; descricao?: string; detalhe?: string; ocorridoEm?: Date; protocolo?: string };
  /** conteúdo ilegível: não é gravado e o cursor não passa por cima dele */
  erroLeitura?: string;
};

export type PaginaCaptura = {
  /** cStat da SEFAZ (137 nada novo, 138 encontrados, 656 consumo indevido...) ou ERR */
  status: string;
  mensagem: string;
  ultimoNsu: string;
  maxNsu?: string;
  documentos: DocumentoCapturado[];
  /** ainda há documentos para buscar nesta mesma execução */
  temMais: boolean;
};

export type ResultadoManifestacao = {
  ok: boolean;
  /** cStat do evento (135 registrado, 136 registrado sem vínculo, 573 duplicidade...) */
  status: string;
  mensagem: string;
  protocolo?: string;
  registradoEm?: Date;
  /** a SEFAZ já tinha este evento (duplicidade): conta como feito */
  jaExistia?: boolean;
};

/** Classifica o retorno de uma consulta de distribuição para a tela (137 e 138 não são erro). */
export function classificarStatus(status: string | null | undefined): { ok: boolean; rotulo: string } {
  const s = String(status ?? "").trim().toUpperCase();
  if (!s) return { ok: false, rotulo: "Ainda não consultado" };
  if (s === "ERR") return { ok: false, rotulo: "Falha de comunicação" };
  if (s === "137") return { ok: true, rotulo: "Nenhum documento novo" };
  if (s === "138") return { ok: true, rotulo: "Documentos localizados" };
  if (s === "656") return { ok: false, rotulo: "Consumo indevido (SEFAZ pediu para esperar)" };
  if (s === "593") return { ok: false, rotulo: "Certificado de outra raiz de CNPJ" };
  if (s === "215" || s === "243") return { ok: false, rotulo: "Pedido recusado pelo schema" };
  return { ok: false, rotulo: `Rejeição ${s}` };
}

export type EstadoCaptacao = {
  empresaId: string;
  nome: string;
  cnpj: string;
  matriz: boolean;
  ativa: boolean;
  motor: Motor;
  ambiente: 1 | 2;
  tipos: TipoDoc[];
  cienciaAutomatica: boolean;
  temCertificado: boolean;
  certificadoHerdado: boolean;
  focusDisponivel: boolean;
  focusAtivada: boolean;
  cursores: {
    tipo: TipoDoc;
    consultadoEm: string | null;
    status: string | null;
    mensagem: string | null;
    proximaConsulta: string | null;
    pendente: boolean;
  }[];
};
