"use server";

// Ações da cobrança (Asaas).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao } from "@/lib/auth/sessao";
import { escopoEmpresa, exigirAdmin, exigirContaNoEscopo, exigirMatrizAdministrada } from "@/lib/auth/empresa";
import { auditar } from "@/lib/auditoria";
import { fmtMoeda } from "@/lib/format";
import { num } from "@/lib/serial";
import { urlBase } from "@/modules/email/acoes";
import { emailsValidos } from "@/modules/email/fila";
import { cancelarCobranca as cancelar, cifrarChave, conferirCobranca as conferir, enviarEmailCobranca, gerarCobranca as gerar, registrarWebhookNoAsaas, testarConfiguracao } from "./servicos";

function revalidar(tituloId?: string | null) {
  revalidatePath("/financeiro/cobrancas");
  revalidatePath("/financeiro/receber");
  if (tituloId) revalidatePath(`/financeiro/titulos/${tituloId}`);
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
  ativa: z.boolean(),
  ambiente: z.union([z.literal(1), z.literal(2)]),
  chave: z.string().trim().optional().nullable(),
  contaBancariaId: z.string().optional().nullable(),
  formaPadrao: z.enum(["BOLETO", "PIX", "UNDEFINED"]),
  multaPercentual: z.number().min(0, "Multa entre 0 e 10%.").max(10, "Multa entre 0 e 10%."),
  jurosMensal: z.number().min(0, "Juros entre 0 e 10% ao mês.").max(10, "Juros entre 0 e 10% ao mês."),
  notificarPeloAsaas: z.boolean(),
  enviarEmailAutomatico: z.boolean(),
});

export async function salvarConfiguracaoCobranca(empresaId: string, entrada: z.input<typeof esquemaConfig>): Promise<Resultado> {
  return executar(async () => {
    const { u, empresa } = await estabelecimento(empresaId);
    const d = esquemaConfig.parse(entrada);
    const atual = await prisma.configuracaoCobranca.findUnique({ where: { empresaId } });
    const chave = d.chave?.trim() || null;
    if (chave && !/^\$aact_/.test(chave)) throw new ErroAcao("A chave do Asaas começa com $aact_ (produção: $aact_prod_, sandbox: $aact_hmlg_).", { chave: "Chave inválida." });
    if (chave && d.ambiente === 2 && /^\$aact_prod_/.test(chave)) throw new ErroAcao("Esta é uma chave de PRODUÇÃO; escolha o ambiente produção ou use a chave do sandbox ($aact_hmlg_).", { chave: "Chave de produção no sandbox." });
    if (chave && d.ambiente === 1 && /^\$aact_hmlg_/.test(chave)) throw new ErroAcao("Esta é uma chave do SANDBOX; escolha o ambiente sandbox ou use a chave de produção ($aact_prod_).", { chave: "Chave do sandbox na produção." });
    if (d.ativa && !chave && !atual?.chaveCifrada) throw new ErroAcao("Informe a chave da API do Asaas para ligar a cobrança.", { chave: "Informe a chave." });
    if (d.contaBancariaId) {
      const escopo = await escopoEmpresa();
      await exigirContaNoEscopo(escopo, d.contaBancariaId);
    }
    if (d.ativa && !d.contaBancariaId && !atual?.contaBancariaId) throw new ErroAcao("Escolha a conta onde o dinheiro recebido pelo Asaas entra.", { contaBancariaId: "Escolha a conta." });
    const dados = {
      ativa: d.ativa,
      ambiente: d.ambiente,
      contaBancariaId: d.contaBancariaId ?? atual?.contaBancariaId ?? null,
      formaPadrao: d.formaPadrao,
      multaPercentual: d.multaPercentual,
      jurosMensal: d.jurosMensal,
      notificarPeloAsaas: d.notificarPeloAsaas,
      enviarEmailAutomatico: d.enviarEmailAutomatico,
      atualizadoPorId: u.id,
      ...(chave ? { chaveCifrada: cifrarChave(empresaId, chave), chaveFinal: chave.slice(-6), testadaEm: null, webhookId: atual?.ambiente === d.ambiente ? atual?.webhookId : null } : {}),
      ...(!chave && atual && atual.ambiente !== d.ambiente ? { webhookId: null, webhookRegistradoEm: null } : {}),
    };
    await prisma.configuracaoCobranca.upsert({ where: { empresaId }, create: { empresaId, ...dados }, update: dados });
    const nome = empresa.nomeFantasia || empresa.razaoSocial;
    await auditar(
      "configurar_cobranca",
      "empresa",
      empresaId,
      `Cobrança Asaas de ${nome}: ${d.ativa ? "ligada" : "desligada"} · ${d.ambiente === 1 ? "PRODUÇÃO" : "sandbox"} · padrão ${d.formaPadrao}${chave ? " · chave trocada" : ""} · multa ${d.multaPercentual}% · juros ${d.jurosMensal}%`,
      { ...d, chave: chave ? "(trocada)" : "(mantida)" },
      { usuarioId: u.id, empresaId: empresa.matrizId ?? empresa.id },
    );
    revalidatePath("/configuracoes/empresa");
    return undefined;
  }, "Configuração da cobrança salva.");
}

