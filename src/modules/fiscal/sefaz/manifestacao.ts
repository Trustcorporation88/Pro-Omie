// Manifestação do destinatário da NF-e (ciência, confirmação, desconhecimento, operação não realizada). Só servidor.
// Evento enviado ao Ambiente Nacional (cOrgao 91) pelo NFeRecepcaoEvento4, assinado com o A1 da empresa.
// URLs oficiais (portal da SEFAZ-SP, seção Ambiente Nacional): www.nfe.fazenda.gov.br e hom.nfe.fazenda.gov.br.
import "server-only";
import type https from "node:https";
import type { ResultadoManifestacao, TipoManifestacao } from "../tipos";
import { EVENTO_MANIFESTACAO } from "../tipos";
import { dataFiscal, documento, escaparTexto, lerXml, lista, opc, textoSefaz, txt, type No } from "../xml";
import { assinarElemento } from "./assinatura";
import { requisitar, type MaterialTls } from "./conexao";

export const URL_EVENTO_AN: Record<1 | 2, string> = {
  1: "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  2: "https://hom.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
};

const NS = "http://www.portalfiscal.inf.br/nfe";
const ACTION = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento";

/** "2026-10-23T10:15:30-03:00" (horário de Brasília; o Brasil não tem horário de verão desde 2019). */
export function dataHoraBrasilia(d: Date): string {
  const sp = new Date(d.getTime() - 3 * 3_600_000);
  return sp.toISOString().slice(0, 19) + "-03:00";
}

export function idEvento(codigo: string, chave: string, sequencia = 1): string {
  return `ID${codigo}${chave}${String(sequencia).padStart(2, "0")}`;
}

/** Monta o `<evento>` sem assinatura (exportado para os testes). */
export function montarEvento(opcoes: { chave: string; cnpj: string; tipo: TipoManifestacao; justificativa?: string; ambiente: 1 | 2; quando: Date }): {
  xml: string;
  id: string;
} {
  const { codigo, descricao } = EVENTO_MANIFESTACAO[opcoes.tipo];
  const chave = documento(opcoes.chave);
  if (!/^[0-9A-Z]{44}$/.test(chave)) throw new Error("Chave de acesso inválida para manifestação");
  const id = idEvento(codigo, chave, 1);
  let det = `<descEvento>${descricao}</descEvento>`;
  if (opcoes.tipo === "NAO_REALIZADA") {
    const just = textoSefaz(opcoes.justificativa ?? "");
    if (just.length < 15) throw new Error("A justificativa precisa ter pelo menos 15 caracteres");
    det += `<xJust>${escaparTexto(just)}</xJust>`;
  }
  const xml =
    `<evento xmlns="${NS}" versao="1.00"><infEvento Id="${id}">` +
    `<cOrgao>91</cOrgao><tpAmb>${opcoes.ambiente}</tpAmb><CNPJ>${documento(opcoes.cnpj)}</CNPJ><chNFe>${chave}</chNFe>` +
    `<dhEvento>${dataHoraBrasilia(opcoes.quando)}</dhEvento><tpEvento>${codigo}</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00">${det}</detEvento></infEvento></evento>`;
  return { xml, id };
}

export function assinarEvento(xml: string, id: string, m: MaterialTls): string {
  return assinarElemento(xml, { tag: "infEvento", id, namespaceHerdado: NS, chavePem: m.chavePem, certificadoBase64: m.certificadoBase64 });
}

function envelope(eventoAssinado: string): string {
  const lote = String(Date.now()).slice(-15);
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">` +
    `<envEvento xmlns="${NS}" versao="1.00"><idLote>${lote}</idLote>${eventoAssinado}</envEvento>` +
    `</nfeDadosMsg></soap12:Body></soap12:Envelope>`
  );
}

function acharRetorno(obj: unknown): No | null {
  if (!obj || typeof obj !== "object") return null;
  if ("retEnvEvento" in (obj as No)) return (obj as No).retEnvEvento as No;
  for (const v of Object.values(obj as No)) {
    const achado = acharRetorno(v);
    if (achado) return achado;
  }
  return null;
}

/** Lê o retorno do lote de eventos (exportado para os testes). */
export function lerRetornoEvento(soapXml: string): ResultadoManifestacao {
  const ret = acharRetorno(lerXml(soapXml, { isArray: (n) => n === "retEvento" }));
  if (!ret) {
    const falha = soapXml.match(/<(?:\w+:)?Text[^>]*>([^<]+)</)?.[1];
    return { ok: false, status: "999", mensagem: falha ? `SEFAZ: ${falha}` : "Resposta da SEFAZ sem retEnvEvento" };
  }
  const lote = txt(ret.cStat);
  const inf = lista<No>(ret.retEvento)[0]?.infEvento as No | undefined;
  if (lote !== "128" || !inf) return { ok: false, status: lote || "999", mensagem: txt(ret.xMotivo) || "Lote de evento não processado" };
  const status = txt(inf.cStat);
  const mensagem = txt(inf.xMotivo);
  if (status === "135" || status === "136") return { ok: true, status, mensagem, protocolo: opc(inf.nProt), registradoEm: dataFiscal(inf.dhRegEvento) };
  if (status === "573") return { ok: true, status, mensagem, jaExistia: true };
  return { ok: false, status, mensagem };
}

export async function enviarManifestacao(
  agente: https.Agent,
  material: MaterialTls,
  opcoes: { chave: string; cnpj: string; tipo: TipoManifestacao; justificativa?: string; ambiente: 1 | 2 },
): Promise<ResultadoManifestacao> {
  // 30 s antes de agora: relógio do servidor um pouco adiantado não pode gerar "evento no futuro".
  const { xml, id } = montarEvento({ ...opcoes, quando: new Date(Date.now() - 30_000) });
  const corpo = envelope(assinarEvento(xml, id, material));
  const r = await requisitar(agente, URL_EVENTO_AN[opcoes.ambiente], {
    metodo: "POST",
    corpo,
    cabecalhos: { "Content-Type": `application/soap+xml; charset=utf-8; action="${ACTION}"` },
  });
  if (r.status < 200 || r.status >= 300) {
    const lido = r.texto.includes("retEnvEvento") ? lerRetornoEvento(r.texto) : null;
    if (lido) return lido;
    return { ok: false, status: "ERR", mensagem: `SEFAZ respondeu HTTP ${r.status}` };
  }
  return lerRetornoEvento(r.texto);
}
