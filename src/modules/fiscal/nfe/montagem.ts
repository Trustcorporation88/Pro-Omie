// Montagem do XML da NF-e 4.00 (modelo 55) a partir de dados já validados. Só servidor.
//
// O XML sai minificado (a SEFAZ recusa CR/LF entre tags, regra 588) e já na forma canônica para a assinatura: sem tag
// autofechada, texto escapado como na C14N e atributos na ordem (Id antes de versao). Ordem dos grupos conforme o
// leiauteNFe_v4.00.xsd do pacote 010f. Simples Nacional (CRT 1/4) em 2026: sem o grupo IBS/CBS (NT 2025.002 v1.52,
// "implementação futura" para CRT 1/2/4); CRT 3 é recusado antes de montar.
import "server-only";
import { escaparTexto, textoSefaz } from "../xml";
import { dataHoraBrasilia } from "../sefaz/manifestacao";
import { TEXTO_HOMOLOGACAO } from "./tipos";

export const NS_NFE = "http://www.portalfiscal.inf.br/nfe";

export type Endereco = {
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  codigoMunicipio: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone?: string | null;
};

export type ItemNfe = {
  codigo: string;
  descricao: string;
  ncm: string;
  cest?: string | null;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  /** desconto do item (inclui o rateio do desconto do pedido) */
  desconto: number;
  origem: number;
  csosn: string;
  /** só no CSOSN 101 */
  pCredSN?: number;
  /** CST do IBS/CBS (3 dígitos); vazio = 000 */
  cstIbsCbs?: string | null;
  /** classificação tributária do IBS/CBS (6 dígitos); vazio = 000001 */
  cClassTrib?: string | null;
};

/** Alíquotas do IBS/CBS usadas no grupo (em %). */
export type AliquotasIbsCbs = { pIBSUF: number; pIBSMun: number; pCBS: number };

/** Alíquotas de referência por ano (LC 214/2025, arts. 343, 344 e 346). 2027+ depende de resolução do Senado: informar na configuração. */
export function aliquotasIbsCbsDoAno(ano: number): AliquotasIbsCbs | null {
  if (ano <= 2026) return { pIBSUF: 0.1, pIBSMun: 0, pCBS: 0.9 };
  return null;
}

export type IbsCbsItem = { cst: string; cClassTrib: string; vBC: number; vIBSUF: number; vIBSMun: number; vIBS: number; vCBS: number };

/** Valores do IBS/CBS de um item (base = valor do item líquido de desconto; em 2026 os valores não entram no total da nota). */
export function calcularIbsCbs(vBC: number, a: AliquotasIbsCbs, item: Pick<ItemNfe, "cstIbsCbs" | "cClassTrib">): IbsCbsItem {
  const cst = (item.cstIbsCbs ?? "").replace(/\D/g, "") || "000";
  const cClassTrib = (item.cClassTrib ?? "").replace(/\D/g, "") || "000001";
  if (cst !== "000") throw new Error(`CST ${cst} do IBS/CBS ainda não é suportado: nesta versão só a tributação integral (CST 000).`);
  if (!/^000\d{3}$/.test(cClassTrib)) throw new Error(`Classificação tributária ${cClassTrib} incompatível com o CST 000 (os três primeiros dígitos têm de ser 000).`);
  const vIBSUF = arred2((vBC * a.pIBSUF) / 100);
  const vIBSMun = arred2((vBC * a.pIBSMun) / 100);
  const vCBS = arred2((vBC * a.pCBS) / 100);
  return { cst, cClassTrib, vBC: arred2(vBC), vIBSUF, vIBSMun, vIBS: arred2(vIBSUF + vIBSMun), vCBS };
}

function xmlIbsCbs(v: IbsCbsItem, a: AliquotasIbsCbs): string {
  return (
    "<IBSCBS>" +
    tag("CST", v.cst) +
    tag("cClassTrib", v.cClassTrib) +
    "<gIBSCBS>" +
    tag("vBC", d2(v.vBC)) +
    `<gIBSUF>${tag("pIBSUF", d4(a.pIBSUF))}${tag("vIBSUF", d2(v.vIBSUF))}</gIBSUF>` +
    `<gIBSMun>${tag("pIBSMun", d4(a.pIBSMun))}${tag("vIBSMun", d2(v.vIBSMun))}</gIBSMun>` +
    tag("vIBS", d2(v.vIBS)) +
    `<gCBS>${tag("pCBS", d4(a.pCBS))}${tag("vCBS", d2(v.vCBS))}</gCBS>` +
    "</gIBSCBS></IBSCBS>"
  );
}

