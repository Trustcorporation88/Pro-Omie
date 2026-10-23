"use server";

// Ações dos contratos recorrentes e das ordens de serviço.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { exigirPermissao } from "@/lib/auth/sessao";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { auditar } from "@/lib/auditoria";
import { fmtMoeda } from "@/lib/format";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { urlBase } from "@/modules/email/acoes";
import { gerarCompetencia, gerarContratosPendentes, gerarPedidoDaOrdem } from "./recorrencia";

function revalidar() {
  revalidatePath("/cadastros/contratos");
  revalidatePath("/cadastros/ordens");
  revalidatePath("/vendas/pedidos");
  revalidatePath("/financeiro/receber");
}

/** Gera agora todas as competências que já entraram na janela (botão da tela de contratos). */
export async function gerarContratosAgora(): Promise<Resultado<{ gerados: number; erros: { contrato: number; erro: string }[] }>> {
  let mensagem = "";
  const r = await executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    await exigirPermissao("vendas:editar");
    const escopo = await escopoEmpresa();
    const res = await gerarContratosPendentes({ usuarioId: u.id, urlBase: await urlBase(), empresaIds: escopo.ids });
    for (const g of res.gerados) await auditar("gerar_contrato", "contrato", String(g.contrato), `Contrato ${String(g.contrato).padStart(4, "0")}: competência ${g.competencia} → pedido nº ${fmtNumeroDoc(g.pedido)}`, g, { usuarioId: u.id, empresaId: escopo.ativa.id });
    revalidar();
    mensagem = res.gerados.length ? `${res.gerados.length} competência(s) gerada(s): ${res.gerados.map((g) => `pedido nº ${fmtNumeroDoc(g.pedido)}`).join(", ")}.` : "Nenhuma competência pendente dentro da antecedência.";
    if (res.erros.length) mensagem += ` ${res.erros.length} com erro: ${res.erros.map((e) => `contrato ${e.contrato}: ${e.erro}`).join("; ")}`;
    return { gerados: res.gerados.length, erros: res.erros };
  });
  return r.ok ? { ...r, mensagem } : r;
}

/** Gera a próxima competência de um contrato específico, mesmo fora da janela de antecedência. */
export async function gerarCompetenciaContrato(contratoId: string): Promise<Resultado<{ pedidoId: string; numero: number }>> {
  let mensagem = "";
  const r = await executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    await exigirPermissao("vendas:editar");
    const escopo = await escopoEmpresa();
    const c = await prisma.contrato.findFirst({ where: { id: contratoId, empresaId: { in: escopo.ids } }, select: { numero: true } });
    if (!c) return Promise.reject(new Error("Contrato não encontrado nesta empresa."));
    const res = await gerarCompetencia(contratoId, { usuarioId: u.id, urlBase: await urlBase(), forcar: true });
    await auditar("gerar_contrato", "contrato", contratoId, `Contrato ${String(c.numero).padStart(4, "0")}: competência ${res.competencia} → pedido nº ${fmtNumeroDoc(res.numero)} · ${res.cliente} · ${fmtMoeda(res.valor)}${res.cobrancaId ? " · cobrança gerada" : res.erroCobranca ? ` · cobrança falhou: ${res.erroCobranca}` : ""}`, res, { usuarioId: u.id, empresaId: escopo.ativa.id });
    revalidar();
    mensagem = `Competência ${res.competencia} gerada: pedido nº ${fmtNumeroDoc(res.numero)}, vencimento ${res.vencimento.split("-").reverse().join("/")}.${res.cobrancaId ? " Boleto/Pix gerado e enviado." : res.erroCobranca ? ` Cobrança não gerada: ${res.erroCobranca}` : ""}`;
    return { pedidoId: res.pedidoId, numero: res.numero };
  });
  return r.ok ? { ...r, mensagem } : r;
}

export async function gerarPedidoDaOs(osId: string): Promise<Resultado<{ pedidoId: string; numero: number }>> {
  let mensagem = "";
  const r = await executar(async () => {
    const u = await exigirPermissao("vendas:editar");
    const escopo = await escopoEmpresa();
    const res = await gerarPedidoDaOrdem(osId, { usuarioId: u.id, escopoIds: escopo.ids });
    await auditar("gerar_pedido_os", "ordem_servico", osId, `OS virou o pedido nº ${fmtNumeroDoc(res.numero)} · ${fmtMoeda(res.valor)}`, res, { usuarioId: u.id, empresaId: escopo.ativa.id });
    revalidar();
    mensagem = `Pedido nº ${fmtNumeroDoc(res.numero)} criado a partir da OS. Fature-o para gerar a conta a receber e a NFS-e.`;
    return { pedidoId: res.pedidoId, numero: res.numero };
  });
  return r.ok ? { ...r, mensagem } : r;
}
