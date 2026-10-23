// NFS-e padrão nacional: distribuição por NSU no Ambiente de Dados Nacional (ADN), API "Contribuintes". Só servidor.
// Base: HUBCLONE (src/lib/sefaz/nfse-adn.ts). GET {base}/DFe/{ultNSU} com mTLS; o ADN usa 200, 400 e 404 com corpo JSON
// válido (o resultado real vem em StatusProcessamento); lote de até 50 documentos e sem maxNSU (lote cheio = pode haver mais).
// cnpjConsulta (manual do ADN para contribuintes, fev/2026): sem ele, o ADN devolve os documentos do CNPJ do CERTIFICADO;
// com ele, os do CNPJ informado, desde que tenha a mesma raiz do certificado. É o que deixa a filial usar o A1 da matriz
// sem receber as notas da matriz. O mesmo manual pede 1 hora de espera quando não há mais documentos.
import "server-only";
import type https from "node:https";
import type { DocumentoCapturado, PaginaCaptura } from "../tipos";
import { lerNfse } from "../leitura";
import { abrirDocZip, nsu15 } from "../xml";
import { requisitar } from "./conexao";

export const URL_ADN: Record<1 | 2, string> = {
  1: "https://adn.nfse.gov.br/contribuintes",
  2: "https://adn.producaorestrita.nfse.gov.br/contribuintes",
};

export const LOTE_ADN = 50;

type ItemAdn = { NSU?: number | string; ChaveAcesso?: string; TipoDocumento?: string; ArquivoXml?: string };
type RespostaAdn = { StatusProcessamento?: string; LoteDFe?: ItemAdn[]; Erros?: { Codigo?: string; Descricao?: string }[] };

/** Lê a resposta JSON do ADN (exportada para os testes). */
export function lerRetornoAdn(status: number, texto: string, cnpj: string, ultNsu: string): PaginaCaptura {
  if (![200, 400, 404].includes(status)) throw new Error(`Ambiente Nacional da NFS-e respondeu HTTP ${status}: ${texto.slice(0, 200)}`);
  let json: RespostaAdn;
  try {
    json = JSON.parse(texto) as RespostaAdn;
  } catch {
    throw new Error(`Ambiente Nacional da NFS-e respondeu HTTP ${status} sem JSON (rota, proxy ou firewall no caminho).`);
  }
  if (typeof json.StatusProcessamento !== "string") throw new Error(`Ambiente Nacional da NFS-e respondeu HTTP ${status} sem StatusProcessamento.`);
  const inicio = nsu15(ultNsu);
  if (json.StatusProcessamento === "REJEICAO") {
    const motivo = (json.Erros ?? []).map((e) => `${e.Codigo ?? ""} ${e.Descricao ?? ""}`.trim()).filter(Boolean).join("; ");
    return { status: "999", mensagem: motivo || "Rejeição do Ambiente Nacional", ultimoNsu: inicio, documentos: [], temMais: false };
  }
  const lote = json.LoteDFe ?? [];
  const documentos: DocumentoCapturado[] = lote.map((item) => {
    const nsu = nsu15(item.NSU);
    const evento = item.TipoDocumento === "EVENTO";
    const base = { nsu, tipo: "NFSE" as const, xml: "" };
    // Sem o arquivo o documento NÃO entra (nada de XML sintético) e o cursor não passa por cima dele.
    if (!item.ArquivoXml) return { ...base, natureza: "OUTRO" as const, chave: item.ChaveAcesso ?? "", erroLeitura: `NFS-e ${item.ChaveAcesso ?? `NSU ${nsu}`} veio sem o arquivo XML` };
    const aberto = abrirDocZip(item.ArquivoXml);
    if ("erro" in aberto) return { ...base, natureza: "OUTRO" as const, chave: item.ChaveAcesso ?? "", erroLeitura: aberto.erro };
    return lerNfse(aberto.xml, cnpj, { ...base, xml: aberto.xml }, item.ChaveAcesso, evento);
  });
  const maior = lote.reduce((m, i) => Math.max(m, Number(i.NSU ?? 0) || 0), Number(inicio));
  return {
    status: documentos.length ? "138" : "137",
    mensagem: documentos.length ? "Documentos NFS-e localizados" : "Nenhum documento localizado",
    ultimoNsu: nsu15(maior),
    maxNsu: nsu15(maior),
    documentos,
    temMais: lote.length >= LOTE_ADN,
  };
}

export async function consultarAdn(agente: https.Agent, opcoes: { cnpj: string; ambiente: 1 | 2; ultNsu: string }): Promise<PaginaCaptura> {
  const cnpj = opcoes.cnpj.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const url = `${URL_ADN[opcoes.ambiente]}/DFe/${nsu15(opcoes.ultNsu)}?cnpjConsulta=${cnpj}`;
  const r = await requisitar(agente, url, { metodo: "GET", cabecalhos: { Accept: "application/json" } });
  return lerRetornoAdn(r.status, r.texto, opcoes.cnpj, opcoes.ultNsu);
}
