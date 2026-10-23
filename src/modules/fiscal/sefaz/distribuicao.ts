// Distribuição de DF-e de interesse (NF-e e CT-e) pelo Ambiente Nacional da SEFAZ. Só servidor.
// Base: HUBCLONE (src/lib/sefaz/dist-dfe.ts e cte-dist-dfe.ts): SOAP 1.2 com a action no Content-Type (o ASMX responde
// 404 sem ela), SOAP 1.1 como reserva, lote de até 50 documentos, paginação por ultNSU até alcançar maxNSU.
import "server-only";
import type https from "node:https";
import type { DocumentoCapturado, PaginaCaptura } from "../tipos";
import { lerCte, lerNfe } from "../leitura";
import { abrirDocZip, documento, lerXml, nsu15, txt, type No } from "../xml";
import { requisitar } from "./conexao";

type TipoDist = "NFE" | "CTE";

export const URL_DISTRIBUICAO: Record<TipoDist, Record<1 | 2, string>> = {
  NFE: {
    1: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    2: "https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  },
  CTE: {
    1: "https://www1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx",
    2: "https://hom1.cte.fazenda.gov.br/CTeDistribuicaoDFe/CTeDistribuicaoDFe.asmx",
  },
};

const CONFIG = {
  NFE: { ns: "http://www.portalfiscal.inf.br/nfe", versao: "1.01", op: "nfeDistDFeInteresse", msg: "nfeDadosMsg", wsdl: "NFeDistribuicaoDFe" },
  CTE: { ns: "http://www.portalfiscal.inf.br/cte", versao: "1.00", op: "cteDistDFeInteresse", msg: "cteDadosMsg", wsdl: "CTeDistribuicaoDFe" },
} as const;

export function montarPedido(tipo: TipoDist, cnpj: string, cUF: string, ambiente: 1 | 2, ultNsu: string): string {
  const c = CONFIG[tipo];
  // cUFAutor é opcional no schema, mas só aceita UF real (11 a 53; 91 é recusado com 215). Sem UF cadastrada, vai sem.
  const uf = /^[1-5]\d$/.test(cUF) ? `<cUFAutor>${cUF}</cUFAutor>` : "";
  return (
    `<distDFeInt xmlns="${c.ns}" versao="${c.versao}">` +
    `<tpAmb>${ambiente}</tpAmb>${uf}<CNPJ>${documento(cnpj)}</CNPJ>` +
    `<distNSU><ultNSU>${nsu15(ultNsu)}</ultNSU></distNSU></distDFeInt>`
  );
}

function envelope(tipo: TipoDist, pedido: string, soap: "1.2" | "1.1"): { corpo: string; cabecalhos: Record<string, string> } {
  const c = CONFIG[tipo];
  const action = `${c.ns}/wsdl/${c.wsdl}/${c.op}`;
  const prefixo = soap === "1.2" ? "soap12" : "soap";
  const nsEnv = soap === "1.2" ? "http://www.w3.org/2003/05/soap-envelope" : "http://schemas.xmlsoap.org/soap/envelope/";
  const corpo =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<${prefixo}:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:${prefixo}="${nsEnv}">` +
    `<${prefixo}:Body><${c.op} xmlns="${c.ns}/wsdl/${c.wsdl}"><${c.msg}>${pedido}</${c.msg}></${c.op}></${prefixo}:Body></${prefixo}:Envelope>`;
  const cabecalhos: Record<string, string> =
    soap === "1.2"
      ? { "Content-Type": `application/soap+xml; charset=utf-8; action="${action}"` }
      : { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${action}"` };
  return { corpo, cabecalhos };
}

function acharRetorno(obj: unknown): No | null {
  if (!obj || typeof obj !== "object") return null;
  if ("retDistDFeInt" in (obj as No)) return (obj as No).retDistDFeInt as No;
  for (const v of Object.values(obj as No)) {
    const achado = acharRetorno(v);
    if (achado) return achado;
  }
  return null;
}

/** Lê a resposta SOAP do DistDFe (exportada para os testes). */
export function lerRetornoDistribuicao(tipo: TipoDist, soapXml: string, cnpj: string): PaginaCaptura {
  const ret = acharRetorno(lerXml(soapXml, { isArray: (nome) => nome === "docZip" }));
  if (!ret) return { status: "999", mensagem: "Resposta da SEFAZ sem retDistDFeInt", ultimoNsu: "0", documentos: [], temMais: false };
  const status = txt(ret.cStat) || "999";
  const ultimoNsu = nsu15(txt(ret.ultNSU));
  const maxNsu = nsu15(txt(ret.maxNSU) || ultimoNsu);
  const documentos: DocumentoCapturado[] = [];
  for (const z of (ret.loteDistDFeInt?.docZip ?? []) as unknown[]) {
    const item = (typeof z === "string" ? { "#text": z } : z) as No;
    const b64 = txt(item["#text"]);
    if (b64.length < 8) continue;
    const nsu = nsu15(txt(item["@_NSU"]));
    const schema = txt(item["@_schema"]);
    const aberto = abrirDocZip(b64);
    const base = { nsu, tipo, xml: "" as string };
    if ("erro" in aberto) {
      documentos.push({ ...base, natureza: "OUTRO", chave: "", erroLeitura: aberto.erro });
      continue;
    }
    const lido = tipo === "NFE" ? lerNfe(aberto.xml, cnpj, { ...base, xml: aberto.xml }, schema) : lerCte(aberto.xml, cnpj, { ...base, xml: aberto.xml }, schema);
    documentos.push(lido);
  }
  return {
    status,
    mensagem: txt(ret.xMotivo),
    ultimoNsu,
    maxNsu,
    documentos,
    temMais: status === "138" && Number(ultimoNsu) < Number(maxNsu),
  };
}

export async function consultarDistribuicao(
  agente: https.Agent,
  tipo: TipoDist,
  opcoes: { cnpj: string; cUF: string; ambiente: 1 | 2; ultNsu: string },
): Promise<PaginaCaptura> {
  const url = URL_DISTRIBUICAO[tipo][opcoes.ambiente];
  const pedido = montarPedido(tipo, opcoes.cnpj, opcoes.cUF, opcoes.ambiente, opcoes.ultNsu);
  let ultimo = { status: 0, texto: "" };
  for (const soap of ["1.2", "1.1"] as const) {
    const { corpo, cabecalhos } = envelope(tipo, pedido, soap);
    ultimo = await requisitar(agente, url, { metodo: "POST", corpo, cabecalhos });
    if (ultimo.status >= 200 && ultimo.status < 300) return lerRetornoDistribuicao(tipo, ultimo.texto, opcoes.cnpj);
    if (ultimo.status !== 404 && ultimo.status !== 415) break;
  }
  throw new Error(`SEFAZ respondeu HTTP ${ultimo.status}: ${ultimo.texto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 200)}`);
}
