// Leitor de extratos OFX (1.x SGML e 2.x XML).
// Sem dependências e sem imports de alias: pode rodar no servidor, no navegador ou em scripts (node arquivo.ts).

export type ContaOfx = {
  /** BANKID (código do banco) */
  banco: string | null;
  /** BRANCHID (agência) */
  agencia: string | null;
  /** ACCTID (número da conta, às vezes com agência/dígito) */
  numero: string | null;
  /** ACCTTYPE (CHECKING, SAVINGS…) ou "CREDITCARD" para faturas de cartão */
  tipo: string | null;
};

export type TransacaoOfx = {
  /** FITID do banco ou um id estável gerado quando ausente */
  fitId: string;
  /** 'YYYY-MM-DD' */
  data: string;
  /** Com sinal: crédito > 0, débito < 0 */
  valor: number;
  /** MEMO e/ou NAME com espaços normalizados */
  descricao: string;
  /** CHECKNUM ou REFNUM */
  documento?: string;
  /** TRNTYPE (CREDIT, DEBIT, PAYMENT, XFER, OTHER…) */
  tipo: string;
};

export type ExtratoOfx = {
  conta: ContaOfx;
  /** CURDEF (ex.: BRL) */
  moeda: string | null;
  /** DTSTART (ou a menor data das transações) */
  inicio: string | null;
  /** DTEND (ou a maior data das transações) */
  fim: string | null;
  /** LEDGERBAL: saldo final informado pelo banco */
  saldo?: { valor: number; data: string | null };
  transacoes: TransacaoOfx[];
  formato: "SGML" | "XML";
  versao: string | null;
  codificacao: string;
  /** Observações não bloqueantes sobre a leitura */
  avisos: string[];
};

export class ErroOfx extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroOfx";
  }
}

// ───────────── Decodificação ─────────────

const RE_LATINO = /1252|8859|LATIN|WINDOWS|ANSI|CP125/;

function cabecalhoAscii(bytes: Uint8Array): string {
  let s = "";
  const n = Math.min(bytes.length, 4096);
  for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** Charset declarado no cabeçalho SGML (CHARSET/ENCODING) ou na declaração XML. */
function charsetDeclarado(cabecalho: string): "windows-1252" | "utf-8" | null {
  const up = cabecalho.toUpperCase();
  const xml = /<\?XML[^>]*ENCODING\s*=\s*["']([^"']+)["']/.exec(up);
  if (xml) {
    if (/UTF-?8/.test(xml[1])) return "utf-8";
    if (RE_LATINO.test(xml[1])) return "windows-1252";
  }
  const charset = /(?:^|\s)CHARSET\s*:\s*([^\r\n<]*)/.exec(up)?.[1]?.trim() ?? "";
  const encoding = /(?:^|\s)ENCODING\s*:\s*([^\r\n<]*)/.exec(up)?.[1]?.trim() ?? "";
  if (RE_LATINO.test(charset) || RE_LATINO.test(encoding)) return "windows-1252";
  if (/UTF-?8|UNICODE/.test(encoding) || /UTF-?8/.test(charset)) return "utf-8";
  return null;
}

function utf8Estrito(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function decodificar(bytes: Uint8Array): { texto: string; codificacao: string } {
  // BOMs
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const corpo = bytes.subarray(3);
    const t = utf8Estrito(corpo);
    return t !== null ? { texto: t, codificacao: "utf-8" } : { texto: new TextDecoder("windows-1252").decode(corpo), codificacao: "windows-1252" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { texto: new TextDecoder("utf-16le").decode(bytes.subarray(2)), codificacao: "utf-16le" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { texto: new TextDecoder("utf-16be").decode(bytes.subarray(2)), codificacao: "utf-16be" };
  // UTF-16 sem BOM (arquivos salvos por ferramentas do Windows)
  if (bytes.length >= 4 && bytes[0] !== 0 && bytes[1] === 0 && bytes[3] === 0) return { texto: new TextDecoder("utf-16le").decode(bytes), codificacao: "utf-16le" };
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[2] === 0 && bytes[1] !== 0) return { texto: new TextDecoder("utf-16be").decode(bytes), codificacao: "utf-16be" };

  let temAlto = false;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] >= 0x80) {
      temAlto = true;
      break;
    }
  }
  if (!temAlto) return { texto: new TextDecoder("utf-8").decode(bytes), codificacao: "ascii" };

  const declarado = charsetDeclarado(cabecalhoAscii(bytes));
  const utf8 = utf8Estrito(bytes);
  if (declarado === "windows-1252") {
    // Alguns bancos declaram CHARSET:1252 mas exportam UTF-8. Texto latino real quase nunca forma
    // sequências UTF-8 válidas (ex.: "ç" seguido de letra ASCII é inválido em UTF-8), então só
    // trocamos de codificação quando o conteúdo é UTF-8 estritamente válido.
    if (utf8 !== null) return { texto: utf8, codificacao: "utf-8" };
    return { texto: new TextDecoder("windows-1252").decode(bytes), codificacao: "windows-1252" };
  }
  // UTF-8 declarado ou indefinido: tenta UTF-8 e cai para windows-1252 se houver bytes inválidos.
  if (utf8 !== null) return { texto: utf8, codificacao: "utf-8" };
  return { texto: new TextDecoder("windows-1252").decode(bytes), codificacao: "windows-1252" };
}

