import "server-only";
import { soDigitos } from "@/lib/format";

/**
 * Consultas de CNPJ e CEP feitas pelo servidor.
 *
 * CNPJ, em ordem:
 *  1. Fonte paga com a chave CNPJ_API_KEY (dados completos: Simples/MEI e inscrição estadual):
 *     - CNPJ Trust (cnpj.trustcorp.com.br), chave no cabeçalho x-access-key; ou
 *     - CNPJá comercial (api.cnpja.com), chave no cabeçalho Authorization.
 *     O provedor sai do formato da chave (a da CNPJá tem 73 caracteres: dois UUIDs) ou de CNPJ_API_PROVEDOR.
 *     A chave só é enviada ao provedor dela: nunca às fontes gratuitas.
 *  2. CNPJá pública (gratuita, 5 consultas por minuto por IP).
 *  3. BrasilAPI (gratuita; recusa pedidos vindos de alguns provedores de nuvem).
 */

export type DadosCnpj = {
  razaoSocial: string;
  nomeFantasia: string;
  cnae: string;
  email: string;
  telefone: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  codigoMunicipio: string;
  situacao: string;
  regimeSugerido: "MEI" | "SIMPLES_NACIONAL" | null;
  /** Inscrição estadual ativa na UF do endereço. Só as fontes pagas trazem. */
  inscricaoEstadual: string;
  /** true: tem IE ativa; false: a fonte consultou e não há IE ativa; null: a fonte não informa. */
  contribuinteIcms: boolean | null;
  /** Fonte dos dados, para mostrar ao usuário. */
  fonte: string;
};

export type ResultadoCnpj = { ok: true; dados: DadosCnpj } | { ok: false; motivo: string };

export type DadosCep = {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  codigoMunicipio: string;
};

type Obj = Record<string, unknown>;

const TIMEOUT_MS = 12_000;
const PARAMETROS_COMPLETOS = "simples=true&registrations=ORIGIN";

const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const lista = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x): x is Obj => !!x && typeof x === "object") : []);
const semBarra = (u: string) => u.replace(/\/+$/, "");

const urlCnpjTrust = () => semBarra(process.env.CNPJ_API_URL || "https://cnpj.trustcorp.com.br");
const urlCnpja = () => semBarra(process.env.CNPJA_API_URL || "https://api.cnpja.com");
const urlCnpjaPublica = () => semBarra(process.env.CNPJA_OPEN_URL || "https://open.cnpja.com");
const urlBrasilApi = () => semBarra(process.env.BRASILAPI_URL || "https://brasilapi.com.br");

/** Chave da CNPJá: 73 caracteres (dois UUIDs unidos por hífen). */
export function ehChaveCnpja(chave: string): boolean {
  return chave.length === 73 && /^[0-9a-f-]+$/i.test(chave);
}

// Cache curto por instância: evita gastar crédito quando o usuário clica duas vezes.
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { em: number; dados: DadosCnpj }>();

// ───────────────────────── mapeamentos ─────────────────────────

/** Formato da CNPJá (comercial, pública e o repassado pelo CNPJ Trust). */
export function mapearCnpja(j: Obj, fonte: string): DadosCnpj {
  const empresa = obj(j.company);
  const endereco = obj(j.address);
  const telefone = lista(j.phones)[0];
  const email = lista(j.emails)[0];
  const uf = texto(endereco.state).toUpperCase();
  const consultouInscricoes = Array.isArray(j.registrations);
  const ativas = lista(j.registrations).filter((r) => r.enabled === true);
  const ie = ativas.find((r) => texto(r.state).toUpperCase() === uf) ?? ativas[0];
  return {
    razaoSocial: texto(empresa.name),
    nomeFantasia: texto(j.alias),
    cnae: texto(obj(j.mainActivity).id),
    email: texto(email?.address).toLowerCase(),
    telefone: telefone ? soDigitos(`${texto(telefone.area)}${texto(telefone.number)}`) : "",
    cep: soDigitos(texto(endereco.zip)),
    logradouro: texto(endereco.street),
    numero: texto(endereco.number),
    complemento: texto(endereco.details),
    bairro: texto(endereco.district),
    cidade: texto(endereco.city),
    uf,
    codigoMunicipio: texto(endereco.municipality),
    situacao: texto(obj(j.status).text),
    regimeSugerido:
      obj(empresa.simei).optant === true ? "MEI" : obj(empresa.simples).optant === true ? "SIMPLES_NACIONAL" : null,
    inscricaoEstadual: ie ? texto(ie.number).replace(/[.\-/\s]/g, "") : "",
    contribuinteIcms: consultouInscricoes ? ativas.length > 0 : null,
    fonte,
  };
}

function mapearBrasilApi(j: Obj): DadosCnpj {
  return {
    razaoSocial: texto(j.razao_social),
    nomeFantasia: texto(j.nome_fantasia),
    cnae: texto(j.cnae_fiscal),
    email: texto(j.email).toLowerCase(),
    telefone: soDigitos(texto(j.ddd_telefone_1)),
    cep: soDigitos(texto(j.cep)),
    logradouro: [texto(j.descricao_tipo_de_logradouro), texto(j.logradouro)].filter(Boolean).join(" "),
    numero: texto(j.numero),
    complemento: texto(j.complemento),
    bairro: texto(j.bairro),
    cidade: texto(j.municipio),
    uf: texto(j.uf).toUpperCase(),
    codigoMunicipio: texto(j.codigo_municipio_ibge),
    situacao: texto(j.descricao_situacao_cadastral),
    regimeSugerido: j.opcao_pelo_mei ? "MEI" : j.opcao_pelo_simples ? "SIMPLES_NACIONAL" : null,
    inscricaoEstadual: "",
    contribuinteIcms: null,
    fonte: "BrasilAPI (Receita Federal)",
  };
}

