// Leitura e geração de planilhas sem dependência nova: .xlsx (Office Open XML, o padrão do Excel) e .csv.
// Usa o fflate (ZIP) e o fast-xml-parser, que o projeto já tem. Só servidor.
//
// Cuidados na leitura (arquivo enviado pelo usuário):
// - ZIP aberto só nas partes necessárias, com teto de tamanho descompactado (zip bomb);
// - entidades de DOCTYPE nunca são expandidas (processEntities desligado); as predefinidas e as numéricas
//   são decodificadas uma vez, à parte;
// - valores ficam como texto exato (parseTagValue desligado): "00123" continua "00123";
// - colunas e linhas com teto (uma célula em XFD1 não cria um array gigante).
import "server-only";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

export type Celula = string | number | boolean | null;
export type LinhaPlanilha = { /** número da linha como o Excel mostra (1, 2, 3…) */ numero: number; celulas: Celula[] };
export type AbaPlanilha = { nome: string; linhas: LinhaPlanilha[] };
export type Planilha = { formato: "xlsx" | "csv"; abas: AbaPlanilha[] };

/** Erro de leitura com mensagem pronta para o usuário. */
export class ErroPlanilha extends Error {}

const LIMITE_DESCOMPACTADO = 40 * 1024 * 1024;
const MAX_COLUNAS = 60;
const MAX_LINHAS = 20_000;

// ───────────────────────────── leitura ─────────────────────────────

/** Lê um .xlsx ou .csv. Recusa .xls (97-2003), .ods e HTML disfarçado de planilha com instrução de como salvar. */
export function lerPlanilha(bytes: Uint8Array): Planilha {
  if (bytes.length === 0) throw new ErroPlanilha("O arquivo está vazio.");
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return lerXlsx(bytes);
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0)
    throw new ErroPlanilha("Arquivo .xls (Excel 97-2003) não é aceito. No Excel, use Arquivo › Salvar como › Pasta de Trabalho do Excel (.xlsx) e envie de novo.");
  return lerCsv(bytes);
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decodifica entidades (predefinidas e numéricas) numa passada só e os escapes _xHHHH_ do Excel. */
function decodificar(s: string): string {
  let t = s.includes("&")
    ? s.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos);/g, (inteiro, e: string) => {
        if (e[0] !== "#") return ENTIDADES[e]!;
        const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : inteiro;
      })
    : s;
  if (t.includes("_x")) t = t.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  return t;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type No = Record<string, any>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: false,
  isArray: (nome) => ["sheet", "Relationship", "si", "r", "row", "c"].includes(nome),
});

function xml(arquivos: Record<string, Uint8Array>, caminho: string): No | null {
  const a = arquivos[caminho];
  if (!a) return null;
  try {
    return parser.parse(strFromU8(a)) as No;
  } catch {
    throw new ErroPlanilha("A planilha está corrompida (XML inválido). Abra no Excel, salve de novo como .xlsx e envie.");
  }
}

/** Texto de um nó <t> (string, ou objeto com #text quando tem atributos como xml:space). */
function textoNo(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return decodificar(v);
  if (typeof v === "object" && "#text" in (v as No)) return decodificar(String((v as No)["#text"]));
  return "";
}

/** Texto de um <si> ou <is>: <t> direto ou a soma dos trechos <r><t> (texto com formatação). Ignora <rPh> (fonética). */
function textoRico(no: unknown): string {
  if (no === null || no === undefined || typeof no !== "object") return typeof no === "string" ? decodificar(no) : "";
  const n = no as No;
  let s = "t" in n ? textoNo(n.t) : "";
  for (const r of (n.r as No[] | undefined) ?? []) s += textoNo(r?.t);
  return s;
}