// ───────────── Árvore de tags (tolerante a SGML sem fechamento e a XML) ─────────────

type No = { nome: string; valor: string | null; filhos: No[] };

/** Agregados conhecidos do OFX (usados quando o arquivo não fecha as tags). */
const AGREGADOS = new Set([
  "OFX", "SIGNONMSGSRSV1", "SONRS", "STATUS", "FI", "BANKMSGSRSV1", "STMTTRNRS", "STMTRS", "BANKACCTFROM",
  "BANKACCTTO", "CCACCTFROM", "CCACCTTO", "BANKTRANLIST", "STMTTRN", "PAYEE", "LEDGERBAL", "AVAILBAL",
  "BALLIST", "BAL", "CREDITCARDMSGSRSV1", "CCSTMTTRNRS", "CCSTMTRS", "CURRENCY", "ORIGCURRENCY",
]);

function decodificarEntidades(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, ent: string) => {
    const e = ent.toLowerCase();
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    if (e === "nbsp") return " ";
    const cp = e.startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
}

function nomeTag(bruto: string): string {
  return bruto.trim().split(/[\s/]/)[0].toUpperCase();
}

function montarArvore(texto: string, inicio: number): No {
  const raiz: No = { nome: "#RAIZ", valor: null, filhos: [] };
  // Tags com fechamento explícito em algum ponto do arquivo são agregados (em SGML, folhas não fecham).
  const comFechamento = new Set<string>();
  for (const m of texto.matchAll(/<\/\s*([A-Za-z0-9_.:-]+)\s*>/g)) comFechamento.add(m[1].toUpperCase());

  const pilha: No[] = [raiz];
  let i = texto.indexOf("<", inicio);
  while (i !== -1) {
    if (texto.startsWith("<!--", i)) {
      const f = texto.indexOf("-->", i + 4);
      i = f === -1 ? -1 : texto.indexOf("<", f + 3);
      continue;
    }
    const fim = texto.indexOf(">", i + 1);
    if (fim === -1) break;
    const bruto = texto.slice(i + 1, fim).trim();
    const prox = texto.indexOf("<", fim + 1);
    const conteudo = texto.slice(fim + 1, prox === -1 ? texto.length : prox).trim();
    i = prox;
    if (!bruto || bruto[0] === "?" || bruto[0] === "!") continue;

    if (bruto[0] === "/") {
      const nome = nomeTag(bruto.slice(1));
      for (let k = pilha.length - 1; k > 0; k--) {
        if (pilha[k].nome === nome) {
          pilha.length = k;
          break;
        }
      }
      continue; // fechamento de folha (XML) ou avulso: ignorado
    }

    const nome = nomeTag(bruto);
    if (!nome) continue;
    const topo = pilha[pilha.length - 1];
    if (bruto.endsWith("/")) {
      topo.filhos.push({ nome, valor: "", filhos: [] });
      continue;
    }
    if (conteudo !== "") {
      topo.filhos.push({ nome, valor: decodificarEntidades(conteudo), filhos: [] });
      continue;
    }
    // Conteúdo vazio: folha vazia XML (<MEMO></MEMO>), folha vazia SGML ou início de agregado.
    if (prox !== -1 && /^<\/\s*([A-Za-z0-9_.:-]+)\s*>/.exec(texto.slice(prox, prox + 64))?.[1]?.toUpperCase() === nome && !AGREGADOS.has(nome)) {
      topo.filhos.push({ nome, valor: "", filhos: [] });
      continue;
    }
    if (AGREGADOS.has(nome) || comFechamento.has(nome)) {
      const no: No = { nome, valor: null, filhos: [] };
      topo.filhos.push(no);
      pilha.push(no);
      continue;
    }
    topo.filhos.push({ nome, valor: "", filhos: [] });
  }
  return raiz;
}