// ───────────────────────── chamadas ─────────────────────────

type Tentativa = { dados: DadosCnpj } | { falha: string; naoEncontrado?: boolean };

async function pedir(url: string, cabecalhos: Record<string, string>) {
  const r = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "ProOmie-ERP/1.0", ...cabecalhos },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const corpo = await r.text();
  let json: Obj | null = null;
  try {
    const p: unknown = JSON.parse(corpo);
    json = p && typeof p === "object" && !Array.isArray(p) ? (p as Obj) : null;
  } catch {
    json = null; // HTML de erro, página de bloqueio etc.
  }
  return { status: r.status, json };
}

async function tentar(
  nome: string,
  url: string,
  cabecalhos: Record<string, string>,
  mapear: (j: Obj) => DadosCnpj | null,
  comChave = false,
): Promise<Tentativa> {
  try {
    const { status, json } = await pedir(url, cabecalhos);
    const mensagem = texto(json?.error) || texto(json?.message);
    if (status === 200 && json) {
      const dados = mapear(json);
      if (dados?.razaoSocial) return { dados };
      return { falha: `${nome}: resposta sem dados` };
    }
    if (status === 404 || /não encontrado|not found/i.test(mensagem)) return { falha: `${nome}: CNPJ não encontrado`, naoEncontrado: true };
    if (status === 401 || status === 403) {
      return { falha: comChave ? `${nome}: chave recusada` : `${nome}: recusou a consulta (HTTP ${status})` };
    }
    if (status === 402 || /crédito|credit/i.test(mensagem)) return { falha: `${nome}: créditos esgotados` };
    if (status === 429 || /limite/i.test(mensagem)) return { falha: `${nome}: limite de consultas por minuto` };
    return { falha: `${nome}: ${mensagem || `HTTP ${status}`}` };
  } catch (e) {
    const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { falha: `${nome}: ${tempo ? "não respondeu a tempo" : "sem conexão"}` };
  }
}

const temRazao = (n: string) => (j: Obj) => (j.company || j.taxId ? mapearCnpja(j, n) : null);

async function consultarComChave(cnpj: string, chave: string): Promise<Tentativa> {
  const forcado = texto(process.env.CNPJ_API_PROVEDOR).toLowerCase();
  const provedor = forcado || (ehChaveCnpja(chave) ? "cnpja" : "cnpj-trust");
  if (provedor === "cnpja") {
    return tentar("CNPJá", `${urlCnpja()}/office/${cnpj}?${PARAMETROS_COMPLETOS}`, { Authorization: chave }, temRazao("CNPJá"), true);
  }
  return tentar(
    "CNPJ Trust",
    `${urlCnpjTrust()}/api/cnpja/office?cnpj=${cnpj}&${PARAMETROS_COMPLETOS}`,
    { "x-access-key": chave },
    temRazao("CNPJ Trust (CNPJá)"),
    true,
  );
}

/** Consulta de CNPJ com fonte paga (se configurada) e reservas gratuitas. */
export async function buscarCnpj(cnpj: string): Promise<ResultadoCnpj> {
  const d = soDigitos(cnpj);
  if (d.length !== 14) return { ok: false, motivo: "CNPJ inválido." };

  const emCache = cache.get(d);
  if (emCache && Date.now() - emCache.em < CACHE_MS) return { ok: true, dados: emCache.dados };

  const falhas: string[] = [];
  let naoEncontrado = false;
  const registrar = (t: Tentativa) => {
    if ("dados" in t) return t.dados;
    falhas.push(t.falha);
    naoEncontrado ||= Boolean(t.naoEncontrado);
    console.warn(`[cnpj] ${t.falha}`);
    return null;
  };

  const chave = texto(process.env.CNPJ_API_KEY);
  const dados =
    (chave ? registrar(await consultarComChave(d, chave)) : null) ??
    registrar(await tentar("CNPJá pública", `${urlCnpjaPublica()}/office/${d}`, {}, temRazao("CNPJá pública"))) ??
    registrar(await tentar("BrasilAPI", `${urlBrasilApi()}/api/cnpj/v1/${d}`, {}, (j) => (j.razao_social ? mapearBrasilApi(j) : null)));

  if (dados) {
    cache.set(d, { em: Date.now(), dados });
    return { ok: true, dados };
  }
  if (naoEncontrado && falhas.every((f) => /não encontrado|limite|não respondeu|sem conexão|HTTP 5/.test(f))) {
    return { ok: false, motivo: "CNPJ não encontrado na Receita Federal." };
  }
  return {
    ok: false,
    motivo: `Não foi possível consultar o CNPJ agora (${falhas.join("; ")}). Preencha à mão ou tente de novo em instantes.`,
  };
}

/** Consulta de CEP (ViaCEP). */
export async function buscarCep(cep: string): Promise<DadosCep | null> {
  const d = soDigitos(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as Obj;
    if (j.erro) return null;
    return {
      logradouro: texto(j.logradouro),
      bairro: texto(j.bairro),
      cidade: texto(j.localidade),
      uf: texto(j.uf),
      codigoMunicipio: texto(j.ibge),
    };
  } catch {
    return null;
  }
}
