// Contratos recorrentes e ordens de serviço: geração do pedido faturado com a conta a receber (e cobrança opcional) a cada
// competência; conversão da OS concluída em pedido. Só servidor.
import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { num } from "@/lib/serial";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { criarLancamento } from "@/modules/financeiro/servicos";
import { gerarCobranca } from "@/modules/cobranca/servicos";

const MESES: Record<string, number> = { MENSAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 };
const isoDia = (d: Date) => d.toISOString().slice(0, 10);
const hojeBr = () => new Date(Date.now() - 3 * 3_600_000);

async function proximoNumero(tx: Prisma.TransactionClient, empresaId: string, tipo: string) {
  const s = await tx.sequenciaDocumento.upsert({ where: { empresaId_tipo: { empresaId, tipo } }, create: { empresaId, tipo, ultimo: 1 }, update: { ultimo: { increment: 1 } } });
  return s.ultimo;
}

/** Vencimento de uma competência: dia fixo do contrato dentro do mês (1 a 28). */
export function vencimentoDe(competencia: Date, dia: number): Date {
  return new Date(Date.UTC(competencia.getUTCFullYear(), competencia.getUTCMonth(), Math.min(28, Math.max(1, dia))));
}
export const competenciaSeguinte = (competencia: Date, periodicidade: string) => new Date(Date.UTC(competencia.getUTCFullYear(), competencia.getUTCMonth() + (MESES[periodicidade] ?? 1), 1));

/** Gera a competência atual de um contrato: pedido faturado (só serviços) + conta a receber + cobrança opcional. */
export async function gerarCompetencia(contratoId: string, opcoes: { usuarioId: string | null; urlBase: string; forcar?: boolean }) {
  const c = await prisma.contrato.findUniqueOrThrow({ where: { id: contratoId }, include: { pessoa: { select: { nome: true, nomeFantasia: true, email: true } }, produto: { select: { id: true, codigo: true, descricao: true, unidade: true } }, empresa: { select: { id: true } } } });
  if (!c.ativo) throw new ErroAcao("Contrato suspenso.");
  const competencia = c.proximaCompetencia;
  if (c.fim && competencia > c.fim) throw new ErroAcao("O contrato já passou da data de fim.");
  const vencimento = vencimentoDe(competencia, c.diaVencimento);
  const limite = new Date(vencimento.getTime() - c.antecedenciaDias * 86_400_000);
  if (!opcoes.forcar && hojeBr() < limite) throw new ErroAcao(`A competência ${isoDia(competencia).slice(0, 7)} só é gerada a partir de ${isoDia(limite).split("-").reverse().join("/")}.`);
  const existente = await prisma.contratoGeracao.findUnique({ where: { contratoId_competencia: { contratoId, competencia } } });
  if (existente?.pedidoId) throw new ErroAcao("Esta competência já foi gerada.");
  const categoria = c.categoriaId ?? (await prisma.categoria.findFirst({ where: { empresaId: c.empresaId, tipo: "RECEITA", ativo: true, OR: [{ nome: { contains: "servi", mode: "insensitive" } }, {}] }, orderBy: { codigo: "asc" }, select: { id: true } }))?.id;
  if (!categoria) throw new ErroAcao("Cadastre uma categoria de receita (ou escolha a do contrato).");
  const cliente = c.pessoa.nomeFantasia || c.pessoa.nome;
  const competenciaRotulo = `${isoDia(competencia).slice(5, 7)}/${isoDia(competencia).slice(0, 4)}`;
  const hoje = isoDia(hojeBr());
  const valor = num(c.valor);

  const r = await prisma.$transaction(async (tx) => {
    const numero = await proximoNumero(tx, c.empresaId, "pedido");
    const pedido = await tx.pedido.create({
      data: {
        empresaId: c.empresaId,
        numero,
        status: "FATURADO",
        pessoaId: c.pessoaId,
        emissao: new Date(`${hoje}T00:00:00Z`),
        formaPagamentoId: c.formaPagamentoId,
        observacoes: `${c.descricao} - competência ${competenciaRotulo} (contrato ${String(c.numero).padStart(4, "0")})${c.observacoes ? `\n${c.observacoes}` : ""}`.slice(0, 2000),
        subtotal: valor,
        desconto: 0,
        total: valor,
        faturadoEm: new Date(),
        dataFaturamento: new Date(`${hoje}T00:00:00Z`),
        criadoPorId: opcoes.usuarioId,
        itens: { create: [{ ordem: 1, produtoId: c.produto?.id ?? null, tipo: "SERVICO", descricao: `${c.descricao} - ${competenciaRotulo}`.slice(0, 300), unidade: c.produto?.unidade ?? "UN", quantidade: 1, precoUnitario: valor, descontoPercentual: 0, total: valor }] },
      },
    });
    const ids = await criarLancamento(
      tx,
      {
        tipo: "RECEBER",
        empresaId: c.empresaId,
        pessoaId: c.pessoaId,
        descricao: `Pedido nº ${fmtNumeroDoc(numero)} · ${cliente} · ${c.descricao} ${competenciaRotulo}`.slice(0, 300),
        documento: `PED-${fmtNumeroDoc(numero)}`,
        contaBancariaId: c.contaBancariaId,
        formaPagamentoId: c.formaPagamentoId,
        emissao: hoje,
        competencia: isoDia(competencia),
        rateios: [{ categoriaId: categoria, centroCustoId: null, percentual: 100 }],
        parcelas: [{ vencimento: isoDia(vencimento), valor }],
        origem: "VENDA",
        origemId: pedido.id,
      },
      opcoes.usuarioId,
    );
    const geracao = existente
      ? await tx.contratoGeracao.update({ where: { id: existente.id }, data: { pedidoId: pedido.id, tituloId: ids[0], erro: null } })
      : await tx.contratoGeracao.create({ data: { contratoId, competencia, pedidoId: pedido.id, tituloId: ids[0] } });
    const proxima = competenciaSeguinte(competencia, c.periodicidade);
    await tx.contrato.update({ where: { id: contratoId }, data: { proximaCompetencia: proxima, ...(c.fim && proxima > c.fim ? { ativo: false } : {}) } });
    return { pedidoId: pedido.id, numero, tituloId: ids[0], geracaoId: geracao.id };
  });

  let cobrancaId: string | null = null;
  let erroCobranca: string | null = null;
  if (c.gerarCobranca) {
    try {
      const g = await gerarCobranca(r.tituloId, { tipo: null, enviarEmail: true, usuarioId: opcoes.usuarioId ?? "", escopoIds: [c.empresaId], urlBase: opcoes.urlBase });
      cobrancaId = g.cobranca.id;
      await prisma.contratoGeracao.update({ where: { id: r.geracaoId }, data: { cobrancaId } });
    } catch (e) {
      erroCobranca = (e instanceof Error ? e.message : String(e)).slice(0, 400);
      await prisma.contratoGeracao.update({ where: { id: r.geracaoId }, data: { erro: `Cobrança não gerada: ${erroCobranca}` } });
    }
  }
  return { ...r, competencia: competenciaRotulo, vencimento: isoDia(vencimento), cobrancaId, erroCobranca, cliente, valor };
}