function folha(no: No | undefined, nome: string): string | null {
  if (!no) return null;
  const f = no.filhos.find((x) => x.nome === nome && x.valor !== null);
  return f?.valor ? f.valor : null;
}

function buscar(no: No, nome: string): No | undefined {
  for (const f of no.filhos) {
    if (f.nome === nome) return f;
    if (f.valor === null) {
      const r = buscar(f, nome);
      if (r) return r;
    }
  }
  return undefined;
}

function buscarTodos(no: No, nomes: string[], out: No[] = []): No[] {
  for (const f of no.filhos) {
    if (nomes.includes(f.nome)) out.push(f);
    if (f.valor === null) buscarTodos(f, nomes, out);
  }
  return out;
}

// ───────────── Valores ─────────────

/** 'YYYYMMDD[HHMMSS[.XXX]][[-3:BRT]]' → 'YYYY-MM-DD' (data como escrita pelo banco, sem conversão de fuso). */
export function dataOfx(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  let m = /^(\d{4})(\d{2})(\d{2})/.exec(t);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t))) [y, mo, d] = [Number(m[3]), Number(m[2]), Number(m[1])];
  else return null;
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Valor com ponto ou vírgula decimal ("-1234.56", "-1.234,56", "50,00", "+10", "50.00-") → número com 2 casas. */
export function valorOfx(s: string | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  let t = s.replace(/\s+/g, "").replace(/[^\d,.+-]/g, "");
  let negativo = false;
  if (t.startsWith("+")) t = t.slice(1);
  if (t.startsWith("-")) {
    negativo = true;
    t = t.slice(1);
  } else if (t.endsWith("-")) {
    negativo = true;
    t = t.slice(0, -1);
  }
  if (!t || /[+-]/.test(t)) return null;
  const virgula = t.lastIndexOf(",");
  const ponto = t.lastIndexOf(".");
  if (virgula !== -1 && ponto !== -1) {
    t = virgula > ponto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (virgula !== -1) {
    t = (t.match(/,/g) ?? []).length === 1 ? t.replace(",", ".") : t.replace(/,/g, "");
  } else if (ponto !== -1 && (t.match(/\./g) ?? []).length > 1) {
    // "1.234.567" (milhar) ou "1.234.56" (último ponto decimal)
    const casas = t.length - ponto - 1;
    t = casas <= 2 ? `${t.slice(0, ponto).replace(/\./g, "")}.${t.slice(ponto + 1)}` : t.replace(/\./g, "");
  }
  if (!/^\d*(\.\d*)?$/.test(t) || !/\d/.test(t)) return null;
  // Arredondamento exato em centavos a partir do texto (evita erros de ponto flutuante).
  const [inteiro, fracao = ""] = t.split(".");
  const f = `${fracao}000`;
  let centavos = Number(inteiro || "0") * 100 + Number(f.slice(0, 2));
  if (Number(f[2]) >= 5) centavos += 1;
  if (!Number.isFinite(centavos)) return null;
  if (centavos === 0) return 0;
  return (negativo ? -centavos : centavos) / 100;
}

function normalizarEspacos(s: string): string {
  return s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/g, " ")
    .trim();
}

