// Leitura dos documentos distribuídos (NF-e, CT-e, NFS-e e eventos) para o formato comum dos motores. Só servidor.
// Base: HUBCLONE (parseNfeFields, parseCte, parseNfseXml, tomadorDoCte), com mais campos (número, série, nome e IE do
// emitente, protocolo, situação) e o papel da empresa no documento.
import "server-only";
import type { Direcao, DocumentoCapturado, Situacao, TipoDoc } from "./tipos";
import { dataFiscal, documento, lerXml, lista, numero, opc, txt, type No } from "./xml";

const ID_NFE = /Id="NFe([0-9A-Z]{44})"/;
const ID_CTE = /Id="CTe([0-9A-Z]{44})"/;

/** Série e número a partir da chave de 44 posições (cUF AAMM CNPJ mod série nNF tpEmis cNF DV). */
export function serieNumeroDaChave(chave: string): { serie?: string; numero?: string } {
  if (!/^[0-9A-Z]{44}$/.test(chave)) return {};
  return { serie: String(Number(chave.slice(22, 25))), numero: String(Number(chave.slice(25, 34))) };
}

function situacaoPorCStat(cStat: string): Situacao | undefined {
  if (["100", "150"].includes(cStat)) return "AUTORIZADO";
  if (["101", "151", "135", "155"].includes(cStat)) return "CANCELADO";
  if (["110", "205", "301", "302", "303"].includes(cStat)) return "DENEGADO";
  return undefined;
}

const parte = (p: No | undefined) => documento(txt(p?.CNPJ) || txt(p?.CPF));

function direcao(emitente: string, destinatario: string, interessado: string): Direcao {
  if (destinatario && destinatario === interessado) return "ENTRADA";
  if (emitente && emitente === interessado) return "SAIDA";
  return "TERCEIRO";
}

type Base = Pick<DocumentoCapturado, "nsu" | "tipo" | "xml">;

// ───────────────────────── NF-e ─────────────────────────

export function lerNfe(xml: string, interessado: string, base: Base, schema = ""): DocumentoCapturado {
  const cnpj = documento(interessado);
  let p: No;
  try {
    p = lerXml(xml);
  } catch {
    return { ...base, natureza: "OUTRO", chave: "", erroLeitura: "XML da NF-e ilegível" };
  }

  // Resumo (resNFe): o que o destinatário recebe antes de manifestar.
  const res = p.resNFe as No | undefined;
  if (res) {
    const chave = documento(txt(res.chNFe));
    const emit = documento(txt(res.CNPJ) || txt(res.CPF));
    const cSit = txt(res.cSitNFe);
    return {
      ...base,
      natureza: "RESUMO",
      chave,
      ...serieNumeroDaChave(chave),
      direcao: emit && emit === cnpj ? "SAIDA" : "ENTRADA",
      emitenteDocumento: emit || undefined,
      emitenteNome: opc(res.xNome),
      emitenteIe: opc(res.IE),
      destinatarioDocumento: cnpj,
      valor: numero(res.vNF),
      emitidoEm: dataFiscal(res.dhEmi),
      protocolo: opc(res.nProt),
      situacao: cSit === "3" ? "CANCELADO" : cSit === "2" ? "DENEGADO" : "AUTORIZADO",
    };
  }

  // Eventos: procEventoNFe (completo) e resEvento (resumo do evento).
  const ev = (p.procEventoNFe?.evento?.infEvento ?? p.evento?.infEvento) as No | undefined;
  const retEv = p.procEventoNFe?.retEvento?.infEvento as No | undefined;
  const resEv = p.resEvento as No | undefined;
  if (ev || resEv || /evento/i.test(schema)) {
    const e = (ev ?? resEv ?? retEv ?? {}) as No;
    const det = (e.detEvento ?? {}) as No;
    const chave = documento(txt(e.chNFe));
    return {
      ...base,
      natureza: "EVENTO",
      chave,
      emitenteDocumento: documento(txt(e.CNPJ) || txt(e.CPF)) || undefined,
      evento: {
        codigo: txt(e.tpEvento),
        sequencia: Number(txt(e.nSeqEvento)) || 1,
        descricao: opc(det.descEvento) ?? opc(e.xEvento),
        detalhe: opc(det.xCorrecao) ?? opc(det.xJust),
        ocorridoEm: dataFiscal(e.dhEvento ?? e.dhRecbto),
        protocolo: opc(retEv?.nProt) ?? opc(e.nProt),
      },
      ...(chave ? {} : { erroLeitura: "Evento de NF-e sem chave" }),
    };
  }

  // Documento completo (nfeProc ou NFe).
  const inf = (p.nfeProc?.NFe?.infNFe ?? p.NFe?.infNFe) as No | undefined;
  if (!inf) {
    const ch = xml.match(ID_NFE)?.[1] ?? "";
    return { ...base, natureza: "OUTRO", chave: ch, erroLeitura: ch ? undefined : "Documento de NF-e em formato desconhecido" };
  }
  const chave = documento(txt(inf["@_Id"]).replace(/^NFe/, ""));
  const emit = parte(inf.emit);
  const dest = parte(inf.dest);
  const prot = p.nfeProc?.protNFe?.infProt as No | undefined;
  return {
    ...base,
    natureza: "DOCUMENTO",
    chave,
    direcao: direcao(emit, dest, cnpj),
    numero: opc(inf.ide?.nNF) ?? serieNumeroDaChave(chave).numero,
    serie: opc(inf.ide?.serie) ?? serieNumeroDaChave(chave).serie,
    emitenteDocumento: emit || undefined,
    emitenteNome: opc(inf.emit?.xNome),
    emitenteIe: opc(inf.emit?.IE),
    destinatarioDocumento: dest || undefined,
    valor: numero(inf.total?.ICMSTot?.vNF),
    emitidoEm: dataFiscal(inf.ide?.dhEmi ?? inf.ide?.dEmi),
    protocolo: opc(prot?.nProt),
    situacao: situacaoPorCStat(txt(prot?.cStat)) ?? "AUTORIZADO",
  };
}

