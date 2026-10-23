"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa, exigirEmpresaNoEscopo, type EscopoEmpresa } from "@/lib/auth/empresa";
import { auditar } from "@/lib/auditoria";
import { isoParaDate } from "@/lib/datas";
import { fmtMoeda } from "@/lib/format";
import { num } from "@/lib/serial";
import { parcelasPorCondicao } from "@/modules/financeiro/parcelas";
import { criarLancamento, excluirTitulo } from "@/modules/financeiro/servicos";
import { avancarParaProposta, ganharPelaProposta, oportunidadeParaProposta } from "@/modules/crm/servicos";
import { baixarEstoqueVenda, estornarEstoqueVenda } from "@/modules/estoque/servicos";
import { fmtQtd } from "@/modules/estoque/tipos";
import { fmtNumeroDoc, rateioPorTipo, totaisDocumento, totalItem } from "./calculos";
import {
  esquemaFaturamento,
  esquemaMotivo,
  esquemaPedido,
  esquemaProposta,
  type EntradaFaturamento,
  type EntradaPedido,
  type EntradaProposta,
} from "./esquemas";

type Tx = Prisma.TransactionClient;
type Dados = ReturnType<typeof esquemaPedido.parse>;

const nome = (p: { nome: string; nomeFantasia: string | null }) => p.nomeFantasia || p.nome;

function revalidarVendas() {
  revalidatePath("/vendas/propostas");
  revalidatePath("/vendas/pedidos");
}

