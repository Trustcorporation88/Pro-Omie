import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { fmtCep, fmtData, fmtDocumento, fmtMoeda, fmtTelefone } from "@/lib/format";
import { fmtDecimal, fmtNumeroDoc, fmtPrecoUnitario } from "./calculos";
import type { DocumentoVenda } from "./tipos";

export type EmitentePdf = {
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  inscricaoEstadual: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  email: string | null;
  telefone: string | null;
  /** logotipo da empresa (PNG ou JPEG); sem ele, o cabeçalho destaca o nome */
  logo?: { dados: Buffer; formato: "png" | "jpeg"; largura: number; altura: number } | null;
};

/** O logotipo cabe numa área de 170 x 56 pt, mantendo a proporção. */
function tamanhoLogo(l: { largura: number; altura: number }) {
  const escala = Math.min(170 / l.largura, 56 / l.altura);
  return { width: l.largura * escala, height: l.altura * escala };
}

const AZUL = "#1e3a8a";
const CINZA = "#64748b";
const LINHA = "#e2e8f0";

const s = StyleSheet.create({
  pagina: { paddingTop: 36, paddingBottom: 56, paddingHorizontal: 40, fontSize: 9, fontFamily: "Helvetica", color: "#0f172a" },
  topo: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: AZUL, paddingBottom: 12 },
  empresa: { maxWidth: 320 },
  empresaNome: { fontSize: 13, fontFamily: "Helvetica-Bold", color: AZUL },
  empresaRazao: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 7 },
  miudo: { fontSize: 8, color: CINZA, marginTop: 2 },
  caixa: { borderWidth: 1, borderColor: AZUL, borderRadius: 4, padding: 8, minWidth: 150, alignItems: "flex-end" },
  caixaTitulo: { fontSize: 10, fontFamily: "Helvetica-Bold", color: AZUL, letterSpacing: 0.5 },
  caixaNumero: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 2 },
  secao: { marginTop: 16 },
  rotulo: { fontSize: 7, color: CINZA, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  cliente: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  tabela: { marginTop: 6, borderTopWidth: 1, borderTopColor: LINHA },
  linhaCab: { flexDirection: "row", backgroundColor: "#f1f5f9", paddingVertical: 5, paddingHorizontal: 4 },
  linha: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: LINHA },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: CINZA, textTransform: "uppercase" },
  cNum: { width: 18 },
  cDesc: { flex: 1, paddingRight: 6 },
  cQtd: { width: 62, textAlign: "right" },
  cUn: { width: 28, textAlign: "center" },
  cPreco: { width: 70, textAlign: "right" },
  cDescPct: { width: 40, textAlign: "right" },
  cTotal: { width: 72, textAlign: "right" },
  totais: { marginTop: 10, marginLeft: "auto", width: 220 },
  totalLinha: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalFinal: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: AZUL },
  totalFinalTexto: { fontSize: 12, fontFamily: "Helvetica-Bold", color: AZUL },
  condicoes: { flexDirection: "row", gap: 24, marginTop: 16 },
  // sem lineHeight: no react-pdf o valor sem unidade sobra ~15pt embaixo do texto
  observacoes: { marginTop: 16, padding: 8, backgroundColor: "#f8fafc", borderRadius: 4 },
  rodape: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: CINZA, borderTopWidth: 1, borderTopColor: LINHA, paddingTop: 6 },
});

