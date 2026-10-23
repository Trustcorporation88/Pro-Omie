// Motor Focus NFe (reserva, desligado por padrão). Mesma interface do motor SEFAZ: a Focus consulta a SEFAZ, guarda os
// documentos e o ERP busca as novidades pela "versão" (um número por CNPJ que cresce a cada mudança).
// Endpoints conferidos em doc.focusnfe.com.br (out/2026): GET /v2/{nfes,ctes,nfsens}_recebidas?cnpj=&versao= (até 100 por
// página, cabeçalhos X-Total-Count e X-Max-Version), GET /v2/{tipo}_recebidas/{chave}.xml e
// POST /v2/nfes_recebidas/{chave}/manifesto { tipo, justificativa }.
import "server-only";
import type { MotorCaptacao } from "../motor";
import type { DocumentoCapturado, PaginaCaptura, ResultadoManifestacao, Situacao, TipoDoc, TipoManifestacao } from "../tipos";
import { lerDocumento, serieNumeroDaChave } from "../leitura";
import { dataFiscal, documento } from "../xml";
import { chamarFocus, mensagemFocus } from "./cliente";

const ROTA: Record<TipoDoc, string> = { NFE: "nfes_recebidas", CTE: "ctes_recebidas", NFSE: "nfsens_recebidas" };
const PAGINA_FOCUS = 100;

type ItemFocus = {
  versao?: number | string;
  chave_nfe?: string;
  chave_cte?: string;
  chave_nfse?: string;
  nome_emitente?: string;
  documento_emitente?: string;
  nome_prestador?: string;
  documento_prestador?: string;
  cnpj_destinatario?: string;
  valor_total?: string;
  data_emissao?: string;
  situacao?: string;
  manifestacao_destinatario?: string | null;
  nfe_completa?: boolean;
  numero_carta_correcao?: string;
  carta_correcao?: string;
  data_carta_correcao?: string;
  data_cancelamento?: string;
  justificativa_cancelamento?: string;
  motivo_cancelamento?: string;
};

const MANIFESTO: Record<TipoManifestacao, string> = {
  CIENCIA: "ciencia",
  CONFIRMACAO: "confirmacao",
  DESCONHECIMENTO: "desconhecimento",
  NAO_REALIZADA: "nao_realizada",
};
const DE_MANIFESTO: Record<string, TipoManifestacao> = Object.fromEntries(Object.entries(MANIFESTO).map(([k, v]) => [v, k as TipoManifestacao]));

function situacao(s: string | undefined): Situacao {
  if (/cancel/i.test(s ?? "")) return "CANCELADO";
  if (/deneg/i.test(s ?? "")) return "DENEGADO";
  return "AUTORIZADO";
}

