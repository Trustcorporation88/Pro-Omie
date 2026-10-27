// Demonstrativo da armazenagem em PDF (react-pdf, Helvetica): período, tarifa, paletes apurados, cálculo, vencimento,
// boleto/Pix, paletes de cada dia e posições no dia da apuração. Do faturamento (números congelados) ou prévia do
// período ainda não faturado. Vai anexo ao e-mail da cobrança. Só servidor.
import "server-only";
import { Document, Image as ImagemPdf, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { hojeISO } from "@/lib/datas";
import { num } from "@/lib/serial";
import { fmtCep, fmtDocumento, fmtMoeda, fmtTelefone } from "@/lib/format";
import { logoParaPdf } from "@/modules/configuracoes/logotipo";
import type { Anexo } from "@/modules/email/provedor";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import type { EmitentePdf } from "@/modules/vendas/pdf";
import { ocupacaoDoIntervalo, tarifaCalculo } from "./faturamento";
import {
  calcularArmazenagem,
  dataBr,
  descricaoArmazenagem,
  ehDataISO,
  ehMetodo,
  periodosDaTarifa,
  resumoApuracao,
  rotuloPeriodo,
  vencimentoArmazenagem,
  type CalculoArmazenagem,
  type DiaOcupacao,
  type MetodoArmazenagem,
  type Periodo,
  type TarifaCalculo,
  type TipoPeriodo,
} from "./tipos";

export type DadosDemonstrativo = {
  /** período ainda não faturado: os números podem mudar até o fim do período */
  previa: boolean;
  empresaId: string;
  matrizId: string;
  empresaNome: string;
  emailEmpresa: string | null;
  emitente: EmitentePdf;
  cliente: { nome: string; documento: string | null; email: string | null };
  periodo: Periodo & { rotulo: string; tipo: TipoPeriodo };
  tarifa: TarifaCalculo;
  calculo: CalculoArmazenagem;
  /** texto do item do pedido (o mesmo da NFS-e) */
  descricao: string;
  resumo: string;
  valor: number;
  vencimento: string;
  pedido: number | null;
  cobranca: { linhaDigitavel: string | null; pixPayload: string | null; urlFatura: string | null } | null;
  dias: DiaOcupacao[];
  enderecosApuracao: string[];
  observacoes: string | null;
};

type Alvo = { faturamentoId: string } | { empresaId: string; depositanteId: string; periodoInicio: string };
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function emitente(empresaId: string): Promise<{ e: EmitentePdf; matrizId: string; nome: string; email: string | null }> {
  const x = await prisma.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: { id: true, matrizId: true, razaoSocial: true, nomeFantasia: true, cnpj: true, inscricaoEstadual: true, logradouro: true, numero: true, complemento: true, bairro: true, cidade: true, uf: true, cep: true, email: true, telefone: true },
  });
  const logo = await logoParaPdf({ id: x.id, matrizId: x.matrizId }).catch(() => null);
  const { id: _id, matrizId, ...dados } = x;
  return { e: { ...dados, logo }, matrizId: matrizId ?? x.id, nome: x.nomeFantasia || x.razaoSocial, email: x.email };
}

