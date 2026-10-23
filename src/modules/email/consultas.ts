// Consultas do e-mail transacional (telas). Só servidor.
import "server-only";
import { prisma } from "@/lib/db";
import type { AlvoEmail } from "@/components/email/enviar-email";
import type { DocumentoVenda } from "@/modules/vendas/tipos";
import { configuracaoEmail } from "./provedor";

/** Destinatário padrão (e-mail do cliente) e se o provedor está configurado, para o botão "Enviar por e-mail". */
export async function alvoEmailDoDocumento(doc: DocumentoVenda): Promise<AlvoEmail> {
  const pessoa = await prisma.pessoa.findUnique({ where: { id: doc.pessoaId }, select: { email: true } });
  return { tipo: doc.tipo, id: doc.id, paraPadrao: pessoa?.email ?? null, configurado: configuracaoEmail().configurado };
}

/** E-mail do cliente pelo documento (CNPJ/CPF) dentro das empresas do escopo. */
export async function emailDoDocumentoCliente(documento: string | null, empresaIds: string[]): Promise<string | null> {
  if (!documento) return null;
  const p = await prisma.pessoa.findFirst({ where: { empresaId: { in: empresaIds }, documento: documento.replace(/\D/g, ""), email: { not: null } }, select: { email: true }, orderBy: { createdAt: "asc" } });
  return p?.email ?? null;
}

export function estadoEmail() {
  const c = configuracaoEmail();
  return { configurado: c.configurado, remetente: c.remetente, dominio: c.dominio };
}

export async function listarEmails(limite = 100) {
  const lista = await prisma.email.findMany({
    orderBy: { createdAt: "desc" },
    take: limite,
    select: { id: true, tipo: true, para: true, assunto: true, status: true, tentativas: true, erro: true, enviadoEm: true, createdAt: true, proximaTentativa: true, anexos: true },
  });
  const [pendentes, falhos] = await Promise.all([prisma.email.count({ where: { status: "PENDENTE" } }), prisma.email.count({ where: { status: "FALHOU" } })]);
  return {
    pendentes,
    falhos,
    emails: lista.map((e) => ({
      ...e,
      anexos: Array.isArray(e.anexos) ? (e.anexos as { nome: string }[]).map((a) => a.nome) : [],
      enviadoEm: e.enviadoEm?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
      proximaTentativa: e.proximaTentativa?.toISOString() ?? null,
    })),
  };
}
export type LinhaEmail = Awaited<ReturnType<typeof listarEmails>>["emails"][number];