export function criarMotorFocus(ctx: { cnpj: string; ambiente: 1 | 2; token: string }): MotorCaptacao {
  const cnpj = documento(ctx.cnpj);

  async function baixarXml(tipo: TipoDoc, chave: string): Promise<string | null> {
    const r = await chamarFocus(ctx.token, ctx.ambiente, `/v2/${ROTA[tipo]}/${chave}.xml`);
    return r.status === 200 && r.texto.includes("<") ? r.texto : null;
  }

  async function converter(tipo: TipoDoc, item: ItemFocus): Promise<DocumentoCapturado[]> {
    const nsu = String(item.versao ?? "0");
    const chave = documento(item.chave_nfe ?? item.chave_cte ?? item.chave_nfse ?? "");
    const completo = tipo === "NFE" ? item.nfe_completa === true : true;
    const xml = completo ? await baixarXml(tipo, chave) : null;
    const emit = documento(item.documento_emitente ?? item.documento_prestador ?? "");
    const dest = documento(item.cnpj_destinatario ?? "");
    const base: DocumentoCapturado = {
      nsu,
      tipo,
      natureza: xml ? "DOCUMENTO" : "RESUMO",
      chave,
      xml: xml ?? "",
      // resumo da Focus não traz número nem série: na NF-e e no CT-e eles estão na chave
      ...(tipo === "NFSE" ? {} : serieNumeroDaChave(chave)),
      direcao: dest && dest !== cnpj ? "TERCEIRO" : emit === cnpj ? "SAIDA" : "ENTRADA",
      emitenteDocumento: emit || undefined,
      emitenteNome: item.nome_emitente ?? item.nome_prestador,
      destinatarioDocumento: dest || undefined,
      valor: item.valor_total ? Math.round(Number(item.valor_total) * 100) / 100 : undefined,
      emitidoEm: dataFiscal(item.data_emissao),
      situacao: situacao(item.situacao),
      manifestacao: item.manifestacao_destinatario ? (DE_MANIFESTO[item.manifestacao_destinatario] ?? null) : null,
    };
    // Com o XML em mãos, os campos lidos dele valem mais (número, série, IE, protocolo).
    const lido = xml ? lerDocumento(tipo, xml, cnpj, { nsu, tipo, xml }, { chaveAdn: chave }) : null;
    const doc: DocumentoCapturado = lido && !lido.erroLeitura && lido.natureza === "DOCUMENTO" ? { ...base, ...lido, situacao: base.situacao, manifestacao: base.manifestacao } : base;
    const saida = [doc];
    if (item.data_cancelamento)
      saida.push({ nsu, tipo, natureza: "EVENTO", chave, xml: "", evento: { codigo: tipo === "NFSE" ? "101101" : "110111", sequencia: 1, descricao: "Cancelamento", detalhe: item.justificativa_cancelamento ?? item.motivo_cancelamento, ocorridoEm: dataFiscal(item.data_cancelamento) } });
    if (item.carta_correcao)
      saida.push({ nsu, tipo, natureza: "EVENTO", chave, xml: "", evento: { codigo: "110110", sequencia: Number(item.numero_carta_correcao) || 1, descricao: "Carta de correção", detalhe: item.carta_correcao, ocorridoEm: dataFiscal(item.data_carta_correcao) } });
    return saida;
  }

  return {
    motor: "FOCUS",
    esperaSemNovidade: () => 0,
    async consultar(tipo, versao): Promise<PaginaCaptura> {
      const r = await chamarFocus(ctx.token, ctx.ambiente, `/v2/${ROTA[tipo]}?cnpj=${cnpj}&versao=${encodeURIComponent(versao || "0")}`);
      if (r.status !== 200) return { status: "ERR", mensagem: mensagemFocus(r), ultimoNsu: versao, documentos: [], temMais: false };
      let itens: ItemFocus[];
      try {
        itens = JSON.parse(r.texto) as ItemFocus[];
      } catch {
        return { status: "ERR", mensagem: "Resposta da Focus NFe sem JSON", ultimoNsu: versao, documentos: [], temMais: false };
      }
      const documentos: DocumentoCapturado[] = [];
      for (const item of itens) documentos.push(...(await converter(tipo, item)));
      const maior = itens.reduce((m, i) => Math.max(m, Number(i.versao ?? 0) || 0), Number(versao) || 0);
      const maxVersao = Number(r.cabecalhos.get("X-Max-Version")) || maior;
      const total = Number(r.cabecalhos.get("X-Total-Count")) || itens.length;
      return {
        status: itens.length ? "138" : "137",
        mensagem: itens.length ? `${itens.length} documento(s) na Focus NFe` : "Nenhum documento novo na Focus NFe",
        ultimoNsu: String(Math.max(maior, maxVersao)),
        documentos,
        temMais: itens.length >= PAGINA_FOCUS && total > itens.length,
      };
    },
    async manifestar(chave, tipo, justificativa): Promise<ResultadoManifestacao> {
      const r = await chamarFocus(ctx.token, ctx.ambiente, `/v2/nfes_recebidas/${documento(chave)}/manifesto`, {
        metodo: "POST",
        corpo: { tipo: MANIFESTO[tipo], ...(tipo === "NAO_REALIZADA" ? { justificativa } : {}) },
      });
      let j: { status?: string; status_sefaz?: string; mensagem_sefaz?: string; protocolo?: string } = {};
      try {
        j = JSON.parse(r.texto);
      } catch {
        /* sem JSON */
      }
      const status = j.status_sefaz ?? String(r.status);
      if (j.status === "evento_registrado") return { ok: true, status, mensagem: j.mensagem_sefaz ?? "Evento registrado", protocolo: j.protocolo, registradoEm: new Date() };
      if (status === "573") return { ok: true, status, mensagem: j.mensagem_sefaz ?? "Duplicidade de evento", jaExistia: true };
      return { ok: false, status, mensagem: j.mensagem_sefaz ?? mensagemFocus(r) };
    },
    encerrar: () => undefined,
  };
}