function colunaDe(ref: string): number {
  const m = /^([A-Z]{1,3})\d*$/i.exec(ref);
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1]!.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function lerXlsx(bytes: Uint8Array): Planilha {
  let total = 0;
  let arquivos: Record<string, Uint8Array>;
  const nomes: string[] = [];
  try {
    arquivos = unzipSync(bytes, {
      filter: (f) => {
        nomes.push(f.name);
        const quer = f.name === "xl/workbook.xml" || f.name === "xl/_rels/workbook.xml.rels" || f.name === "xl/sharedStrings.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(f.name);
        if (!quer) return false;
        total += f.originalSize;
        if (f.originalSize > LIMITE_DESCOMPACTADO || total > LIMITE_DESCOMPACTADO) throw new ErroPlanilha("A planilha é grande demais para importar de uma vez. Divida em arquivos menores.");
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ErroPlanilha) throw e;
    throw new ErroPlanilha("Não consegui abrir o arquivo: ele não é uma planilha .xlsx válida (ou está corrompido).");
  }
  if (!arquivos["xl/workbook.xml"]) {
    if (nomes.includes("content.xml") || nomes.includes("mimetype"))
      throw new ErroPlanilha("Arquivo do LibreOffice/OpenOffice (.ods) não é aceito. Use Arquivo › Salvar como › Excel 2007-365 (.xlsx) e envie de novo.");
    throw new ErroPlanilha("O arquivo não é uma planilha do Excel (.xlsx).");
  }
  const wb = xml(arquivos, "xl/workbook.xml");
  const rels = xml(arquivos, "xl/_rels/workbook.xml.rels");
  const alvo = new Map<string, string>();
  for (const r of (rels?.Relationships?.Relationship as No[] | undefined) ?? []) {
    const t = String(r["@_Target"] ?? "");
    const caminho = t.startsWith("/") ? t.slice(1) : `xl/${t.replace(/^\.\//, "")}`;
    alvo.set(String(r["@_Id"] ?? ""), caminho);
  }
  const compartilhados = ((xml(arquivos, "xl/sharedStrings.xml")?.sst?.si as unknown[] | undefined) ?? []).map(textoRico);
  const abas: AbaPlanilha[] = [];
  const folhas = (wb?.workbook?.sheets?.sheet as No[] | undefined) ?? [];
  folhas.forEach((s, i) => {
    const estado = String(s["@_state"] ?? "visible");
    if (estado !== "visible") return;
    const caminho = alvo.get(String(s["@_id"] ?? "")) ?? `xl/worksheets/sheet${i + 1}.xml`;
    const folha = xml(arquivos, caminho);
    if (!folha) return;
    abas.push({ nome: decodificar(String(s["@_name"] ?? `Planilha${i + 1}`)), linhas: linhasDaFolha(folha, compartilhados) });
  });
  if (!abas.length) throw new ErroPlanilha("A planilha não tem nenhuma aba visível com dados.");
  return { formato: "xlsx", abas };
}

function linhasDaFolha(folha: No, compartilhados: string[]): LinhaPlanilha[] {
  const saida: LinhaPlanilha[] = [];
  const rows = (folha.worksheet?.sheetData?.row as No[] | undefined) ?? [];
  let numeroAnterior = 0;
  for (const row of rows) {
    const numero = Number(row["@_r"]) || numeroAnterior + 1;
    numeroAnterior = numero;
    if (saida.length >= MAX_LINHAS) throw new ErroPlanilha(`A planilha passa de ${MAX_LINHAS.toLocaleString("pt-BR")} linhas. Divida em arquivos menores.`);
    const celulas: Celula[] = [];
    let colAnterior = -1;
    for (const c of (row.c as No[] | undefined) ?? []) {
      const ref = String(c["@_r"] ?? "");
      const col = ref ? colunaDe(ref) : colAnterior + 1;
      colAnterior = col;
      if (col < 0 || col >= MAX_COLUNAS) continue;
      const v = c.v === undefined ? undefined : textoNo(c.v);
      const tipo = String(c["@_t"] ?? "n");
      let valor: Celula = null;
      if (tipo === "s") valor = v === undefined || v === "" ? null : (compartilhados[Number(v)] ?? null);
      else if (tipo === "inlineStr") valor = textoRico(c.is);
      else if (tipo === "str" || tipo === "e" || tipo === "d") valor = v ?? null;
      else if (tipo === "b") valor = v === undefined ? null : v === "1" || v.toLowerCase() === "true";
      else if (v !== undefined && v.trim() !== "") {
        const n = Number(v);
        valor = Number.isFinite(n) ? n : v;
      }
      if (typeof valor === "string") valor = valor.trim() || null;
      while (celulas.length < col) celulas.push(null);
      celulas[col] = valor;
    }
    if (celulas.some((x) => x !== null)) saida.push({ numero, celulas });
  }
  return saida;
}

/** CSV do Excel brasileiro: separador ";" (ou "," / tab), aspas, UTF-8 ou Windows-1252, linha "sep=;" opcional. */
function lerCsv(bytes: Uint8Array): Planilha {
  let texto: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) texto = new TextDecoder("utf-16le").decode(bytes);
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) texto = new TextDecoder("utf-16be").decode(bytes);
  else
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      texto = new TextDecoder("windows-1252").decode(bytes);
    }
  texto = texto.replace(/^\uFEFF/, "");
  if (/^\s*</.test(texto)) throw new ErroPlanilha("Este arquivo parece uma página da web (HTML) com nome de planilha. Abra no Excel e salve como Pasta de Trabalho do Excel (.xlsx).");
  if (/[\u0000-\u0008\u000E-\u001F]/.test(texto.slice(0, 4096))) throw new ErroPlanilha("Formato não reconhecido. Envie uma planilha .xlsx (Excel) ou .csv.");
  let delimitador = "";
  const sep = /^sep=(.)\r?\n/i.exec(texto);
  if (sep) {
    delimitador = sep[1]!;
    texto = texto.slice(sep[0].length);
  } else {
    const primeira = texto.split(/\r?\n/).find((l) => l.trim()) ?? "";
    const conta = (ch: string) => primeira.replace(/"[^"]*"/g, "").split(ch).length - 1;
    delimitador = [";", "\t", ","].reduce((melhor, ch) => (conta(ch) > conta(melhor) ? ch : melhor), ";");
  }
  const linhas: LinhaPlanilha[] = [];
  let campo = "";
  let linha: Celula[] = [];
  let aspas = false;
  let numero = sep ? 2 : 1;
  let inicioLinha = numero;
  const fecharCampo = () => {
    const t = campo.trim();
    if (linha.length < MAX_COLUNAS) linha.push(t === "" ? null : t);
    campo = "";
  };
  const fecharLinha = () => {
    fecharCampo();
    if (linha.some((x) => x !== null)) {
      if (linhas.length >= MAX_LINHAS) throw new ErroPlanilha(`O arquivo passa de ${MAX_LINHAS.toLocaleString("pt-BR")} linhas. Divida em arquivos menores.`);
      linhas.push({ numero: inicioLinha, celulas: linha });
    }
    linha = [];
  };
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]!;
    if (aspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else {
        if (ch === "\n") numero++;
        campo += ch;
      }
      continue;
    }
    if (ch === '"' && campo.trim() === "") {
      campo = "";
      aspas = true;
    } else if (ch === delimitador) fecharCampo();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      fecharLinha();
      numero++;
      inicioLinha = numero;
    } else campo += ch;
  }
  if (campo !== "" || linha.length) fecharLinha();
  return { formato: "csv", abas: [{ nome: "CSV", linhas }] };
}