/** Dados do demonstrativo. escopoIds: estabelecimentos que quem pede pode ver (null = uso interno, sem restrição). */
export async function dadosDemonstrativo(alvo: Alvo, escopoIds: string[] | null): Promise<DadosDemonstrativo> {
  const noEscopo = (empresaId: string) => !escopoIds || escopoIds.includes(empresaId);
  if ("faturamentoId" in alvo) {
    const f = await prisma.faturamentoArmazem.findUnique({
      where: { id: alvo.faturamentoId },
      include: {
        depositante: { select: { nome: true, documento: true, email: true } },
        pedido: { select: { numero: true, itens: { select: { descricao: true }, take: 1 } } },
        tarifa: { select: { descricao: true, observacoes: true } },
      },
    });
    if (!f || !noEscopo(f.empresaId)) throw new ErroAcao("Faturamento não encontrado nesta empresa.");
    const tipo: TipoPeriodo = f.tipoPeriodo === "MES" ? "MES" : "DIAS30";
    const metodo: MetodoArmazenagem = ehMetodo(f.metodo) ? f.metodo : "PRO_RATA";
    const periodo: Periodo = { numero: 0, inicio: iso(f.periodoInicio), fim: iso(f.periodoFim), divisor: f.diasPeriodo, diasVigencia: f.diasVigencia };
    const tarifa: TarifaCalculo = { valorPosicao: num(f.valorPosicao), metodo, minimoPosicoes: f.minimoPosicoes, cobrarReservadas: f.cobrarReservadas, inicio: periodo.inicio, periodo: tipo };
    const dias = (await ocupacaoDoIntervalo([f.empresaId], periodo.inicio, periodo.fim)).get(f.empresaId)?.get(f.depositanteId) ?? [];
    // os números cobrados ficam como foram faturados; o dia a dia vem das fotografias
    const calculo: CalculoArmazenagem = {
      ...calcularArmazenagem(dias, tarifa, periodo),
      apurado: f.apurado,
      posicoesDia: f.posicoesDia,
      pico: f.pico,
      posicoesCobradas: num(f.posicoesCobradas),
      valor: num(f.valor),
      diasRepetidos: f.diasRepetidos,
      reservadasDia: f.reservadasDia,
    };
    const cobranca = f.cobrancaId ? await prisma.cobranca.findUnique({ where: { id: f.cobrancaId }, select: { linhaDigitavel: true, pixPayload: true, urlFatura: true } }) : null;
    const em = await emitente(f.empresaId);
    return montar({
      previa: false,
      em,
      empresaId: f.empresaId,
      cliente: f.depositante,
      periodo: { ...periodo, rotulo: rotuloPeriodo(periodo, tipo, metodo), tipo },
      tarifa,
      calculo,
      descricao: f.pedido?.itens[0]?.descricao ?? descricaoArmazenagem(f.tarifa?.descricao ?? "Armazenagem", periodo, tipo, calculo, tarifa),
      valor: num(f.valor),
      vencimento: iso(f.vencimento),
      pedido: f.pedido?.numero ?? null,
      cobranca,
      dias,
      observacoes: f.tarifa?.observacoes ?? null,
    });
  }
  if (!ehDataISO(alvo.periodoInicio)) throw new ErroAcao("Período inválido.");
  const t = await prisma.tarifaArmazem.findUnique({
    where: { empresaId_depositanteId: { empresaId: alvo.empresaId, depositanteId: alvo.depositanteId } },
    include: { depositante: { select: { nome: true, documento: true, email: true } } },
  });
  if (!t || !noEscopo(t.empresaId)) throw new ErroAcao("Tarifa de armazenagem não encontrada nesta empresa.");
  const hoje = hojeISO();
  const tarifa = tarifaCalculo(t);
  const periodo = periodosDaTarifa({ periodo: tarifa.periodo, inicio: tarifa.inicio }, alvo.periodoInicio > hoje ? alvo.periodoInicio : hoje).find((x) => x.inicio === alvo.periodoInicio);
  if (!periodo) throw new ErroAcao("Esta data não é o começo de um período da tarifa.");
  const ate = periodo.fim < hoje ? periodo.fim : hoje;
  const dias = ate < periodo.inicio ? [] : ((await ocupacaoDoIntervalo([t.empresaId], periodo.inicio, ate)).get(t.empresaId)?.get(t.depositanteId) ?? []);
  const calculo = calcularArmazenagem(dias, tarifa, periodo);
  const em = await emitente(t.empresaId);
  return montar({
    previa: true,
    em,
    empresaId: t.empresaId,
    cliente: t.depositante,
    periodo: { ...periodo, rotulo: rotuloPeriodo(periodo, tarifa.periodo, tarifa.metodo), tipo: tarifa.periodo },
    tarifa,
    calculo,
    descricao: descricaoArmazenagem(t.descricao, periodo, tarifa.periodo, calculo, tarifa),
    valor: calculo.valor,
    vencimento: vencimentoArmazenagem(periodo.fim, t.prazoPagamento, hoje),
    pedido: null,
    cobranca: null,
    dias,
    observacoes: t.observacoes,
  });
}

function montar(p: {
  previa: boolean;
  em: Awaited<ReturnType<typeof emitente>>;
  empresaId: string;
  cliente: DadosDemonstrativo["cliente"];
  periodo: DadosDemonstrativo["periodo"];
  tarifa: TarifaCalculo;
  calculo: CalculoArmazenagem;
  descricao: string;
  valor: number;
  vencimento: string;
  pedido: number | null;
  cobranca: DadosDemonstrativo["cobranca"];
  dias: DiaOcupacao[];
  observacoes: string | null;
}): DadosDemonstrativo {
  const dias = p.dias.filter((d) => d.dia >= p.periodo.inicio && d.dia <= p.periodo.fim && d.dia >= p.tarifa.inicio);
  const diaApuracao = p.calculo.diaApuracao ?? dias[dias.length - 1]?.dia ?? null;
  return {
    previa: p.previa,
    empresaId: p.empresaId,
    matrizId: p.em.matrizId,
    empresaNome: p.em.nome,
    emailEmpresa: p.em.email,
    emitente: p.em.e,
    cliente: p.cliente,
    periodo: p.periodo,
    tarifa: p.tarifa,
    calculo: p.calculo,
    descricao: p.descricao,
    resumo: resumoApuracao(p.tarifa.metodo, p.calculo, p.periodo.fim),
    valor: p.valor,
    vencimento: p.vencimento,
    pedido: p.pedido,
    cobranca: p.cobranca && (p.cobranca.linhaDigitavel || p.cobranca.pixPayload || p.cobranca.urlFatura) ? p.cobranca : null,
    dias,
    enderecosApuracao: (diaApuracao && dias.find((d) => d.dia === diaApuracao)?.enderecos) || [],
    observacoes: p.observacoes,
  };
}

