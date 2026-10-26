// Manual do usuário em PDF (react-pdf, Helvetica): capa, sumário com links, uma seção por página e rodapé com
// a numeração. O conteúdo é o mesmo da tela /ajuda. Só servidor.
import "server-only";
import { Document, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { partesTexto, type Bloco, type Secao } from "./tipos";

const AZUL = "#1e3a8a";
const CINZA = "#4b5563";

const s = StyleSheet.create({
  // sem lineHeight: na página ele some com o rodapé absoluto e, no texto, deixa as linhas frouxas (react-pdf)
  pagina: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 52, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  capa: { paddingTop: 220, paddingHorizontal: 64, fontFamily: "Helvetica", color: "#111827" },
  capaMarca: { fontSize: 12, color: AZUL, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  capaTitulo: { fontSize: 34, fontFamily: "Helvetica-Bold", marginTop: 10 },
  capaSub: { fontSize: 13, color: CINZA, marginTop: 10 },
  capaRodape: { position: "absolute", bottom: 64, left: 64, right: 64, fontSize: 9, color: CINZA, lineHeight: 1.5 },
  regua: { height: 3, width: 64, backgroundColor: AZUL, marginTop: 22 },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", color: AZUL },
  resumo: { fontSize: 10.5, color: CINZA, marginTop: 4 },
  quem: { fontSize: 9, color: CINZA, marginTop: 8, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "#f3f4f6", borderRadius: 3 },
  h2: { fontSize: 12.5, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  p: { marginBottom: 6 },
  subtitulo: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginBottom: 3, marginTop: 2 },
  item: { flexDirection: "row", marginBottom: 3.5 },
  num: { width: 16, fontFamily: "Helvetica-Bold", color: AZUL },
  bala: { width: 12, color: CINZA },
  itemTexto: { flex: 1 },
  caixa: { borderLeftWidth: 3, paddingVertical: 5, paddingHorizontal: 8, marginVertical: 5 },
  caixaTitulo: { fontFamily: "Helvetica-Bold", fontSize: 8.5, marginBottom: 1 },
  tabela: { borderWidth: 0.6, borderColor: "#d1d5db", marginVertical: 5 },
  tr: { flexDirection: "row", borderTopWidth: 0.6, borderColor: "#d1d5db" },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8.5, padding: 4, backgroundColor: "#f3f4f6" },
  td: { fontSize: 8.5, padding: 4 },
  rodape: { position: "absolute", bottom: 24, left: 52, right: 52, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#9ca3af" },
  sumarioSecao: { fontSize: 11, fontFamily: "Helvetica-Bold", color: AZUL, marginTop: 9 },
  sumarioTopicos: { fontSize: 8.5, color: CINZA, marginTop: 1.5 },
});

function Inline({ texto }: { texto: string }) {
  return (
    <>
      {partesTexto(texto).map((p, i) =>
        p.tipo === "negrito" ? (
          <Text key={i} style={{ fontFamily: "Helvetica-Bold" }}>
            {p.valor}
          </Text>
        ) : p.tipo === "link" && p.menu ? (
          <Text key={i} style={{ fontFamily: "Helvetica-Bold", color: AZUL }}>
            {p.valor}
          </Text>
        ) : (
          <Text key={i}>{p.valor}</Text>
        ),
      )}
    </>
  );
}

function BlocoPdf({ b }: { b: Bloco }) {
  if (b.tipo === "texto")
    return (
      <Text style={s.p}>
        <Inline texto={b.texto} />
      </Text>
    );
  if (b.tipo === "passos" || b.tipo === "lista")
    return (
      <View style={{ marginBottom: 6 }}>
        {b.titulo && <Text style={s.subtitulo}>{b.titulo}</Text>}
        {b.itens.map((item, i) => (
          <View key={i} style={s.item} wrap={false}>
            <Text style={b.tipo === "passos" ? s.num : s.bala}>{b.tipo === "passos" ? `${i + 1}.` : "•"}</Text>
            <Text style={s.itemTexto}>
              <Inline texto={item} />
            </Text>
          </View>
        ))}
      </View>
    );
  if (b.tipo === "dica" || b.tipo === "atencao") {
    const dica = b.tipo === "dica";
    return (
      <View style={[s.caixa, { borderColor: dica ? AZUL : "#d97706", backgroundColor: dica ? "#eff6ff" : "#fffbeb" }]} wrap={false}>
        <Text style={[s.caixaTitulo, { color: dica ? AZUL : "#b45309" }]}>{dica ? "Dica" : "Atenção"}</Text>
        <Text>
          <Inline texto={b.texto} />
        </Text>
      </View>
    );
  }
  const largura = (j: number) => (b.colunas.length === 2 ? (j === 0 ? "28%" : "72%") : j === 0 ? "40%" : `${60 / (b.colunas.length - 1)}%`);
  return (
    <View style={s.tabela}>
      <View style={[s.tr, { borderTopWidth: 0 }]}>
        {b.colunas.map((c, j) => (
          <Text key={c} style={[s.th, { width: largura(j) }]}>
            {c}
          </Text>
        ))}
      </View>
      {b.linhas.map((l, i) => (
        <View key={i} style={s.tr} wrap={false}>
          {l.map((c, j) => (
            <Text key={j} style={[s.td, { width: largura(j) }, j === 0 ? { fontFamily: "Helvetica-Bold" } : {}]}>
              <Inline texto={c} />
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Rodape() {
  return (
    <View style={s.rodape} fixed>
      <Text>Pro Omie · Manual do usuário</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

function Manual({ secoes, geradoEm, perfil }: { secoes: Secao[]; geradoEm: string; perfil: string }) {
  return (
    <Document title="Manual do usuário · Pro Omie" author="Pro Omie" subject="Como usar o Pro Omie" language="pt-BR">
      <Page size="A4" style={s.capa}>
        <Text style={s.capaMarca}>PRO OMIE · ERP TRUSTCORP</Text>
        <Text style={s.capaTitulo}>Manual do usuário</Text>
        <Text style={s.capaSub}>Como usar cada parte do sistema, passo a passo: financeiro, CRM, vendas, estoque, serviços, notas fiscais, cadastros e administração.</Text>
        <View style={s.regua} />
        <View style={s.capaRodape}>
          <Text>erp.trustcorp.com.br</Text>
          <Text>
            Gerado em {geradoEm} · partes do perfil {perfil}
          </Text>
          <Text>Dentro do sistema, o botão Manual (no topo de cada tela) abre a versão sempre atualizada deste manual.</Text>
        </View>
      </Page>
      <Page size="A4" style={s.pagina}>
        <Text style={s.h1}>Sumário</Text>
        {secoes.map((sec) => (
          <View key={sec.id} wrap={false}>
            <Link src={`#${sec.id}`} style={{ textDecoration: "none" }}>
              <Text style={s.sumarioSecao}>{sec.titulo}</Text>
            </Link>
            <Text style={s.sumarioTopicos}>{sec.topicos.map((t) => t.titulo).join(" · ")}</Text>
          </View>
        ))}
        <Rodape />
      </Page>
      {secoes.map((sec) => (
        <Page key={sec.id} size="A4" style={s.pagina}>
          <View id={sec.id}>
            <Text style={s.h1}>{sec.titulo}</Text>
            <Text style={s.resumo}>{sec.resumo}</Text>
            <Text style={s.quem}>Quem usa: {sec.quem}</Text>
          </View>
          {sec.topicos.map((t) => (
            <View key={t.id}>
              <Text style={s.h2} minPresenceAhead={60}>
                {t.titulo}
              </Text>
              {t.blocos.map((b, i) => (
                <BlocoPdf key={i} b={b} />
              ))}
            </View>
          ))}
          <Rodape />
        </Page>
      ))}
    </Document>
  );
}

/** PDF do manual com as seções informadas. */
export async function gerarManualPdf(secoes: Secao[], opcoes: { geradoEm: string; perfil: string }): Promise<Buffer> {
  return renderToBuffer(<Manual secoes={secoes} geradoEm={opcoes.geradoEm} perfil={opcoes.perfil} />);
}