// ───────────────────────────── geração ─────────────────────────────

export type EstiloCelula = "cabecalho" | "cabecalhoReferencia" | "moeda" | "referencia" | "titulo" | "negrito" | "quebra" | "texto";
export type CelulaSaida = Celula | { valor: Celula; estilo?: EstiloCelula };
export type ColunaSaida = { largura: number; /** formato da coluna inteira (vale para o que o usuário digitar) */ estilo?: EstiloCelula };
export type ValidacaoLista = { coluna: number; opcoes: string[]; /** recusa valor fora da lista (senão só sugere) */ estrita: boolean; titulo?: string; mensagem?: string };
export type AbaSaida = { nome: string; colunas: ColunaSaida[]; linhas: CelulaSaida[][]; congelarPrimeiraLinha?: boolean; validacoes?: ValidacaoLista[]; linhasValidadas?: number };

const ESTILO: Record<EstiloCelula, number> = { cabecalho: 1, moeda: 2, referencia: 3, titulo: 4, negrito: 5, quebra: 6, cabecalhoReferencia: 7, texto: 8 };

const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const CABECALHO_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const escapar = (s: string) =>
  s
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function letraColuna(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const nomeAbaValido = (n: string) => n.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Planilha";

function celulaXml(c: CelulaSaida, ref: string): string {
  const { valor, estilo } = c !== null && typeof c === "object" ? c : { valor: c, estilo: undefined };
  const s = estilo ? ` s="${ESTILO[estilo]}"` : "";
  if (valor === null || valor === undefined || valor === "") return s ? `<c r="${ref}"${s}/>` : "";
  if (typeof valor === "number") return Number.isFinite(valor) ? `<c r="${ref}"${s}><v>${valor}</v></c>` : "";
  if (typeof valor === "boolean") return `<c r="${ref}"${s} t="b"><v>${valor ? 1 : 0}</v></c>`;
  const texto = escapar(String(valor).slice(0, 32_000));
  const preservar = /^\s|\s$|\n/.test(texto) ? ' xml:space="preserve"' : "";
  return `<c r="${ref}"${s} t="inlineStr"><is><t${preservar}>${texto}</t></is></c>`;
}

function folhaXml(aba: AbaSaida, primeira: boolean): string {
  const ultimaColuna = letraColuna(Math.max(aba.colunas.length, 1) - 1);
  const dim = `A1:${ultimaColuna}${Math.max(aba.linhas.length, 1)}`;
  const visao = aba.congelarPrimeiraLinha
    ? `<sheetView workbookViewId="0"${primeira ? ' tabSelected="1"' : ""}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>`
    : `<sheetView workbookViewId="0"${primeira ? ' tabSelected="1"' : ""}/>`;
  const cols = aba.colunas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura}"${c.estilo ? ` style="${ESTILO[c.estilo]}"` : ""} customWidth="1"/>`).join("");
  const linhas = aba.linhas
    .map((l, i) => {
      const cel = l.map((c, j) => celulaXml(c, `${letraColuna(j)}${i + 1}`)).join("");
      return cel ? `<row r="${i + 1}">${cel}</row>` : "";
    })
    .join("");
  const ate = aba.linhasValidadas ?? 1000;
  const validacoes = (aba.validacoes ?? [])
    .filter((v) => v.opcoes.length)
    .map((v) => {
      const lista = `"${v.opcoes.map((o) => o.replace(/[",]/g, " ")).join(",")}"`;
      if (lista.length > 255) throw new Error("Lista de validação do Excel passa de 255 caracteres.");
      const col = letraColuna(v.coluna);
      const aviso = v.estrita
        ? ` showErrorMessage="1" errorStyle="stop"${v.titulo ? ` errorTitle="${escapar(v.titulo).replace(/"/g, "&quot;")}"` : ""}${v.mensagem ? ` error="${escapar(v.mensagem).replace(/"/g, "&quot;")}"` : ""}`
        : ' showErrorMessage="0"';
      return `<dataValidation type="list" allowBlank="1" showInputMessage="1"${aviso} sqref="${col}2:${col}${ate}"><formula1>${escapar(lista)}</formula1></dataValidation>`;
    });
  return (
    CABECALHO_XML +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<dimension ref="${dim}"/>` +
    `<sheetViews>${visao}</sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${linhas}</sheetData>` +
    (validacoes.length ? `<dataValidations count="${validacoes.length}">${validacoes.join("")}</dataValidations>` : "") +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    "</worksheet>"
  );
}

const ESTILOS_XML =
  CABECALHO_XML +
  `<styleSheet xmlns="${NS_MAIN}">` +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00##"/></numFmts>' +
  '<fonts count="5">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><sz val="11"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>' +
  "</fonts>" +
  '<fills count="4">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF9"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>' +
  "</fills>" +
  '<borders count="2">' +
  "<border><left/><right/><top/><bottom/><diagonal/></border>" +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FF9CA3AF"/></bottom><diagonal/></border>' +
  "</borders>" +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="9">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

/** Gera um .xlsx (abas com larguras, formatos, cabeçalho congelado e listas de opções). */
export function gerarXlsx(abas: AbaSaida[]): Uint8Array {
  if (!abas.length) throw new Error("Planilha sem abas.");
  const nomes = abas.map((a) => nomeAbaValido(a.nome));
  const arquivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      CABECALHO_XML +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>",
    ),
    "_rels/.rels": strToU8(`${CABECALHO_XML}<Relationships xmlns="${NS_PKG}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(
      `${CABECALHO_XML}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>` +
        nomes.map((n, i) => `<sheet name="${escapar(n).replace(/"/g, "&quot;")}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        "</sheets></workbook>",
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${CABECALHO_XML}<Relationships xmlns="${NS_PKG}">` +
        abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${abas.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(ESTILOS_XML),
  };
  abas.forEach((a, i) => {
    arquivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(folhaXml(a, i === 0));
  });
  return zipSync(arquivos, { level: 6 });
}