/** Próximo número do documento no estabelecimento (CNPJ). Atômico: upsert com incremento. */
async function proximoNumero(tx: Tx, empresaId: string, tipo: "proposta" | "pedido") {
  const s = await tx.sequenciaDocumento.upsert({
    where: { empresaId_tipo: { empresaId, tipo } },
    create: { empresaId, tipo, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });
  return s.ultimo;
}

/** Cliente, produtos, condição, forma e vendedor precisam ser da empresa ativa. */
async function validarReferencias(escopo: EscopoEmpresa, d: Dados) {
  exigirEmpresaNoEscopo(escopo, d.empresaId, "Empresa fora do escopo atual. Troque de empresa no menu.");
  const matriz = escopo.ativa.id;
  const produtoIds = [...new Set(d.itens.map((i) => i.produtoId).filter((x): x is string => !!x))];
  const [pessoa, produtos, condicao, forma, vendedor] = await Promise.all([
    prisma.pessoa.findFirst({ where: { id: d.pessoaId, empresaId: matriz }, select: { id: true, nome: true, nomeFantasia: true, ativo: true } }),
    produtoIds.length ? prisma.produto.findMany({ where: { id: { in: produtoIds }, empresaId: matriz }, select: { id: true } }) : Promise.resolve([]),
    d.condicaoPagamentoId ? prisma.condicaoPagamento.findFirst({ where: { id: d.condicaoPagamentoId, empresaId: matriz }, select: { id: true } }) : Promise.resolve(true),
    d.formaPagamentoId ? prisma.formaPagamento.findFirst({ where: { id: d.formaPagamentoId, empresaId: matriz }, select: { id: true } }) : Promise.resolve(true),
    d.vendedorId
      ? prisma.usuario.findFirst({ where: { id: d.vendedorId, ativo: true, OR: [{ todasEmpresas: true }, { empresas: { has: matriz } }] }, select: { id: true } })
      : Promise.resolve(true),
  ]);
  if (!pessoa) throw new ErroAcao("Cliente não encontrado nesta empresa.", { pessoaId: "Cliente não encontrado nesta empresa." });
  if (produtos.length !== produtoIds.length) throw new ErroAcao("Produto ou serviço não encontrado nesta empresa. Recarregue a página.");
  if (!condicao) throw new ErroAcao("Condição de pagamento não encontrada nesta empresa.", { condicaoPagamentoId: "Condição não encontrada." });
  if (!forma) throw new ErroAcao("Forma de pagamento não encontrada nesta empresa.", { formaPagamentoId: "Forma não encontrada." });
  if (!vendedor) throw new ErroAcao("Vendedor não encontrado ou sem acesso a esta empresa.", { vendedorId: "Vendedor sem acesso a esta empresa." });
  return pessoa;
}

const dadosItens = (d: Dados) =>
  d.itens.map((i, ordem) => ({
    ordem,
    produtoId: i.produtoId,
    tipo: i.tipo,
    descricao: i.descricao,
    unidade: i.unidade,
    quantidade: i.quantidade,
    precoUnitario: i.precoUnitario,
    descontoPercentual: i.descontoPercentual,
    total: totalItem(i),
  }));

function dadosCabecalho(d: Dados, usuarioId: string) {
  const t = totaisDocumento(d.itens);
  return {
    empresaId: d.empresaId,
    pessoaId: d.pessoaId,
    vendedorId: d.vendedorId ?? usuarioId,
    emissao: isoParaDate(d.emissao),
    condicaoPagamentoId: d.condicaoPagamentoId,
    formaPagamentoId: d.formaPagamentoId,
    observacoes: d.observacoes,
    observacoesInternas: d.observacoesInternas,
    subtotal: t.subtotal,
    desconto: t.desconto,
    total: t.total,
  };
}

// ───────────────────────── Propostas ─────────────────────────

/** Cria ou edita uma proposta (edição só em rascunho ou enviada). Os totais são sempre recalculados aqui. */
export async function salvarProposta(id: string | null, entrada: EntradaProposta): Promise<Resultado<{ id: string; numero: number }>> {
  return executar(async () => {
    const u = await exigirPermissao("vendas:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaProposta.parse(entrada);
    const pessoa = await validarReferencias(escopo, d);
    // proposta aberta a partir do funil: a oportunidade precisa ser desta empresa e estar aberta
    const oportunidade = !id && d.oportunidadeId ? await oportunidadeParaProposta(escopo.ativa.id, d.oportunidadeId) : null;
    const cab = dadosCabecalho(d, u.id);
    const itens = dadosItens(d);
    const r = await prisma.$transaction(async (tx) => {
      if (id) {
        const atual = await tx.proposta.findFirst({ where: { id, empresaId: { in: escopo.ids } }, select: { id: true, status: true, empresaId: true } });
        if (!atual) throw new ErroAcao("Proposta não encontrada nesta empresa.");
        if (atual.status !== "RASCUNHO" && atual.status !== "ENVIADA") throw new ErroAcao("Só propostas em rascunho ou enviadas podem ser editadas.");
        if (atual.empresaId !== d.empresaId) throw new ErroAcao("A empresa emissora não pode mudar depois de numerada. Crie outra proposta.", { empresaId: "Não pode mudar." });
        await tx.propostaItem.deleteMany({ where: { propostaId: id } });
        const p = await tx.proposta.update({ where: { id }, data: { ...cab, validade: isoParaDate(d.validade), itens: { create: itens } } });
        return { id: p.id, numero: p.numero, criada: false };
      }
      const numero = await proximoNumero(tx, d.empresaId, "proposta");
      const p = await tx.proposta.create({
        data: { ...cab, validade: isoParaDate(d.validade), numero, oportunidadeId: oportunidade?.id ?? null, criadoPorId: u.id, itens: { create: itens } },
      });
      return { id: p.id, numero, criada: true };
    });
    if (oportunidade) {
      await avancarParaProposta(oportunidade.id, escopo.ativa.id, fmtNumeroDoc(r.numero));
      revalidatePath("/crm/funil");
      revalidatePath(`/crm/oportunidades/${oportunidade.id}`);
    }
    await auditar(r.criada ? "criar" : "atualizar", "proposta", r.id, `Proposta nº ${fmtNumeroDoc(r.numero)} · ${nome(pessoa)} · ${fmtMoeda(cab.total)}`, {
      ...cab,
      validade: d.validade,
      itens: d.itens,
    });
    revalidarVendas();
    return { id: r.id, numero: r.numero };
  }, id ? "Proposta salva." : "Proposta criada.");
}

const TRANSICOES = {
  enviar: { de: ["RASCUNHO"], para: "ENVIADA", carimbo: "enviadaEm", msg: "Proposta marcada como enviada." },
  aprovar: { de: ["RASCUNHO", "ENVIADA"], para: "APROVADA", carimbo: "aprovadaEm", msg: "Proposta aprovada." },
  recusar: { de: ["RASCUNHO", "ENVIADA"], para: "RECUSADA", carimbo: "recusadaEm", msg: "Proposta recusada." },
  cancelar: { de: ["RASCUNHO", "ENVIADA", "APROVADA"], para: "CANCELADA", carimbo: "canceladaEm", msg: "Proposta cancelada." },
  reabrir: { de: ["RECUSADA", "CANCELADA"], para: "RASCUNHO", carimbo: null, msg: "Proposta reaberta como rascunho." },
} as const;
export type AcaoProposta = keyof typeof TRANSICOES;

/**
 * Muda a situação da proposta (transição atômica: só vale a partir das situações permitidas).
 * Aprovar uma proposta que saiu do funil marca a oportunidade como ganha, com o valor da proposta.
 */
export async function alterarSituacaoProposta(id: string, acao: AcaoProposta, motivo?: string | null): Promise<Resultado<{ oportunidadeGanha: boolean }>> {
  const t = TRANSICOES[acao];
  const r = await executar(async () => {
    await exigirPermissao("vendas:editar");
    if (!t) throw new ErroAcao("Ação inválida.");
    const escopo = await escopoEmpresa();
    const m = esquemaMotivo.parse(motivo);
    const atual = await prisma.proposta.findFirst({
      where: { id, empresaId: { in: escopo.ids } },
      select: {
        id: true,
        numero: true,
        status: true,
        total: true,
        oportunidadeId: true,
        pedido: { select: { id: true } },
        pessoa: { select: { nome: true, nomeFantasia: true } },
      },
    });
    if (!atual) throw new ErroAcao("Proposta não encontrada nesta empresa.");
    if (acao === "cancelar" && atual.pedido) throw new ErroAcao("Esta proposta já virou pedido. Cancele o pedido.");
    const data: Prisma.PropostaUpdateManyMutationInput = { status: t.para };
    if (t.carimbo) data[t.carimbo] = new Date();
    if (acao === "recusar") data.motivoRecusa = m;
    if (acao === "reabrir") Object.assign(data, { motivoRecusa: null, recusadaEm: null, canceladaEm: null, aprovadaEm: null });
    const r = await prisma.proposta.updateMany({ where: { id, status: { in: [...t.de] } }, data });
    if (r.count !== 1) throw new ErroAcao("A proposta mudou de situação. Atualize a página.");
    await auditar(acao, "proposta", id, `Proposta nº ${fmtNumeroDoc(atual.numero)} · ${nome(atual.pessoa)}${m ? ` · ${m}` : ""}`, { de: atual.status, para: t.para });
    let oportunidadeGanha = false;
    if (acao === "aprovar" && atual.oportunidadeId) {
      oportunidadeGanha = await ganharPelaProposta(atual.oportunidadeId, escopo.ativa.id, fmtNumeroDoc(atual.numero), num(atual.total));
      revalidatePath("/crm/funil");
      revalidatePath(`/crm/oportunidades/${atual.oportunidadeId}`);
    }
    revalidarVendas();
    revalidatePath(`/vendas/propostas/${id}`);
    return { oportunidadeGanha };
  }, t?.msg ?? "Situação atualizada.");
  if (r.ok && r.data?.oportunidadeGanha) r.mensagem = "Proposta aprovada e oportunidade marcada como ganha.";
  return r;
}

/** Gera o pedido de venda a partir de uma proposta aprovada (copia itens, condição e observações). */
export async function gerarPedido(propostaId: string): Promise<Resultado<{ id: string; numero: number }>> {
  return executar(async () => {
    const u = await exigirPermissao("vendas:editar");
    const escopo = await escopoEmpresa();
    const r = await prisma.$transaction(async (tx) => {
      const p = await tx.proposta.findFirst({
        where: { id: propostaId, empresaId: { in: escopo.ids } },
        include: { itens: { orderBy: { ordem: "asc" } }, pedido: { select: { id: true } }, pessoa: { select: { nome: true, nomeFantasia: true } } },
      });
      if (!p) throw new ErroAcao("Proposta não encontrada nesta empresa.");
      if (p.status !== "APROVADA") throw new ErroAcao("Aprove a proposta antes de gerar o pedido.");
      if (p.pedido) throw new ErroAcao("Esta proposta já gerou um pedido.");
      const numero = await proximoNumero(tx, p.empresaId, "pedido");
      const pedido = await tx.pedido.create({
        data: {
          empresaId: p.empresaId,
          numero,
          propostaId: p.id,
          pessoaId: p.pessoaId,
          vendedorId: p.vendedorId,
          emissao: isoParaDate(new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })),
          condicaoPagamentoId: p.condicaoPagamentoId,
          formaPagamentoId: p.formaPagamentoId,
          observacoes: p.observacoes,
          observacoesInternas: p.observacoesInternas,
          subtotal: p.subtotal,
          desconto: p.desconto,
          total: p.total,
          criadoPorId: u.id,
          itens: {
            create: p.itens.map((i) => ({
              ordem: i.ordem,
              produtoId: i.produtoId,
              tipo: i.tipo,
              descricao: i.descricao,
              unidade: i.unidade,
              quantidade: i.quantidade,
              precoUnitario: i.precoUnitario,
              descontoPercentual: i.descontoPercentual,
              total: i.total,
            })),
          },
        },
      });
      return { id: pedido.id, numero, propostaNumero: p.numero, cliente: nome(p.pessoa), total: num(p.total) };
    });
    await auditar("criar", "pedido", r.id, `Pedido nº ${fmtNumeroDoc(r.numero)} · ${r.cliente} · ${fmtMoeda(r.total)} · da proposta nº ${fmtNumeroDoc(r.propostaNumero)}`, {
      propostaId,
    });
    revalidarVendas();
    return { id: r.id, numero: r.numero };
  }, "Pedido gerado.");
}

