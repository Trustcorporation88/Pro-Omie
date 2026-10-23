// Web services da NF-e 4.00: SEFAZ-SP (autorizadora de SP) e SVC-AN (contingência). Só servidor.
// URLs oficiais (portal da SEFAZ-SP e portal nacional; SVC-AN no host sefazvirtual desde 11/02/2025).
// Autorização síncrona (indSinc=1) é obrigatória para lote com uma NF-e (NT 2025.001, rejeição 452 se assíncrona).
import "server-only";
import type https from "node:https";
import { dataFiscal, documento, escaparTexto, lerXml, lista, opc, textoSefaz, txt, type No } from "../xml";
import { assinarElemento } from "../sefaz/assinatura";
import { requisitar, type MaterialTls } from "../sefaz/conexao";
import { dataHoraBrasilia, idEvento } from "../sefaz/manifestacao";
import { NS_NFE } from "./montagem";

export type Servico = "autorizacao" | "retAutorizacao" | "consulta" | "status" | "evento" | "inutilizacao";

const SP = (h: string) => ({
  autorizacao: `https://${h}/ws/nfeautorizacao4.asmx`,
  retAutorizacao: `https://${h}/ws/nferetautorizacao4.asmx`,
  consulta: `https://${h}/ws/nfeconsultaprotocolo4.asmx`,
  status: `https://${h}/ws/nfestatusservico4.asmx`,
  evento: `https://${h}/ws/nferecepcaoevento4.asmx`,
  inutilizacao: `https://${h}/ws/nfeinutilizacao4.asmx`,
});
const SVC = (h: string) => ({
  autorizacao: `https://${h}/NFeAutorizacao4/NFeAutorizacao4.asmx`,
  retAutorizacao: `https://${h}/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx`,
  consulta: `https://${h}/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx`,
  status: `https://${h}/NFeStatusServico4/NFeStatusServico4.asmx`,
  evento: `https://${h}/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx`,
  inutilizacao: `https://${h}/NFeInutilizacao4/NFeInutilizacao4.asmx`,
});

/** Autorizadora por UF. Por enquanto só SP (a First e a MEiSHOP são de SP); outra UF é recusada com mensagem clara. */
export const AUTORIZADORA: Record<string, Record<1 | 2, Record<Servico, string>>> = {
  SP: { 1: SP("nfe.fazenda.sp.gov.br"), 2: SP("homologacao.nfe.fazenda.sp.gov.br") },
};
export const SVC_AN: Record<1 | 2, Record<Servico, string>> = { 1: SVC("www.sefazvirtual.fazenda.gov.br"), 2: SVC("hom.sefazvirtual.fazenda.gov.br") };

export function urlsPara(uf: string, ambiente: 1 | 2, tpEmis: number): Record<Servico, string> {
  if (tpEmis === 6) return SVC_AN[ambiente];
  const a = AUTORIZADORA[uf.toUpperCase()];
  if (!a) throw new Error(`A emissão direta ainda não atende a UF ${uf}. Use o motor Focus NFe ou fale com o suporte.`);
  return a[ambiente];
}

