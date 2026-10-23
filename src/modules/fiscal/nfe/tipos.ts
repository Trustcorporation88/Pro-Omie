// Tipos e textos da emissão de NF-e. Seguro para client e server.

export type StatusNota = "PROCESSANDO" | "AUTORIZADA" | "REJEITADA" | "DENEGADA" | "CANCELADA";

export const ROTULO_STATUS_NOTA: Record<StatusNota, string> = {
  PROCESSANDO: "Processando",
  AUTORIZADA: "Autorizada",
  REJEITADA: "Rejeitada",
  DENEGADA: "Denegada",
  CANCELADA: "Cancelada",
};

export const TOM_STATUS_NOTA: Record<StatusNota, "neutro" | "sucesso" | "alerta" | "perigo" | "info"> = {
  PROCESSANDO: "info",
  AUTORIZADA: "sucesso",
  REJEITADA: "alerta",
  DENEGADA: "perigo",
  CANCELADA: "perigo",
};

/** CSOSN do Simples Nacional aceitos pelo emissor (grupos ICMSSN101, 102, 500 e 900). */
export const CSOSN_OPCOES = [
  { valor: "101", rotulo: "101 · Tributada com permissão de crédito" },
  { valor: "102", rotulo: "102 · Tributada sem permissão de crédito" },
  { valor: "103", rotulo: "103 · Isenção para faixa de receita bruta" },
  { valor: "300", rotulo: "300 · Imune" },
  { valor: "400", rotulo: "400 · Não tributada (inclui diferimento)" },
  { valor: "500", rotulo: "500 · ICMS cobrado antes por substituição" },
  { valor: "900", rotulo: "900 · Outros" },
];

export const TEXTO_SIMPLES = "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL; NÃO GERA DIREITO A CRÉDITO FISCAL DE IPI";
export const TEXTO_DIFERIMENTO_SP = 'Diferido o lançamento do ICMS, nos termos do "caput" do artigo 392 do RICMS/2000';
export const TEXTO_HOMOLOGACAO = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

/**
 * Padrão fiscal quando o produto não tem os campos preenchidos (o contador confirma; cada produto pode mudar).
 * Recicláveis da produção própria: CFOP 5101/6101; dentro de SP, CSOSN 400 com o diferimento do art. 392 do RICMS-SP;
 * fora do estado o diferimento acaba (CSOSN 102). Demais produtos: revenda (5102/6102, CSOSN 102).
 */
export const PADRAO_FISCAL = {
  reciclavel: { cfopInterno: "5101", cfopInterestadual: "6101", csosnInterno: "400", csosnInterestadual: "102", textoFiscal: TEXTO_DIFERIMENTO_SP },
  produto: { cfopInterno: "5102", cfopInterestadual: "6102", csosnInterno: "102", csosnInterestadual: "102", textoFiscal: "" },
};

/** Natureza da operação (natOp, até 60 caracteres) a partir dos CFOP dos itens; produção e revenda juntas têm texto próprio. */
export function naturezaPorCfop(cfops: string | string[]): string {
  const lista = [...new Set(Array.isArray(cfops) ? cfops : [cfops])];
  const producao = lista.some((c) => /^[56]101$/.test(c));
  const revenda = lista.some((c) => /^[56]102$/.test(c));
  const outros = lista.some((c) => !/^[56]10[12]$/.test(c));
  if (outros || !lista.length) return "VENDA";
  if (producao && revenda) return "VENDA DE PRODUCAO E DE MERCADORIA ADQUIRIDA DE TERCEIROS";
  return producao ? "VENDA DE PRODUCAO DO ESTABELECIMENTO" : "VENDA DE MERCADORIA ADQUIRIDA DE TERCEIROS";
}

/** Meio de pagamento do ERP → tPag da NF-e. */
export const TPAG_POR_MEIO: Record<string, string> = {
  DINHEIRO: "01",
  CHEQUE: "02",
  CARTAO_CREDITO: "03",
  CARTAO_DEBITO: "04",
  BOLETO: "15",
  PIX: "17",
  TRANSFERENCIA: "18",
  DEBITO_AUTOMATICO: "18",
  OUTRO: "99",
};

export type ProblemaEmissao = { campo: string; mensagem: string; link?: string };