/** "Demonstrativo-armazenagem-2026-10-MARQUES-COSMETICOS-LTDA.pdf" (só ASCII: abre em qualquer sistema). */
export function nomeArquivoDemonstrativo(d: Pick<DadosDemonstrativo, "periodo" | "cliente">): string {
  const ref = d.periodo.tipo === "MES" ? d.periodo.fim.slice(0, 7) : d.periodo.inicio;
  const cliente = d.cliente.nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `Demonstrativo-armazenagem-${ref}${cliente ? `-${cliente}` : ""}.pdf`;
}

// ───────────────────────── PDF ─────────────────────────

const AZUL = "#1e3a8a";
const CINZA = "#64748b";
const LINHA = "#e2e8f0";
const LARANJA = "#c2410c";

const s = StyleSheet.create({
  pagina: { paddingTop: 36, paddingBottom: 56, paddingHorizontal: 40, fontSize: 9, fontFamily: "Helvetica", color: "#0f172a" },
  topo: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: AZUL, paddingBottom: 12 },
  empresa: { maxWidth: 300 },
  empresaNome: { fontSize: 13, fontFamily: "Helvetica-Bold", color: AZUL },
  empresaRazao: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 7 },
  miudo: { fontSize: 8, color: CINZA, marginTop: 2 },
  caixa: { borderWidth: 1, borderColor: AZUL, borderRadius: 4, padding: 8, minWidth: 180, alignItems: "flex-end" },
  caixaTitulo: { fontSize: 9, fontFamily: "Helvetica-Bold", color: AZUL, letterSpacing: 0.5 },
  caixaPeriodo: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 3 },
  previa: { fontSize: 9, fontFamily: "Helvetica-Bold", color: LARANJA, marginTop: 3 },
  secao: { marginTop: 14 },
  rotulo: { fontSize: 7, color: CINZA, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 },
  cliente: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  cartoes: { flexDirection: "row", marginTop: 6 },
  cartao: { flex: 1, borderWidth: 1, borderColor: LINHA, borderRadius: 4, padding: 8, marginRight: 6 },
  cartaoFim: { marginRight: 0 },
  cartaoDestaque: { borderColor: AZUL, backgroundColor: "#eff6ff" },
  cartaoValor: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 3 },
  calculo: { marginTop: 6, padding: 8, backgroundColor: "#f8fafc", borderRadius: 4 },
  negrito: { fontFamily: "Helvetica-Bold" },
  mono: { fontFamily: "Courier", fontSize: 8.5 },
  grade: { flexDirection: "row", flexWrap: "wrap", marginTop: 6, borderTopWidth: 1, borderLeftWidth: 1, borderColor: LINHA },
  celula: { width: "12.5%", borderRightWidth: 1, borderBottomWidth: 1, borderColor: LINHA, paddingVertical: 4, paddingHorizontal: 5 },
  celulaRepetida: { backgroundColor: "#f8fafc" },
  celulaApuracao: { backgroundColor: "#dbeafe" },
  celulaDia: { fontSize: 7, color: CINZA },
  celulaValor: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 1 },
  legenda: { fontSize: 7.5, color: CINZA, marginTop: 4 },
  rodape: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: CINZA, borderTopWidth: 1, borderTopColor: LINHA, paddingTop: 6 },
});

function tamanhoLogo(l: { largura: number; altura: number }) {
  const escala = Math.min(170 / l.largura, 56 / l.altura, 1);
  return { width: l.largura * escala, height: l.altura * escala };
}

