"use server";

// Ações do e-mail transacional: documentos ao cliente, notas fiscais, teste, domínio, fila e redefinição de senha.
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { executar, tratarErro, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao, hashSenha } from "@/lib/auth/sessao";
import { escopoEmpresa, exigirAdmin, exigirAdminDoGrupo } from "@/lib/auth/empresa";
import { auditar } from "@/lib/auditoria";
import { fmtData, fmtMoeda } from "@/lib/format";
import { obterDocumento } from "@/modules/vendas/consultas";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { gerarPdfDocumento } from "@/modules/vendas/pdf";
import { logoParaPdf } from "@/modules/configuracoes/logotipo";
import { gerarDanfe } from "@/modules/fiscal/nfe/danfe";
import { gerarDanfse } from "@/modules/fiscal/nfse/danfse";
import { emailsValidos, enfileirar, reenviar } from "./fila";
import { modeloDocumento, modeloNota, modeloRedefinirSenha, modeloTeste } from "./modelos";
import { configuracaoEmail, garantirDominio, verificarDominio, type EstadoDominio } from "./provedor";

/** Endereço do app (para links nos e-mails): cabeçalhos da requisição ou APP_URL. */
export async function urlBase(): Promise<string> {
  const fixa = process.env.APP_URL?.trim();
  if (fixa) return fixa.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

const esquemaEnvio = z.object({
  para: z.string().transform(emailsValidos).refine((l) => l.length > 0 && l.length <= 5, "Informe de 1 a 5 e-mails válidos."),
  mensagem: z.string().trim().max(1000, "Mensagem de até 1.000 caracteres.").optional().nullable(),
});

function exigirConfigurado() {
  if (!configuracaoEmail().configurado) throw new ErroAcao("O envio de e-mails ainda não está configurado. Um administrador configura em Configurações › E-mails.");
}

async function emitentePara(empresaId: string) {
  const e = await prisma.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: { id: true, matrizId: true, razaoSocial: true, nomeFantasia: true, cnpj: true, inscricaoEstadual: true, logradouro: true, numero: true, complemento: true, bairro: true, cidade: true, uf: true, cep: true, email: true, telefone: true },
  });
  return { ...e, nome: e.nomeFantasia || e.razaoSocial };
}

const resultadoEnvio = (status: string, para: string) => (status === "ENVIADO" ? `E-mail enviado para ${para}.` : `E-mail na fila para ${para}; o envio será tentado de novo em instantes.`);

/** Proposta ou pedido em PDF para o cliente. */
export async function enviarDocumentoPorEmail(tipo: "proposta" | "pedido", id: string, entrada: z.input<typeof esquemaEnvio>): Promise<Resultado> {
  let mensagem = "";
  const r = await executar(async () => {
    const u = await exigirPermissao("vendas:ver");
    exigirConfigurado();
    const d = esquemaEnvio.parse(entrada);
    const escopo = await escopoEmpresa();
    const doc = await obterDocumento(tipo, id);
    if (!doc || !escopo.ids.includes(doc.empresaId)) throw new ErroAcao("Documento não encontrado nesta empresa.");
    const emitente = await emitentePara(doc.empresaId);
    const logo = await logoParaPdf(emitente).catch(() => null);
    const pdf = await gerarPdfDocumento(doc, { ...emitente, logo });
    const numero = fmtNumeroDoc(doc.numero);
    const modelo = modeloDocumento({ tipo, numero, empresa: emitente.nome, cliente: doc.pessoaNome, total: fmtMoeda(doc.total), validade: tipo === "proposta" && doc.validade ? fmtData(doc.validade) : null, mensagem: d.mensagem });
    const e = await enfileirar({
      empresaId: emitente.matrizId ?? emitente.id,
      tipo,
      origemId: id,
      para: d.para,
      responderPara: emitente.email,
      ...modelo,
      anexos: [{ nome: `${tipo === "proposta" ? "Proposta" : "Pedido"}-${numero}.pdf`, tipo: "application/pdf", base64: pdf.toString("base64") }],
      usuarioId: u.id,
    });
    await auditar("enviar_email", tipo, id, `${tipo === "proposta" ? "Proposta" : "Pedido"} nº ${numero} enviado por e-mail para ${d.para.join(", ")}: ${e.status}`, { para: d.para }, { usuarioId: u.id, empresaId: escopo.ativa.id });
    mensagem = resultadoEnvio(e.status, d.para.join(", "));
    return undefined;
  });
  return r.ok ? { ...r, mensagem } : r;
}

