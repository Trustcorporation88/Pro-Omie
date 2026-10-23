// DANFSe (Documento Auxiliar da NFS-e nacional) em PDF, gerado localmente a partir do XML da NFS-e: a API de DANFSe do
// ADN foi desativada em 03/08/2026. A4 retrato, uma página, QR code da consulta pública. Só servidor.
import "server-only";
import qrcode from "qrcode-generator";
import { Document, Page, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { lerXml, txt, type No } from "../xml";
import { MOTIVOS_CANCELAMENTO_NFSE, urlConsultaPublicaNfse } from "./tipos";

const fmtDoc = (d: string) =>
  d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;
const fmtNum = (v: string | number) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (v: string) => (v ? new Date(v.length === 10 ? `${v}T12:00:00-03:00` : v).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const fmtHora = (v: string) => (v ? new Date(v).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");
const fmtCep = (c: string) => (c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : c);
const fmtChave = (c: string) => c.replace(/(.{10})/g, "$1 ").trim();
const seguro = (s: string) => s.replace(/[\u2212\u2013\u2014]/g, "-").replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

const st = StyleSheet.create({
  pagina: { padding: 24, fontSize: 8, fontFamily: "Helvetica", color: "#000" },
  linha: { flexDirection: "row" },
  caixa: { borderWidth: 0.6, borderColor: "#000", paddingHorizontal: 4, paddingVertical: 3 },
  rot: { fontSize: 5.5, textTransform: "uppercase", color: "#333", marginBottom: 1.5 },
  val: { fontSize: 8 },
  valN: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  titulo: { fontSize: 7, fontFamily: "Helvetica-Bold", marginTop: 7, marginBottom: 2, textTransform: "uppercase" },
  marca: { position: "absolute", top: 380, left: 40, right: 40, textAlign: "center", fontSize: 44, color: "#d4d4d4", fontFamily: "Helvetica-Bold", transform: "rotate(-30deg)" },
});

function Campo({ rotulo, valor, largura, negrito, alinhar, altura }: { rotulo: string; valor?: string; largura: string | number; negrito?: boolean; alinhar?: "right" | "center"; altura?: number }) {
  return (
    <View style={[st.caixa, { width: largura, minHeight: altura ?? 24 }]}>
      <Text style={st.rot}>{rotulo}</Text>
      <Text style={[negrito ? st.valN : st.val, alinhar ? { textAlign: alinhar } : {}]}>{seguro(valor ?? "")}</Text>
    </View>
  );
}

function QrCode({ texto, tamanho }: { texto: string; tamanho: number }) {
  const qr = qrcode(0, "M");
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  const m = tamanho / n;
  const celulas: { x: number; y: number }[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) celulas.push({ x: c * m, y: r * m });
  return (
    <Svg width={tamanho} height={tamanho}>
      {celulas.map((p, k) => (
        <Rect key={k} x={p.x} y={p.y} width={m + 0.05} height={m + 0.05} fill="#000" />
      ))}
    </Svg>
  );
}

export type OpcoesDanfse = { cancelada?: boolean; cancelamento?: { motivo: string | null; codigo: string | null; em: Date | null } | null };

function Danfse({ p, opcoes }: { p: No; opcoes: OpcoesDanfse }) {
  const nfse = (p.NFSe ?? p) as No;
  const inf = nfse.infNFSe ?? {};
  const dps = inf.DPS?.infDPS ?? {};
  const emit = inf.emit ?? {};
  const prest = dps.prest ?? {};
  const toma = dps.toma;
  const serv = dps.serv ?? {};
  const valores = dps.valores ?? {};
  const vNfse = inf.valores ?? {};
  const chave = txt(inf["@_Id"]).replace(/^NFS/, "");
  const homolog = txt(dps.tpAmb) === "2";
  const simples = txt(prest.regTrib?.opSimpNac) !== "1";
  const docPrest = txt(prest.CNPJ) || txt(prest.CPF);
  const docToma = txt(toma?.CNPJ) || txt(toma?.CPF);
  const endEmit = emit.enderNac ?? {};
  const endToma = toma?.end ?? {};
  const retido = txt(valores.trib?.tribMun?.tpRetISSQN) === "2";
  const motivoCanc = MOTIVOS_CANCELAMENTO_NFSE.find((m) => m.valor === opcoes.cancelamento?.codigo)?.rotulo;
  const adicionais = [
    opcoes.cancelada ? `NFS-e CANCELADA${opcoes.cancelamento?.em ? ` em ${opcoes.cancelamento.em.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}${motivoCanc ? ` - ${motivoCanc}` : ""}${opcoes.cancelamento?.motivo ? `: ${opcoes.cancelamento.motivo}` : ""}` : "",
    homolog ? "EMITIDA EM AMBIENTE DE PRODUÇÃO RESTRITA (TESTES) - SEM VALOR FISCAL" : "",
    txt(serv.infoCompl?.xInfComp),
    txt(inf.xOutInf),
  ]
    .filter(Boolean)
    .join("\n");
  const linhasDesc = txt(serv.cServ?.xDescServ).split("\n").filter(Boolean);
  const vServ = txt(valores.vServPrest?.vServ);
  const vLiq = txt(vNfse.vLiq) || vServ;
  const vISS = txt(vNfse.vISSQN);
  return (
    <Document title={`DANFSe ${txt(inf.nNFSe)}`} author={txt(emit.xNome)}>
      <Page size="A4" style={st.pagina}>
        {(homolog || opcoes.cancelada) && (
          <Text style={[st.marca, { fontSize: opcoes.cancelada ? 58 : 44 }]} fixed>
            {opcoes.cancelada ? "CANCELADA" : "SEM VALOR FISCAL"}
          </Text>
        )}
        {/* cabeçalho */}
        <View style={[st.linha, st.caixa, { alignItems: "center", minHeight: 70 }]}>
          <View style={{ width: "22%", alignItems: "center" }}>
            <QrCode texto={urlConsultaPublicaNfse(chave)} tamanho={64} />
          </View>
          <View style={{ width: "52%", alignItems: "center", paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}>DANFSe v1.0</Text>
            <Text style={{ fontSize: 7.5, textAlign: "center" }}>Documento Auxiliar da Nota Fiscal de Serviços Eletrônica - NFS-e</Text>
            <Text style={{ fontSize: 7, marginTop: 4, textAlign: "center" }}>{seguro(txt(inf.xLocEmi))}</Text>
            <Text style={{ fontSize: 6, marginTop: 3, textAlign: "center", color: "#333" }}>Emitida pelo Sistema Nacional NFS-e (www.nfse.gov.br). A autenticidade pode ser conferida pela chave de acesso ou pelo QR code.</Text>
          </View>
          <View style={{ width: "26%" }}>
            <Text style={st.rot}>Número da NFS-e</Text>
            <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>{txt(inf.nNFSe)}</Text>
            <Text style={[st.rot, { marginTop: 3 }]}>Competência</Text>
            <Text style={st.val}>{fmtData(txt(dps.dCompet))}</Text>
            <Text style={[st.rot, { marginTop: 3 }]}>Data e hora da emissão</Text>
            <Text style={st.val}>{`${fmtData(txt(inf.dhProc))} ${fmtHora(txt(inf.dhProc))}`}</Text>
            <Text style={[st.rot, { marginTop: 3 }]}>DPS</Text>
            <Text style={st.val}>{`Série ${txt(dps.serie)} · nº ${txt(dps.nDPS)}`}</Text>
          </View>
        </View>
        <View style={st.linha}>
          <Campo rotulo="Chave de acesso da NFS-e" valor={fmtChave(chave)} largura="100%" negrito />
        </View>

        <Text style={st.titulo}>Prestador do serviço</Text>
        <View style={st.linha}>
          <Campo rotulo="Nome / razão social" valor={txt(emit.xNome)} largura="55%" negrito />
          <Campo rotulo="CNPJ / CPF" valor={fmtDoc(docPrest)} largura="25%" />
          <Campo rotulo="Inscrição municipal" valor={txt(emit.IM) || txt(prest.IM) || "-"} largura="20%" />
        </View>
        <View style={st.linha}>
          <Campo rotulo="Endereço" valor={[txt(endEmit.xLgr), txt(endEmit.nro), txt(endEmit.xCpl)].filter(Boolean).join(", ")} largura="45%" />
          <Campo rotulo="Bairro" valor={txt(endEmit.xBairro)} largura="20%" />
          <Campo rotulo="Município / UF" valor={`${seguro(txt(inf.xLocEmi))}${txt(endEmit.UF) ? ` - ${txt(endEmit.UF)}` : ""}`} largura="23%" />
          <Campo rotulo="CEP" valor={fmtCep(txt(endEmit.CEP))} largura="12%" />
        </View>
        <View style={st.linha}>
          <Campo rotulo="Telefone" valor={txt(emit.fone)} largura="25%" />
          <Campo rotulo="E-mail" valor={txt(emit.email)} largura="40%" />
          <Campo rotulo="Regime tributário" valor={simples ? (txt(prest.regTrib?.opSimpNac) === "2" ? "MEI" : "Simples Nacional (ME/EPP)") : "Regime normal"} largura="35%" />
        </View>

        <Text style={st.titulo}>Tomador do serviço</Text>
        {toma ? (
          <>
            <View style={st.linha}>
              <Campo rotulo="Nome / razão social" valor={txt(toma.xNome) || "-"} largura="55%" negrito />
              <Campo rotulo="CNPJ / CPF" valor={fmtDoc(docToma)} largura="25%" />
              <Campo rotulo="Telefone" valor={txt(toma.fone)} largura="20%" />
            </View>
            <View style={st.linha}>
              <Campo rotulo="Endereço" valor={[txt(endToma.xLgr), txt(endToma.nro), txt(endToma.xCpl)].filter(Boolean).join(", ") || "-"} largura="45%" />
              <Campo rotulo="Bairro" valor={txt(endToma.xBairro)} largura="20%" />
              <Campo rotulo="Município (IBGE) / CEP" valor={endToma.endNac ? `${txt(endToma.endNac.cMun)} · ${fmtCep(txt(endToma.endNac.CEP))}` : "-"} largura="20%" />
              <Campo rotulo="E-mail" valor={txt(toma.email)} largura="15%" />
            </View>
          </>
        ) : (
          <View style={st.linha}>
            <Campo rotulo="Tomador" valor="Não informado" largura="100%" />
          </View>
        )}

        <Text style={st.titulo}>Serviço prestado</Text>
        <View style={st.linha}>
          <Campo rotulo="Código de tributação nacional" valor={`${txt(serv.cServ?.cTribNac)} - ${seguro(txt(inf.xTribNac))}`} largura="60%" altura={30} />
          <Campo rotulo="Código municipal" valor={txt(serv.cServ?.cTribMun) ? `${txt(serv.cServ.cTribMun)}${txt(inf.xTribMun) ? ` - ${seguro(txt(inf.xTribMun))}` : ""}` : "-"} largura="20%" altura={30} />
          <Campo rotulo="Local da prestação" valor={seguro(txt(inf.xLocPrestacao)) || txt(serv.locPrest?.cLocPrestacao)} largura="20%" altura={30} />
        </View>
        <View style={[st.caixa, { minHeight: 90 }]}>
          <Text style={st.rot}>Descrição do serviço</Text>
          {linhasDesc.map((l, k) => (
            <Text key={k} style={st.val}>
              {seguro(l)}
            </Text>
          ))}
        </View>

        <Text style={st.titulo}>Valores</Text>
        <View style={st.linha}>
          <Campo rotulo="Valor do serviço" valor={fmtNum(vServ)} largura="20%" alinhar="right" />
          <Campo rotulo="Desconto incondicionado" valor={fmtNum(txt(valores.vDescCondIncond?.vDescIncond) || 0)} largura="20%" alinhar="right" />
          <Campo rotulo="Tributação do ISSQN" valor={retido ? "Retido pelo tomador" : simples ? "Recolhido no Simples Nacional" : txt(valores.trib?.tribMun?.tribISSQN) === "1" ? "Operação tributável" : "Não tributável / imune / exportação"} largura="30%" />
          <Campo rotulo="Alíquota / ISS" valor={vISS ? `${fmtNum(txt(vNfse.pAliqAplic))}% · R$ ${fmtNum(vISS)}` : simples ? `Simples ${fmtNum(txt(valores.trib?.totTrib?.pTotTribSN) || 0)}% (aprox. tributos)` : "-"} largura="30%" alinhar="right" />
        </View>
        <View style={st.linha}>
          <Campo rotulo="Retenções federais" valor={fmtNum(txt(vNfse.vTotalRet) || 0)} largura="30%" alinhar="right" />
          <Campo rotulo="Valor líquido da NFS-e" valor={`R$ ${fmtNum(vLiq)}`} largura="70%" negrito alinhar="right" />
        </View>

        <Text style={st.titulo}>Informações complementares</Text>
        <View style={[st.caixa, { minHeight: 60 }]}>
          {adicionais.split("\n").map((l, k) => (
            <Text key={k} style={{ fontSize: 7 }}>
              {seguro(l)}
            </Text>
          ))}
          {simples && <Text style={{ fontSize: 7, marginTop: 3 }}>Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de ISS.</Text>}
        </View>
        <Text style={{ fontSize: 6, marginTop: 6, color: "#444" }}>
          {`Consulte em ${urlConsultaPublicaNfse(chave)}  ·  Ambiente gerador: ${txt(inf.ambGer) === "1" ? "prefeitura" : "Sistema Nacional NFS-e"}  ·  Aplicativo: ${seguro(txt(inf.verAplic))}`}
        </Text>
      </Page>
    </Document>
  );
}

export async function gerarDanfse(xml: string, opcoes: OpcoesDanfse = {}): Promise<Buffer> {
  const p = lerXml(xml);
  const nfse = (p.NFSe ?? p) as No;
  if (!nfse?.infNFSe) throw new Error("XML sem NFS-e para gerar a DANFSe");
  return renderToBuffer(<Danfse p={p} opcoes={opcoes} />);
}