// ───────────────────────── Pedidos ─────────────────────────

/** Cria ou edita um pedido de venda (edição só enquanto aberto). */
export async function salvarPedido(id: string | null, entrada: EntradaPedido): Promise<Resultado<{ id: string; numero: number }>> {
  return executar(async () => {
    const u = await exigirPermissao("vendas:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaPedido.parse(entrada);
    const pessoa = await validarReferencias(escopo, d);
    const cab = dadosCabecalho(d, u.id);
    const itens = dadosItens(d);
    const r = await prisma.$transaction(async (tx) => {
      if (id) {
        const atual = await tx.pedido.findFirst({ where: { id, empresaId: { in: escopo.ids } }, select: { id: true, status: true, empresaId: true } });
        if (!atual) throw new ErroAcao("Pedido não encontrado nesta empresa.");
        if (atual.status !== "ABERTO") throw new ErroAcao("Só pedidos em aberto podem ser editados.");
        if (atual.empresaId !== d.empresaId) throw new ErroAcao("A empresa emissora não pode mudar depois de numerada. Crie outro pedido.", { empresaId: "Não pode mudar." });
        await tx.pedidoItem.deleteMany({ where: { pedidoId: id } });
        const p = await tx.pedido.update({ where: { id }, data: { ...cab, itens: { create: itens } } });
        return { id: p.id, numero: p.numero, criado: false };
      }
      const numero = await proximoNumero(tx, d.empresaId, "pedido");
      const p = await tx.pedido.create({ data: { ...cab, numero, criadoPorId: u.id, itens: { create: itens } } });
      return { id: p.id, numero, criado: true };
    });
    await auditar(r.criado ? "criar" : "atualizar", "pedido", r.id, `Pedido nº ${fmtNumeroDoc(r.numero)} · ${nome(pessoa)} · ${fmtMoeda(cab.total)}`, { ...cab, itens: d.itens });
    revalidarVendas();
    return { id: r.id, numero: r.numero };
  }, id ? "Pedido salvo." : "Pedido criado.");
}

export async function cancelarPedido(id: string, motivo?: string | null): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("vendas:editar");
    const escopo = await escopoEmpresa();
    const m = esquemaMotivo.parse(motivo);
    const atual = await prisma.pedido.findFirst({ where: { id, empresaId: { in: escopo.ids } }, select: { numero: true, status: true, pessoa: { select: { nome: true, nomeFantasia: true } } } });
    if (!atual) throw new ErroAcao("Pedido não encontrado nesta empresa.");
    if (atual.status === "FATURADO") throw new ErroAcao("Pedido faturado: desfaça o faturamento antes de cancelar.");
    const r = await prisma.pedido.updateMany({ where: { id, status: "ABERTO" }, data: { status: "CANCELADO", canceladoEm: new Date(), motivoCancelamento: m } });
    if (r.count !== 1) throw new ErroAcao("O pedido mudou de situação. Atualize a página.");
    await auditar("cancelar", "pedido", id, `Pedido nº ${fmtNumeroDoc(atual.numero)} · ${nome(atual.pessoa)}${m ? ` · ${m}` : ""}`, { motivo: m });
    revalidarVendas();
    revalidatePath(`/vendas/pedidos/${id}`);
    return undefined;
  }, "Pedido cancelado.");
}