/** DANFE ou DANFSe em PDF com o XML, para o cliente. */
export async function enviarNotaPorEmail(tipo: "nfe" | "nfse", id: string, entrada: z.input<typeof esquemaEnvio>): Promise<Resultado> {
  let mensagem = "";
  const r = await executar(async () => {
    const u = await exigirPermissao("vendas:ver");
    exigirConfigurado();
    const d = esquemaEnvio.parse(entrada);
    const escopo = await escopoEmpresa();
    let dados: { empresaId: string; numero: string; cliente: string; total: number; chave: string | null; homologacao: boolean; pdf: Buffer; xml: string; nomeBase: string };
    if (tipo === "nfe") {
      const n = await prisma.notaFiscal.findFirst({ where: { id, empresaId: { in: escopo.ids } } });
      if (!n) throw new ErroAcao("Nota não encontrada nesta empresa.");
      if (!n.xmlAutorizado || n.status === "REJEITADA" || n.status === "PROCESSANDO") throw new ErroAcao("Só nota autorizada (ou cancelada) pode ser enviada.");
      dados = { empresaId: n.empresaId, numero: String(n.numero), cliente: n.destinatarioNome, total: Number(n.valor), chave: n.chave, homologacao: n.ambiente === 2, pdf: await gerarDanfe(n.xmlAutorizado, { cancelada: n.status === "CANCELADA", cancelamento: { protocolo: n.cancelamentoProtocolo, em: n.canceladaEm } }), xml: n.xmlAutorizado, nomeBase: `NFe-${n.chave ?? n.numero}` };
    } else {
      const n = await prisma.notaServico.findFirst({ where: { id, empresaId: { in: escopo.ids } } });
      if (!n) throw new ErroAcao("Nota não encontrada nesta empresa.");
      if (!n.xmlAutorizado || n.status === "REJEITADA" || n.status === "PROCESSANDO") throw new ErroAcao("Só NFS-e gerada (ou cancelada) pode ser enviada.");
      dados = { empresaId: n.empresaId, numero: n.numeroNfse ?? String(n.numero), cliente: n.tomadorNome, total: Number(n.valor), chave: n.chave, homologacao: n.ambiente === 2, pdf: await gerarDanfse(n.xmlAutorizado, { cancelada: n.status === "CANCELADA", cancelamento: { motivo: n.cancelamentoMotivo, codigo: n.cancelamentoCodigo, em: n.canceladaEm } }), xml: n.xmlAutorizado, nomeBase: `NFSe-${n.chave ?? n.numero}` };
    }
    const emitente = await emitentePara(dados.empresaId);
    const modelo = modeloNota({ tipo, numero: dados.numero, empresa: emitente.nome, cliente: dados.cliente, total: fmtMoeda(dados.total), chave: dados.chave, homologacao: dados.homologacao, mensagem: d.mensagem });
    const e = await enfileirar({
      empresaId: emitente.matrizId ?? emitente.id,
      tipo,
      origemId: id,
      para: d.para,
      responderPara: emitente.email,
      ...modelo,
      anexos: [
        { nome: `${dados.nomeBase}.pdf`, tipo: "application/pdf", base64: dados.pdf.toString("base64") },
        { nome: `${dados.nomeBase}.xml`, tipo: "application/xml", base64: Buffer.from(dados.xml, "utf8").toString("base64") },
      ],
      usuarioId: u.id,
    });
    await auditar("enviar_email", "fiscal", id, `${tipo === "nfe" ? "NF-e" : "NFS-e"} nº ${dados.numero} enviada por e-mail para ${d.para.join(", ")}: ${e.status}`, { para: d.para }, { usuarioId: u.id, empresaId: escopo.ativa.id });
    mensagem = resultadoEnvio(e.status, d.para.join(", "));
    return undefined;
  });
  return r.ok ? { ...r, mensagem } : r;
}

// ───────────────────────── administrador: teste, domínio, fila ─────────────────────────

export async function enviarEmailTeste(para: string): Promise<Resultado> {
  let mensagem = "";
  const r = await executar(async () => {
    const { u, ctx } = await exigirAdmin();
    exigirAdminDoGrupo(ctx);
    exigirConfigurado();
    const lista = emailsValidos(para);
    if (lista.length !== 1) throw new ErroAcao("Informe um e-mail válido.", { para: "E-mail inválido." });
    const m = ctx.matrizes[0] ? await prisma.empresa.findUnique({ where: { id: ctx.matrizes[0] }, select: { razaoSocial: true, nomeFantasia: true } }) : null;
    const empresa = m?.nomeFantasia || m?.razaoSocial || "Pro Omie";
    const e = await enfileirar({ tipo: "teste", para: lista, ...modeloTeste({ nome: u.nome, empresa }), usuarioId: u.id });
    if (e.status !== "ENVIADO") throw new ErroAcao(`O envio falhou: ${e.erro ?? "sem detalhes"}`);
    mensagem = `E-mail de teste enviado para ${lista[0]}.`;
    return undefined;
  });
  return r.ok ? { ...r, mensagem } : r;
}

