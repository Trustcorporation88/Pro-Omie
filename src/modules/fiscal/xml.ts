// Leitura segura de XML fiscal (SEFAZ, Ambiente Nacional, Focus) e utilitários comuns. Só servidor.
//
// Origem: HUBCLONE (ProContador Office), src/lib/sefaz/xml-seguro.ts e dist-dfe.ts.
// - processEntities desligado: nada de expansão de entidades de DOCTYPE ("billion laughs");
//   as cinco entidades predefinidas são decodificadas à parte, uma vez, sem recursão.
// - parseTagValue desligado: CNPJ com zero à esquerda e chave de 44 dígitos continuam texto exato.
// - docZip descomprimido com teto de 8 MB (zip bomb) e recusado se não for XML.
import "server-only";
import { gunzipSync, inflateRawSync } from "node:zlib";
import { XMLParser, type X2jOptions } from "fast-xml-parser";

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodificarEntidades(texto: string): string {
  if (!texto.includes("&")) return texto;
  return texto.replace(/&(amp|lt|gt|quot|apos);/g, (_, nome: string) => ENTIDADES[nome]!);
}

function decodificarTudo(valor: unknown): unknown {
  if (typeof valor === "string") return decodificarEntidades(valor);
  if (Array.isArray(valor)) return valor.map(decodificarTudo);
  if (valor !== null && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) saida[k] = decodificarTudo(v);
    return saida;
  }
  return valor;
}

const PADRAO: X2jOptions = { ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, trimValues: true };

/** Objeto genérico vindo de XML. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type No = Record<string, any>;

export function lerXml(xml: string, opcoes: X2jOptions = {}): No {
  const parser = new XMLParser({ ...PADRAO, ...opcoes, processEntities: false });
  return decodificarTudo(parser.parse(xml)) as No;
}

/** Texto de um nó (string, número ou { "#text" }). */
export function txt(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && "#text" in (v as No)) return txt((v as No)["#text"]);
  return "";
}

export const opc = (v: unknown): string | undefined => txt(v) || undefined;

export function numero(v: unknown): number | undefined {
  const s = txt(v);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}

/** Sempre um array (o parser devolve objeto quando há um só item). */
export function lista<T = No>(v: unknown): T[] {
  if (v === null || v === undefined || v === "") return [];
  return (Array.isArray(v) ? v : [v]) as T[];
}

export const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
/** CNPJ/CPF normalizado (mantém letras do CNPJ alfanumérico). */
export const documento = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Data fiscal: "2026-10-23T10:00:00-03:00" ou só data (vira meio-dia de Brasília, nunca o dia anterior). */
export function dataFiscal(v: unknown): Date | undefined {
  const s = txt(v);
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00-03:00`);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const nsu15 = (nsu: string | number | null | undefined) => String(nsu ?? "0").replace(/\D/g, "").padStart(15, "0").slice(-15);

const TETO_XML = 8 * 1024 * 1024;

/** Conteúdo do docZip (base64 de gzip). Erro em vez de gravar lixo: o documento não entra e o cursor não avança. */
export function abrirDocZip(b64: string): { xml: string } | { erro: string } {
  const buf = Buffer.from(b64, "base64");
  for (const descomprimir of [gunzipSync, inflateRawSync]) {
    try {
      return { xml: descomprimir(buf, { maxOutputLength: TETO_XML }).toString("utf8") };
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      if (e instanceof RangeError || code === "ERR_BUFFER_TOO_LARGE") return { erro: "XML descomprimido passa do limite de 8 MB" };
    }
  }
  const texto = buf.subarray(0, TETO_XML).toString("utf8").replace(/^\uFEFF/, "");
  if (/^\s*(<\?xml|<[A-Za-z])/.test(texto)) return { xml: texto };
  return { erro: "Conteúdo em formato desconhecido (não é XML nem gzip)" };
}

/** Escapa texto para dentro de um elemento XML (forma canônica: & < > e \r). */
export function escaparTexto(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
}

/** Escapa valor de atributo (forma canônica). */
export function escaparAtributo(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, "&#x9;")
    .replace(/\n/g, "&#xA;")
    .replace(/\r/g, "&#xD;");
}

/**
 * Texto livre no formato aceito pelos schemas da SEFAZ (TString): só caracteres de espaço a ÿ, sem quebra de
 * linha e sem espaço nas pontas. Aspas e travessões "tipográficos" viram os simples; o resto fora da faixa sai.
 */
export function textoSefaz(s: string, max = 255): string {
  return s
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\xFF]/g, "")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}