function endereco(e: EmitentePdf): string {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const l1 = [rua, e.complemento].filter(Boolean).join(" - ");
  const l2 = [e.bairro, [e.cidade, e.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  return [l1, l2, e.cep ? `CEP ${fmtCep(e.cep)}` : ""].filter(Boolean).join(" · ");
}

/** Pix copia e cola não tem espaços: quebra em pedaços para caber na linha. */
const emPedacos = (t: string, n = 72) => t.match(new RegExp(`.{1,${n}}`, "g")) ?? [t];

const paletes = (n: number) => `${n.toLocaleString("pt-BR")} ${n === 1 ? "palete" : "paletes"}`;

function Demonstrativo({ d }: { d: DadosDemonstrativo }) {
  const e = d.emitente;
  const contato = [e.email, e.telefone ? fmtTelefone(e.telefone) : null].filter(Boolean).join(" · ");
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const fim = d.tarifa.metodo === "FIM_PERIODO";
  const porPeriodo = d.periodo.tipo === "DIAS30" ? "a cada 30 dias" : "por mês";
  const primeiro =
    d.tarifa.metodo === "FIM_PERIODO"
      ? { rotulo: "Paletes apurados", valor: paletes(d.calculo.apurado), detalhe: d.calculo.diaApuracao ? `em ${dataBr(d.calculo.diaApuracao)}` : "sem fotografia ainda" }
      : d.tarifa.metodo === "PICO"
        ? { rotulo: "Maior quantidade", valor: paletes(d.calculo.pico), detalhe: "no mesmo dia" }
        : { rotulo: "Paletes-dia", valor: d.calculo.posicoesDia.toLocaleString("pt-BR"), detalhe: `${d.periodo.divisor} dias no período` };
  return (
    <Document title={`Demonstrativo de armazenagem · ${d.periodo.rotulo} · ${d.cliente.nome}`} author={e.razaoSocial} creator="Pro Omie">
      <Page size="A4" style={s.pagina}>
        <View style={s.topo}>
          <View style={s.empresa}>
            {e.logo ? (
              <>
                <ImagemPdf src={{ data: e.logo.dados, format: e.logo.formato === "jpeg" ? "jpg" : "png" }} style={tamanhoLogo(e.logo)} />
                <Text style={s.empresaRazao}>{e.razaoSocial}</Text>
              </>
            ) : (
              <>
                <Text style={s.empresaNome}>{e.nomeFantasia || e.razaoSocial}</Text>
                {e.nomeFantasia ? <Text style={s.miudo}>{e.razaoSocial}</Text> : null}
              </>
            )}
            <Text style={s.miudo}>
              CNPJ {fmtDocumento(e.cnpj)}
              {e.inscricaoEstadual ? ` · IE ${e.inscricaoEstadual}` : ""}
            </Text>
            {endereco(e) ? <Text style={s.miudo}>{endereco(e)}</Text> : null}
            {contato ? <Text style={s.miudo}>{contato}</Text> : null}
          </View>
          <View style={s.caixa}>
            <Text style={s.caixaTitulo}>DEMONSTRATIVO DE ARMAZENAGEM</Text>
            <Text style={s.caixaPeriodo}>{d.periodo.rotulo}</Text>
            {d.previa ? <Text style={s.previa}>PRÉVIA · ainda não faturado</Text> : d.pedido ? <Text style={s.miudo}>Pedido nº {fmtNumeroDoc(d.pedido)}</Text> : null}
            <Text style={s.miudo}>{d.periodo.tipo === "MES" ? `Período: ${dataBr(d.periodo.inicio)} a ${dataBr(d.periodo.fim)}` : `período de ${d.periodo.divisor} dias`}</Text>
          </View>
        </View>

        <View style={s.secao}>
          <Text style={s.rotulo}>Depositante</Text>
          <Text style={s.cliente}>{d.cliente.nome}</Text>
          {d.cliente.documento ? <Text style={s.miudo}>CNPJ/CPF {fmtDocumento(d.cliente.documento)}</Text> : null}
        </View>

        <View style={s.cartoes}>
          <View style={s.cartao}>
            <Text style={s.rotulo}>{primeiro.rotulo}</Text>
            <Text style={s.cartaoValor}>{primeiro.valor}</Text>
            <Text style={s.miudo}>{primeiro.detalhe}</Text>
          </View>
          <View style={s.cartao}>
            <Text style={s.rotulo}>Valor por palete</Text>
            <Text style={s.cartaoValor}>{fmtMoeda(d.tarifa.valorPosicao)}</Text>
            <Text style={s.miudo}>{porPeriodo}</Text>
          </View>
          <View style={[s.cartao, s.cartaoDestaque]}>
            <Text style={s.rotulo}>Total</Text>
            <Text style={[s.cartaoValor, { color: AZUL }]}>{fmtMoeda(d.valor)}</Text>
            <Text style={s.miudo}>
              {d.calculo.minimoAplicado ? `mínimo de ${paletes(Math.round(d.calculo.posicoesCobradas))}` : !d.previa ? "faturado" : d.periodo.fim < hojeISO() ? "a faturar" : "parcial, até hoje"}
            </Text>
          </View>
          <View style={[s.cartao, s.cartaoFim]}>
            <Text style={s.rotulo}>Vencimento</Text>
            <Text style={s.cartaoValor}>{dataBr(d.vencimento)}</Text>
            <Text style={s.miudo}>{d.previa ? "previsto" : d.cobranca ? "do boleto/Pix" : "da conta a receber"}</Text>
          </View>
        </View>

        <View style={s.secao}>
          <Text style={s.rotulo}>Cálculo</Text>
          <View style={s.calculo}>
            <Text>
              {d.descricao} = <Text style={s.negrito}>{fmtMoeda(d.valor)}</Text>
            </Text>
          </View>
        </View>

        {d.cobranca ? (
          <View style={s.secao} wrap={false}>
            <Text style={s.rotulo}>Pagamento</Text>
            {d.cobranca.linhaDigitavel ? (
              <>
                <Text style={s.miudo}>Linha digitável do boleto</Text>
                <Text style={[s.mono, { marginTop: 2 }]}>{d.cobranca.linhaDigitavel}</Text>
              </>
            ) : null}
            {d.cobranca.pixPayload ? (
              <>
                <Text style={[s.miudo, { marginTop: 6 }]}>Pix copia e cola</Text>
                {emPedacos(d.cobranca.pixPayload).map((p, i) => (
                  <Text key={i} style={[s.mono, { marginTop: i ? 0 : 2 }]}>
                    {p}
                  </Text>
                ))}
              </>
            ) : null}
            {d.cobranca.urlFatura ? (
              <Text style={[s.miudo, { marginTop: 6 }]}>
                Boleto e Pix também em: <Link src={d.cobranca.urlFatura}>{d.cobranca.urlFatura}</Link>
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={s.secao} wrap={false}>
          <Text style={s.rotulo}>Paletes de cada dia</Text>
          {d.dias.length ? (
            <View style={s.grade}>
              {d.dias.map((x) => {
                const total = x.posicoes + (d.tarifa.cobrarReservadas ? x.reservadasVazias : 0);
                const apuracao = fim && x.dia === d.calculo.diaApuracao;
                return (
                  <View key={x.dia} style={[s.celula, x.origem === "REPETIDO" ? s.celulaRepetida : {}, apuracao ? s.celulaApuracao : {}]}>
                    <Text style={s.celulaDia}>
                      {dataBr(x.dia).slice(0, 5)}
                      {x.origem === "REPETIDO" ? " *" : ""}
                    </Text>
                    <Text style={s.celulaValor}>{total}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={s.miudo}>Ainda não há fotografia neste período.</Text>
          )}
          <Text style={s.legenda}>
            Paletes no fim de cada dia (a última fotografia do dia){d.tarifa.cobrarReservadas ? ", com as posições reservadas vazias" : ""}.
            {d.dias.some((x) => x.origem === "REPETIDO") ? " * dia sem fotografia: repete o último dia fotografado." : ""}
            {fim ? " Em azul, o dia da apuração." : ""}
          </Text>
        </View>

        {d.enderecosApuracao.length ? (
          <View style={s.secao}>
            <Text style={s.rotulo}>{fim ? "Posições no dia da apuração" : "Posições no último dia"}</Text>
            <Text>{d.enderecosApuracao.join(", ")}</Text>
          </View>
        ) : null}

        {d.observacoes ? (
          <View style={s.secao}>
            <Text style={s.rotulo}>Observações</Text>
            <Text>{d.observacoes}</Text>
          </View>
        ) : null}

        <View style={s.rodape} fixed>
          <Text>
            Gerado em {geradoEm} pelo Pro Omie · {d.empresaNome}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function gerarDemonstrativoPdf(d: DadosDemonstrativo): Promise<Buffer> {
  return renderToBuffer(<Demonstrativo d={d} />);
}

/** O demonstrativo do faturamento como anexo de e-mail (uso interno: cobrança e envio avulso). */
export async function anexoDemonstrativo(faturamentoId: string, escopoIds: string[] | null = null): Promise<{ dados: DadosDemonstrativo; anexo: Anexo }> {
  const dados = await dadosDemonstrativo({ faturamentoId }, escopoIds);
  const pdf = await gerarDemonstrativoPdf(dados);
  return { dados, anexo: { nome: nomeArquivoDemonstrativo(dados), tipo: "application/pdf", base64: pdf.toString("base64") } };
}