/** Totais do IBS/CBS da nota (soma dos itens). */
export function totalIbsCbs(itens: IbsCbsItem[]) {
  const soma = (f: (i: IbsCbsItem) => number) => arred2(itens.reduce((acc, i) => acc + f(i), 0));
  return { vBC: soma((i) => i.vBC), vIBSUF: soma((i) => i.vIBSUF), vIBSMun: soma((i) => i.vIBSMun), vIBS: soma((i) => i.vIBS), vCBS: soma((i) => i.vCBS) };
}

function xmlIbsCbsTot(itens: IbsCbsItem[]): string {
  const tot = totalIbsCbs(itens);
  return (
    "<IBSCBSTot>" +
    tag("vBCIBSCBS", d2(tot.vBC)) +
    "<gIBS>" +
    `<gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib>${tag("vIBSUF", d2(tot.vIBSUF))}</gIBSUF>` +
    `<gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib>${tag("vIBSMun", d2(tot.vIBSMun))}</gIBSMun>` +
    tag("vIBS", d2(tot.vIBS)) +
    "<vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus>" +
    "</gIBS>" +
    `<gCBS><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib>${tag("vCBS", d2(tot.vCBS))}<vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gCBS>` +
    "</IBSCBSTot>"
  );
}

export type DadosNfe = {
  ambiente: 1 | 2;
  tpEmis: 1 | 6;
  contingencia?: { inicio: Date; justificativa: string } | null;
  cUF: string;
  serie: number;
  numero: number;
  cNF: string;
  chave: string;
  dv: number;
  emissao: Date;
  naturezaOperacao: string;
  emitente: { cnpj: string; razaoSocial: string; nomeFantasia?: string | null; ie: string; crt: 1 | 2 | 3 | 4; endereco: Endereco };
  destinatario: { documento: string; nome: string; indIEDest: 1 | 2 | 9; ie?: string | null; email?: string | null; endereco: Endereco };
  itens: ItemNfe[];
  modFrete: number;
  pagamentos: { indPag: 0 | 1; tPag: string; valor: number }[];
  cobranca?: { numero: string; valorOriginal: number; desconto: number; valorLiquido: number; duplicatas: { numero: string; vencimento: string; valor: number }[] } | null;
  informacoesComplementares?: string | null;
  /** grupo IBS/CBS (NT 2025.002): ausente = não informar */
  ibsCbs?: AliquotasIbsCbs | null;
};

const d2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const d4 = (n: number) => (Math.round(n * 10000) / 10000).toFixed(4);
const t = (s: string, max: number) => escaparTexto(textoSefaz(s, max));
const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const tag = (nome: string, valor: string | number | null | undefined) => (valor === null || valor === undefined || valor === "" ? "" : `<${nome}>${valor}</${nome}>`);

export const arred2 = (n: number) => Math.round(n * 100) / 100;
export const valorBruto = (i: Pick<ItemNfe, "quantidade" | "valorUnitario">) => arred2(i.quantidade * i.valorUnitario);

function endereco(e: Endereco, nome: "enderEmit" | "enderDest"): string {
  return (
    `<${nome}>` +
    tag("xLgr", t(e.logradouro, 60)) +
    tag("nro", t(e.numero || "S/N", 60)) +
    tag("xCpl", e.complemento ? t(e.complemento, 60) : "") +
    tag("xBairro", t(e.bairro, 60)) +
    tag("cMun", dig(e.codigoMunicipio)) +
    tag("xMun", t(e.municipio, 60)) +
    tag("UF", e.uf.toUpperCase()) +
    tag("CEP", dig(e.cep)) +
    "<cPais>1058</cPais><xPais>BRASIL</xPais>" +
    tag("fone", dig(e.telefone).length >= 6 ? dig(e.telefone).slice(0, 14) : "") +
    `</${nome}>`
  );
}

