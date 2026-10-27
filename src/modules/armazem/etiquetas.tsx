// Etiquetas do armazém em PDF: caixas e pallets (10 x 15 cm ou duas por folha A4) e endereços (10 x 5 cm ou dez por
// folha A4). O QR leva à tela do volume ou do endereço no sistema (o celular abre direto). Só servidor.
import "server-only";
import qrcode from "qrcode-generator";
import { Document, Page, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { fmtQuantidade, rotuloTipoEndereco, ROTULO_TIPO_VOLUME, numeroRecebimento, type TipoVolume } from "./tipos";

const CM = 28.3465;
const TERMICA_VOLUME: [number, number] = [10 * CM, 15 * CM];
const TERMICA_ENDERECO: [number, number] = [10 * CM, 5 * CM];

// A Helvetica do PDF só tem os caracteres do Windows-1252: o resto vira "?" (e não some do texto)
const EXTRAS_1252 = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function imprimivel(s: string | null | undefined): string {
  return [...(s ?? "")].map((c) => (c.charCodeAt(0) <= 0xff || EXTRAS_1252.includes(c) ? c : c === "−" ? "-" : "?")).join("");
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

const s = StyleSheet.create({
  pagina: { fontFamily: "Helvetica", color: "#000" },
  etiqueta: { borderWidth: 1, borderColor: "#000", borderStyle: "solid", padding: 10, flexDirection: "column" },
  pequeno: { fontSize: 7.5, color: "#333" },
  rotulo: { fontSize: 7, color: "#555", textTransform: "uppercase", letterSpacing: 0.6 },
  linha: { flexDirection: "row", justifyContent: "space-between" },
  separador: { borderBottomWidth: 0.8, borderBottomColor: "#000", borderBottomStyle: "solid", marginVertical: 6 },
  tabela: { flexDirection: "row", paddingVertical: 1.5, borderBottomWidth: 0.4, borderBottomColor: "#bbb", borderBottomStyle: "solid" },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#333" },
  td: { fontSize: 8.5 },
});

export type EtiquetaVolume = {
  id: string;
  tipo: TipoVolume;
  codigo: string;
  estabelecimento: string;
  depositante: string;
  depositanteDocumento: string | null;
  recebimento: number | null;
  notas: string;
  endereco: string | null;
  referenciaDepositante: string | null;
  conteudo: { codigo: string; descricao: string; lote: string; quantidade: number; unidade: string }[];
};

function CorpoVolume({ v, base, largura, altura, impressoEm }: { v: EtiquetaVolume; base: string; largura: number; altura: number; impressoEm: string }) {
  const qr = Math.min(largura * 0.32, 96);
  const maxLinhas = Math.max(3, Math.floor((altura - 250) / 13));
  const linhas = v.conteudo.slice(0, maxLinhas);
  const resto = v.conteudo.length - linhas.length;
  const total = v.conteudo.reduce((a, c) => a + c.quantidade, 0);
  const unidades = [...new Set(v.conteudo.map((c) => c.unidade))];
  return (
    <View style={[s.etiqueta, { width: largura, height: altura }]}>
      <View style={s.linha}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={s.pequeno}>{imprimivel(v.estabelecimento)}</Text>
          <Text style={[s.rotulo, { marginTop: 6 }]}>{ROTULO_TIPO_VOLUME[v.tipo]}</Text>
          <Text style={{ fontSize: 30, fontFamily: "Helvetica-Bold", marginTop: 1 }}>{v.codigo}</Text>
          {v.referenciaDepositante ? <Text style={[s.pequeno, { marginTop: 2 }]}>Ref. do depositante: {imprimivel(v.referenciaDepositante)}</Text> : null}
        </View>
        <QrCode texto={`${base}/servicos/armazem/volumes/${v.id}`} tamanho={qr} />
      </View>
      <View style={s.separador} />
      <Text style={s.rotulo}>Depositante</Text>
      <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold" }}>{imprimivel(v.depositante)}</Text>
      {v.depositanteDocumento ? <Text style={s.pequeno}>{v.depositanteDocumento}</Text> : null}
      <View style={[s.linha, { marginTop: 5 }]}>
        <View>
          <Text style={s.rotulo}>Recebimento</Text>
          <Text style={{ fontSize: 9 }}>{v.recebimento ? numeroRecebimento(v.recebimento) : "-"}{v.notas ? ` · NF-e ${imprimivel(v.notas)}` : ""}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.rotulo}>Endereço</Text>
          <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold" }}>{v.endereco ?? "-"}</Text>
        </View>
      </View>
      <View style={s.separador} />
      <View style={s.tabela}>
        <Text style={[s.th, { width: "34%" }]}>Código</Text>
        <Text style={[s.th, { width: "38%" }]}>Lote</Text>
        <Text style={[s.th, { width: "28%", textAlign: "right" }]}>Quantidade</Text>
      </View>
      {linhas.map((c, k) => (
        <View key={k} style={s.tabela} wrap={false}>
          <Text style={[s.td, { width: "34%" }]}>{imprimivel(c.codigo)}</Text>
          <Text style={[s.td, { width: "38%" }]}>{imprimivel(c.lote) || "-"}</Text>
          <Text style={[s.td, { width: "28%", textAlign: "right" }]}>{fmtQuantidade(c.quantidade, c.unidade)}</Text>
        </View>
      ))}
      {resto > 0 ? <Text style={[s.pequeno, { marginTop: 3 }]}>+ {resto} {resto === 1 ? "item" : "itens"} (lista completa no sistema, pelo QR)</Text> : null}
      {!v.conteudo.length ? <Text style={[s.pequeno, { marginTop: 3 }]}>Sem itens.</Text> : null}
      <View style={{ flexGrow: 1 }} />
      <View style={s.linha}>
        <Text style={s.pequeno}>
          {v.conteudo.length} {v.conteudo.length === 1 ? "item" : "itens"}
          {unidades.length === 1 ? ` · total ${fmtQuantidade(total, unidades[0])}` : ""}
        </Text>
        <Text style={s.pequeno}>Impresso em {impressoEm}</Text>
      </View>
    </View>
  );
}

export async function pdfEtiquetasVolumes(volumes: EtiquetaVolume[], opcoes: { base: string; formato: "termica" | "a4"; impressoEm: string }): Promise<Buffer> {
  const doc =
    opcoes.formato === "termica" ? (
      <Document title="Etiquetas de caixas e pallets" author="Pro Omie">
        {volumes.map((v) => (
          <Page key={v.id} size={TERMICA_VOLUME} style={[s.pagina, { padding: 8 }]}>
            <CorpoVolume v={v} base={opcoes.base} largura={TERMICA_VOLUME[0] - 16} altura={TERMICA_VOLUME[1] - 16} impressoEm={opcoes.impressoEm} />
          </Page>
        ))}
      </Document>
    ) : (
      <Document title="Etiquetas de caixas e pallets" author="Pro Omie">
        {Array.from({ length: Math.ceil(volumes.length / 2) }, (_, p) => (
          <Page key={p} size="A4" style={[s.pagina, { padding: 22 }]}>
            {volumes.slice(p * 2, p * 2 + 2).map((v, k) => (
              <View key={v.id} style={{ marginTop: k ? 18 : 0 }}>
                <CorpoVolume v={v} base={opcoes.base} largura={595.28 - 44} altura={(841.89 - 44 - 18) / 2} impressoEm={opcoes.impressoEm} />
              </View>
            ))}
          </Page>
        ))}
      </Document>
    );
  return renderToBuffer(doc);
}

export type EtiquetaEndereco = { id: string; codigo: string; zona: string | null; tipo: string; estabelecimento: string; reservadoPara: string | null };

function CorpoEndereco({ e, base, largura, altura }: { e: EtiquetaEndereco; base: string; largura: number; altura: number }) {
  const qr = Math.min(altura - 20, 110);
  const fonte = e.codigo.length <= 8 ? 34 : e.codigo.length <= 12 ? 26 : 19;
  return (
    <View style={[s.etiqueta, { width: largura, height: altura, flexDirection: "row", alignItems: "center" }]}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={s.rotulo}>Endereço</Text>
        <Text style={{ fontSize: fonte, fontFamily: "Helvetica-Bold", marginTop: 1 }}>{e.codigo}</Text>
        <Text style={[s.pequeno, { marginTop: 3 }]}>
          {e.zona ? `Rua/zona ${imprimivel(e.zona)} · ` : ""}
          {imprimivel(rotuloTipoEndereco(e.tipo))}
        </Text>
        {e.reservadoPara ? <Text style={[s.pequeno, { marginTop: 1 }]}>Reservado: {imprimivel(e.reservadoPara)}</Text> : null}
        <Text style={[s.pequeno, { marginTop: 1, color: "#666" }]}>{imprimivel(e.estabelecimento)}</Text>
      </View>
      <QrCode texto={`${base}/servicos/armazem/enderecos/${e.id}`} tamanho={qr} />
    </View>
  );
}

export async function pdfEtiquetasEnderecos(enderecos: EtiquetaEndereco[], opcoes: { base: string; formato: "termica" | "a4" }): Promise<Buffer> {
  const porFolha = 10;
  const larguraA4 = (595.28 - 40 - 12) / 2;
  const alturaA4 = (841.89 - 40 - 4 * 10) / 5;
  const doc =
    opcoes.formato === "termica" ? (
      <Document title="Etiquetas de endereços" author="Pro Omie">
        {enderecos.map((e) => (
          <Page key={e.id} size={TERMICA_ENDERECO} style={[s.pagina, { padding: 6 }]}>
            <CorpoEndereco e={e} base={opcoes.base} largura={TERMICA_ENDERECO[0] - 12} altura={TERMICA_ENDERECO[1] - 12} />
          </Page>
        ))}
      </Document>
    ) : (
      <Document title="Etiquetas de endereços" author="Pro Omie">
        {Array.from({ length: Math.ceil(enderecos.length / porFolha) }, (_, p) => (
          <Page key={p} size="A4" style={[s.pagina, { padding: 20, flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start" }]}>
            {enderecos.slice(p * porFolha, p * porFolha + porFolha).map((e, k) => (
              <View key={e.id} style={{ marginRight: k % 2 === 0 ? 12 : 0, marginBottom: 10 }}>
                <CorpoEndereco e={e} base={opcoes.base} largura={larguraA4} altura={alturaA4} />
              </View>
            ))}
          </Page>
        ))}
      </Document>
    );
  return renderToBuffer(doc);
}