// ───────────────────────── CT-e ─────────────────────────

/** Documento do tomador do frete: toma4 traz o CNPJ; toma3 é um código de papel (0 remetente, 1 expedidor, 2 recebedor, 3 destinatário). */
export function tomadorDoCte(inf: No | undefined): string {
  if (!inf) return "";
  const toma4 = inf.ide?.toma4 as No | undefined;
  if (toma4 && parte(toma4)) return parte(toma4);
  const codigo = txt(inf.ide?.toma3?.toma ?? inf.ide?.toma03?.toma);
  const papel: Record<string, string> = { "0": "rem", "1": "exped", "2": "receb", "3": "dest" };
  if (papel[codigo]) return parte(inf[papel[codigo]] as No | undefined);
  return parte(inf.toma as No | undefined); // CT-e OS
}

export function lerCte(xml: string, interessado: string, base: Base, schema = ""): DocumentoCapturado {
  const cnpj = documento(interessado);
  let p: No;
  try {
    p = lerXml(xml);
  } catch {
    return { ...base, natureza: "OUTRO", chave: "", erroLeitura: "XML do CT-e ilegível" };
  }
  const ev = (p.procEventoCTe?.eventoCTe?.infEvento ?? p.eventoCTe?.infEvento) as No | undefined;
  const retEv = p.procEventoCTe?.retEventoCTe?.infEvento as No | undefined;
  if (ev || /evento/i.test(schema)) {
    const e = (ev ?? retEv ?? {}) as No;
    const det = (e.detEvento ?? {}) as No;
    const corpo = (Object.values(det).find((v) => v && typeof v === "object") ?? {}) as No;
    const chave = documento(txt(e.chCTe));
    return {
      ...base,
      natureza: "EVENTO",
      chave,
      emitenteDocumento: documento(txt(e.CNPJ)) || undefined,
      evento: {
        codigo: txt(e.tpEvento),
        sequencia: Number(txt(e.nSeqEvento)) || 1,
        descricao: opc(corpo.descEvento),
        detalhe: opc(corpo.xJust) ?? opc(corpo.xObs),
        ocorridoEm: dataFiscal(e.dhEvento),
        protocolo: opc(retEv?.nProt),
      },
      ...(chave ? {} : { erroLeitura: "Evento de CT-e sem chave" }),
    };
  }
  const inf = (p.cteProc?.CTe?.infCte ?? p.CTe?.infCte ?? p.cteOSProc?.CTeOS?.infCte ?? p.CTeOS?.infCte) as No | undefined;
  if (!inf) {
    const ch = xml.match(ID_CTE)?.[1] ?? "";
    return { ...base, natureza: "OUTRO", chave: ch, erroLeitura: ch ? undefined : "Documento de CT-e em formato desconhecido" };
  }
  const chave = documento(txt(inf["@_Id"]).replace(/^CTe/, ""));
  const emit = parte(inf.emit);
  const tomador = tomadorDoCte(inf);
  const prot = (p.cteProc?.protCTe?.infProt ?? p.cteOSProc?.protCTe?.infProt) as No | undefined;
  return {
    ...base,
    natureza: "DOCUMENTO",
    chave,
    direcao: direcao(emit, tomador, cnpj),
    numero: opc(inf.ide?.nCT),
    serie: opc(inf.ide?.serie),
    emitenteDocumento: emit || undefined,
    emitenteNome: opc(inf.emit?.xNome),
    emitenteIe: opc(inf.emit?.IE),
    destinatarioDocumento: tomador || undefined,
    valor: numero(inf.vPrest?.vTPrest),
    emitidoEm: dataFiscal(inf.ide?.dhEmi),
    protocolo: opc(prot?.nProt),
    situacao: situacaoPorCStat(txt(prot?.cStat)) ?? "AUTORIZADO",
  };
}