/** Contratos ativos cuja competência já entrou na janela de antecedência (cron ou botão). */
export async function gerarContratosPendentes(opcoes: { usuarioId: string | null; urlBase: string; empresaIds?: string[] }) {
  const hoje = hojeBr();
  const contratos = await prisma.contrato.findMany({ where: { ativo: true, ...(opcoes.empresaIds ? { empresaId: { in: opcoes.empresaIds } } : {}), proximaCompetencia: { lte: new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 2, 1)) } }, select: { id: true, numero: true, proximaCompetencia: true, diaVencimento: true, antecedenciaDias: true, fim: true } });
  const gerados: { contrato: number; pedido: number; competencia: string }[] = [];
  const erros: { contrato: number; erro: string }[] = [];
  for (const c of contratos) {
    if (c.fim && c.proximaCompetencia > c.fim) {
      await prisma.contrato.update({ where: { id: c.id }, data: { ativo: false } });
      continue;
    }
    const limite = new Date(vencimentoDe(c.proximaCompetencia, c.diaVencimento).getTime() - c.antecedenciaDias * 86_400_000);
    if (hoje < limite) continue;
    try {
      const r = await gerarCompetencia(c.id, opcoes);
      gerados.push({ contrato: c.numero, pedido: r.numero, competencia: r.competencia });
    } catch (e) {
      erros.push({ contrato: c.numero, erro: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  }
  return { gerados, erros };
}

/** OS concluída vira pedido em aberto (o faturamento e a NFS-e seguem o fluxo normal do pedido). */
export async function gerarPedidoDaOrdem(osId: string, opcoes: { usuarioId: string; escopoIds: string[] }) {
  const o = await prisma.ordemServico.findFirst({ where: { id: osId, empresaId: { in: opcoes.escopoIds } }, include: { produto: { select: { id: true, unidade: true } } } });
  if (!o) throw new ErroAcao("Ordem de serviço não encontrada nesta empresa.");
  if (o.pedidoId) throw new ErroAcao("Esta OS já virou pedido.");
  if (o.status === "CANCELADA") throw new ErroAcao("OS cancelada não gera pedido.");
  const valor = Math.round(num(o.quantidade) * num(o.valorUnitario) * 100) / 100;
  if (valor <= 0) throw new ErroAcao("Informe o valor da OS (quantidade e valor unitário) antes de gerar o pedido.");
  const hoje = isoDia(hojeBr());
  return prisma.$transaction(async (tx) => {
    const numero = await proximoNumero(tx, o.empresaId, "pedido");
    const pedido = await tx.pedido.create({
      data: {
        empresaId: o.empresaId,
        numero,
        status: "ABERTO",
        pessoaId: o.pessoaId,
        emissao: new Date(`${hoje}T00:00:00Z`),
        observacoes: `${o.observacoes ?? ""}`.trim() || null,
        observacoesInternas: `OS ${String(o.numero).padStart(4, "0")}${o.detalhes ? ` · ${o.detalhes}` : ""}`.slice(0, 2000),
        subtotal: valor,
        desconto: 0,
        total: valor,
        criadoPorId: opcoes.usuarioId,
        itens: { create: [{ ordem: 1, produtoId: o.produto?.id ?? null, tipo: "SERVICO", descricao: o.descricao.slice(0, 300), unidade: o.produto?.unidade ?? "UN", quantidade: o.quantidade, precoUnitario: o.valorUnitario, descontoPercentual: 0, total: valor }] },
      },
    });
    await tx.ordemServico.update({ where: { id: osId }, data: { pedidoId: pedido.id, status: o.status === "ABERTA" || o.status === "EM_ANDAMENTO" ? "CONCLUIDA" : o.status, conclusao: o.conclusao ?? new Date(`${hoje}T00:00:00Z`) } });
    return { pedidoId: pedido.id, numero, valor };
  });
}