/** Hash simples (cyrb53) para gerar ids estáveis. */
function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** TRNTYPEs que, em extrato de conta, são sempre saídas (ATM e POS podem ser entrada ou saída no padrão OFX). */
const TIPOS_DEBITO = new Set(["DEBIT", "PAYMENT", "CHECK", "FEE", "SRVCHG", "DIRECTDEBIT", "CASH"]);
const RE_LINHA_SALDO = /^(saldo\s+(anterior|do\s+dia|final|inicial|atual|total|disponivel|dispon\u00edvel|bloqueado|em\s+c\/?c)|s\s+a\s+l\s+d\s+o|sdo\s+(anterior|do\s+dia|final))\b/i;

function combinarDescricao(nome: string | null, memo: string | null): string {
  const n = nome ? normalizarEspacos(nome) : "";
  const m = memo ? normalizarEspacos(memo) : "";
  if (!n) return m;
  if (!m) return n;
  const nl = n.toLowerCase();
  const ml = m.toLowerCase();
  if (ml.includes(nl)) return m;
  if (nl.includes(ml)) return n;
  return `${n} · ${m}`;
}

// ───────────── Leitura principal ─────────────

/**
 * Lê um extrato OFX (bytes do arquivo ou texto já decodificado).
 * Lança ErroOfx com mensagem amigável quando o conteúdo não é um OFX de conta/cartão.
 */