// ───────────────────────── NFS-e (padrão nacional) ─────────────────────────

export function lerNfse(xml: string, interessado: string, base: Base, chaveAdn?: string, ehEvento = false): DocumentoCapturado {
  const cnpj = documento(interessado);
  let p: No;
  try {
    p = lerXml(xml);
  } catch {
    return { ...base, natureza: "OUTRO", chave: chaveAdn ?? "", erroLeitura: "XML da NFS-e ilegível" };
  }
  const ev = (p.evento?.infEvento ?? p.pedRegEvento?.infPedReg) as No | undefined;
  if (ev || ehEvento) {
    const e = (ev ?? {}) as No;
    const inner = (e.pedRegEvento?.infPedReg ?? e) as No;
    const codigoChave = Object.keys(inner).find((k) => /^e\d{6}$/.test(k));
    const corpo = (codigoChave ? inner[codigoChave] : {}) as No;
    const chave = documento(txt(inner.chNFSe) || chaveAdn || "");
    return {
      ...base,
      natureza: "EVENTO",
      chave,
      evento: {
        codigo: codigoChave?.slice(1) ?? txt(inner.tpEvento),
        sequencia: Number(txt(inner.nPedRegEvento)) || 1,
        descricao: opc(corpo.xDesc),
        detalhe: opc(corpo.xMotivo) ?? opc(corpo.xJust),
        ocorridoEm: dataFiscal(e.dhProc ?? inner.dhEvento),
        protocolo: opc(e.nSeqEvento),
      },
      ...(chave ? {} : { erroLeitura: "Evento de NFS-e sem chave" }),
    };
  }
  const inf = p.NFSe?.infNFSe as No | undefined;
  if (!inf) return { ...base, natureza: "OUTRO", chave: chaveAdn ?? "", erroLeitura: "NFS-e em formato desconhecido" };
  const dps = (inf.DPS?.infDPS ?? {}) as No;
  const prestador = parte(dps.prest) || parte(inf.emit);
  const tomador = parte(dps.toma);
  const valor = numero(dps.valores?.vServPrest?.vServ) ?? numero(inf.valores?.vLiq);
  return {
    ...base,
    natureza: "DOCUMENTO",
    chave: documento(chaveAdn || txt(inf["@_Id"]).replace(/^NFS/, "")),
    direcao: direcao(prestador, tomador, cnpj),
    numero: opc(inf.nNFSe),
    serie: opc(dps.serie),
    emitenteDocumento: prestador || undefined,
    emitenteNome: opc(inf.emit?.xNome) ?? opc(dps.prest?.xNome),
    destinatarioDocumento: tomador || undefined,
    valor,
    emitidoEm: dataFiscal(dps.dhEmi ?? dps.dCompet ?? inf.dhProc),
    protocolo: opc(inf.nDFSe),
    situacao: "AUTORIZADO",
  };
}

export function lerDocumento(tipo: TipoDoc, xml: string, interessado: string, base: Base, extra: { schema?: string; chaveAdn?: string; evento?: boolean } = {}) {
  if (tipo === "NFE") return lerNfe(xml, interessado, base, extra.schema);
  if (tipo === "CTE") return lerCte(xml, interessado, base, extra.schema);
  return lerNfse(xml, interessado, base, extra.chaveAdn, extra.evento);
}