export async function testarCobranca(empresaId: string): Promise<Resultado> {
  let mensagem = "";
  const r = await executar(async () => {
    await estabelecimento(empresaId);
    const ambiente = await testarConfiguracao(empresaId);
    revalidatePath("/configuracoes/empresa");
    mensagem = `Conexão com o Asaas (${ambiente === 1 ? "produção" : "sandbox"}) funcionando.`;
    return undefined;
  });
  return r.ok ? { ...r, mensagem } : r;
}

export async function registrarWebhookCobranca(empresaId: string): Promise<Resultado<{ url: string }>> {
  let mensagem = "";
  const r = await executar(async () => {
    const { u, empresa } = await estabelecimento(empresaId);
    const res = await registrarWebhookNoAsaas(empresaId, await urlBase(), u.email);
    await auditar("configurar_cobranca", "empresa", empresaId, `Webhook do Asaas registrado (${res.url})`, res, { usuarioId: u.id, empresaId: empresa.matrizId ?? empresa.id });
    revalidatePath("/configuracoes/empresa");
    mensagem = "Webhook registrado: a baixa dos títulos passa a ser automática.";
    return { url: res.url };
  });
  return r.ok ? { ...r, mensagem } : r;
}

// ───────────────────────── cobranças ─────────────────────────

const esquemaGerar = z.object({ tipo: z.enum(["BOLETO", "PIX", "UNDEFINED"]).nullable().optional(), enviarEmail: z.boolean().optional() });

export async function gerarCobranca(tituloId: string, entrada: z.input<typeof esquemaGerar> = {}): Promise<Resultado<{ id: string; emailEnviado: boolean }>> {
  let mensagem = "";
  const r = await executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const d = esquemaGerar.parse(entrada);
    const escopo = await escopoEmpresa();
    const res = await gerar(tituloId, { tipo: d.tipo ?? null, enviarEmail: d.enviarEmail ?? true, usuarioId: u.id, escopoIds: escopo.ids, urlBase: await urlBase() });
    const t = await prisma.titulo.findUniqueOrThrow({ where: { id: tituloId }, select: { numero: true } });
    await auditar("gerar_cobranca", "titulo", tituloId, `Cobrança ${res.cobranca.tipo} de ${fmtMoeda(num(res.cobranca.valor))} gerada no Asaas para o título #${t.numero} (${res.cobranca.asaasPaymentId})${res.ambiente === 2 ? " · sandbox" : ""}${res.emailEnviado ? " · e-mail enviado" : ""}`, { cobrancaId: res.cobranca.id }, { usuarioId: u.id, empresaId: escopo.ativa.id });
    revalidar(tituloId);
    mensagem = `Cobrança gerada no Asaas${res.ambiente === 2 ? " (sandbox)" : ""}.${res.emailEnviado ? " E-mail enviado ao cliente." : ""}`;
    return { id: res.cobranca.id, emailEnviado: res.emailEnviado };
  });
  return r.ok ? { ...r, mensagem } : r;
}

export async function conferirCobranca(id: string): Promise<Resultado<{ status: string }>> {
  let mensagem = "";
  const r = await executar(async () => {
    await exigirPermissao("financeiro:editar");
    const escopo = await escopoEmpresa();
    const res = await conferir(id, escopo.ids);
    const c = await prisma.cobranca.findUnique({ where: { id }, select: { tituloId: true } });
    revalidar(c?.tituloId);
    mensagem = `Situação no Asaas: ${res.status}${res.motivo ? ` (${res.motivo})` : ""}.`;
    return { status: res.status };
  });
  return r.ok ? { ...r, mensagem } : r;
}

export async function cancelarCobranca(id: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const escopo = await escopoEmpresa();
    const c = await cancelar(id, escopo.ids);
    await auditar("cancelar_cobranca", "titulo", c.tituloId, `Cobrança ${c.asaasPaymentId} cancelada no Asaas`, { cobrancaId: id }, { usuarioId: u.id, empresaId: escopo.ativa.id });
    revalidar(c.tituloId);
    return undefined;
  }, "Cobrança cancelada no Asaas. O título continua em aberto.");
}

export async function reenviarCobrancaPorEmail(id: string, para: string): Promise<Resultado> {
  let mensagem = "";
  const r = await executar(async () => {
    const u = await exigirPermissao("financeiro:ver");
    const escopo = await escopoEmpresa();
    const c = await prisma.cobranca.findFirst({ where: { id, empresaId: { in: escopo.ids } }, select: { tituloId: true } });
    if (!c) throw new ErroAcao("Cobrança não encontrada nesta empresa.");
    const lista = emailsValidos(para);
    if (!lista.length || lista.length > 5) throw new ErroAcao("Informe de 1 a 5 e-mails válidos.", { para: "E-mail inválido." });
    const enviado = await enviarEmailCobranca(id, lista);
    await auditar("enviar_email", "titulo", c.tituloId, `Cobrança enviada por e-mail para ${lista.join(", ")}: ${enviado ? "ENVIADO" : "na fila"}`, { para: lista }, { usuarioId: u.id, empresaId: escopo.ativa.id });
    mensagem = enviado ? `E-mail enviado para ${lista.join(", ")}.` : "E-mail na fila; o envio será tentado de novo em instantes.";
    return undefined;
  });
  return r.ok ? { ...r, mensagem } : r;
}