export function lerOfx(entrada: Uint8Array | ArrayBuffer | string): ExtratoOfx {
  let texto: string;
  let codificacao: string;
  let bytes: Uint8Array | null = null;
  if (typeof entrada === "string") {
    texto = entrada;
    codificacao = "texto";
  } else {
    bytes = entrada instanceof Uint8Array ? entrada : new Uint8Array(entrada);
    if (!bytes.length) throw new ErroOfx("O arquivo está vazio.");
    ({ texto, codificacao } = decodificar(bytes));
  }
  texto = texto.replace(/^\uFEFF/, "");

  const comeco = texto.slice(0, 1024).trimStart();
  if (comeco.startsWith("%PDF")) throw new ErroOfx("O arquivo enviado é um PDF. No internet banking, exporte o extrato no formato OFX (Money/Quicken).");
  if (bytes && bytes[0] === 0x50 && bytes[1] === 0x4b) throw new ErroOfx("O arquivo enviado é uma planilha ou um arquivo compactado (ZIP/XLSX). Exporte o extrato no formato OFX.");

  const posOfx = /<OFX[\s>]/i.exec(texto);
  if (!posOfx) {
    if (/OFXHEADER/i.test(comeco)) throw new ErroOfx("Arquivo OFX incompleto: a seção <OFX> não foi encontrada.");
    throw new ErroOfx("O arquivo não parece ser um extrato OFX. No internet banking, exporte o extrato no formato OFX (Money/Quicken).");
  }

  const cabecalho = texto.slice(0, posOfx.index);
  const formato: "SGML" | "XML" = /<\?(xml|ofx)\b/i.test(cabecalho) || /OFXHEADER\s*=\s*["']?2/i.test(cabecalho) ? "XML" : "SGML";
  const versao =
    /<\?OFX[^>]*VERSION\s*=\s*["']?(\d+)/i.exec(cabecalho)?.[1] ??
    /(?:^|\s)VERSION\s*:\s*(\d+)/i.exec(cabecalho)?.[1] ??
    null;

  // Seções CDATA (raras em OFX 2.x) viram texto escapado antes da leitura das tags.
  let corpo = texto.slice(posOfx.index);
  if (corpo.includes("<![CDATA[")) {
    corpo = corpo.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, c: string) => c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  }
  const raiz = montarArvore(corpo, 0);
  const avisos: string[] = [];

  const extratos = buscarTodos(raiz, ["STMTRS", "CCSTMTRS"]);
  let extrato: No | undefined = extratos.find((e) => buscarTodos(e, ["STMTTRN"]).length > 0) ?? extratos[0];
  if (!extrato) {
    if (buscarTodos(raiz, ["STMTTRN"]).length) {
      extrato = raiz;
      avisos.push("Estrutura incomum: o extrato não está dentro de <STMTRS>; as transações foram lidas mesmo assim.");
    } else {
      throw new ErroOfx("O arquivo OFX não contém extrato de conta corrente ou de cartão (STMTRS/CCSTMTRS).");
    }
  }
  if (extratos.length > 1) {
    avisos.push(`O arquivo contém ${extratos.length} contas; apenas a primeira com lançamentos foi lida.`);
  }

  const contaNo = buscar(extrato, "BANKACCTFROM") ?? buscar(extrato, "CCACCTFROM");
  const cartao = extrato.nome === "CCSTMTRS" || contaNo?.nome === "CCACCTFROM";
  const limpar = (v: string | null) => (v ? normalizarEspacos(v) || null : null);
  const conta: ContaOfx = {
    banco: limpar(folha(contaNo, "BANKID")),
    agencia: limpar(folha(contaNo, "BRANCHID")),
    numero: limpar(folha(contaNo, "ACCTID")),
    tipo: cartao ? "CREDITCARD" : limpar(folha(contaNo, "ACCTTYPE")),
  };
  const moeda = limpar(folha(extrato, "CURDEF"))?.toUpperCase() ?? null;

  const lista = buscar(extrato, "BANKTRANLIST");
  let inicio = dataOfx(folha(lista, "DTSTART"));
  let fim = dataOfx(folha(lista, "DTEND"));

  // Transações
  type Bruta = { fitId: string | null; data: string; valor: number; descricao: string; documento?: string; tipo: string };
  const brutas: Bruta[] = [];
  let semData = 0;
  let semValor = 0;
  let zeradas = 0;
  let linhasSaldo = 0;
  for (const t of buscarTodos(extrato, ["STMTTRN"])) {
    const data = dataOfx(folha(t, "DTPOSTED")) ?? dataOfx(folha(t, "DTUSER")) ?? dataOfx(folha(t, "DTAVAIL"));
    if (!data) {
      semData++;
      continue;
    }
    const valor = valorOfx(folha(t, "TRNAMT"));
    if (valor === null) {
      semValor++;
      continue;
    }
    const payee = t.filhos.find((f) => f.nome === "PAYEE" && f.valor === null);
    const descricaoBase = combinarDescricao(folha(t, "NAME") ?? folha(payee, "NAME"), folha(t, "MEMO"));
    if (valor === 0) {
      zeradas++;
      continue;
    }
    if (RE_LINHA_SALDO.test(descricaoBase)) {
      linhasSaldo++;
      continue;
    }
    const tipo = (folha(t, "TRNTYPE") ?? "").trim().toUpperCase() || (valor > 0 ? "CREDIT" : "DEBIT");
    const docBruto = normalizarEspacos(folha(t, "CHECKNUM") ?? "") || normalizarEspacos(folha(t, "REFNUM") ?? "");
    const documento = docBruto && !/^0+$/.test(docBruto) ? docBruto.slice(0, 60) : undefined;
    const fitBruto = normalizarEspacos(folha(t, "FITID") ?? "");
    brutas.push({
      fitId: fitBruto ? fitBruto.slice(0, 200) : null,
      data,
      valor,
      descricao: (descricaoBase || (valor > 0 ? "Crédito" : "Débito")).slice(0, 500),
      documento,
      tipo,
    });
  }
  if (semData) avisos.push(`${semData} transação(ões) sem data válida foram descartadas.`);
  if (semValor) avisos.push(`${semValor} transação(ões) sem valor válido foram descartadas.`);
  if (zeradas) avisos.push(`${zeradas} transação(ões) com valor zero foram ignoradas.`);
  if (linhasSaldo) avisos.push(`${linhasSaldo} linha(s) de saldo informativo (ex.: "Saldo anterior") foram ignoradas.`);

  // Extrato de conta com todos os valores positivos: deduz o sinal pelo TRNTYPE (não vale para cartão,
  // onde PAYMENT é o pagamento da fatura, um crédito).
  if (!cartao && brutas.length && brutas.every((b) => b.valor > 0) && brutas.some((b) => TIPOS_DEBITO.has(b.tipo))) {
    let invertidas = 0;
    for (const b of brutas) {
      if (TIPOS_DEBITO.has(b.tipo)) {
        b.valor = -b.valor;
        invertidas++;
      }
    }
    avisos.push(`Os valores do arquivo vieram sem sinal; ${invertidas} lançamento(s) foram tratados como débito pelo tipo da transação.`);
  }

  // FITIDs: gera ids estáveis quando ausentes e diferencia FITIDs repetidos dentro do arquivo.
  const ocorrenciasChave = new Map<string, number>();
  const ocorrenciasFit = new Map<string, number>();
  let gerados = 0;
  let repetidos = 0;
  const transacoes: TransacaoOfx[] = brutas.map((b) => {
    let fitId: string;
    if (b.fitId) {
      const n = (ocorrenciasFit.get(b.fitId) ?? 0) + 1;
      ocorrenciasFit.set(b.fitId, n);
      fitId = n === 1 ? b.fitId : `${b.fitId}#${n}`;
      if (n > 1) repetidos++;
    } else {
      const chave = `${b.data}|${Math.round(b.valor * 100)}|${b.descricao.toLowerCase()}`;
      const n = (ocorrenciasChave.get(chave) ?? 0) + 1;
      ocorrenciasChave.set(chave, n);
      fitId = `SEMFITID-${hash(`${chave}|${n}`)}`;
      gerados++;
    }
    const tr: TransacaoOfx = { fitId, data: b.data, valor: b.valor, descricao: b.descricao, tipo: b.tipo };
    if (b.documento) tr.documento = b.documento;
    return tr;
  });
  if (gerados) avisos.push(`${gerados} transação(ões) sem FITID receberam um identificador gerado a partir de data, valor e descrição.`);
  if (repetidos) avisos.push(`${repetidos} FITID(s) repetido(s) no arquivo foram diferenciados para não perder lançamentos.`);

  if (transacoes.length) {
    const datas = transacoes.map((t) => t.data).sort();
    if (!inicio) inicio = datas[0];
    if (!fim) fim = datas[datas.length - 1];
  }
  if (inicio && fim && inicio > fim) [inicio, fim] = [fim, inicio];

  const ledger = buscar(extrato, "LEDGERBAL");
  const saldoValor = valorOfx(folha(ledger, "BALAMT"));
  const resultado: ExtratoOfx = {
    conta,
    moeda,
    inicio,
    fim,
    transacoes,
    formato,
    versao,
    codificacao,
    avisos,
  };
  if (saldoValor !== null) resultado.saldo = { valor: saldoValor, data: dataOfx(folha(ledger, "DTASOF")) ?? fim };
  return resultado;
}

/** Alias em inglês para quem procurar por "parseOfx". */
export const parseOfx = lerOfx;
