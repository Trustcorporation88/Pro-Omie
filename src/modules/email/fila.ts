// Fila de e-mails: grava, tenta enviar na hora e deixa o reenvio para o cron (5 tentativas com espera crescente). Só servidor.
import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/db";
import { configuracaoEmail, enviarViaResend, type Anexo } from "./provedor";

const ESPERAS_MIN = [5, 30, 120, 720, 1440];
const MAX_TENTATIVAS = ESPERAS_MIN.length;
const SENSIVEIS = new Set(["senha_provisoria", "redefinir_senha"]);
/** E-mails que vão para clientes: saem com o nome da empresa no "De:" (avisos do sistema seguem com o remetente configurado). */
const COM_NOME_DA_EMPRESA = new Set(["proposta", "pedido", "nfe", "nfse", "cobranca", "teste"]);

export const emailsValidos = (lista: string) =>
  lista
    .split(/[;,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

export type NovoEmail = {
  empresaId?: string | null;
  tipo: string;
  origemId?: string | null;
  para: string[];
  copia?: string[];
  responderPara?: string | null;
  assunto: string;
  html: string;
  texto: string;
  anexos?: Anexo[];
  usuarioId?: string | null;
};

/** Grava na fila e tenta enviar agora. Devolve o registro (status ENVIADO, ou PENDENTE/FALHOU com o erro). */
export async function enfileirar(e: NovoEmail) {
  const registro = await prisma.email.create({
    data: {
      empresaId: e.empresaId ?? null,
      tipo: e.tipo,
      origemId: e.origemId ?? null,
      para: e.para.join(", "),
      copia: e.copia?.length ? e.copia.join(", ") : null,
      responderPara: e.responderPara ?? null,
      assunto: e.assunto,
      html: e.html,
      texto: e.texto,
      anexos: e.anexos?.length ? (e.anexos as unknown as Prisma.InputJsonValue) : undefined,
      usuarioId: e.usuarioId ?? null,
      proximaTentativa: new Date(),
    },
  });
  return despachar(registro.id);
}

/** Tenta enviar um e-mail da fila. Sem provedor configurado, fica PENDENTE com a explicação. */
export async function despachar(id: string) {
  const e = await prisma.email.findUniqueOrThrow({ where: { id } });
  if (e.status === "ENVIADO") return e;
  const { configurado } = configuracaoEmail();
  if (!configurado) {
    return prisma.email.update({ where: { id }, data: { erro: "E-mail não configurado: falta RESEND_API_KEY na Vercel.", proximaTentativa: new Date(Date.now() + 3_600_000) } });
  }
  const empresa = e.empresaId && COM_NOME_DA_EMPRESA.has(e.tipo) ? await prisma.empresa.findUnique({ where: { id: e.empresaId }, select: { nomeFantasia: true, razaoSocial: true } }) : null;
  try {
    const provedorId = await enviarViaResend({
      para: e.para.split(", "),
      copia: e.copia ? e.copia.split(", ") : undefined,
      responderPara: e.responderPara,
      nomeRemetente: empresa ? empresa.nomeFantasia || empresa.razaoSocial : null,
      assunto: e.assunto,
      html: e.html,
      texto: e.texto,
      anexos: (e.anexos as unknown as Anexo[] | null) ?? undefined,
    });
    // senha provisória e link de redefinição não ficam guardados depois do envio
    const sensivel = SENSIVEIS.has(e.tipo) ? { html: "(conteúdo sensível removido após o envio)", texto: "(removido)" } : {};
    return prisma.email.update({ where: { id }, data: { status: "ENVIADO", enviadoEm: new Date(), provedorId, erro: null, tentativas: { increment: 1 }, proximaTentativa: null, ...sensivel } });
  } catch (erro) {
    const tentativas = e.tentativas + 1;
    const esgotou = tentativas >= MAX_TENTATIVAS;
    return prisma.email.update({
      where: { id },
      data: {
        status: esgotou ? "FALHOU" : "PENDENTE",
        ...(esgotou && SENSIVEIS.has(e.tipo) ? { html: "(conteúdo sensível removido)", texto: "(removido)" } : {}),
        tentativas,
        erro: (erro instanceof Error ? erro.message : String(erro)).slice(0, 500),
        proximaTentativa: esgotou ? null : new Date(Date.now() + ESPERAS_MIN[Math.min(tentativas, ESPERAS_MIN.length) - 1] * 60_000),
      },
    });
  }
}

/** Reenvia o que está pendente e vencido (cron). */
export async function processarFila(limite = 50) {
  const pendentes = await prisma.email.findMany({ where: { status: "PENDENTE", proximaTentativa: { lte: new Date() } }, orderBy: { createdAt: "asc" }, take: limite, select: { id: true } });
  let enviados = 0;
  let falhas = 0;
  for (const p of pendentes) {
    const r = await despachar(p.id);
    if (r.status === "ENVIADO") enviados++;
    else falhas++;
  }
  return { processados: pendentes.length, enviados, falhas };
}

/** Volta um e-mail FALHOU para a fila (administrador). */
export async function reenviar(id: string) {
  await prisma.email.update({ where: { id }, data: { status: "PENDENTE", tentativas: 0, proximaTentativa: new Date() } });
  return despachar(id);
}