function endereco(e: EmitentePdf): string {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const l1 = [rua, e.complemento].filter(Boolean).join(" — ");
  const l2 = [e.bairro, [e.cidade, e.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  return [l1, l2, e.cep ? `CEP ${fmtCep(e.cep)}` : ""].filter(Boolean).join(" · ");
}

function DocumentoVendaPdf({ doc, emitente }: { doc: DocumentoVenda; emitente: EmitentePdf }) {
  const proposta = doc.tipo === "proposta";
  const titulo = proposta ? "PROPOSTA COMERCIAL" : "PEDIDO DE VENDA";
  const contato = [emitente.email, emitente.telefone ? fmtTelefone(emitente.telefone) : null].filter(Boolean).join(" · ");
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  return (
    <Document title={`${proposta ? "Proposta" : "Pedido"} ${fmtNumeroDoc(doc.numero)} · ${doc.pessoaNome}`} author={emitente.razaoSocial} creator="Pro Omie">
      <Page size="A4" style={s.pagina}>
        <View style={s.topo}>
          <View style={s.empresa}>
            {emitente.logo ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
                <Image src={{ data: emitente.logo.dados, format: emitente.logo.formato === "jpeg" ? "jpg" : "png" }} style={tamanhoLogo(emitente.logo)} />
                <Text style={s.empresaRazao}>{emitente.razaoSocial}</Text>
              </>
            ) : (
              <>
                <Text style={s.empresaNome}>{emitente.nomeFantasia || emitente.razaoSocial}</Text>
                {emitente.nomeFantasia ? <Text style={s.miudo}>{emitente.razaoSocial}</Text> : null}
              </>
            )}
            <Text style={s.miudo}>
              CNPJ {fmtDocumento(emitente.cnpj)}
              {emitente.inscricaoEstadual ? ` · IE ${emitente.inscricaoEstadual}` : ""}
            </Text>
            {endereco(emitente) ? <Text style={s.miudo}>{endereco(emitente)}</Text> : null}
            {contato ? <Text style={s.miudo}>{contato}</Text> : null}
          </View>
          <View style={s.caixa}>
            <Text style={s.caixaTitulo}>{titulo}</Text>
            <Text style={s.caixaNumero}>Nº {fmtNumeroDoc(doc.numero)}</Text>
            <Text style={s.miudo}>Emissão {fmtData(doc.emissao)}</Text>
            {proposta && doc.validade ? <Text style={s.miudo}>Válida até {fmtData(doc.validade)}</Text> : null}
          </View>
        </View>

        <View style={s.secao}>
          <Text style={s.rotulo}>Cliente</Text>
          <Text style={s.cliente}>{doc.pessoaNome}</Text>
          {doc.pessoaDocumento ? <Text style={s.miudo}>{doc.pessoaDocumento}</Text> : null}
        </View>

        <View style={s.secao}>
          <Text style={s.rotulo}>Itens</Text>
          <View style={s.tabela}>
            <View style={s.linhaCab} fixed>
              <Text style={[s.th, s.cNum]}>#</Text>
              <Text style={[s.th, s.cDesc]}>Descrição</Text>
              <Text style={[s.th, s.cQtd]}>Qtd.</Text>
              <Text style={[s.th, s.cUn]}>Un.</Text>
              <Text style={[s.th, s.cPreco]}>Preço unit.</Text>
              <Text style={[s.th, s.cDescPct]}>Desc.</Text>
              <Text style={[s.th, s.cTotal]}>Total</Text>
            </View>
            {doc.itens.map((i, n) => (
              <View key={n} style={s.linha} wrap={false}>
                <Text style={s.cNum}>{n + 1}</Text>
                <Text style={s.cDesc}>{i.descricao}</Text>
                <Text style={s.cQtd}>{fmtDecimal(i.quantidade, 0, 3)}</Text>
                <Text style={s.cUn}>{i.unidade}</Text>
                <Text style={s.cPreco}>{fmtPrecoUnitario(i.precoUnitario)}</Text>
                <Text style={s.cDescPct}>{i.descontoPercentual ? `${fmtDecimal(i.descontoPercentual, 0, 2)}%` : "—"}</Text>
                <Text style={s.cTotal}>{fmtMoeda(i.total)}</Text>
              </View>
            ))}
          </View>
          <View style={s.totais}>
            <View style={s.totalLinha}>
              <Text style={{ color: CINZA }}>Subtotal</Text>
              <Text>{fmtMoeda(doc.subtotal)}</Text>
            </View>
            {doc.desconto > 0 ? (
              <View style={s.totalLinha}>
                <Text style={{ color: CINZA }}>Descontos</Text>
                <Text>– {fmtMoeda(doc.desconto)}</Text>
              </View>
            ) : null}
            <View style={s.totalFinal}>
              <Text style={s.totalFinalTexto}>Total</Text>
              <Text style={s.totalFinalTexto}>{fmtMoeda(doc.total)}</Text>
            </View>
          </View>
        </View>

        <View style={s.condicoes}>
          <View>
            <Text style={s.rotulo}>Condição de pagamento</Text>
            <Text>{doc.condicaoNome ?? "A combinar"}</Text>
          </View>
          {doc.formaNome ? (
            <View>
              <Text style={s.rotulo}>Forma de pagamento</Text>
              <Text>{doc.formaNome}</Text>
            </View>
          ) : null}
          {doc.vendedorNome ? (
            <View>
              <Text style={s.rotulo}>Responsável</Text>
              <Text>{doc.vendedorNome}</Text>
            </View>
          ) : null}
        </View>

        {doc.observacoes ? (
          <View style={s.observacoes}>
            <Text style={s.rotulo}>Observações</Text>
            <Text>{doc.observacoes}</Text>
          </View>
        ) : null}

        <View style={s.rodape} fixed>
          <Text>
            {titulo.charAt(0) + titulo.slice(1).toLowerCase()} nº {fmtNumeroDoc(doc.numero)} · gerado em {geradoEm}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** PDF da proposta ou do pedido. */
export async function gerarPdfDocumento(doc: DocumentoVenda, emitente: EmitentePdf): Promise<Buffer> {
  return renderToBuffer(<DocumentoVendaPdf doc={doc} emitente={emitente} />);
}
