import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { aplicarPagamento } from "@/modules/cobranca/servicos";
import type { PagamentoAsaas } from "@/modules/cobranca/asaas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const igual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Webhook do Asaas: o cabeçalho asaas-access-token identifica o estabelecimento (token gerado no registro). Responde 200
 * sempre que o evento foi guardado (o Asaas pausa a fila depois de 15 falhas); o id do evento garante idempotência.
 */
export async function POST(request: Request) {
  const token = request.headers.get("asaas-access-token") ?? "";
  if (!token) return Response.json({ erro: "Sem token." }, { status: 401 });
  const configs = await prisma.configuracaoCobranca.findMany({ where: { webhookToken: { not: null } }, select: { empresaId: true, webhookToken: true } });
  const config = configs.find((c) => c.webhookToken && igual(c.webhookToken, token));
  if (!config) return Response.json({ erro: "Token inválido." }, { status: 401 });
  let corpo: { id?: string; event?: string; payment?: PagamentoAsaas };
  try {
    corpo = (await request.json()) as typeof corpo;
  } catch {
    return Response.json({ erro: "JSON inválido." }, { status: 400 });
  }
  if (!corpo.id || !corpo.event) return Response.json({ erro: "Evento sem id ou tipo." }, { status: 400 });
  const existente = await prisma.eventoCobranca.findUnique({ where: { asaasEventId: corpo.id }, select: { id: true, processadoEm: true } });
  if (existente?.processadoEm) return Response.json({ ok: true, repetido: true });
  const cobranca = corpo.payment?.id ? await prisma.cobranca.findUnique({ where: { asaasPaymentId: corpo.payment.id }, select: { id: true } }) : null;
  const evento = existente
    ? await prisma.eventoCobranca.findUniqueOrThrow({ where: { id: existente.id } })
    : await prisma.eventoCobranca.create({ data: { asaasEventId: corpo.id, cobrancaId: cobranca?.id ?? null, empresaId: config.empresaId, evento: corpo.event, paymentId: corpo.payment?.id ?? null, payload: corpo as object } });
  try {
    const r = corpo.payment && corpo.event.startsWith("PAYMENT_") ? await aplicarPagamento({ ...corpo.payment, deleted: corpo.event === "PAYMENT_DELETED" ? true : corpo.payment.deleted }, `webhook ${corpo.event}`) : { aplicado: false, motivo: "evento ignorado" };
    await prisma.eventoCobranca.update({ where: { id: evento.id }, data: { processadoEm: new Date(), erro: null, cobrancaId: cobranca?.id ?? evento.cobrancaId } });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    await prisma.eventoCobranca.update({ where: { id: evento.id }, data: { erro: (e instanceof Error ? e.message : String(e)).slice(0, 500) } });
    console.error(`[cobranca] webhook ${corpo.event} ${corpo.payment?.id}: ${e instanceof Error ? e.message : String(e)}`);
    return Response.json({ ok: false, erro: "Guardado; será reprocessado na conferência." });
  }
}
