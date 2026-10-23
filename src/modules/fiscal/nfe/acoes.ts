"use server";

// Ações da emissão de NF-e.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao } from "@/lib/auth/sessao";
import { escopoEmpresa, exigirAdmin, exigirMatrizAdministrada } from "@/lib/auth/empresa";
import { auditar } from "@/lib/auditoria";
import { fmtMoeda } from "@/lib/format";
import { textoSefaz } from "../xml";
import { cancelarNota, cartaDeCorrecao, consultarSituacaoNota, emitirNfeDoPedido, inutilizarFaixa, type ResultadoEmissao } from "./emissao";
import { ROTULO_STATUS_NOTA, TEXTO_SIMPLES } from "./tipos";

function revalidar(pedidoId?: string | null, notaId?: string) {
  revalidatePath("/fiscal/emitidas");
  if (notaId) revalidatePath(`/fiscal/emitidas/${notaId}`);
  if (pedidoId) revalidatePath(`/vendas/pedidos/${pedidoId}`);
}

const rotulo = (r: { numero: number; serie: number }) => `NF-e nº ${r.numero} série ${r.serie}`;

/** Emite (ou reenvia, se a anterior foi rejeitada) a NF-e do pedido faturado. */
export async function emitirNfe(pedidoId: string, opcoes: { contingencia?: { justificativa: string } | null } = {}): Promise<Resultado<ResultadoEmissao>> {
  let mensagem = "";
  const r = await executar(async () => {
    const u = await exigirPermissao("fiscal:editar");
    const escopo = await escopoEmpresa();
    let contingencia: { justificativa: string } | null = null;
    if (opcoes.contingencia) {
      const just = textoSefaz(opcoes.contingencia.justificativa ?? "", 256);
      if (just.length < 15) throw new ErroAcao("Explique a contingência em pelo menos 15 caracteres.", { justificativa: "Mínimo de 15 caracteres." });
      contingencia = { justificativa: just };
    }
    const res = await emitirNfeDoPedido(pedidoId, { escopoIds: escopo.ids, usuarioId: u.id, contingencia });
    const nota = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: res.notaId }, select: { valor: true, destinatarioNome: true, ambiente: true, tpEmis: true } });
    await auditar(
      "emitir_nfe",
      "fiscal",
      res.notaId,
      `${rotulo(res)} · ${nota.destinatarioNome} · ${fmtMoeda(Number(nota.valor))}: ${ROTULO_STATUS_NOTA[res.status]}${res.cStat ? ` (${res.cStat})` : ""}${nota.ambiente === 2 ? " · homologação" : ""}${nota.tpEmis === 6 ? " · contingência SVC-AN" : ""}`,
      { pedidoId, status: res.status, cStat: res.cStat },
      { usuarioId: u.id, empresaId: escopo.ativa.id },
    );
    revalidar(pedidoId, res.notaId);
    mensagem = res.mensagem;
    return res;
  });
  return r.ok ? { ...r, mensagem } : r;
}

export async function consultarNfe(notaId: string): Promise<Resultado<ResultadoEmissao>> {
  let mensagem = "";
  const r = await executar(async () => {
    await exigirPermissao("fiscal:editar");
    const escopo = await escopoEmpresa();
    const res = await consultarSituacaoNota(notaId, escopo.ids);
    const nota = await prisma.notaFiscal.findUnique({ where: { id: notaId }, select: { pedidoId: true } });
    revalidar(nota?.pedidoId, notaId);
    mensagem = res.mensagem;
    return res;
  });
  return r.ok ? { ...r, mensagem } : r;
}

const textoEvento = (min: number, max: number, campo: string) => z.string().transform((s) => textoSefaz(s, max)).refine((s) => s.length >= min, `Escreva pelo menos ${min} caracteres.`).describe(campo);

export async function cancelarNfe(notaId: string, justificativa: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("fiscal:editar");
    const escopo = await escopoEmpresa();
    const just = textoEvento(15, 255, "justificativa").parse(justificativa);
    const r = await cancelarNota(notaId, just, { escopoIds: escopo.ids, usuarioId: u.id }).catch(async (e) => {
      await auditar("cancelar_nfe", "fiscal", notaId, `Cancelamento recusado: ${e instanceof Error ? e.message : String(e)}`.slice(0, 900), { justificativa: just }, { usuarioId: u.id, empresaId: escopo.ativa.id });
      throw e;
    });
    await auditar("cancelar_nfe", "fiscal", notaId, `${rotulo(r)} cancelada (protocolo ${r.protocolo ?? "—"}): ${just}`.slice(0, 900), { justificativa: just, protocolo: r.protocolo }, { usuarioId: u.id, empresaId: escopo.ativa.id });
    const nota = await prisma.notaFiscal.findUnique({ where: { id: notaId }, select: { pedidoId: true } });
    revalidar(nota?.pedidoId, notaId);
    return undefined;
  }, "NF-e cancelada na SEFAZ. O pedido continua faturado: desfaça o faturamento se a venda não aconteceu.");
}