/**
 * Fatura o pedido: gera as contas a receber (uma por parcela da condição de pagamento), com rateio por tipo de item
 * (produtos e serviços em categorias próprias), origem VENDA. Exige também permissão de editar o financeiro.
 */
export async function faturarPedido(id: string, entrada: EntradaFaturamento): Promise<Resultado<{ titulos: number; baixaEstoque: boolean }>> {
  const resultado = await executar(async () => {
    const u = await exigirPermissao("vendas:editar");
    if (!pode(u.papel, "financeiro:editar")) throw new ErroAcao("Faturar gera contas a receber: peça a alguém do financeiro.");
    const escopo = await escopoEmpresa();
    const f = esquemaFaturamento.parse(entrada);
    const matriz = escopo.ativa.id;
    const pedido = await prisma.pedido.findFirst({
      where: { id, empresaId: { in: escopo.ids } },
      include: {
        itens: { include: { produto: { select: { tipo: true, controlaEstoque: true, descricao: true, unidade: true } } } },
        pessoa: { select: { nome: true, nomeFantasia: true } },
        condicaoPagamento: { select: { dias: true } },
      },
    });
    if (!pedido) throw new ErroAcao("Pedido não encontrado nesta empresa.");
    if (pedido.status !== "ABERTO") throw new ErroAcao("Só pedidos em aberto podem ser faturados.");
    const total = num(pedido.total);
    if (!(total > 0)) throw new ErroAcao("O pedido está com total zero.");

    const tipos = new Set(pedido.itens.map((i) => i.tipo));
    if (tipos.has("PRODUTO") && !f.categoriaProdutosId) throw new ErroAcao("Escolha a categoria dos produtos.", { categoriaProdutosId: "Escolha a categoria." });
    if (tipos.has("SERVICO") && !f.categoriaServicosId) throw new ErroAcao("Escolha a categoria dos serviços.", { categoriaServicosId: "Escolha a categoria." });
    const categoriaIds = [f.categoriaProdutosId, f.categoriaServicosId].filter((x): x is string => !!x);
    const condicaoId = f.condicaoPagamentoId ?? pedido.condicaoPagamentoId;
    const formaId = f.formaPagamentoId ?? pedido.formaPagamentoId;
    const [categorias, centro, conta, condicao, forma] = await Promise.all([
      prisma.categoria.findMany({ where: { id: { in: categoriaIds }, empresaId: matriz, tipo: "RECEITA" }, select: { id: true } }),
      f.centroCustoId ? prisma.centroCusto.findFirst({ where: { id: f.centroCustoId, empresaId: matriz }, select: { id: true } }) : Promise.resolve(true),
      f.contaBancariaId ? prisma.contaBancaria.findFirst({ where: { id: f.contaBancariaId, empresaId: { in: escopo.ids } }, select: { id: true } }) : Promise.resolve(true),
      condicaoId ? prisma.condicaoPagamento.findFirst({ where: { id: condicaoId, empresaId: matriz }, select: { dias: true } }) : Promise.resolve(null),
      formaId ? prisma.formaPagamento.findFirst({ where: { id: formaId, empresaId: matriz }, select: { id: true } }) : Promise.resolve(true),
    ]);
    if (categorias.length !== new Set(categoriaIds).size) throw new ErroAcao("Categoria de receita não encontrada nesta empresa.");
    if (!centro) throw new ErroAcao("Centro de custo não encontrado nesta empresa.");
    if (!conta) throw new ErroAcao("Conta bancária não encontrada nesta empresa.");
    if (condicaoId && !condicao) throw new ErroAcao("Condição de pagamento não encontrada nesta empresa.");
    if (!forma) throw new ErroAcao("Forma de pagamento não encontrada nesta empresa.");

    const rateios = rateioPorTipo(
      pedido.itens.map((i) => ({ tipo: i.tipo, total: num(i.total) })),
      { PRODUTO: f.categoriaProdutosId, SERVICO: f.categoriaServicosId },
      f.centroCustoId,
    );
    const parcelas = parcelasPorCondicao(total, condicao?.dias ?? "0", f.emissao);
    const cliente = nome(pedido.pessoa);

    const { ids, estoque } = await prisma.$transaction(async (tx) => {
      const r = await tx.pedido.updateMany({
        where: { id, status: "ABERTO" },
        data: { status: "FATURADO", faturadoEm: new Date(), dataFaturamento: isoParaDate(f.emissao), condicaoPagamentoId: condicaoId, formaPagamentoId: formaId },
      });
      if (r.count !== 1) throw new ErroAcao("O pedido mudou de situação. Atualize a página.");
      // baixa no estoque dos materiais (falta de saldo desfaz tudo, inclusive as contas a receber)
      const estoque = await baixarEstoqueVenda(tx, {
        empresaId: pedido.empresaId,
        pedidoId: pedido.id,
        pedidoNumero: fmtNumeroDoc(pedido.numero),
        data: isoParaDate(f.emissao),
        usuarioId: u.id,
        itens: pedido.itens,
      });
      const ids = await criarLancamento(
        tx,
        {
          tipo: "RECEBER",
          empresaId: pedido.empresaId,
          pessoaId: pedido.pessoaId,
          descricao: `Pedido nº ${fmtNumeroDoc(pedido.numero)} · ${cliente}`.slice(0, 300),
          documento: `PED-${fmtNumeroDoc(pedido.numero)}`,
          contaBancariaId: f.contaBancariaId,
          formaPagamentoId: formaId,
          emissao: f.emissao,
          competencia: f.emissao,
          rateios,
          parcelas,
          origem: "VENDA",
          origemId: pedido.id,
        },
        u.id,
      );
      return { ids, estoque };
    });
    await auditar("faturar", "pedido", id, `Pedido nº ${fmtNumeroDoc(pedido.numero)} · ${cliente} · ${fmtMoeda(total)} em ${parcelas.length} parcela(s)`, {
      parcelas,
      rateios,
      titulos: ids,
      estoque: estoque ? { lancamento: estoque.numero, itens: estoque.itens.map((i) => `${i.descricao} ${fmtQtd(i.quantidade, i.unidade)}`) } : null,
    });
    revalidarVendas();
    revalidatePath(`/vendas/pedidos/${id}`);
    revalidatePath("/financeiro/receber");
    revalidatePath("/");
    if (estoque) revalidatePath("/estoque", "layout");
    return { titulos: ids.length, baixaEstoque: !!estoque };
  });
  if (resultado.ok) {
    resultado.mensagem = resultado.data?.baixaEstoque ? "Pedido faturado: contas a receber geradas e baixa no estoque feita." : "Pedido faturado: contas a receber geradas.";
  }
  return resultado;
}

