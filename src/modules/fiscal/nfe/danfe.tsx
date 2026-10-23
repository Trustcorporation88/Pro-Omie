// DANFE (retrato, A4) gerado a partir do XML autorizado (nfeProc), para notas da SEFAZ direto ou da Focus. Só servidor.
// Blocos na ordem do Manual de Orientação do Contribuinte (Anexo II). Código de barras CODE-128C da chave com cerca de
// 7,8 cm × 1,1 cm (mínimo 6 cm × 0,8 cm). Fonte Helvetica (WinAnsi): sem caracteres fora da tabela (ex.: U+2212).
import "server-only";
import { Document, Page, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { lerXml, lista, txt, type No } from "../xml";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CODE128C } = require("jsbarcode/bin/barcodes/CODE128/index.js") as { CODE128C: new (d: string, o: object) => { encode: () => { data: string } } };

const fmtDoc = (d: string) =>
  d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;
const fmtNum = (v: string | number, casas = 2) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const fmtQtd = (v: string) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const fmtData = (v: string) => (v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const fmtHora = (v: string) => (v ? new Date(v).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");
const fmtCep = (c: string) => (c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : c);
const nnf = (n: string) => n.padStart(9, "0").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1.$2.$3");
const seguro = (s: string) => s.replace(/[\u2212\u2013\u2014]/g, "-").replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

const MOD_FRETE: Record<string, string> = {
  "0": "0 - Por conta do emitente",
  "1": "1 - Por conta do destinatário",
  "2": "2 - Por conta de terceiros",
  "3": "3 - Próprio por conta do remetente",
  "4": "4 - Próprio por conta do destinatário",
  "9": "9 - Sem ocorrência de transporte",
};

const s = StyleSheet.create({
  pagina: { padding: 18, fontSize: 7, fontFamily: "Helvetica", color: "#000" },
  linha: { flexDirection: "row" },
  caixa: { borderWidth: 0.6, borderColor: "#000", paddingHorizontal: 3, paddingVertical: 2, minHeight: 20 },
  rot: { fontSize: 5, textTransform: "uppercase", marginBottom: 1 },
  val: { fontSize: 7.5 },
  valN: { fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  titulo: { fontSize: 6.5, fontFamily: "Helvetica-Bold", marginTop: 5, marginBottom: 1 },
  th: { fontSize: 5, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  td: { fontSize: 6.5 },
  marca: { position: "absolute", top: 360, left: 40, right: 40, textAlign: "center", fontSize: 58, color: "#d4d4d4", fontFamily: "Helvetica-Bold", transform: "rotate(-30deg)" },
});

function Campo({ rotulo, valor, largura, alinhar, negrito, altura }: { rotulo: string; valor?: string; largura: string | number; alinhar?: "right" | "center"; negrito?: boolean; altura?: number }) {
  return (
    <View style={[s.caixa, { width: largura, minHeight: altura ?? 20 }]}>
      <Text style={s.rot}>{rotulo}</Text>
      <Text style={[negrito ? s.valN : s.val, alinhar ? { textAlign: alinhar } : {}]}>{seguro(valor ?? "")}</Text>
    </View>
  );
}

function CodigoBarras({ chave, largura, altura }: { chave: string; largura: number; altura: number }) {
  const modulos = new CODE128C(chave, {}).encode().data;
  const m = largura / modulos.length;
  const barras: { x: number; w: number }[] = [];
  for (let i = 0; i < modulos.length; ) {
    if (modulos[i] !== "1") {
      i++;
      continue;
    }
    let j = i;
    while (j < modulos.length && modulos[j] === "1") j++;
    barras.push({ x: i * m, w: (j - i) * m });
    i = j;
  }
  return (
    <Svg width={largura} height={altura}>
      {barras.map((b, k) => (
        <Rect key={k} x={b.x} y={0} width={b.w} height={altura} fill="#000" />
      ))}
    </Svg>
  );
}

export type OpcoesDanfe = { cancelada?: boolean; cancelamento?: { protocolo: string | null; em: Date | null } | null };

function Danfe({ p, opcoes }: { p: No; opcoes: OpcoesDanfe }) {
  const nfe = (p.nfeProc?.NFe ?? p.NFe) as No;
  const inf = nfe.infNFe as No;
  const prot = p.nfeProc?.protNFe?.infProt as No | undefined;
  const ide = inf.ide as No;
  const emit = inf.emit as No;
  const ee = emit.enderEmit as No;
  const dest = (inf.dest ?? {}) as No;
  const ed = (dest.enderDest ?? {}) as No;
  const tot = inf.total.ICMSTot as No;
  const chave = txt(inf["@_Id"]).replace(/^NFe/, "");
  const homolog = txt(ide.tpAmb) === "2";
  const contingencia = txt(ide.tpEmis) === "6";
  const dups = lista<No>(inf.cobr?.dup);
  const itens = lista<No>(inf.det);
  const infCpl = txt(inf.infAdic?.infCpl);
  const docDest = txt(dest.CNPJ) || txt(dest.CPF);
  const enderecoEmit = [txt(ee.xLgr), txt(ee.nro), txt(ee.xCpl)].filter(Boolean).join(", ");
  const canc = opcoes.cancelamento;
  const adicionais = [
    opcoes.cancelada
      ? `NF-e CANCELADA${canc?.protocolo ? ` - protocolo de cancelamento ${canc.protocolo}` : ""}${canc?.em ? ` em ${canc.em.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}`
      : "",
    homolog ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL" : "",
    contingencia ? `EMITIDA EM CONTINGÊNCIA (SVC-AN) desde ${fmtData(txt(ide.dhCont))} ${fmtHora(txt(ide.dhCont))}. Justificativa: ${txt(ide.xJust)}` : "",
    infCpl,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Document title={`DANFE ${txt(ide.nNF)}`} author={txt(emit.xNome)}>
      <Page size="A4" style={s.pagina}>
        {(homolog || opcoes.cancelada) && (
          <Text style={[s.marca, { fontSize: opcoes.cancelada ? 58 : 44 }]} fixed>
            {opcoes.cancelada ? "CANCELADA" : "SEM VALOR FISCAL"}
          </Text>
        )}
        {/* canhoto */}
        <View style={s.linha}>
          <View style={{ width: "82%" }}>
            <View style={[s.caixa, { minHeight: 14 }]}>
              <Text style={s.td}>
                {seguro(`RECEBEMOS DE ${txt(emit.xNome)} OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO. EMISSÃO: ${fmtData(txt(ide.dhEmi))} - VALOR TOTAL: R$ ${fmtNum(txt(tot.vNF))} - DESTINATÁRIO: ${txt(dest.xNome)}`)}
              </Text>
            </View>
            <View style={s.linha}>
              <Campo rotulo="Data de recebimento" largura="25%" altura={22} />
              <Campo rotulo="Identificação e assinatura do recebedor" largura="75%" altura={22} />
            </View>
          </View>
          <View style={[s.caixa, { width: "18%", alignItems: "center", justifyContent: "center" }]}>
            <Text style={s.valN}>NF-e</Text>
            <Text style={s.valN}>Nº {nnf(txt(ide.nNF))}</Text>
            <Text style={s.val}>SÉRIE {txt(ide.serie).padStart(3, "0")}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 5, textAlign: "center", marginVertical: 3 }}>- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</Text>

        {/* emitente | DANFE | código de barras */}
        <View style={s.linha}>
          <View style={[s.caixa, { width: "38%", minHeight: 82 }]}>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 3 }}>{seguro(txt(emit.xNome))}</Text>
            <Text style={s.td}>{seguro(enderecoEmit)}</Text>
            <Text style={s.td}>{seguro(`${txt(ee.xBairro)} - CEP ${fmtCep(txt(ee.CEP))}`)}</Text>
            <Text style={s.td}>{seguro(`${txt(ee.xMun)} - ${txt(ee.UF)}`)}</Text>
            {txt(ee.fone) ? <Text style={s.td}>Fone: {txt(ee.fone)}</Text> : null}
          </View>
          <View style={[s.caixa, { width: "17%", minHeight: 82, alignItems: "center" }]}>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold" }}>DANFE</Text>
            <Text style={{ fontSize: 5.5, textAlign: "center", marginBottom: 3 }}>Documento Auxiliar da Nota Fiscal Eletrônica</Text>
            <View style={[s.linha, { alignItems: "center", marginBottom: 3 }]}>
              <View>
                <Text style={{ fontSize: 5.5 }}>0 - ENTRADA</Text>
                <Text style={{ fontSize: 5.5 }}>1 - SAÍDA</Text>
              </View>
              <View style={{ borderWidth: 0.6, marginLeft: 5, paddingHorizontal: 4, paddingVertical: 1 }}>
                <Text style={s.valN}>{txt(ide.tpNF)}</Text>
              </View>
            </View>
            <Text style={s.valN}>Nº {nnf(txt(ide.nNF))}</Text>
            <Text style={s.valN}>SÉRIE {txt(ide.serie).padStart(3, "0")}</Text>
            <Text style={s.td} render={({ pageNumber, totalPages }) => `FOLHA ${pageNumber}/${totalPages}`} />
          </View>
          <View style={[s.caixa, { width: "45%", minHeight: 82 }]}>
            <View style={{ alignItems: "center", marginTop: 2 }}>
              <CodigoBarras chave={chave} largura={222} altura={32} />
            </View>
            <Text style={[s.rot, { marginTop: 3 }]}>Chave de acesso</Text>
            <Text style={[s.valN, { fontSize: 7.5, textAlign: "center" }]}>{chave.replace(/(\d{4})(?=\d)/g, "$1 ")}</Text>
            <Text style={{ fontSize: 5.5, textAlign: "center", marginTop: 3 }}>Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora</Text>
          </View>
        </View>
        <View style={s.linha}>
          <Campo rotulo="Natureza da operação" valor={txt(ide.natOp)} largura="55%" />
          <Campo
            rotulo={contingencia && !prot ? "Contingência" : "Protocolo de autorização de uso"}
            valor={prot ? `${txt(prot.nProt)} - ${fmtData(txt(prot.dhRecbto))} ${fmtHora(txt(prot.dhRecbto))}` : "Aguardando autorização"}
            largura="45%"
            alinhar="center"
          />
        </View>
        <View style={s.linha}>
          <Campo rotulo="Inscrição estadual" valor={txt(emit.IE)} largura="33.3%" />
          <Campo rotulo="Insc. estadual do subst. tribut." valor={txt(emit.IEST)} largura="33.3%" />
          <Campo rotulo="CNPJ" valor={fmtDoc(txt(emit.CNPJ))} largura="33.4%" />
        </View>

        <Text style={s.titulo}>DESTINATÁRIO / REMETENTE</Text>
        <View style={s.linha}>
          <Campo rotulo="Nome / razão social" valor={txt(dest.xNome)} largura="58%" />
          <Campo rotulo="CNPJ / CPF" valor={fmtDoc(docDest)} largura="24%" />
          <Campo rotulo="Data da emissão" valor={fmtData(txt(ide.dhEmi))} largura="18%" />
        </View>
        <View style={s.linha}>
          <Campo rotulo="Endereço" valor={[txt(ed.xLgr), txt(ed.nro), txt(ed.xCpl)].filter(Boolean).join(", ")} largura="46%" />
          <Campo rotulo="Bairro / distrito" valor={txt(ed.xBairro)} largura="24%" />
          <Campo rotulo="CEP" valor={fmtCep(txt(ed.CEP))} largura="12%" />
          <Campo rotulo="Data da saída" valor={fmtData(txt(ide.dhSaiEnt) || txt(ide.dhEmi))} largura="18%" />
        </View>
        <View style={s.linha}>
          <Campo rotulo="Município" valor={txt(ed.xMun)} largura="34%" />
          <Campo rotulo="Fone / fax" valor={txt(ed.fone)} largura="18%" />
          <Campo rotulo="UF" valor={txt(ed.UF)} largura="6%" />
          <Campo rotulo="Inscrição estadual" valor={txt(dest.IE)} largura="24%" />
          <Campo rotulo="Hora da saída" valor={fmtHora(txt(ide.dhSaiEnt) || txt(ide.dhEmi))} largura="18%" />
        </View>

        {dups.length > 0 && (
          <>
            <Text style={s.titulo}>FATURA / DUPLICATAS</Text>
            <View style={[s.linha, { flexWrap: "wrap" }]}>
              {dups.map((d) => (
                <View key={txt(d.nDup)} style={[s.caixa, { width: "16.66%", minHeight: 24 }]}>
                  <Text style={s.td}>Nº {txt(d.nDup)}</Text>
                  <Text style={s.td}>Venc. {fmtData(`${txt(d.dVenc)}T12:00:00-03:00`)}</Text>
                  <Text style={s.valN}>R$ {fmtNum(txt(d.vDup))}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={s.titulo}>CÁLCULO DO IMPOSTO</Text>
        <View style={s.linha}>
          <Campo rotulo="Base de cálc. do ICMS" valor={fmtNum(txt(tot.vBC))} largura="20%" alinhar="right" />
          <Campo rotulo="Valor do ICMS" valor={fmtNum(txt(tot.vICMS))} largura="20%" alinhar="right" />
          <Campo rotulo="Base de cálc. ICMS ST" valor={fmtNum(txt(tot.vBCST))} largura="20%" alinhar="right" />
          <Campo rotulo="Valor do ICMS subst." valor={fmtNum(txt(tot.vST))} largura="20%" alinhar="right" />
          <Campo rotulo="V. total dos produtos" valor={fmtNum(txt(tot.vProd))} largura="20%" alinhar="right" />
        </View>
        <View style={s.linha}>
          <Campo rotulo="Valor do frete" valor={fmtNum(txt(tot.vFrete))} largura="16.66%" alinhar="right" />
          <Campo rotulo="Valor do seguro" valor={fmtNum(txt(tot.vSeg))} largura="16.66%" alinhar="right" />
          <Campo rotulo="Desconto" valor={fmtNum(txt(tot.vDesc))} largura="16.66%" alinhar="right" />
          <Campo rotulo="Outras despesas" valor={fmtNum(txt(tot.vOutro))} largura="16.66%" alinhar="right" />
          <Campo rotulo="Valor total do IPI" valor={fmtNum(txt(tot.vIPI))} largura="16.66%" alinhar="right" />
          <Campo rotulo="V. total da nota" valor={fmtNum(txt(tot.vNF))} largura="16.7%" alinhar="right" negrito />
        </View>

        <Text style={s.titulo}>TRANSPORTADOR / VOLUMES TRANSPORTADOS</Text>
        <View style={s.linha}>
          <Campo rotulo="Frete por conta" valor={MOD_FRETE[txt(inf.transp?.modFrete)] ?? txt(inf.transp?.modFrete)} largura="40%" />
          <Campo rotulo="Razão social" valor={txt(inf.transp?.transporta?.xNome)} largura="60%" />
        </View>

        <Text style={s.titulo}>DADOS DOS PRODUTOS / SERVIÇOS</Text>
        <View style={[s.linha, { borderWidth: 0.6, backgroundColor: "#f1f5f9", paddingVertical: 2 }]} fixed>
          {[
            ["Código", "10%"],
            ["Descrição do produto / serviço", "28%"],
            ["NCM/SH", "8%"],
            ["CSOSN", "5%"],
            ["CFOP", "5%"],
            ["UN", "4%"],
            ["Quant.", "8%"],
            ["V. unit.", "8%"],
            ["V. total", "8%"],
            ["BC ICMS", "6%"],
            ["V. ICMS", "5%"],
            ["Alíq.", "5%"],
          ].map(([r, w]) => (
            <Text key={r} style={[s.th, { width: w, paddingHorizontal: 2 }]}>
              {r}
            </Text>
          ))}
        </View>
        {itens.map((d) => {
          const pr = d.prod as No;
          const icms = (Object.values((d.imposto?.ICMS ?? {}) as No)[0] ?? {}) as No;
          return (
            <View key={txt(d["@_nItem"])} style={[s.linha, { borderBottomWidth: 0.3, borderLeftWidth: 0.6, borderRightWidth: 0.6, paddingVertical: 1.5 }]} wrap={false}>
              <Text style={[s.td, { width: "10%", paddingHorizontal: 2 }]}>{seguro(txt(pr.cProd))}</Text>
              <Text style={[s.td, { width: "28%", paddingHorizontal: 2 }]}>{seguro(txt(pr.xProd))}</Text>
              <Text style={[s.td, { width: "8%", paddingHorizontal: 2 }]}>{txt(pr.NCM)}</Text>
              <Text style={[s.td, { width: "5%", paddingHorizontal: 2 }]}>{txt(icms.CSOSN) || txt(icms.CST)}</Text>
              <Text style={[s.td, { width: "5%", paddingHorizontal: 2 }]}>{txt(pr.CFOP)}</Text>
              <Text style={[s.td, { width: "4%", paddingHorizontal: 2 }]}>{seguro(txt(pr.uCom))}</Text>
              <Text style={[s.td, { width: "8%", paddingHorizontal: 2, textAlign: "right" }]}>{fmtQtd(txt(pr.qCom))}</Text>
              <Text style={[s.td, { width: "8%", paddingHorizontal: 2, textAlign: "right" }]}>{fmtNum(txt(pr.vUnCom), 4)}</Text>
              <Text style={[s.td, { width: "8%", paddingHorizontal: 2, textAlign: "right" }]}>{fmtNum(txt(pr.vProd))}</Text>
              <Text style={[s.td, { width: "6%", paddingHorizontal: 2, textAlign: "right" }]}>{fmtNum(txt(icms.vBC))}</Text>
              <Text style={[s.td, { width: "5%", paddingHorizontal: 2, textAlign: "right" }]}>{fmtNum(txt(icms.vICMS))}</Text>
              <Text style={[s.td, { width: "5%", paddingHorizontal: 2, textAlign: "right" }]}>{fmtNum(txt(icms.pICMS))}</Text>
            </View>
          );
        })}

        <Text style={s.titulo}>DADOS ADICIONAIS</Text>
        <View style={s.linha} wrap={false}>
          <View style={[s.caixa, { width: "65%", minHeight: 70 }]}>
            <Text style={s.rot}>Informações complementares</Text>
            <Text style={s.td}>{seguro(adicionais)}</Text>
          </View>
          <View style={[s.caixa, { width: "35%", minHeight: 70 }]}>
            <Text style={s.rot}>Reservado ao fisco</Text>
            <Text style={s.td}>{seguro(txt(inf.infAdic?.infAdFisco))}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** PDF do DANFE a partir do nfeProc (ou do NFe assinado, antes da autorização). */
export async function gerarDanfe(xml: string, opcoes: OpcoesDanfe = {}): Promise<Buffer> {
  const p = lerXml(xml, { isArray: (n) => n === "det" || n === "dup" });
  if (!(p.nfeProc?.NFe ?? p.NFe)?.infNFe) throw new Error("XML sem NF-e para gerar o DANFE");
  return renderToBuffer(<Danfe p={p} opcoes={opcoes} />);
}