const WSDL: Record<Servico, { ns: string; acao: string }> = {
  autorizacao: { ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4", acao: "nfeAutorizacaoLote" },
  retAutorizacao: { ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4", acao: "nfeRetAutorizacaoLote" },
  consulta: { ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4", acao: "nfeConsultaNF" },
  status: { ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4", acao: "nfeStatusServicoNF" },
  evento: { ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4", acao: "nfeRecepcaoEvento" },
  inutilizacao: { ns: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4", acao: "nfeInutilizacaoNF" },
};

/** Erro de transporte (sem resposta da SEFAZ): a situação da nota é desconhecida e precisa de consulta. */
export class ErroTransporte extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroTransporte";
  }
}

async function chamar(agente: https.Agent, url: string, servico: Servico, corpo: string): Promise<string> {
  const w = WSDL[servico];
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body><nfeDadosMsg xmlns="${w.ns}">${corpo}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
  let r;
  try {
    r = await requisitar(agente, url, { metodo: "POST", corpo: envelope, cabecalhos: { "Content-Type": `application/soap+xml; charset=utf-8; action="${w.ns}/${w.acao}"` }, timeoutMs: 45_000 });
  } catch (e) {
    throw new ErroTransporte(e instanceof Error ? e.message : String(e));
  }
  if (r.status >= 500 && !/<(\w+:)?ret\w+/.test(r.texto)) throw new ErroTransporte(`SEFAZ respondeu HTTP ${r.status}`);
  if (r.status < 200 || r.status >= 300) {
    if (/<(\w+:)?ret\w+/.test(r.texto)) return r.texto;
    throw new ErroTransporte(`SEFAZ respondeu HTTP ${r.status}: ${r.texto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200)}`);
  }
  return r.texto;
}

/** Trecho XML original de um elemento (para montar nfeProc e procEventoNFe sem re-serializar). */
export function trechoXml(texto: string, nome: string): string | null {
  const m = texto.match(new RegExp(`<(?:\\w+:)?${nome}[\\s>][\\s\\S]*?</(?:\\w+:)?${nome}>`));
  if (!m) return null;
  // remove prefixos de namespace eventualmente usados pela resposta (ex.: <nfe:protNFe>)
  return m[0].replace(new RegExp(`<(/?)\\w+:`, "g"), "<$1");
}

function acharNo(obj: unknown, nome: string): No | null {
  if (!obj || typeof obj !== "object") return null;
  if (nome in (obj as No)) return (obj as No)[nome] as No;
  for (const v of Object.values(obj as No)) {
    const achado = acharNo(v, nome);
    if (achado) return achado;
  }
  return null;
}

export type ResultadoAutorizacao = {
  situacao: "AUTORIZADA" | "DENEGADA" | "REJEITADA" | "PROCESSANDO";
  cStat: string;
  xMotivo: string;
  protocolo?: string;
  autorizadaEm?: Date;
  /** trecho <protNFe> para montar o nfeProc */
  protNFe?: string;
  recibo?: string;
};

const AUTORIZADO = new Set(["100", "150"]);
const DENEGADO = new Set(["110", "205", "301", "302", "303"]);

function lerProtNFe(texto: string): ResultadoAutorizacao | null {
  const prot = acharNo(lerXml(texto), "protNFe");
  const inf = prot?.infProt as No | undefined;
  if (!inf) return null;
  const cStat = txt(inf.cStat);
  return {
    situacao: AUTORIZADO.has(cStat) ? "AUTORIZADA" : DENEGADO.has(cStat) ? "DENEGADA" : "REJEITADA",
    cStat,
    xMotivo: txt(inf.xMotivo),
    protocolo: opc(inf.nProt),
    autorizadaEm: dataFiscal(inf.dhRecbto),
    protNFe: AUTORIZADO.has(cStat) || DENEGADO.has(cStat) ? (trechoXml(texto, "protNFe") ?? undefined) : undefined,
  };
}

/** Lê o retEnviNFe (exportado para os testes). */
export function lerRetornoAutorizacao(texto: string): ResultadoAutorizacao {
  const ret = acharNo(lerXml(texto), "retEnviNFe");
  if (!ret) return { situacao: "PROCESSANDO", cStat: "999", xMotivo: "Resposta da SEFAZ sem retEnviNFe" };
  const cStat = txt(ret.cStat);
  if (cStat === "104") return lerProtNFe(texto) ?? { situacao: "PROCESSANDO", cStat, xMotivo: "Lote processado sem protocolo" };
  if (cStat === "103") return { situacao: "PROCESSANDO", cStat, xMotivo: txt(ret.xMotivo), recibo: opc(ret.infRec?.nRec) };
  return { situacao: "REJEITADA", cStat, xMotivo: txt(ret.xMotivo) };
}

export async function autorizar(agente: https.Agent, urls: Record<Servico, string>, nfeAssinada: string): Promise<ResultadoAutorizacao> {
  const lote = String(Date.now()).slice(-15);
  const corpo = `<enviNFe xmlns="${NS_NFE}" versao="4.00"><idLote>${lote}</idLote><indSinc>1</indSinc>${nfeAssinada.replace(/^<\?xml[^>]*>/, "")}</enviNFe>`;
  return lerRetornoAutorizacao(await chamar(agente, urls.autorizacao, "autorizacao", corpo));
}

export async function consultarRecibo(agente: https.Agent, urls: Record<Servico, string>, ambiente: 1 | 2, recibo: string): Promise<ResultadoAutorizacao> {
  const corpo = `<consReciNFe xmlns="${NS_NFE}" versao="4.00"><tpAmb>${ambiente}</tpAmb><nRec>${recibo}</nRec></consReciNFe>`;
  const texto = await chamar(agente, urls.retAutorizacao, "retAutorizacao", corpo);
  const ret = acharNo(lerXml(texto), "retConsReciNFe");
  const cStat = txt(ret?.cStat);
  if (cStat === "105") return { situacao: "PROCESSANDO", cStat, xMotivo: txt(ret?.xMotivo), recibo };
  return lerProtNFe(texto) ?? { situacao: "REJEITADA", cStat: cStat || "999", xMotivo: txt(ret?.xMotivo) || "Recibo sem protocolo" };
}

export type ResultadoConsulta = ResultadoAutorizacao & { cancelada?: { protocolo?: string; em?: Date; procEvento?: string } };

/** Consulta a situação pela chave (recupera nota enviada sem resposta). 217 = a SEFAZ não tem a nota. */
export async function consultarProtocolo(agente: https.Agent, urls: Record<Servico, string>, ambiente: 1 | 2, chave: string): Promise<ResultadoConsulta> {
  const corpo = `<consSitNFe xmlns="${NS_NFE}" versao="4.00"><tpAmb>${ambiente}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${chave}</chNFe></consSitNFe>`;
  const texto = await chamar(agente, urls.consulta, "consulta", corpo);
  const ret = acharNo(lerXml(texto, { isArray: (n) => n === "procEventoNFe" }), "retConsSitNFe");
  const cStat = txt(ret?.cStat);
  const prot = lerProtNFe(texto);
  if (["101", "151", "155"].includes(cStat)) {
    const procs = lista<No>(ret?.procEventoNFe);
    const canc = procs.find((p) => txt(p.evento?.infEvento?.tpEvento) === "110111");
    return {
      ...(prot ?? { situacao: "AUTORIZADA" as const, cStat, xMotivo: txt(ret?.xMotivo) }),
      cStat,
      xMotivo: txt(ret?.xMotivo),
      cancelada: { protocolo: opc(canc?.retEvento?.infEvento?.nProt), em: dataFiscal(canc?.retEvento?.infEvento?.dhRegEvento) },
    };
  }
  if (prot) return { ...prot, cStat: prot.cStat || cStat, xMotivo: prot.xMotivo || txt(ret?.xMotivo) };
  return { situacao: cStat === "217" ? "REJEITADA" : "PROCESSANDO", cStat: cStat || "999", xMotivo: txt(ret?.xMotivo) || "Consulta sem retorno" };
}

export async function statusServico(agente: https.Agent, urls: Record<Servico, string>, ambiente: 1 | 2, cUF: string): Promise<{ cStat: string; xMotivo: string }> {
  const corpo = `<consStatServ xmlns="${NS_NFE}" versao="4.00"><tpAmb>${ambiente}</tpAmb><cUF>${cUF}</cUF><xServ>STATUS</xServ></consStatServ>`;
  const ret = acharNo(lerXml(await chamar(agente, urls.status, "status", corpo)), "retConsStatServ");
  return { cStat: txt(ret?.cStat), xMotivo: txt(ret?.xMotivo) };
}

// ───────────────────────── eventos (cancelamento e carta de correção) ─────────────────────────

export const COND_USO_CCE =
  "A Carta de Correção é disciplinada pelo § 1º-A do art. 7º do Convênio S/N, de 15 de dezembro de 1970 e pode ser utilizada para regularização de erro ocorrido na emissão de documento fiscal, desde que o erro não esteja relacionado com: I - as variáveis que determinam o valor do imposto tais como: base de cálculo, alíquota, diferença de preço, quantidade, valor da operação ou da prestação; II - a correção de dados cadastrais que implique mudança do remetente ou do destinatário; III - a data de emissão ou de saída.";

export type EventoNfe =
  | { tipo: "CANCELAMENTO"; protocolo: string; justificativa: string }
  | { tipo: "CCE"; sequencia: number; correcao: string };

export function montarEventoNfe(p: { evento: EventoNfe; cOrgao: string; ambiente: 1 | 2; cnpj: string; chave: string; quando: Date }): { xml: string; id: string } {
  const codigo = p.evento.tipo === "CANCELAMENTO" ? "110111" : "110110";
  const seq = p.evento.tipo === "CANCELAMENTO" ? 1 : p.evento.sequencia;
  const id = idEvento(codigo, p.chave, seq);
  const det =
    p.evento.tipo === "CANCELAMENTO"
      ? `<descEvento>Cancelamento</descEvento><nProt>${documento(p.evento.protocolo)}</nProt><xJust>${escaparTexto(textoSefaz(p.evento.justificativa, 255))}</xJust>`
      : `<descEvento>Carta de Correcao</descEvento><xCorrecao>${escaparTexto(textoSefaz(p.evento.correcao, 1000))}</xCorrecao><xCondUso>${escaparTexto(COND_USO_CCE)}</xCondUso>`;
  const xml =
    `<evento xmlns="${NS_NFE}" versao="1.00"><infEvento Id="${id}">` +
    `<cOrgao>${p.cOrgao}</cOrgao><tpAmb>${p.ambiente}</tpAmb><CNPJ>${documento(p.cnpj)}</CNPJ><chNFe>${p.chave}</chNFe>` +
    `<dhEvento>${dataHoraBrasilia(p.quando)}</dhEvento><tpEvento>${codigo}</tpEvento><nSeqEvento>${seq}</nSeqEvento><verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00">${det}</detEvento></infEvento></evento>`;
  return { xml, id };
}

export type ResultadoEventoNfe = { ok: boolean; cStat: string; xMotivo: string; protocolo?: string; registradoEm?: Date; procEvento?: string; jaExistia?: boolean };

export function lerRetornoEventoNfe(texto: string, eventoAssinado: string): ResultadoEventoNfe {
  const ret = acharNo(lerXml(texto, { isArray: (n) => n === "retEvento" }), "retEnvEvento");
  if (!ret) return { ok: false, cStat: "999", xMotivo: "Resposta da SEFAZ sem retEnvEvento" };
  const lote = txt(ret.cStat);
  const inf = lista<No>(ret.retEvento)[0]?.infEvento as No | undefined;
  if (lote !== "128" || !inf) return { ok: false, cStat: lote || "999", xMotivo: txt(ret.xMotivo) || "Lote de evento não processado" };
  const cStat = txt(inf.cStat);
  const xMotivo = txt(inf.xMotivo);
  if (["135", "136", "155"].includes(cStat)) {
    const retEvento = trechoXml(texto, "retEvento");
    return {
      ok: true,
      cStat,
      xMotivo,
      protocolo: opc(inf.nProt),
      registradoEm: dataFiscal(inf.dhRegEvento),
      procEvento: retEvento ? `<procEventoNFe xmlns="${NS_NFE}" versao="1.00">${eventoAssinado}${retEvento}</procEventoNFe>` : undefined,
    };
  }
  if (cStat === "573") return { ok: true, cStat, xMotivo, jaExistia: true };
  return { ok: false, cStat, xMotivo };
}

export async function enviarEventoNfe(
  agente: https.Agent,
  material: MaterialTls,
  urls: Record<Servico, string>,
  p: { evento: EventoNfe; cOrgao: string; ambiente: 1 | 2; cnpj: string; chave: string },
): Promise<ResultadoEventoNfe> {
  const { xml, id } = montarEventoNfe({ ...p, quando: new Date(Date.now() - 30_000) });
  const assinado = assinarElemento(xml, { tag: "infEvento", id, namespaceHerdado: NS_NFE, chavePem: material.chavePem, certificadoBase64: material.certificadoBase64 });
  const lote = String(Date.now()).slice(-15);
  const corpo = `<envEvento xmlns="${NS_NFE}" versao="1.00"><idLote>${lote}</idLote>${assinado}</envEvento>`;
  return lerRetornoEventoNfe(await chamar(agente, urls.evento, "evento", corpo), assinado);
}

// ───────────────────────── inutilização ─────────────────────────

export function montarInutilizacao(p: { cUF: string; ambiente: 1 | 2; cnpj: string; ano: number; serie: number; inicio: number; fim: number; justificativa: string }) {
  const ano2 = String(p.ano % 100).padStart(2, "0");
  const cnpj = documento(p.cnpj);
  const id = `ID${p.cUF}${ano2}${cnpj}55${String(p.serie).padStart(3, "0")}${String(p.inicio).padStart(9, "0")}${String(p.fim).padStart(9, "0")}`;
  const xml =
    `<inutNFe xmlns="${NS_NFE}" versao="4.00"><infInut Id="${id}"><tpAmb>${p.ambiente}</tpAmb><xServ>INUTILIZAR</xServ><cUF>${p.cUF}</cUF><ano>${ano2}</ano>` +
    `<CNPJ>${cnpj}</CNPJ><mod>55</mod><serie>${p.serie}</serie><nNFIni>${p.inicio}</nNFIni><nNFFin>${p.fim}</nNFFin><xJust>${escaparTexto(textoSefaz(p.justificativa, 255))}</xJust></infInut></inutNFe>`;
  return { xml, id };
}

export async function inutilizar(
  agente: https.Agent,
  material: MaterialTls,
  urls: Record<Servico, string>,
  p: Parameters<typeof montarInutilizacao>[0],
): Promise<{ ok: boolean; cStat: string; xMotivo: string; protocolo?: string; xml?: string }> {
  const { xml, id } = montarInutilizacao(p);
  const assinado = assinarElemento(xml, { tag: "infInut", id, namespaceHerdado: NS_NFE, chavePem: material.chavePem, certificadoBase64: material.certificadoBase64 });
  const texto = await chamar(agente, urls.inutilizacao, "inutilizacao", assinado);
  const ret = acharNo(lerXml(texto), "retInutNFe");
  const inf = (ret?.infInut ?? {}) as No;
  const cStat = txt(inf.cStat);
  const retInut = trechoXml(texto, "retInutNFe");
  return {
    ok: cStat === "102",
    cStat: cStat || "999",
    xMotivo: txt(inf.xMotivo) || "Resposta sem retInutNFe",
    protocolo: opc(inf.nProt),
    xml: cStat === "102" && retInut ? `<procInutNFe xmlns="${NS_NFE}" versao="4.00">${assinado}${retInut}</procInutNFe>` : undefined,
  };
}

/** nfeProc = NF-e assinada + protocolo de autorização. */
export function montarNfeProc(nfeAssinada: string, protNFe: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${NS_NFE}" versao="4.00">${nfeAssinada.replace(/^<\?xml[^>]*>/, "")}${protNFe}</nfeProc>`;
}
