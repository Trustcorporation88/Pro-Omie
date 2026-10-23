// Rótulos da cobrança (Asaas). Seguro para client e server.
export const ROTULO_STATUS_COBRANCA: Record<string, string> = {
  PENDING: "Em aberto",
  OVERDUE: "Vencida",
  CONFIRMED: "Paga (a compensar)",
  RECEIVED: "Recebida",
  RECEIVED_IN_CASH: "Recebida por fora",
  REFUNDED: "Estornada",
  REFUND_REQUESTED: "Estorno pedido",
  REFUND_IN_PROGRESS: "Estorno em andamento",
  DELETED: "Cancelada",
  CHARGEBACK_REQUESTED: "Chargeback",
  CHARGEBACK_DISPUTE: "Chargeback em disputa",
  AWAITING_CHARGEBACK_REVERSAL: "Aguardando reversão",
  DUNNING_REQUESTED: "Em negativação",
  DUNNING_RECEIVED: "Recebida (negativação)",
  AWAITING_RISK_ANALYSIS: "Em análise",
};
export const TOM_STATUS_COBRANCA = (s: string): "neutro" | "sucesso" | "alerta" | "perigo" | "info" =>
  s === "RECEIVED" || s === "CONFIRMED" || s === "RECEIVED_IN_CASH" || s === "DUNNING_RECEIVED" ? "sucesso" : s === "PENDING" ? "info" : s === "OVERDUE" ? "alerta" : s === "DELETED" ? "neutro" : "perigo";
export const ROTULO_TIPO_COBRANCA: Record<string, string> = { BOLETO: "Boleto", PIX: "Pix", UNDEFINED: "Boleto ou Pix" };

