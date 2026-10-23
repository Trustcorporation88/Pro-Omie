// Montagem da DPS (Declaração de Prestação de Serviços) e do pedido de cancelamento da NFS-e nacional.
// Dois layouts: "1.01" (produção até 30/11/2026) e "NT009" (produção restrita hoje e produção a partir de 01/12/2026):
// finNFSe obrigatório, xDescServ depois de cNBS, xNome do tomador opcional. Validado nos XSD oficiais nos testes.
import { escaparTexto, textoSefaz } from "../xml";
import { dataHoraBrasilia } from "../sefaz/manifestacao";

export const NS_NFSE = "http://www.sped.fazenda.gov.br/nfse";
export const VERSAO_NFSE = "1.01";
export const VER_APLIC = "ProOmie 1.0";
export const INICIO_NT009_PRODUCAO = new Date("2026-12-01T03:00:00Z"); // 00:00 de 01/12/2026 em Brasília

export type LayoutDps = "1.01" | "NT009";

export function layoutDps(ambiente: 1 | 2, agora = new Date()): LayoutDps {
  if (ambiente === 2) return "NT009";
  return agora >= INICIO_NT009_PRODUCAO ? "NT009" : "1.01";
}

export type EnderecoNfse = { logradouro: string; numero: string; complemento: string | null; bairro: string; codigoMunicipio: string; cep: string };

export type PessoaNfse = {
  /** CNPJ (14) ou CPF (11), só dígitos */
  documento: string;
  nome: string;
  endereco: EnderecoNfse | null;
  telefone: string | null;
  email: string | null;
};

export type DadosDps = {
  ambiente: 1 | 2;
  emissao: Date;
  competencia: Date;
  serie: number;
  numero: number;
  cLocEmi: string;
  prestador: {
    cnpj: string;
    /** inscrição municipal: só vai quando o município cadastrou o contribuinte (regra E0116/E0120) */
    im: string | null;
    /** 1 = não optante, 2 = MEI, 3 = ME/EPP */
    opSimpNac: 1 | 2 | 3;
    /** 1 = regime de apuração do Simples (ME/EPP) */
    regApTribSN: 1 | 2 | 3 | null;
    regEspTrib: number;
  };
  tomador: PessoaNfse | null;
  servico: { cLocPrestacao: string; cTribNac: string; cTribMun: string | null; cNBS: string | null; descricao: string };
  valores: {
    vServ: number;
    descontoIncondicionado: number;
    tribISSQN: 1 | 2 | 3 | 4;
    tpRetISSQN: 1 | 2 | 3;
    /** alíquota efetiva do Simples (ME/EPP); MEI usa indTotTrib */
    pTotTribSN: number | null;
  };
  informacoesComplementares: string | null;
  numeroPedido: string | null;
};

const d2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const tag = (nome: string, valor: string | number | null | undefined) => (valor === null || valor === undefined || valor === "" ? "" : `<${nome}>${valor}</${nome}>`);
/** Campo de texto de uma linha (TSString: só caracteres de espaço a ÿ, sem quebra de linha). */
const t = (nome: string, valor: string | null | undefined, max: number) => {
  const v = textoSefaz(valor ?? "", max);
  return v ? `<${nome}>${escaparTexto(v)}</${nome}>` : "";
};
/** Campo que aceita quebra de linha (só xDescServ, TSStringComQuebraDeLinha): mesma faixa de caracteres, com \n preservado. */
const tq = (nome: string, valor: string | null | undefined, max: number) => {
  const v = textoNfse(valor ?? "", max);
  return v ? `<${nome}>${escaparTexto(v)}</${nome}>` : "";
};

/** Texto com quebras de linha no padrão do emissor nacional: faixa Latin-1, sem CR nem caracteres de controle. */
export function textoNfse(s: string, max: number): string {
  return s
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\x20-\xFF\n]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
}

export const dataBrasilia = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

/** Id da DPS: "DPS" + cLocEmi(7) + tpInsc(2 = CNPJ) + CNPJ(14) + série(5) + nDPS(15) = 45 caracteres. */
export function idDps(cLocEmi: string, cnpj: string, serie: number, numero: number): string {
  return `DPS${dig(cLocEmi).padStart(7, "0")}2${dig(cnpj).padStart(14, "0")}${String(serie).padStart(5, "0")}${String(numero).padStart(15, "0")}`;
}

function endereco(e: EnderecoNfse): string {
  return (
    `<end><endNac>${tag("cMun", dig(e.codigoMunicipio))}${tag("CEP", dig(e.cep))}</endNac>` +
    t("xLgr", e.logradouro, 255) +
    t("nro", e.numero || "S/N", 60) +
    t("xCpl", e.complemento, 156) +
    t("xBairro", e.bairro, 60) +
    `</end>`
  );
}

