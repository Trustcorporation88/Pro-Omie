// Cliente da API do Asaas v3 (docs.asaas.com, out/2026): access_token no cabeçalho, User-Agent obrigatório, produção em
// api.asaas.com e sandbox em api-sandbox.asaas.com. Só servidor.
import "server-only";

export const URL_ASAAS: Record<1 | 2, string> = { 1: "https://api.asaas.com/v3", 2: "https://api-sandbox.asaas.com/v3" };

function destino(url: string): string {
  const sim = process.env.FISCAL_SIMULADOR_URL?.trim();
  if (!sim || process.env.VERCEL) return url;
  const u = new URL(url);
  return `${sim.replace(/\/$/, "")}/${u.host}${u.pathname}${u.search}`;
}

export class ErroAsaas extends Error {
  constructor(
    message: string,
    public status: number,
    public codigo?: string,
  ) {
    super(message);
    this.name = "ErroAsaas";
  }
}

type RespostaErro = { errors?: { code?: string; description?: string }[] };

export async function chamarAsaas<T>(chave: string, ambiente: 1 | 2, caminho: string, opcoes: { metodo?: "GET" | "POST" | "PUT" | "DELETE"; corpo?: unknown } = {}): Promise<T> {
  const r = await fetch(destino(`${URL_ASAAS[ambiente]}${caminho}`), {
    method: opcoes.metodo ?? "GET",
    headers: { access_token: chave, "User-Agent": "ProOmie/1.0 (erp.trustcorp.com.br)", Accept: "application/json", ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await r.text();
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* corpo não é JSON */
  }
  if (r.status >= 200 && r.status < 300) return json as T;
  const erros = (json as RespostaErro | null)?.errors;
  const descricao = erros?.map((e) => e.description).filter(Boolean).join("; ") || texto.slice(0, 200) || `HTTP ${r.status}`;
  if (r.status === 401) throw new ErroAsaas("O Asaas recusou a chave (confira a chave e o ambiente: sandbox ou produção).", 401, erros?.[0]?.code);
  throw new ErroAsaas(descricao, r.status, erros?.[0]?.code);
}

export type ClienteAsaasApi = { id: string; name: string; cpfCnpj?: string; email?: string };
export type PagamentoAsaas = {
  id: string;
  customer: string;
  status: string;
  billingType: string;
  value: number;
  netValue?: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  invoiceNumber?: string;
  nossoNumero?: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  confirmedDate?: string | null;
  deleted?: boolean;
};

const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Cliente existente (por CPF/CNPJ) ou criado agora. */
export async function garantirCliente(chave: string, ambiente: 1 | 2, p: { nome: string; documento: string; email: string | null; telefone: string | null; cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; externalReference: string; notificarPeloAsaas: boolean }): Promise<string> {
  const doc = dig(p.documento);
  const lista = await chamarAsaas<{ data?: ClienteAsaasApi[] }>(chave, ambiente, `/customers?cpfCnpj=${doc}&limit=1`);
  if (lista.data?.[0]?.id) return lista.data[0].id;
  const criado = await chamarAsaas<ClienteAsaasApi>(chave, ambiente, "/customers", {
    metodo: "POST",
    corpo: {
      name: p.nome.slice(0, 100),
      cpfCnpj: doc,
      email: p.email || undefined,
      mobilePhone: dig(p.telefone).length >= 10 ? dig(p.telefone) : undefined,
      postalCode: dig(p.cep).length === 8 ? dig(p.cep) : undefined,
      address: p.logradouro || undefined,
      addressNumber: p.numero || undefined,
      complement: p.complemento || undefined,
      province: p.bairro || undefined,
      externalReference: p.externalReference,
      notificationDisabled: !p.notificarPeloAsaas,
    },
  });
  return criado.id;
}

export async function criarPagamento(chave: string, ambiente: 1 | 2, p: { customer: string; billingType: "BOLETO" | "PIX" | "UNDEFINED"; value: number; dueDate: string; description: string; externalReference: string; multaPercentual: number; jurosMensal: number }): Promise<PagamentoAsaas> {
  return chamarAsaas<PagamentoAsaas>(chave, ambiente, "/payments", {
    metodo: "POST",
    corpo: {
      customer: p.customer,
      billingType: p.billingType,
      value: p.value,
      dueDate: p.dueDate,
      description: p.description.slice(0, 500),
      externalReference: p.externalReference,
      ...(p.multaPercentual > 0 ? { fine: { value: p.multaPercentual, type: "PERCENTAGE" } } : {}),
      ...(p.jurosMensal > 0 ? { interest: { value: p.jurosMensal } } : {}),
    },
  });
}

export const consultarPagamento = (chave: string, ambiente: 1 | 2, id: string) => chamarAsaas<PagamentoAsaas>(chave, ambiente, `/payments/${id}`);
export const linhaDigitavel = (chave: string, ambiente: 1 | 2, id: string) => chamarAsaas<{ identificationField?: string; nossoNumero?: string; barCode?: string }>(chave, ambiente, `/payments/${id}/identificationField`);
export const pixQrCode = (chave: string, ambiente: 1 | 2, id: string) => chamarAsaas<{ encodedImage?: string; payload?: string; expirationDate?: string }>(chave, ambiente, `/payments/${id}/pixQrCode`);
export const excluirPagamento = (chave: string, ambiente: 1 | 2, id: string) => chamarAsaas<{ deleted: boolean; id: string }>(chave, ambiente, `/payments/${id}`, { metodo: "DELETE" });
export const receberEmDinheiro = (chave: string, ambiente: 1 | 2, id: string, p: { paymentDate: string; value: number }) => chamarAsaas<PagamentoAsaas>(chave, ambiente, `/payments/${id}/receiveInCash`, { metodo: "POST", corpo: { ...p, notifyCustomer: false } });

/** Testa a chave: lista um cliente. */
export async function testarChave(chave: string, ambiente: 1 | 2) {
  await chamarAsaas<{ data?: unknown[] }>(chave, ambiente, "/customers?limit=1");
}

export const EVENTOS_WEBHOOK = ["PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_RESTORED", "PAYMENT_REFUNDED", "PAYMENT_RECEIVED_IN_CASH_UNDONE", "PAYMENT_BANK_SLIP_CANCELLED"];

export async function registrarWebhook(chave: string, ambiente: 1 | 2, p: { url: string; email: string; authToken: string; webhookId: string | null }): Promise<string> {
  const corpo = { name: "Pro Omie", url: p.url, email: p.email, enabled: true, interrupted: false, apiVersion: 3, authToken: p.authToken, sendType: "SEQUENTIALLY", events: EVENTOS_WEBHOOK };
  if (p.webhookId) {
    try {
      const r = await chamarAsaas<{ id: string }>(chave, ambiente, `/webhooks/${p.webhookId}`, { metodo: "PUT", corpo });
      return r.id ?? p.webhookId;
    } catch (e) {
      if (!(e instanceof ErroAsaas && e.status === 404)) throw e;
    }
  }
  const r = await chamarAsaas<{ id: string }>(chave, ambiente, "/webhooks", { metodo: "POST", corpo });
  return r.id;
}
