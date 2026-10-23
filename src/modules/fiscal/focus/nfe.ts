// Emissão de NF-e pela Focus NFe (motor reserva). A Focus monta o XML a partir do JSON e fala com a SEFAZ.
// Conferido em doc.focusnfe.com.br (out/2026): POST /v2/nfe?ref=, GET /v2/nfe/{ref} (status autorizado, erro_autorizacao,
// processando_autorizacao, cancelado), DELETE /v2/nfe/{ref} { justificativa }. Carta de correção:
// POST /v2/nfe/{ref}/carta_correcao { correcao } (endpoint clássico da Focus; conferir ao ativar o motor).
import "server-only";
import type { DadosNfe } from "../nfe/montagem";
import { totais, valorBruto } from "../nfe/montagem";
import { TEXTO_HOMOLOGACAO } from "../nfe/tipos";
import { dataHoraBrasilia } from "../sefaz/manifestacao";
import { chamarFocus, mensagemFocus } from "./cliente";

export type RespostaNfeFocus = {
  status?: string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string;
  serie?: string;
  protocolo?: string;
  caminho_xml_nota_fiscal?: string;
  erros?: { mensagem?: string }[];
};

const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function jsonFocus(d: DadosNfe) {
  const t = totais(d);
  const doc = dig(d.destinatario.documento);
  const interna = d.emitente.endereco.uf === d.destinatario.endereco.uf;
  return {
    natureza_operacao: d.naturezaOperacao,
    data_emissao: dataHoraBrasilia(d.emissao),
    tipo_documento: 1,
    local_destino: interna ? 1 : 2,
    finalidade_emissao: 1,
    consumidor_final: d.destinatario.indIEDest === 9 ? 1 : 0,
    presenca_comprador: 1,
    numero: d.numero,
    serie: d.serie,
    cnpj_emitente: dig(d.emitente.cnpj),
    nome_destinatario: d.ambiente === 2 ? TEXTO_HOMOLOGACAO : d.destinatario.nome,
    ...(doc.length === 11 ? { cpf_destinatario: doc } : { cnpj_destinatario: doc }),
    indicador_inscricao_estadual_destinatario: d.destinatario.indIEDest,
    ...(d.destinatario.indIEDest === 1 ? { inscricao_estadual_destinatario: dig(d.destinatario.ie) } : {}),
    logradouro_destinatario: d.destinatario.endereco.logradouro,
    numero_destinatario: d.destinatario.endereco.numero,
    complemento_destinatario: d.destinatario.endereco.complemento ?? undefined,
    bairro_destinatario: d.destinatario.endereco.bairro,
    municipio_destinatario: d.destinatario.endereco.municipio,
    codigo_municipio_destinatario: d.destinatario.endereco.codigoMunicipio,
    uf_destinatario: d.destinatario.endereco.uf,
    cep_destinatario: dig(d.destinatario.endereco.cep),
    pais_destinatario: "Brasil",
    telefone_destinatario: dig(d.destinatario.endereco.telefone) || undefined,
    email_destinatario: d.destinatario.email ?? undefined,
    valor_produtos: t.vProd,
    valor_desconto: t.vDesc,
    valor_total: t.vNF,
    modalidade_frete: d.modFrete,
    items: d.itens.map((i, k) => ({
      numero_item: k + 1,
      codigo_produto: i.codigo,
      descricao: i.descricao,
      cfop: i.cfop,
      unidade_comercial: i.unidade,
      quantidade_comercial: i.quantidade,
      valor_unitario_comercial: i.valorUnitario,
      valor_bruto: valorBruto(i),
      unidade_tributavel: i.unidade,
      quantidade_tributavel: i.quantidade,
      valor_unitario_tributavel: i.valorUnitario,
      valor_desconto: i.desconto || undefined,
      codigo_ncm: dig(i.ncm),
      inclui_no_total: 1,
      icms_origem: i.origem,
      icms_situacao_tributaria: i.csosn,
      pis_situacao_tributaria: "99",
      cofins_situacao_tributaria: "99",
    })),
    formas_pagamento: d.pagamentos.map((p) => ({ indicador_pagamento: p.indPag, forma_pagamento: p.tPag, valor_pagamento: p.valor })),
    duplicatas: d.cobranca?.duplicatas.map((u) => ({ numero: u.numero, data_vencimento: u.vencimento, valor: u.valor })),
    informacoes_adicionais_contribuinte: d.informacoesComplementares || undefined,
  };
}

export async function emitirNaFocus(token: string, ambiente: 1 | 2, ref: string, d: DadosNfe): Promise<RespostaNfeFocus> {
  const r = await chamarFocus(token, ambiente, `/v2/nfe?ref=${encodeURIComponent(ref)}`, { metodo: "POST", corpo: jsonFocus(d) });
  if (r.status >= 400 && r.status !== 422) return { status: "erro_autorizacao", mensagem_sefaz: mensagemFocus(r) };
  try {
    return JSON.parse(r.texto) as RespostaNfeFocus;
  } catch {
    return { status: "erro_autorizacao", mensagem_sefaz: mensagemFocus(r) };
  }
}

export async function consultarNaFocus(token: string, ambiente: 1 | 2, ref: string): Promise<RespostaNfeFocus> {
  const r = await chamarFocus(token, ambiente, `/v2/nfe/${encodeURIComponent(ref)}?completa=0`);
  if (r.status === 404) return { status: "nao_encontrada", mensagem_sefaz: "A Focus NFe não tem esta nota" };
  try {
    return JSON.parse(r.texto) as RespostaNfeFocus;
  } catch {
    return { status: "erro", mensagem_sefaz: mensagemFocus(r) };
  }
}

export async function baixarXmlFocus(token: string, ambiente: 1 | 2, caminho: string): Promise<string | null> {
  const r = await chamarFocus(token, ambiente, caminho.startsWith("/") ? caminho : `/${caminho}`);
  return r.status === 200 && r.texto.includes("<nfeProc") ? r.texto : null;
}

export async function cancelarNaFocus(token: string, ambiente: 1 | 2, ref: string, justificativa: string): Promise<RespostaNfeFocus> {
  const r = await chamarFocus(token, ambiente, `/v2/nfe/${encodeURIComponent(ref)}`, { metodo: "DELETE", corpo: { justificativa } });
  try {
    return JSON.parse(r.texto) as RespostaNfeFocus;
  } catch {
    return { status: "erro_cancelamento", mensagem_sefaz: mensagemFocus(r) };
  }
}

export async function corrigirNaFocus(token: string, ambiente: 1 | 2, ref: string, correcao: string): Promise<RespostaNfeFocus> {
  const r = await chamarFocus(token, ambiente, `/v2/nfe/${encodeURIComponent(ref)}/carta_correcao`, { metodo: "POST", corpo: { correcao } });
  try {
    return JSON.parse(r.texto) as RespostaNfeFocus;
  } catch {
    return { status: "erro_autorizacao", mensagem_sefaz: mensagemFocus(r) };
  }
}