function pessoa(p: PessoaNfse, layout: LayoutDps): string {
  const doc = dig(p.documento);
  return (
    (doc.length === 11 ? tag("CPF", doc) : tag("CNPJ", doc)) +
    (p.nome || layout === "1.01" ? t("xNome", p.nome || "NAO INFORMADO", 300) : "") +
    (p.endereco ? endereco(p.endereco) : "") +
    tag("fone", dig(p.telefone).length >= 6 ? dig(p.telefone).slice(0, 20) : null) +
    t("email", p.email, 80)
  );
}

/** Monta a DPS sem assinatura. Devolve também o Id para a assinatura (elemento infDPS). */
export function montarDps(d: DadosDps, layout: LayoutDps): { xml: string; id: string } {
  const id = idDps(d.cLocEmi, d.prestador.cnpj, d.serie, d.numero);
  const emissao = new Date(Math.floor(d.emissao.getTime() / 1000) * 1000);
  const servico =
    `<serv><locPrest>${tag("cLocPrestacao", dig(d.servico.cLocPrestacao))}</locPrest><cServ>` +
    tag("cTribNac", dig(d.servico.cTribNac).padStart(6, "0")) +
    tag("cTribMun", d.servico.cTribMun ? dig(d.servico.cTribMun).slice(0, 3) : null) +
    (layout === "1.01" ? tq("xDescServ", d.servico.descricao, 2000) : "") +
    tag("cNBS", d.servico.cNBS ? dig(d.servico.cNBS).padStart(9, "0") : null) +
    (layout === "NT009" ? tq("xDescServ", d.servico.descricao, 2000) : "") +
    `</cServ>` +
    (d.informacoesComplementares || d.numeroPedido ? `<infoCompl>${t("xPed", d.numeroPedido, 60)}${t("xInfComp", d.informacoesComplementares, 2000)}</infoCompl>` : "") +
    `</serv>`;
  const totTrib = d.prestador.opSimpNac === 2 ? tag("indTotTrib", 0) : tag("pTotTribSN", d2(d.valores.pTotTribSN ?? 0));
  const valores =
    `<valores><vServPrest>${tag("vServ", d2(d.valores.vServ))}</vServPrest>` +
    (d.valores.descontoIncondicionado > 0 ? `<vDescCondIncond>${tag("vDescIncond", d2(d.valores.descontoIncondicionado))}</vDescCondIncond>` : "") +
    `<trib><tribMun>${tag("tribISSQN", d.valores.tribISSQN)}${tag("tpRetISSQN", d.valores.tpRetISSQN)}</tribMun><totTrib>${totTrib}</totTrib></trib></valores>`;
  const xml =
    `<DPS xmlns="${NS_NFSE}" versao="${VERSAO_NFSE}"><infDPS Id="${id}">` +
    tag("tpAmb", d.ambiente) +
    tag("dhEmi", dataHoraBrasilia(emissao)) +
    tag("verAplic", VER_APLIC) +
    tag("serie", d.serie) +
    tag("nDPS", d.numero) +
    tag("dCompet", dataBrasilia(d.competencia)) +
    tag("tpEmit", 1) +
    (layout === "NT009" ? tag("finNFSe", 0) : "") +
    tag("cLocEmi", dig(d.cLocEmi)) +
    `<prest>${tag("CNPJ", dig(d.prestador.cnpj))}${tag("IM", d.prestador.im ? dig(d.prestador.im).slice(0, 15) : null)}<regTrib>${tag("opSimpNac", d.prestador.opSimpNac)}${tag("regApTribSN", d.prestador.regApTribSN)}${tag("regEspTrib", d.prestador.regEspTrib)}</regTrib></prest>` +
    (d.tomador ? `<toma>${pessoa(d.tomador, layout)}</toma>` : "") +
    servico +
    valores +
    `</infDPS></DPS>`;
  return { xml, id };
}

/** Pedido de registro do evento de cancelamento (e101101), sem assinatura. Id = "PRE" + chave(50) + "101101". */
export function montarPedidoCancelamento(p: { ambiente: 1 | 2; chave: string; cnpjAutor: string; cMotivo: "1" | "2" | "9"; xMotivo: string; quando?: Date }): { xml: string; id: string } {
  const id = `PRE${p.chave}101101`;
  const xml =
    `<pedRegEvento xmlns="${NS_NFSE}" versao="${VERSAO_NFSE}"><infPedReg Id="${id}">` +
    tag("tpAmb", p.ambiente) +
    tag("verAplic", VER_APLIC) +
    tag("dhEvento", dataHoraBrasilia(p.quando ?? new Date())) +
    tag("CNPJAutor", dig(p.cnpjAutor)) +
    tag("chNFSe", p.chave) +
    `<e101101><xDesc>Cancelamento de NFS-e</xDesc>${tag("cMotivo", p.cMotivo)}${t("xMotivo", p.xMotivo, 255)}</e101101>` +
    `</infPedReg></pedRegEvento>`;
  return { xml, id };
}