// ───────────────────────── Detalhe da NF-e (tela e contas a pagar) ─────────────────────────

export type LoteNota = { numero: string; quantidade: number; fabricacao?: string; validade?: string };

export type ItemNota = {
  numero: number;
  codigo: string;
  gtin: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  /** grupo rastro (lote, quantidade do lote, fabricação e validade), quando a nota traz */
  lotes: LoteNota[];
};

export type EnderecoParte = { logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; codigoMunicipio?: string; uf?: string; cep?: string; telefone?: string };

function enderecoDe(end: No | undefined): EnderecoParte {
  const e = (end ?? {}) as No;
  return {
    logradouro: opc(e.xLgr),
    numero: opc(e.nro),
    complemento: opc(e.xCpl),
    bairro: opc(e.xBairro),
    cidade: opc(e.xMun),
    codigoMunicipio: opc(e.cMun),
    uf: opc(e.UF),
    cep: opc(e.CEP),
    telefone: opc(e.fone),
  };
}

export type DetalheNota = {
  naturezaOperacao?: string;
  emitente: { documento?: string; nome?: string; fantasia?: string; ie?: string; endereco?: string; uf?: string; cidade?: string; cep?: string; telefone?: string; partes: EnderecoParte };
  destinatario: { documento?: string; nome?: string };
  itens: ItemNota[];
  totais: { produtos?: number; frete?: number; desconto?: number; icms?: number; ipi?: number; outras?: number; total?: number };
  duplicatas: { numero: string; vencimento: string; valor: number }[];
  informacoes?: string;
};

/** Itens, totais e duplicatas de uma NF-e completa (nfeProc). Devolve null para resumo ou outro tipo. */
export function detalheNfe(xml: string): DetalheNota | null {
  let p: No;
  try {
    p = lerXml(xml, { isArray: (nome) => nome === "det" || nome === "dup" || nome === "rastro" });
  } catch {
    return null;
  }
  const inf = (p.nfeProc?.NFe?.infNFe ?? p.NFe?.infNFe) as No | undefined;
  if (!inf) return null;
  const e = (inf.emit ?? {}) as No;
  const end = (e.enderEmit ?? {}) as No;
  const tot = (inf.total?.ICMSTot ?? {}) as No;
  return {
    naturezaOperacao: opc(inf.ide?.natOp),
    emitente: {
      documento: parte(e) || undefined,
      nome: opc(e.xNome),
      fantasia: opc(e.xFant),
      ie: opc(e.IE),
      endereco: [txt(end.xLgr), txt(end.nro), txt(end.xBairro)].filter(Boolean).join(", ") || undefined,
      cidade: opc(end.xMun),
      uf: opc(end.UF),
      cep: opc(end.CEP),
      telefone: opc(end.fone),
      partes: enderecoDe(end),
    },
    destinatario: { documento: parte(inf.dest) || undefined, nome: opc(inf.dest?.xNome) },
    itens: lista<No>(inf.det).map((d, i) => ({
      numero: Number(txt(d["@_nItem"])) || i + 1,
      codigo: txt(d.prod?.cProd),
      gtin: /^\d{8,14}$/.test(txt(d.prod?.cEAN)) ? txt(d.prod?.cEAN) : /^\d{8,14}$/.test(txt(d.prod?.cEANTrib)) ? txt(d.prod?.cEANTrib) : "",
      descricao: txt(d.prod?.xProd),
      ncm: txt(d.prod?.NCM),
      cfop: txt(d.prod?.CFOP),
      unidade: txt(d.prod?.uCom),
      quantidade: Number(txt(d.prod?.qCom)) || 0,
      valorUnitario: Number(txt(d.prod?.vUnCom)) || 0,
      valorTotal: numero(d.prod?.vProd) ?? 0,
      lotes: lista<No>(d.prod?.rastro)
        .map((r) => ({ numero: txt(r.nLote), quantidade: Number(txt(r.qLote)) || 0, fabricacao: opc(r.dFab), validade: opc(r.dVal) }))
        .filter((r) => r.numero),
    })),
    totais: {
      produtos: numero(tot.vProd),
      frete: numero(tot.vFrete),
      desconto: numero(tot.vDesc),
      icms: numero(tot.vICMS),
      ipi: numero(tot.vIPI),
      outras: numero(tot.vOutro),
      total: numero(tot.vNF),
    },
    duplicatas: lista<No>(inf.cobr?.dup)
      .map((d) => ({ numero: txt(d.nDup), vencimento: txt(d.dVenc), valor: numero(d.vDup) ?? 0 }))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.vencimento) && d.valor > 0),
    informacoes: opc(inf.infAdic?.infCpl),
  };
}

