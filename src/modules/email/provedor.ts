// Envio de e-mail pela Resend (https://resend.com/docs/api-reference, out/2026): POST /emails com Bearer; domínio e
// registros DNS por /domains. Dormente até RESEND_API_KEY existir. Só servidor.
import "server-only";

const URL_RESEND = "https://api.resend.com";
export const REMETENTE_PADRAO = "Pro Omie <nao-responda@trustcorp.com.br>";

/** Nome de exibição seguro para o "De:" (sem aspas, <>, vírgulas e quebras de linha). */
export function nomeExibicao(nome: string | null | undefined): string {
  return (nome ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} &'.\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** "Nome <endereço>": com o nome da empresa quando informado; senão o remetente configurado. */
export function remetentePara(nomeRemetente?: string | null): string {
  const { remetente, endereco } = configuracaoEmail();
  const nome = nomeExibicao(nomeRemetente);
  return nome ? `${nome} <${endereco}>` : remetente;
}

export function configuracaoEmail() {
  const chave = process.env.RESEND_API_KEY?.trim() || null;
  const remetente = process.env.EMAIL_REMETENTE?.trim() || REMETENTE_PADRAO;
  const endereco = remetente.match(/<([^>]+)>/)?.[1] ?? remetente;
  const dominio = endereco.split("@")[1] ?? "";
  return { configurado: !!chave, chave, remetente, endereco, dominio };
}

function destino(url: string): string {
  const sim = process.env.FISCAL_SIMULADOR_URL?.trim();
  if (!sim || process.env.VERCEL) return url;
  const u = new URL(url);
  return `${sim.replace(/\/$/, "")}/${u.host}${u.pathname}${u.search}`;
}

async function resend<T>(caminho: string, opcoes: { metodo?: "GET" | "POST"; corpo?: unknown } = {}): Promise<{ status: number; json: T | null; texto: string }> {
  const { chave } = configuracaoEmail();
  if (!chave) throw new Error("E-mail não configurado: falta RESEND_API_KEY.");
  const r = await fetch(destino(`${URL_RESEND}${caminho}`), {
    method: opcoes.metodo ?? "GET",
    headers: { Authorization: `Bearer ${chave}`, Accept: "application/json", ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await r.text();
  let json: T | null = null;
  try {
    json = JSON.parse(texto) as T;
  } catch {
    /* texto puro */
  }
  return { status: r.status, json, texto };
}

export type Anexo = { nome: string; tipo: string; base64: string };

export type MensagemEmail = {
  para: string[];
  copia?: string[];
  responderPara?: string | null;
  /** nome da empresa no "De:" (e-mails para clientes); vazio = remetente configurado */
  nomeRemetente?: string | null;
  assunto: string;
  html: string;
  texto: string;
  anexos?: Anexo[];
};

/** Envia pela Resend. Devolve o id do provedor ou lança erro com a mensagem da API. */
export async function enviarViaResend(m: MensagemEmail): Promise<string> {
  const r = await resend<{ id?: string; message?: string; name?: string }>("/emails", {
    metodo: "POST",
    corpo: {
      from: remetentePara(m.nomeRemetente),
      to: m.para,
      cc: m.copia?.length ? m.copia : undefined,
      reply_to: m.responderPara || undefined,
      subject: m.assunto,
      html: m.html,
      text: m.texto,
      attachments: m.anexos?.map((a) => ({ filename: a.nome, content: a.base64, content_type: a.tipo })),
    },
  });
  if (r.status >= 200 && r.status < 300 && r.json?.id) return r.json.id;
  throw new Error(`Resend respondeu HTTP ${r.status}: ${r.json?.message ?? r.texto.slice(0, 200)}`);
}

export type RegistroDns = { tipo: string; nome: string; valor: string; prioridade?: number | null; status: string; ttl?: string };
export type EstadoDominio = { id: string; nome: string; status: string; registros: RegistroDns[] };

type DominioResend = { id: string; name: string; status: string; records?: { record: string; name: string; type: string; value: string; priority?: number; status: string; ttl?: string }[] };

function mapear(d: DominioResend): EstadoDominio {
  return { id: d.id, nome: d.name, status: d.status, registros: (d.records ?? []).map((r) => ({ tipo: r.type, nome: r.name, valor: r.value, prioridade: r.priority ?? null, status: r.status, ttl: r.ttl })) };
}

/** Garante o domínio do remetente na Resend (cria se faltar) e devolve os registros DNS a criar e a situação. */
export async function garantirDominio(): Promise<EstadoDominio> {
  const { dominio } = configuracaoEmail();
  const lista = await resend<{ data?: DominioResend[] }>("/domains");
  let dom = lista.json?.data?.find((d) => d.name.toLowerCase() === dominio.toLowerCase()) ?? null;
  if (!dom) {
    const criado = await resend<DominioResend & { message?: string }>("/domains", { metodo: "POST", corpo: { name: dominio, region: "sa-east-1" } });
    if (criado.status >= 300 || !criado.json?.id) throw new Error(`Não foi possível cadastrar o domínio na Resend: ${criado.json?.message ?? criado.texto.slice(0, 200)}`);
    dom = criado.json;
  }
  const detalhe = await resend<DominioResend>(`/domains/${dom.id}`);
  return mapear(detalhe.json ?? dom);
}

/** Pede a verificação dos registros DNS do domínio e devolve a situação atual. */
export async function verificarDominio(id: string): Promise<EstadoDominio> {
  await resend(`/domains/${id}/verify`, { metodo: "POST" });
  const detalhe = await resend<DominioResend>(`/domains/${id}`);
  if (!detalhe.json?.id) throw new Error(`Resend respondeu HTTP ${detalhe.status} ao consultar o domínio.`);
  return mapear(detalhe.json);
}
