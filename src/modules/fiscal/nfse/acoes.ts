"use server";

// Ações da NFS-e nacional.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao } from "@/lib/auth/sessao";
import { escopoEmpresa, exigirAdmin, exigirMatrizAdministrada } from "@/lib/auth/empresa";
import { auditar } from "@/lib/auditoria";
import { fmtMoeda } from "@/lib/format";
import { textoSefaz } from "../xml";
import { ROTULO_STATUS_NOTA } from "../nfe/tipos";
import { cancelarNfse as cancelar, conferirMunicipio, consultarSituacaoNfse, emitirNfseDoPedido, type ResultadoNfse } from "./emissao";

function revalidar(pedidoId?: string | null, notaId?: string) {
  revalidatePath("/fiscal/servicos");
  if (notaId) revalidatePath(`/fiscal/servicos/${notaId}`);
  if (pedidoId) revalidatePath(`/vendas/pedidos/${pedidoId}`);
}

/** Emite as NFS-e do pedido faturado (uma por código de tributação; reenvia as recusadas com o mesmo número de DPS). */
export async function emitirNfse(pedidoId: string): Promise<Resultado<ResultadoNfse[]>> {
  let mensagem = "";
  const r = await executar(async () => {
    const u = await exigirPermissao("fiscal:editar");
    const escopo = await escopoEmpresa();
    const res = await emitirNfseDoPedido(pedidoId, { escopoIds: escopo.ids, usuarioId: u.id });
    for (const n of res) {
      const nota = await prisma.notaServico.findUniqueOrThrow({ where: { id: n.notaId }, select: { valor: true, tomadorNome: true, ambiente: true, serie: true } });
      await auditar(
        "emitir_nfse",
        "fiscal",
        n.notaId,
        `DPS nº ${n.numero} série ${nota.serie}${n.numeroNfse ? ` → NFS-e nº ${n.numeroNfse}` : ""} · ${nota.tomadorNome} · ${fmtMoeda(Number(nota.valor))}: ${ROTULO_STATUS_NOTA[n.status]}${n.codigo ? ` (${n.codigo})` : ""}${nota.ambiente === 2 ? " · produção restrita" : ""}`,
        { pedidoId, status: n.status, codigo: n.codigo },
        { usuarioId: u.id, empresaId: escopo.ativa.id },
      );
    }
    revalidar(pedidoId);
    mensagem = res.map((n) => n.mensagem).join(" ");
    return res;
  });
  return r.ok ? { ...r, mensagem } : r;
}

export async function consultarNfse(notaId: string): Promise<Resultado<ResultadoNfse>> {
  let mensagem = "";
  const r = await executar(async () => {
    await exigirPermissao("fiscal:editar");
    const escopo = await escopoEmpresa();
    const res = await consultarSituacaoNfse(notaId, escopo.ids);
    const nota = await prisma.notaServico.findUnique({ where: { id: notaId }, select: { pedidoId: true } });
    revalidar(nota?.pedidoId, notaId);
    mensagem = res.mensagem;
    return res;
  });
  return r.ok ? { ...r, mensagem } : r;
}

const esquemaCancelamento = z.object({
  cMotivo: z.enum(["1", "2", "9"], "Escolha o motivo."),
  xMotivo: z.string().transform((s) => textoSefaz(s, 255)).refine((s) => s.length >= 15, "Escreva pelo menos 15 caracteres."),
});

export async function cancelarNfse(notaId: string, entrada: { cMotivo: string; xMotivo: string }): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("fiscal:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaCancelamento.parse(entrada);
    const r = await cancelar(notaId, d, { escopoIds: escopo.ids, usuarioId: u.id }).catch(async (e) => {
      await auditar("cancelar_nfse", "fiscal", notaId, `Cancelamento recusado: ${e instanceof Error ? e.message : String(e)}`.slice(0, 900), d, { usuarioId: u.id, empresaId: escopo.ativa.id });
      throw e;
    });
    await auditar("cancelar_nfse", "fiscal", notaId, `NFS-e nº ${r.numeroNfse ?? r.numero} cancelada (motivo ${d.cMotivo}): ${d.xMotivo}`.slice(0, 900), d, { usuarioId: u.id, empresaId: escopo.ativa.id });
    const nota = await prisma.notaServico.findUnique({ where: { id: notaId }, select: { pedidoId: true } });
    revalidar(nota?.pedidoId, notaId);
    return undefined;
  }, "NFS-e cancelada no emissor nacional. O pedido continua faturado: desfaça o faturamento se o serviço não foi prestado.");
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
  nfseAtiva: z.boolean(),
  nfseAmbiente: z.union([z.literal(1), z.literal(2)]),
  nfseMotor: z.enum(["SEFAZ", "FOCUS"]),
  nfseSerie: z.number().int().min(1, "Série de 1 a 49999.").max(49999, "Série de 1 a 49999."),
  nfseProximoNumero: z.number().int().min(1, "Número a partir de 1.").max(999_999_999),
  nfseAliquotaSimples: z.number().min(0, "Alíquota entre 0 e 99,99.").max(99.99, "Alíquota entre 0 e 99,99."),
  nfseEnviarIM: z.boolean(),
  nfseInformacoes: z.string().max(2000).optional().nullable(),
});

