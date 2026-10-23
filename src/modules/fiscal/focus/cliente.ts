// Cliente HTTP da API Focus NFe (motor reserva). Só servidor.
// Autenticação HTTP Basic: o token é o usuário e a senha fica vazia. Homologação e produção mudam só a URL e o token.
import "server-only";

export const URL_FOCUS: Record<1 | 2, string> = {
  1: "https://api.focusnfe.com.br",
  2: "https://homologacao.focusnfe.com.br",
};

/** Token Master da conta (cadastra empresas pela API). Fica só na Vercel como variável sensível. */
export const tokenMasterFocus = () => process.env.FOCUS_NFE_TOKEN_MASTER?.trim() || null;

export class ErroFocus extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ErroFocus";
  }
}

function destino(url: string): string {
  const sim = process.env.FISCAL_SIMULADOR_URL?.trim();
  if (!sim || process.env.VERCEL) return url;
  const u = new URL(url);
  return `${sim.replace(/\/$/, "")}/${u.host}${u.pathname}${u.search}`;
}

export type RespostaFocus = { status: number; texto: string; cabecalhos: Headers };

export async function chamarFocus(
  token: string,
  ambiente: 1 | 2,
  caminho: string,
  opcoes: { metodo?: "GET" | "POST" | "PUT" | "DELETE"; corpo?: unknown; timeoutMs?: number } = {},
): Promise<RespostaFocus> {
  const r = await fetch(destino(`${URL_FOCUS[ambiente]}${caminho}`), {
    method: opcoes.metodo ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
      Accept: "application/json, application/xml",
      ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(opcoes.timeoutMs ?? 60_000),
  });
  return { status: r.status, texto: await r.text(), cabecalhos: r.headers };
}

/** Mensagem da Focus ({ codigo, mensagem, erros[] }) ou um texto curto. */
export function mensagemFocus(r: RespostaFocus): string {
  if (r.status === 401 || r.status === 403) return "A Focus NFe recusou o token (confira o token e o ambiente).";
  if (r.status === 429) return "Limite de requisições da Focus NFe atingido. A próxima busca tenta de novo.";
  try {
    const j = JSON.parse(r.texto) as { mensagem?: string; erros?: { mensagem?: string; campo?: string }[] };
    const extra = (j.erros ?? []).map((e) => [e.campo, e.mensagem].filter(Boolean).join(": ")).filter(Boolean).join("; ");
    if (j.mensagem || extra) return [j.mensagem, extra].filter(Boolean).join(" — ").slice(0, 300);
  } catch {
    /* corpo não é JSON */
  }
  return `Focus NFe respondeu HTTP ${r.status}`;
}
