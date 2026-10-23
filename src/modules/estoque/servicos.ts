// Regras de estoque usadas dentro de transações (estoque e faturamento de vendas). Não são server actions.
// Nada aqui chama escopoEmpresa() ou auditar(): isso abriria outra conexão dentro da transação.
import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { num } from "@/lib/serial";
import { fmtQtd, type EstoquePedido } from "./tipos";

type Tx = Prisma.TransactionClient;

const arred3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Próximo número de lançamento de estoque do estabelecimento (atômico). */
export async function proximoNumeroEstoque(tx: Tx, empresaId: string) {
  const s = await tx.sequenciaDocumento.upsert({
    where: { empresaId_tipo: { empresaId, tipo: "estoque" } },
    create: { empresaId, tipo: "estoque", ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });
  return s.ultimo;
}

/** Soma ao saldo do material no estabelecimento (cria a linha na primeira entrada). */
export async function somarSaldo(tx: Tx, empresaId: string, produtoId: string, quantidade: number, custoUnitario: number | null = null) {
  if (custoUnitario === null) {
    await tx.saldoEstoque.upsert({
      where: { empresaId_produtoId: { empresaId, produtoId } },
      create: { empresaId, produtoId, quantidade },
      update: { quantidade: { increment: quantidade } },
    });
    return;
  }
  // entrada com custo (nota fiscal de compra): custo médio ponderado pelo saldo anterior
  const atual = await tx.saldoEstoque.findUnique({ where: { empresaId_produtoId: { empresaId, produtoId } } });
  const saldoAnterior = Math.max(0, num(atual?.quantidade ?? 0));
  const custoAnterior = num(atual?.custoMedio ?? 0);
  const total = saldoAnterior + quantidade;
  const custoMedio = total > 0 ? Math.round(((saldoAnterior * custoAnterior + quantidade * custoUnitario) / total) * 10000) / 10000 : custoUnitario;
  await tx.saldoEstoque.upsert({
    where: { empresaId_produtoId: { empresaId, produtoId } },
    create: { empresaId, produtoId, quantidade, custoMedio },
    update: { quantidade: { increment: quantidade }, custoMedio },
  });
}

/** Tira do saldo só se houver o suficiente, numa única instrução (duas vendas ao mesmo tempo não passam do saldo). */
export async function tirarSaldo(tx: Tx, empresaId: string, produtoId: string, quantidade: number): Promise<boolean> {
  const r = await tx.saldoEstoque.updateMany({
    where: { empresaId, produtoId, quantidade: { gte: quantidade } },
    data: { quantidade: { decrement: quantidade } },
  });
  return r.count === 1;
}

type ItemVenda = {
  tipo: "PRODUTO" | "SERVICO";
  produtoId: string | null;
  quantidade: Prisma.Decimal | number;
  produto: { tipo: "PRODUTO" | "SERVICO"; controlaEstoque: boolean; descricao: string; unidade: string } | null;
};

/** Itens do pedido que mexem no estoque (produto do cadastro com controle de estoque), somados por material. */
export function itensComEstoque(itens: ItemVenda[]) {
  const porProduto = new Map<string, { produtoId: string; descricao: string; unidade: string; quantidade: number }>();
  for (const i of itens) {
    if (i.tipo !== "PRODUTO" || !i.produtoId || !i.produto || i.produto.tipo !== "PRODUTO" || !i.produto.controlaEstoque) continue;
    const atual = porProduto.get(i.produtoId);
    const q = num(i.quantidade);
    if (atual) atual.quantidade = arred3(atual.quantidade + q);
    else porProduto.set(i.produtoId, { produtoId: i.produtoId, descricao: i.produto.descricao, unidade: i.produto.unidade, quantidade: arred3(q) });
  }
  return [...porProduto.values()].filter((i) => i.quantidade > 0);
}

/** Saldos dos materiais no estabelecimento (fora de transação: para mostrar na tela). */
export async function estoqueDoPedido(empresaId: string, itens: ItemVenda[]): Promise<EstoquePedido[]> {
  const linhas = itensComEstoque(itens);
  if (!linhas.length) return [];
  const saldos = await prisma.saldoEstoque.findMany({ where: { empresaId, produtoId: { in: linhas.map((l) => l.produtoId) } } });
  const mapa = new Map(saldos.map((s) => [s.produtoId, num(s.quantidade)]));
  return linhas.map((l) => ({ ...l, saldo: mapa.get(l.produtoId) ?? 0 }));
}

/**
 * Baixa do estoque ao faturar o pedido: um lançamento VENDA com uma saída por material.
 * Falta de saldo em qualquer material cancela o faturamento inteiro, com a lista do que falta.
 */
export async function baixarEstoqueVenda(
  tx: Tx,
  p: { empresaId: string; pedidoId: string; pedidoNumero: string; data: Date; usuarioId: string; itens: ItemVenda[] },
) {
  const linhas = itensComEstoque(p.itens);
  if (!linhas.length) return null;
  const saldos = await tx.saldoEstoque.findMany({ where: { empresaId: p.empresaId, produtoId: { in: linhas.map((l) => l.produtoId) } } });
  const mapa = new Map(saldos.map((s) => [s.produtoId, num(s.quantidade)]));
  const faltas = linhas.filter((l) => (mapa.get(l.produtoId) ?? 0) < l.quantidade);
  if (faltas.length) {
    const lista = faltas.map((l) => `${l.descricao}: pedido ${fmtQtd(l.quantidade, l.unidade)}, saldo ${fmtQtd(mapa.get(l.produtoId) ?? 0, l.unidade)}`).join("; ");
    throw new ErroAcao(`Falta saldo no estoque (${lista}). Registre a entrada da produção, ajuste o estoque ou corrija a quantidade do pedido.`);
  }
  const numero = await proximoNumeroEstoque(tx, p.empresaId);
  const lanc = await tx.lancamentoEstoque.create({
    data: {
      empresaId: p.empresaId,
      numero,
      tipo: "VENDA",
      data: p.data,
      pedidoId: p.pedidoId,
      referencia: `PED-${p.pedidoNumero}`,
      criadoPorId: p.usuarioId,
      itens: { create: linhas.map((l) => ({ produtoId: l.produtoId, quantidade: -l.quantidade })) },
    },
  });
  for (const l of linhas) {
    if (!(await tirarSaldo(tx, p.empresaId, l.produtoId, l.quantidade))) {
      throw new ErroAcao(`O saldo de ${l.descricao} mudou enquanto o pedido era faturado. Atualize a página e tente de novo.`);
    }
  }
  return { id: lanc.id, numero, itens: linhas };
}

/** Desfazer o faturamento: devolve ao estoque o que a venda tirou e apaga o lançamento. */
export async function estornarEstoqueVenda(tx: Tx, pedidoId: string) {
  const lanc = await tx.lancamentoEstoque.findUnique({ where: { pedidoId }, include: { itens: true } });
  if (!lanc) return null;
  for (const i of lanc.itens) await somarSaldo(tx, lanc.empresaId, i.produtoId, -num(i.quantidade));
  await tx.lancamentoEstoque.delete({ where: { id: lanc.id } });
  return { numero: lanc.numero, itens: lanc.itens.length };
}