/** Desfaz o faturamento: exclui as contas a receber geradas (se nenhuma tiver baixa) e reabre o pedido. */
export async function desfazerFaturamento(id: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("vendas:editar");
    if (!pode(u.papel, "financeiro:editar")) throw new ErroAcao("Desfazer o faturamento exclui contas a receber: peça a alguém do financeiro.");
    const escopo = await escopoEmpresa();
    const pedido = await prisma.pedido.findFirst({ where: { id, empresaId: { in: escopo.ids } }, select: { numero: true, status: true, pessoa: { select: { nome: true, nomeFantasia: true } } } });
    if (!pedido) throw new ErroAcao("Pedido não encontrado nesta empresa.");
    if (pedido.status !== "FATURADO") throw new ErroAcao("O pedido não está faturado.");
    const titulos = await prisma.titulo.findMany({ where: { origem: "VENDA", origemId: id }, select: { id: true, numero: true, _count: { select: { baixas: true } } } });
    const comBaixa = titulos.filter((t) => t._count.baixas > 0);
    if (comBaixa.length) {
      throw new ErroAcao(`Há recebimento registrado (título nº ${comBaixa.map((t) => t.numero).join(", ")}). Estorne e cancele os títulos manualmente.`);
    }
    const estoque = await prisma.$transaction(async (tx) => {
      const r = await tx.pedido.updateMany({ where: { id, status: "FATURADO" }, data: { status: "ABERTO", faturadoEm: null, dataFaturamento: null } });
      if (r.count !== 1) throw new ErroAcao("O pedido mudou de situação. Atualize a página.");
      for (const t of titulos) await excluirTitulo(tx, t.id);
      return estornarEstoqueVenda(tx, id);
    });
    await auditar(
      "desfazer_faturamento",
      "pedido",
      id,
      `Pedido nº ${fmtNumeroDoc(pedido.numero)} · ${nome(pedido.pessoa)} · ${titulos.length} título(s) excluído(s)${estoque ? " · material devolvido ao estoque" : ""}`,
      { titulos: titulos.map((t) => t.numero), estoque: estoque ? { lancamento: estoque.numero } : null },
    );
    if (estoque) revalidatePath("/estoque", "layout");
    revalidarVendas();
    revalidatePath(`/vendas/pedidos/${id}`);
    revalidatePath("/financeiro/receber");
    revalidatePath("/");
    return undefined;
  }, "Faturamento desfeito: o pedido voltou a ficar em aberto.");
}
