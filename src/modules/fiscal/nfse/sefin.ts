// Cliente da API do emissor nacional da NFS-e (Sefin Nacional) e do ADN (parâmetros municipais). Só servidor.
// Conferido na documentação técnica (gov.br/nfse, out/2026): JSON sobre HTTPS com certificado de cliente (mTLS);
// XML UTF-8 assinado → gzip → base64. POST /nfse {dpsXmlGZipB64} responde 201 com a NFS-e; erros vêm em erros[].
import "server-only";
import type https from "node:https";
import { gzipSync, gunzipSync } from "node:zlib";
import { lerXml, txt, type No } from "../xml";
import { requisitar } from "../sefaz/conexao";
import { ErroTransporte } from "../nfe/sefaz";

export const SEFIN: Record<1 | 2, string> = { 1: "https://sefin.nfse.gov.br/SefinNacional", 2: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional" };
export const ADN: Record<1 | 2, string> = { 1: "https://adn.nfse.gov.br", 2: "https://adn.producaorestrita.nfse.gov.br" };

export const comprimir = (xml: string) => gzipSync(Buffer.from(xml, "utf8")).toString("base64");
export function descomprimir(b64: string): string {
  return gunzipSync(Buffer.from(b64, "base64")).toString("utf8");
}

export type ErroSefin = { codigo: string; descricao: string; complemento?: string };

/** Lê o JSON do emissor nacional sem depender de maiúsculas e minúsculas nas chaves (há respostas com "Erros"/"Codigo"). */
function campo(obj: Record<string, unknown> | null | undefined, nome: string): unknown {
  if (!obj) return undefined;
  const chave = Object.keys(obj).find((k) => k.toLowerCase() === nome.toLowerCase());
  return chave ? obj[chave] : undefined;
}
function lerErros(json: Record<string, unknown> | null): ErroSefin[] {
  const lista = campo(json, "erros") ?? campo(json, "erro");
  const itens = Array.isArray(lista) ? lista : lista && typeof lista === "object" ? [lista] : [];
  return itens.map((e) => {
    const o = e as Record<string, unknown>;
    return { codigo: String(campo(o, "codigo") ?? ""), descricao: String(campo(o, "descricao") ?? campo(o, "mensagem") ?? ""), complemento: campo(o, "complemento") ? String(campo(o, "complemento")) : undefined };
  });
}
function json(texto: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(texto);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
export const mensagemErros = (erros: ErroSefin[]) => erros.map((e) => `${e.codigo} ${e.descricao}${e.complemento ? ` (${e.complemento})` : ""}`.trim()).join("; ");

async function chamar(agente: https.Agent, url: string, metodo: "GET" | "POST", corpo?: unknown) {
  let r;
  try {
    r = await requisitar(agente, url, {
      metodo,
      corpo: corpo === undefined ? undefined : JSON.stringify(corpo),
      cabecalhos: { Accept: "application/json", ...(corpo === undefined ? {} : { "Content-Type": "application/json" }) },
      timeoutMs: 60_000,
    });
  } catch (e) {
    throw new ErroTransporte(e instanceof Error ? e.message : String(e));
  }
  if (r.status >= 500 && !json(r.texto)) throw new ErroTransporte(`Emissor nacional respondeu HTTP ${r.status}`);
  return r;
}

/** NFS-e lida do XML devolvido pelo emissor nacional. */
export type NfseLida = { chave: string; numero: string; cStat: string; processadaEm: Date | null; valorLiquido: number | null; xmlNfse: string };

export function lerNfse(xmlNfse: string): NfseLida {
  const doc = lerXml(xmlNfse) as No;
  const raiz = doc.NFSe ?? doc;
  const inf = raiz.infNFSe ?? {};
  const id = txt(inf["@_Id"]);
  const dh = txt(inf.dhProc);
  return {
    chave: id.replace(/^NFS/, ""),
    numero: txt(inf.nNFSe),
    cStat: txt(inf.cStat) || "100",
    processadaEm: dh ? new Date(dh) : null,
    valorLiquido: inf.valores?.vLiq !== undefined ? Number(txt(inf.valores.vLiq)) : null,
    xmlNfse,
  };
}

export type ResultadoEmissaoNfse =
  | { situacao: "AUTORIZADA"; nfse: NfseLida; idDps: string; alertas: ErroSefin[] }
  | { situacao: "REJEITADA"; erros: ErroSefin[]; http: number };

/** POST /nfse: emissão síncrona. 201 = NFS-e gerada; 400/422 = DPS recusada; sem resposta = ErroTransporte. */
export async function enviarDps(agente: https.Agent, ambiente: 1 | 2, dpsAssinada: string): Promise<ResultadoEmissaoNfse> {
  const r = await chamar(agente, `${SEFIN[ambiente]}/nfse`, "POST", { dpsXmlGZipB64: comprimir(dpsAssinada) });
  const j = json(r.texto);
  const b64 = campo(j, "nfseXmlGZipB64");
  if ((r.status === 201 || r.status === 200) && typeof b64 === "string" && b64) {
    const xml = descomprimir(b64);
    const nfse = lerNfse(xml);
    const chave = String(campo(j, "chaveAcesso") ?? "") || nfse.chave;
    return { situacao: "AUTORIZADA", nfse: { ...nfse, chave }, idDps: String(campo(j, "idDps") ?? campo(j, "idDPS") ?? ""), alertas: lerErros({ erros: campo(j, "alertas") }) };
  }
  const erros = lerErros(j);
  if (!erros.length) throw new ErroTransporte(`Resposta inesperada do emissor nacional (HTTP ${r.status}): ${r.texto.slice(0, 200)}`);
  return { situacao: "REJEITADA", erros, http: r.status };
}

/** GET /nfse/{chave}: a NFS-e completa, ou null quando não existe. */
export async function consultarNfsePorChave(agente: https.Agent, ambiente: 1 | 2, chave: string): Promise<NfseLida | null> {
  const r = await chamar(agente, `${SEFIN[ambiente]}/nfse/${chave}`, "GET");
  if (r.status === 404) return null;
  const b64 = campo(json(r.texto), "nfseXmlGZipB64");
  if (r.status === 200 && typeof b64 === "string" && b64) return lerNfse(descomprimir(b64));
  const erros = lerErros(json(r.texto));
  throw new ErroTransporte(erros.length ? mensagemErros(erros) : `HTTP ${r.status} na consulta da NFS-e`);
}

/** GET /dps/{idDps}: a chave da NFS-e gerada para a DPS (descobre se um envio sem resposta foi processado), ou null. */
export async function consultarDps(agente: https.Agent, ambiente: 1 | 2, idDps: string): Promise<string | null> {
  const r = await chamar(agente, `${SEFIN[ambiente]}/dps/${idDps}`, "GET");
  if (r.status === 404) return null;
  const chave = campo(json(r.texto), "chaveAcesso");
  if (r.status === 200 && typeof chave === "string" && chave) return chave;
  throw new ErroTransporte(`HTTP ${r.status} na consulta da DPS`);
}

export type ResultadoEvento = { ok: true; xmlEvento: string } | { ok: false; erros: ErroSefin[]; http: number };

/** POST /nfse/{chave}/eventos: registra um evento (cancelamento). */
export async function registrarEvento(agente: https.Agent, ambiente: 1 | 2, chave: string, pedidoAssinado: string): Promise<ResultadoEvento> {
  const r = await chamar(agente, `${SEFIN[ambiente]}/nfse/${chave}/eventos`, "POST", { pedidoRegistroEventoXmlGZipB64: comprimir(pedidoAssinado) });
  const j = json(r.texto);
  const b64 = campo(j, "eventoXmlGZipB64");
  if ((r.status === 201 || r.status === 200) && typeof b64 === "string" && b64) return { ok: true, xmlEvento: descomprimir(b64) };
  const erros = lerErros(j);
  if (!erros.length) throw new ErroTransporte(`Resposta inesperada do emissor nacional (HTTP ${r.status}): ${r.texto.slice(0, 200)}`);
  return { ok: false, erros, http: r.status };
}

/** GET /nfse/{chave}/eventos/101101/1: o evento de cancelamento, se a NFS-e foi cancelada (null se não). */
export async function consultarEventoCancelamento(agente: https.Agent, ambiente: 1 | 2, chave: string): Promise<string | null> {
  const r = await chamar(agente, `${SEFIN[ambiente]}/nfse/${chave}/eventos/101101/1`, "GET");
  if (r.status === 404) return null;
  const b64 = campo(json(r.texto), "eventoXmlGZipB64");
  if (r.status === 200 && typeof b64 === "string" && b64) return descomprimir(b64);
  if (r.status === 200) return null;
  throw new ErroTransporte(`HTTP ${r.status} na consulta do evento`);
}

export type ConvenioMunicipio = { aderenteAmbienteNacional: boolean | null; aderenteEmissorNacional: boolean | null; mensagem: string | null };

/** ADN GET /parametrizacao/{ibge}/convenio: se o município está no Ambiente Nacional e no Emissor Nacional. */
export async function convenioMunicipio(agente: https.Agent, ambiente: 1 | 2, codigoIbge: string): Promise<ConvenioMunicipio> {
  const r = await chamar(agente, `${ADN[ambiente]}/parametrizacao/${codigoIbge}/convenio`, "GET");
  const j = json(r.texto);
  const p = (campo(j, "parametrosConvenio") ?? {}) as Record<string, unknown>;
  const flag = (v: unknown) => (v === undefined || v === null ? null : v === true || v === 1 || v === "1" || v === "true");
  if (r.status !== 200) {
    const erros = lerErros(j);
    return { aderenteAmbienteNacional: null, aderenteEmissorNacional: null, mensagem: erros.length ? mensagemErros(erros) : `HTTP ${r.status}` };
  }
  return { aderenteAmbienteNacional: flag(campo(p, "aderenteAmbienteNacional")), aderenteEmissorNacional: flag(campo(p, "aderenteEmissorNacional")), mensagem: campo(j, "mensagem") ? String(campo(j, "mensagem")) : null };
}