export async function corrigirNfe(notaId: string, correcao: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("fiscal:editar");
    const escopo = await escopoEmpresa();
    const texto = textoEvento(15, 1000, "correcao").parse(correcao);
    const r = await cartaDeCorrecao(notaId, texto, { escopoIds: escopo.ids, usuarioId: u.id });
    await auditar("corrigir_nfe", "fiscal", notaId, `Carta de correção nº ${r.sequencia} na NF-e nº ${r.numero} (protocolo ${r.protocolo ?? "—"})`, { correcao: texto, protocolo: r.protocolo }, { usuarioId: u.id, empresaId: escopo.ativa.id });
    revalidar(null, notaId);
    return undefined;
  }, "Carta de correção registrada na SEFAZ.");
}

// ───────────────────────── configuração (administrador) ─────────────────────────

async function estabelecimento(empresaId: string) {
  const { u, ctx } = await exigirAdmin();
  const e = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true, matrizId: true, razaoSocial: true, nomeFantasia: true } });
  if (!e) throw new ErroAcao("Empresa não encontrada.");
  exigirMatrizAdministrada(ctx, e.matrizId ?? e.id);
  return { u, empresa: e };
}

const esquemaConfig = z.object({
  nfeAtiva: z.boolean(),
  nfeAmbiente: z.union([z.literal(1), z.literal(2)]),
  nfeMotor: z.enum(["SEFAZ", "FOCUS"]),
  nfeSerie: z.number().int().min(1, "Série de 1 a 889.").max(889, "Série de 1 a 889."),
  nfeProximoNumero: z.number().int().min(1, "Número a partir de 1.").max(999_999_999),
  nfeInformacoes: z.string().max(2000).optional().nullable(),
});

export async function salvarConfiguracaoNfe(empresaId: string, entrada: z.input<typeof esquemaConfig>): Promise<Resultado> {
  return executar(async () => {
    const { u, empresa } = await estabelecimento(empresaId);
    const d = esquemaConfig.parse(entrada);
    // não deixa voltar a numeração para um número já usado neste ambiente e série (a rejeitada guarda o número para o reenvio)
    const maior = await prisma.notaFiscal.aggregate({ where: { empresaId, ambiente: d.nfeAmbiente, serie: d.nfeSerie }, _max: { numero: true } });
    if (maior._max.numero && d.nfeProximoNumero <= maior._max.numero)
      throw new ErroAcao(`O número ${d.nfeProximoNumero} já foi usado nesta série. O próximo precisa ser maior que ${maior._max.numero}.`, { nfeProximoNumero: "Número já usado." });
    if (d.nfeMotor === "FOCUS") {
      const c = await prisma.configuracaoFiscal.findUnique({ where: { empresaId }, select: { focusTokenProducao: true, focusTokenHomologacao: true } });
      if (!(d.nfeAmbiente === 1 ? c?.focusTokenProducao : c?.focusTokenHomologacao))
        throw new ErroAcao("Ative o estabelecimento na Focus NFe (bloco Notas recebidas) antes de escolher este motor.");
    }
    const dados = { ...d, nfeInformacoes: d.nfeInformacoes?.trim() || TEXTO_SIMPLES, atualizadoPorId: u.id };
    const antes = await prisma.configuracaoFiscal.findUnique({ where: { empresaId }, select: { nfeAmbiente: true } });
    await prisma.configuracaoFiscal.upsert({ where: { empresaId }, create: { empresaId, ...dados }, update: dados });
    const nome = empresa.nomeFantasia || empresa.razaoSocial;
    await auditar(
      "configurar_nfe",
      "empresa",
      empresaId,
      `Emissão de NF-e de ${nome}: ${d.nfeAtiva ? "ligada" : "desligada"} · ${d.nfeAmbiente === 1 ? "PRODUÇÃO" : "homologação"} · ${d.nfeMotor === "SEFAZ" ? "SEFAZ direto" : "Focus NFe"} · série ${d.nfeSerie}, próximo nº ${d.nfeProximoNumero}${antes && antes.nfeAmbiente !== d.nfeAmbiente ? " (ambiente trocado)" : ""}`,
      d,
      { usuarioId: u.id, empresaId: empresa.matrizId ?? empresa.id },
    );
    revalidatePath("/configuracoes/empresa");
    return undefined;
  }, "Configuração da NF-e salva.");
}

const esquemaInut = z.object({
  serie: z.number().int().min(1).max(889),
  inicio: z.number().int().min(1),
  fim: z.number().int().min(1),
  justificativa: z.string(),
});

export async function inutilizarNumeracao(empresaId: string, entrada: z.input<typeof esquemaInut>): Promise<Resultado> {
  return executar(async () => {
    const { u, empresa } = await estabelecimento(empresaId);
    const d = esquemaInut.parse(entrada);
    const just = textoSefaz(d.justificativa, 255);
    if (just.length < 15) throw new ErroAcao("Explique em pelo menos 15 caracteres por que os números não serão usados.", { justificativa: "Mínimo de 15 caracteres." });
    const r = await inutilizarFaixa(empresaId, { ...d, justificativa: just, usuarioId: u.id });
    await auditar(
      "inutilizar_nfe",
      "empresa",
      empresaId,
      `Numeração inutilizada (${r.ambiente === 1 ? "produção" : "homologação"}): série ${d.serie}, nº ${d.inicio} a ${d.fim}, protocolo ${r.protocolo ?? "—"}`,
      { ...d, justificativa: just },
      { usuarioId: u.id, empresaId: empresa.matrizId ?? empresa.id },
    );
    revalidatePath("/configuracoes/empresa");
    return undefined;
  }, "Numeração inutilizada na SEFAZ.");
}