function icms(i: ItemNfe, valorItem: number): string {
  const base = `<orig>${i.origem}</orig><CSOSN>${i.csosn}</CSOSN>`;
  switch (i.csosn) {
    case "101": {
      const p = i.pCredSN ?? 0;
      return `<ICMS><ICMSSN101>${base}<pCredSN>${d4(p)}</pCredSN><vCredICMSSN>${d2((valorItem * p) / 100)}</vCredICMSSN></ICMSSN101></ICMS>`;
    }
    case "500":
      return `<ICMS><ICMSSN500>${base}</ICMSSN500></ICMS>`;
    case "900":
      return `<ICMS><ICMSSN900>${base}</ICMSSN900></ICMS>`;
    default: // 102, 103, 300, 400
      return `<ICMS><ICMSSN102>${base}</ICMSSN102></ICMS>`;
  }
}

const PIS_COFINS =
  "<PIS><PISOutr><CST>99</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISOutr></PIS>" +
  "<COFINS><COFINSOutr><CST>99</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS>";

export function totais(d: Pick<DadosNfe, "itens">) {
  const vProd = arred2(d.itens.reduce((a, i) => a + valorBruto(i), 0));
  const vDesc = arred2(d.itens.reduce((a, i) => a + i.desconto, 0));
  return { vProd, vDesc, vNF: arred2(vProd - vDesc) };
}

