// NFS-e nacional pela Focus NFe (motor reserva). Conferido em doc.focusnfe.com.br (out/2026): POST /v2/nfsen?ref=
// (202 processando_autorizacao), GET /v2/nfsen/{ref} (autorizado | cancelado | erro_autorizacao | processando_autorizacao),
// DELETE /v2/nfsen/{ref} {justificativa}. Só servidor.
import "server-only";
import { chamarFocus, mensagemFocus } from "./cliente";
import type { DadosDps } from "../nfse/montagem";
import { dataBrasilia } from "../nfse/montagem";
import { dataHoraBrasilia } from "../sefaz/manifestacao";

const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export type RespostaNfsenFocus = {
  status: string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  mensagem?: string;
  erros?: { codigo?: string; mensagem: string }[];
  numero?: string;
  codigo_verificacao?: string;
  chave?: string;
  chave_nfse?: string;
  url?: string;
  url_danfse?: string;
  caminho_xml_nota_fiscal?: string;
};

export function jsonFocusNfsen(d: DadosDps) {
  const toma = d.tomador;
  const doc = dig(toma?.documento);
  return {
    data_emissao: dataHoraBrasilia(d.emissao),
    data_competencia: dataBrasilia(d.competencia),
    codigo_municipio_emissora: d.cLocEmi,
    serie_dps: d.serie,
    numero_dps: d.numero,
    cnpj_prestador: dig(d.prestador.cnpj),
    inscricao_municipal_prestador: d.prestador.im ? dig(d.prestador.im) : undefined,
    codigo_opcao_simples_nacional: d.prestador.opSimpNac,
    regime_tributario_simples_nacional: d.prestador.regApTribSN ?? undefined,
    regime_especial_tributacao: d.prestador.regEspTrib,
    ...(toma
      ? {
          ...(doc.length === 11 ? { cpf_tomador: doc } : { cnpj_tomador: doc }),
          razao_social_tomador: toma.nome,
          email_tomador: toma.email ?? undefined,
          telefone_tomador: dig(toma.telefone) || undefined,
          ...(toma.endereco
            ? {
                logradouro_tomador: toma.endereco.logradouro,
                numero_tomador: toma.endereco.numero || "S/N",
                complemento_tomador: toma.endereco.complemento ?? undefined,
                bairro_tomador: toma.endereco.bairro,
                codigo_municipio_tomador: dig(toma.endereco.codigoMunicipio),
                cep_tomador: dig(toma.endereco.cep),
              }
            : {}),
        }
      : {}),
    codigo_municipio_prestacao: d.servico.cLocPrestacao,
    codigo_tributacao_nacional_iss: d.servico.cTribNac,
    codigo_tributacao_municipal_iss: d.servico.cTribMun ?? undefined,
    codigo_nbs: d.servico.cNBS ?? undefined,
    descricao_servico: d.servico.descricao,
    valor_servico: d.valores.vServ,
    valor_desconto_incondicionado: d.valores.descontoIncondicionado || undefined,
    tributacao_iss: d.valores.tribISSQN,
    tipo_retencao_iss: d.valores.tpRetISSQN,
    ...(d.prestador.opSimpNac === 2 ? { indicador_total_tributos: 0 } : { percentual_total_tributos_simples_nacional: d.valores.pTotTribSN ?? 0 }),
    informacoes_complementares: d.informacoesComplementares ?? undefined,
    numero_pedido: d.numeroPedido ?? undefined,
  };
}

async function ler(r: { status: number; texto: string }, erroPadrao: string): Promise<RespostaNfsenFocus> {
  try {
    const j = JSON.parse(r.texto) as RespostaNfsenFocus;
    if (r.status === 404) return { status: "nao_encontrada", mensagem: j.mensagem ?? "A Focus NFe não tem esta nota" };
    return j;
  } catch {
    return { status: erroPadrao, mensagem: mensagemFocus(r as never) };
  }
}

export async function emitirNfsenNaFocus(token: string, ambiente: 1 | 2, ref: string, d: DadosDps): Promise<RespostaNfsenFocus> {
  return ler(await chamarFocus(token, ambiente, `/v2/nfsen?ref=${encodeURIComponent(ref)}`, { metodo: "POST", corpo: jsonFocusNfsen(d) }), "erro_autorizacao");
}
export async function consultarNfsenNaFocus(token: string, ambiente: 1 | 2, ref: string): Promise<RespostaNfsenFocus> {
  return ler(await chamarFocus(token, ambiente, `/v2/nfsen/${encodeURIComponent(ref)}`), "erro");
}
export async function cancelarNfsenNaFocus(token: string, ambiente: 1 | 2, ref: string, justificativa: string): Promise<RespostaNfsenFocus> {
  return ler(await chamarFocus(token, ambiente, `/v2/nfsen/${encodeURIComponent(ref)}`, { metodo: "DELETE", corpo: { justificativa } }), "erro_cancelamento");
}
export async function baixarXmlNfsenFocus(token: string, ambiente: 1 | 2, caminho: string): Promise<string | null> {
  const r = await chamarFocus(token, ambiente, caminho.startsWith("/") ? caminho : `/${caminho}`);
  return r.status === 200 && /<NFSe|<nfse/i.test(r.texto) ? r.texto : null;
}