// ───────────────────────── Armazém geral ─────────────────────────

/** CFOP da NF-e do depositante que manda mercadoria para o armazém geral: remessa para depósito (5.905/6.905) ou remessa simbólica (5.934/6.934). */
export const CFOP_ARMAZENAGEM = new Set(["5905", "6905", "5934", "6934"]);

/** A nota é remessa para armazenagem quando todos os itens têm CFOP de remessa para armazém geral (a mercadoria é do depositante, não é compra). */
export function ehRemessaArmazenagem(itens: { cfop: string }[]): boolean {
  return itens.length > 0 && itens.every((i) => CFOP_ARMAZENAGEM.has(i.cfop.replace(/\D/g, "")));
}

export type ParteCte = { documento?: string; nome?: string; ie?: string; endereco: EnderecoParte };

export type DetalheCte = {
  chave: string;
  numero?: string;
  serie?: string;
  emitidoEm?: Date;
  emitente: { documento?: string; nome?: string };
  remetente: ParteCte;
  destinatario: ParteCte;
  recebedor: ParteCte | null;
  tomadorDocumento: string;
  valorPrestacao?: number;
  valorCarga?: number;
  produtoPredominante?: string;
  pesoKg?: number;
  volumes?: number;
  /** chaves das NF-e transportadas (infDoc/infNFe) */
  nfes: string[];
};

/** Dados do CT-e para o armazém: remetente (depositante, em geral), carga declarada e NF-e transportadas. Null para outro documento. */
export function detalheCte(xml: string): DetalheCte | null {
  let p: No;
  try {
    p = lerXml(xml, { isArray: (nome) => nome === "infNFe" || nome === "infQ" || nome === "infNF" });
  } catch {
    return null;
  }
  const inf = (p.cteProc?.CTe?.infCte ?? p.CTe?.infCte) as No | undefined;
  if (!inf) return null;
  const parteCte = (x: No | undefined): ParteCte => ({ documento: parte(x) || undefined, nome: opc(x?.xNome), ie: opc(x?.IE), endereco: enderecoDe((x?.enderReme ?? x?.enderDest ?? x?.enderReceb ?? x?.enderExped) as No | undefined) });
  const norm = (inf.infCTeNorm ?? {}) as No;
  const carga = (norm.infCarga ?? {}) as No;
  let pesoKg: number | undefined;
  let volumes: number | undefined;
  for (const q of lista<No>(carga.infQ)) {
    const unidade = txt(q.cUnid);
    const valor = Number(txt(q.qCarga)) || 0;
    if (!valor) continue;
    if (unidade === "01" && pesoKg === undefined) pesoKg = valor;
    else if (unidade === "02" && pesoKg === undefined) pesoKg = valor * 1000;
    else if (unidade === "03" && volumes === undefined) volumes = Math.round(valor);
  }
  const chave = documento(txt(inf["@_Id"]).replace(/^CTe/, ""));
  return {
    chave,
    numero: opc(inf.ide?.nCT),
    serie: opc(inf.ide?.serie),
    emitidoEm: dataFiscal(inf.ide?.dhEmi),
    emitente: { documento: parte(inf.emit) || undefined, nome: opc(inf.emit?.xNome) },
    remetente: parteCte(inf.rem as No | undefined),
    destinatario: parteCte(inf.dest as No | undefined),
    recebedor: inf.receb ? parteCte(inf.receb as No) : null,
    tomadorDocumento: tomadorDoCte(inf),
    valorPrestacao: numero(inf.vPrest?.vTPrest),
    valorCarga: numero(carga.vCarga),
    produtoPredominante: opc(carga.proPred),
    pesoKg,
    volumes,
    nfes: lista<No>(norm.infDoc?.infNFe)
      .map((n) => documento(txt(n.chave)))
      .filter((c) => /^[0-9A-Z]{44}$/.test(c)),
  };
}