/** Monta o `<NFe>` sem assinatura. Devolve também o Id do infNFe (o que é assinado). */
export function montarNfe(d: DadosNfe): { xml: string; id: string } {
  if (d.emitente.crt === 3 && !d.ibsCbs) throw new Error("Regime normal (CRT 3): a NF-e exige o grupo IBS/CBS. Ligue 'Informar IBS/CBS' na configuração de emissão.");
  const id = `NFe${d.chave}`;
  const valoresIbsCbs: IbsCbsItem[] = [];
  const interna = d.emitente.endereco.uf.toUpperCase() === d.destinatario.endereco.uf.toUpperCase();
  const tot = totais(d);
  const indFinal = d.destinatario.indIEDest === 9 ? 1 : 0;
  const docDest = dig(d.destinatario.documento);
  const nomeDest = d.ambiente === 2 ? TEXTO_HOMOLOGACAO : textoSefaz(d.destinatario.nome, 60);

  const ide =
    "<ide>" +
    tag("cUF", d.cUF) +
    tag("cNF", d.cNF) +
    tag("natOp", t(d.naturezaOperacao, 60)) +
    "<mod>55</mod>" +
    tag("serie", d.serie) +
    tag("nNF", d.numero) +
    tag("dhEmi", dataHoraBrasilia(d.emissao)) +
    "<tpNF>1</tpNF>" +
    tag("idDest", interna ? 1 : 2) +
    tag("cMunFG", dig(d.emitente.endereco.codigoMunicipio)) +
    "<tpImp>1</tpImp>" +
    tag("tpEmis", d.tpEmis) +
    tag("cDV", d.dv) +
    tag("tpAmb", d.ambiente) +
    "<finNFe>1</finNFe>" +
    tag("indFinal", indFinal) +
    "<indPres>1</indPres>" +
    "<procEmi>0</procEmi><verProc>Pro Omie 1.0</verProc>" +
    (d.tpEmis === 6 && d.contingencia ? tag("dhCont", dataHoraBrasilia(d.contingencia.inicio)) + tag("xJust", t(d.contingencia.justificativa, 256)) : "") +
    "</ide>";

  const emit =
    "<emit>" +
    tag("CNPJ", dig(d.emitente.cnpj)) +
    tag("xNome", t(d.emitente.razaoSocial, 60)) +
    tag("xFant", d.emitente.nomeFantasia ? t(d.emitente.nomeFantasia, 60) : "") +
    endereco(d.emitente.endereco, "enderEmit") +
    tag("IE", dig(d.emitente.ie)) +
    tag("CRT", d.emitente.crt) +
    "</emit>";

  const dest =
    "<dest>" +
    (docDest.length === 11 ? tag("CPF", docDest) : tag("CNPJ", docDest)) +
    tag("xNome", escaparTexto(nomeDest)) +
    endereco(d.destinatario.endereco, "enderDest") +
    tag("indIEDest", d.destinatario.indIEDest) +
    (d.destinatario.indIEDest === 1 ? tag("IE", dig(d.destinatario.ie)) : "") +
    tag("email", d.destinatario.email ? escaparTexto(d.destinatario.email.trim().slice(0, 60)) : "") +
    "</dest>";

  const grupoIbsCbs = (i: ItemNfe, vBC: number) => {
    if (!d.ibsCbs) return "";
    const v = calcularIbsCbs(vBC, d.ibsCbs, i);
    valoresIbsCbs.push(v);
    return xmlIbsCbs(v, d.ibsCbs);
  };
  const det = d.itens
    .map((i, k) => {
      const vProd = valorBruto(i);
      const q = d4(i.quantidade);
      const v = d4(i.valorUnitario);
      return (
        `<det nItem="${k + 1}"><prod>` +
        tag("cProd", t(i.codigo, 60)) +
        "<cEAN>SEM GTIN</cEAN>" +
        tag("xProd", t(i.descricao, 120)) +
        tag("NCM", dig(i.ncm)) +
        tag("CEST", dig(i.cest)) +
        tag("CFOP", dig(i.cfop)) +
        tag("uCom", t(i.unidade, 6)) +
        tag("qCom", q) +
        tag("vUnCom", v) +
        tag("vProd", d2(vProd)) +
        "<cEANTrib>SEM GTIN</cEANTrib>" +
        tag("uTrib", t(i.unidade, 6)) +
        tag("qTrib", q) +
        tag("vUnTrib", v) +
        (i.desconto > 0 ? tag("vDesc", d2(i.desconto)) : "") +
        "<indTot>1</indTot></prod>" +
        `<imposto>${icms(i, arred2(vProd - i.desconto))}${PIS_COFINS}${grupoIbsCbs(i, arred2(vProd - i.desconto))}</imposto></det>`
      );
    })
    .join("");

  const total =
    "<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST>" +
    "<vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet>" +
    tag("vProd", d2(tot.vProd)) +
    "<vFrete>0.00</vFrete><vSeg>0.00</vSeg>" +
    tag("vDesc", d2(tot.vDesc)) +
    "<vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro>" +
    tag("vNF", d2(tot.vNF)) +
    "</ICMSTot>" +
    (d.ibsCbs ? xmlIbsCbsTot(valoresIbsCbs) : "") +
    "</total>";

  const transp = `<transp><modFrete>${d.modFrete}</modFrete></transp>`;

  const cobr = d.cobranca?.duplicatas.length
    ? "<cobr><fat>" +
      tag("nFat", t(d.cobranca.numero, 60)) +
      tag("vOrig", d2(d.cobranca.valorOriginal)) +
      tag("vDesc", d2(d.cobranca.desconto)) +
      tag("vLiq", d2(d.cobranca.valorLiquido)) +
      "</fat>" +
      d.cobranca.duplicatas.map((u) => `<dup>${tag("nDup", u.numero)}${tag("dVenc", u.vencimento)}${tag("vDup", d2(u.valor))}</dup>`).join("") +
      "</cobr>"
    : "";

  const pag =
    "<pag>" +
    d.pagamentos.map((p) => `<detPag>${tag("indPag", p.indPag)}${tag("tPag", p.tPag)}${p.tPag === "99" ? "<xPag>Outros</xPag>" : ""}${tag("vPag", d2(p.valor))}</detPag>`).join("") +
    "</pag>";

  const infCpl = (d.informacoesComplementares ?? "").trim();
  const infAdic = infCpl ? `<infAdic>${tag("infCpl", t(infCpl, 5000))}</infAdic>` : "";

  const xml = `<NFe xmlns="${NS_NFE}"><infNFe Id="${id}" versao="4.00">${ide}${emit}${dest}${det}${total}${transp}${cobr}${pag}${infAdic}</infNFe></NFe>`;
  return { xml, id };
}