export async function configurarDominioEmail(): Promise<Resultado<EstadoDominio>> {
  return executar(async () => {
    exigirAdminDoGrupo((await exigirAdmin()).ctx);
    exigirConfigurado();
    const d = await garantirDominio();
    revalidatePath("/configuracoes/email");
    return d;
  });
}

export async function verificarDominioEmail(id: string): Promise<Resultado<EstadoDominio>> {
  return executar(async () => {
    exigirAdminDoGrupo((await exigirAdmin()).ctx);
    exigirConfigurado();
    const d = await verificarDominio(id);
    revalidatePath("/configuracoes/email");
    return d;
  }, "Verificação pedida à Resend.");
}

export async function reenviarEmail(id: string): Promise<Resultado> {
  let mensagem = "";
  const r = await executar(async () => {
    exigirAdminDoGrupo((await exigirAdmin()).ctx);
    exigirConfigurado();
    const e = await reenviar(id);
    revalidatePath("/configuracoes/email");
    mensagem = e.status === "ENVIADO" ? "E-mail enviado." : `Ainda não foi: ${e.erro ?? "sem detalhes"}`;
    return undefined;
  });
  return r.ok ? { ...r, mensagem } : r;
}

// ───────────────────────── esqueci minha senha (público) ─────────────────────────

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** Sempre responde igual (não revela se o e-mail existe). Limite: 3 pedidos por hora por usuário. */
export async function solicitarRedefinicaoSenha(_prev: Resultado | null, formData: FormData): Promise<Resultado> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: "Informe um e-mail válido." };
  const generico = { ok: true as const, mensagem: "Se este e-mail tiver acesso ao Pro Omie, você vai receber o link em instantes. Confira também a caixa de spam." };
  const u = await prisma.usuario.findUnique({ where: { email }, select: { id: true, nome: true, ativo: true } });
  if (!u || !u.ativo || !configuracaoEmail().configurado) return generico;
  const recentes = await prisma.tokenSenha.count({ where: { usuarioId: u.id, createdAt: { gte: new Date(Date.now() - 3_600_000) } } });
  if (recentes >= 3) return generico;
  const token = randomBytes(32).toString("base64url");
  await prisma.tokenSenha.create({ data: { usuarioId: u.id, tokenHash: hashToken(token), expiraEm: new Date(Date.now() + 3_600_000) } });
  const url = `${await urlBase()}/redefinir-senha?token=${token}`;
  await enfileirar({ tipo: "redefinir_senha", origemId: u.id, para: [email], ...modeloRedefinirSenha({ nome: u.nome, url }), usuarioId: u.id });
  await auditar("pedir_redefinicao_senha", "usuario", u.id, `Link de redefinição de senha enviado para ${email}`, undefined, { usuarioId: u.id });
  return generico;
}

const senhaForte = z
  .string()
  .min(10, "A senha precisa ter pelo menos 10 caracteres.")
  .regex(/[A-Za-z]/, "A senha precisa ter letras.")
  .regex(/\d/, "A senha precisa ter números.");
const esquemaRedefinir = z.object({ token: z.string().min(10), senha: senhaForte, confirmar: z.string() }).refine((d) => d.senha === d.confirmar, { message: "As senhas não conferem.", path: ["confirmar"] });

export async function redefinirSenha(_prev: Resultado | null, formData: FormData): Promise<Resultado> {
  try {
    const d = esquemaRedefinir.parse(Object.fromEntries(formData));
    const t = await prisma.tokenSenha.findUnique({ where: { tokenHash: hashToken(d.token) } });
    if (!t || t.usadoEm || t.expiraEm < new Date()) throw new ErroAcao("Este link não vale mais. Peça um novo em “Esqueci minha senha”.");
    const u = await prisma.usuario.findUnique({ where: { id: t.usuarioId }, select: { id: true, ativo: true } });
    if (!u || !u.ativo) throw new ErroAcao("Este acesso está desativado. Fale com o administrador.");
    await prisma.$transaction([
      prisma.usuario.update({ where: { id: u.id }, data: { senhaHash: await hashSenha(d.senha), trocarSenha: false, versaoSessao: { increment: 1 }, tentativasFalhas: 0, bloqueadoAte: null } }),
      prisma.tokenSenha.update({ where: { id: t.id }, data: { usadoEm: new Date() } }),
      prisma.tokenSenha.updateMany({ where: { usuarioId: u.id, usadoEm: null }, data: { usadoEm: new Date() } }),
    ]);
    await auditar("redefinir_senha", "usuario", u.id, "Senha redefinida pelo link do e-mail", undefined, { usuarioId: u.id });
  } catch (e) {
    return tratarErro(e);
  }
  redirect("/login?senha=redefinida");
}