export async function salvarConfiguracaoNfse(empresaId: string, entrada: z.input<typeof esquemaConfig>): Promise<Resultado> {
  return executar(async () => {
    const { u, empresa } = await estabelecimento(empresaId);
    const d = esquemaConfig.parse(entrada);
    const maior = await prisma.notaServico.aggregate({ where: { empresaId, ambiente: d.nfseAmbiente, serie: d.nfseSerie }, _max: { numero: true } });
    if (maior._max.numero && d.nfseProximoNumero <= maior._max.numero)
      throw new ErroAcao(`O número ${d.nfseProximoNumero} já foi usado nesta série. O próximo precisa ser maior que ${maior._max.numero}.`, { nfseProximoNumero: "Número já usado." });
    if (d.nfseMotor === "FOCUS") {
      const c = await prisma.configuracaoFiscal.findUnique({ where: { empresaId }, select: { focusTokenProducao: true, focusTokenHomologacao: true } });
      if (!(d.nfseAmbiente === 1 ? c?.focusTokenProducao : c?.focusTokenHomologacao))
        throw new ErroAcao("Ative o estabelecimento na Focus NFe (bloco Notas recebidas) antes de escolher este motor.");
    }
    const dados = { ...d, nfseInformacoes: d.nfseInformacoes?.trim() || null, atualizadoPorId: u.id };
    await prisma.configuracaoFiscal.upsert({ where: { empresaId }, create: { empresaId, ...dados }, update: dados });
    const nome = empresa.nomeFantasia || empresa.razaoSocial;
    await auditar(
      "configurar_nfse",
      "empresa",
      empresaId,
      `Emissão de NFS-e de ${nome}: ${d.nfseAtiva ? "ligada" : "desligada"} · ${d.nfseAmbiente === 1 ? "PRODUÇÃO" : "produção restrita"} · ${d.nfseMotor === "SEFAZ" ? "emissor nacional direto" : "Focus NFe"} · série ${d.nfseSerie}, próxima DPS nº ${d.nfseProximoNumero} · Simples ${d.nfseAliquotaSimples}%`,
      d,
      { usuarioId: u.id, empresaId: empresa.matrizId ?? empresa.id },
    );
    revalidatePath("/configuracoes/empresa");
    return undefined;
  }, "Configuração da NFS-e salva.");
}

export async function conferirMunicipioNfse(empresaId: string): Promise<Resultado<{ aderente: boolean; cidade: string }>> {
  let mensagem = "";
  const r = await executar(async () => {
    const { u, empresa } = await estabelecimento(empresaId);
    const c = await conferirMunicipio(empresaId);
    await auditar("conferir_municipio_nfse", "empresa", empresaId, `Município ${c.cidade}: Emissor Nacional ${c.aderente ? "habilitado" : "NÃO habilitado"} (${c.ambiente === 1 ? "produção" : "produção restrita"})`, c, { usuarioId: u.id, empresaId: empresa.matrizId ?? empresa.id });
    revalidatePath("/configuracoes/empresa");
    mensagem = c.aderente
      ? `${c.cidade} está habilitado no Emissor Nacional${c.ambiente === 2 ? " (produção restrita)" : ""}.`
      : `${c.cidade} ainda não habilitou o Emissor Nacional${c.ambiente === 2 ? " na produção restrita" : ""}. Para empresas do Simples, a habilitação nacional vale a partir de 01/11/2026: confira de novo depois.`;
    return { aderente: c.aderente, cidade: c.cidade };
  });
  return r.ok ? { ...r, mensagem } : r;
}
