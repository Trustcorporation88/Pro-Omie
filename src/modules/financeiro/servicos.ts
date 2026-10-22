// Regras de negócio do financeiro. Funções recebem um client de transação (tx) para compor operações atômicas.
import { prisma, Prisma, type DB } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { isoParaDate, dateParaISO } from "@/lib/datas";
import { arred2 } from "@/lib/format";
import { num } from "@/lib/serial";
import type { OrigemTitulo, TipoTitulo } from "@/generated/prisma/enums";
import { distribuirRateio, proximaData, type Intervalo, type Parcela } from "./parcelas";

type Tx = Prisma.TransactionClient;
const TOLERANCIA = 0.005;

export type RateioEntrada = { categoriaId: string; centroCustoId?: string | null; percentual: number };

export type NovoLancamento = {
  tipo: TipoTitulo;
  empresaId: string;
  pessoaId?: string | null;
  descricao: string;
  documento?: string | null;
  contaBancariaId?: string | null;
  formaPagamentoId?: string | null;
  emissao: string;
  competencia: string;
  observacoes?: string | null;
  rateios: RateioEntrada[];
  /** Uma ou mais parcelas (vencimento + valor). */
  parcelas: Parcela[];
  /** Quando definido, cada parcela é uma recorrência (competência acompanha o vencimento). */
  recorrencia?: { intervalo: Intervalo } | null;
  origem?: OrigemTitulo;
  origemId?: string | null;
  /** Baixa imediata de todas as parcelas (lançamento "já pago/recebido"). */
  baixarAgora?: { data: string; contaBancariaId: string; formaPagamentoId?: string | null } | null;
};

function validarRateios(rateios: RateioEntrada[]) {
  if (!rateios.length) throw new ErroAcao("Informe ao menos uma categoria.");
  const soma = arred2(rateios.reduce((a, r) => a + r.percentual, 0));
  if (Math.abs(soma - 100) > 0.01) throw new ErroAcao(`O rateio precisa somar 100% (está em ${soma}%).`);
}

/** Cria um ou mais títulos (parcelas/recorrências) com rateio. Retorna os ids criados. */
export async function criarLancamento(tx: Tx, d: NovoLancamento, usuarioId: string | null): Promise<string[]> {
  validarRateios(d.rateios);
  if (!d.parcelas.length) throw new ErroAcao("Informe ao menos uma parcela.");
  if (d.parcelas.some((p) => !(p.valor > 0))) throw new ErroAcao("Todas as parcelas precisam ter valor maior que zero.");
  const total = d.parcelas.length;
  const grupoId = total > 1 ? crypto.randomUUID() : null;
  const ids: string[] = [];
  for (let i = 0; i < total; i++) {
    const p = d.parcelas[i];
    const competencia = d.recorrencia ? proximaData(d.competencia, d.recorrencia.intervalo, i) : d.competencia;
    const rateios = distribuirRateio(p.valor, d.rateios);
    const titulo = await tx.titulo.create({
      data: {
        tipo: d.tipo,
        origem: d.origem ?? (d.recorrencia ? "RECORRENCIA" : "MANUAL"),
        origemId: d.origemId ?? null,
        empresaId: d.empresaId,
        pessoaId: d.pessoaId ?? null,
        descricao: d.descricao,
        documento: d.documento ?? null,
        categoriaId: d.rateios[0].categoriaId,
        centroCustoId: d.rateios[0].centroCustoId ?? null,
        contaBancariaId: d.contaBancariaId ?? null,
        formaPagamentoId: d.formaPagamentoId ?? null,
        emissao: isoParaDate(d.emissao),
        competencia: isoParaDate(competencia),
        vencimento: isoParaDate(p.vencimento),
        valor: p.valor,
        parcela: i + 1,
        totalParcelas: total,
        grupoId,
        observacoes: d.observacoes ?? null,
        criadoPorId: usuarioId,
        rateios: {
          create: rateios.map((r) => ({
            categoriaId: r.categoriaId,
            centroCustoId: r.centroCustoId ?? null,
            percentual: r.percentual,
            valor: r.valor,
          })),
        },
      },
    });
    ids.push(titulo.id);
    if (d.baixarAgora) {
      await baixarTitulo(
        tx,
        {
          tituloId: titulo.id,
          data: d.baixarAgora.data,
          contaBancariaId: d.baixarAgora.contaBancariaId,
          formaPagamentoId: d.baixarAgora.formaPagamentoId ?? d.formaPagamentoId ?? null,
          valor: p.valor,
        },
        usuarioId,
      );
    }
  }
  return ids;
}

/** Recalcula valor pago, status e data de quitação a partir das baixas ativas. */
export async function recalcularTitulo(tx: Tx, tituloId: string) {
  const t = await tx.titulo.findUniqueOrThrow({
    where: { id: tituloId },
    include: { baixas: { where: { estornada: false }, select: { valor: true, data: true } } },
  });
  if (t.status === "CANCELADO") return t;
  const pago = arred2(t.baixas.reduce((a, b) => a + num(b.valor), 0));
  const valor = num(t.valor);
  const status = pago <= TOLERANCIA ? "ABERTO" : pago >= valor - TOLERANCIA ? "QUITADO" : "PARCIAL";
  const ultima = t.baixas.reduce<Date | null>((m, b) => (!m || b.data > m ? b.data : m), null);
  return tx.titulo.update({
    where: { id: tituloId },
    data: { valorPago: pago, status, quitadoEm: status === "QUITADO" ? ultima : null },
  });
}

export type DadosBaixa = {
  tituloId: string;
  data: string;
  contaBancariaId: string;
  formaPagamentoId?: string | null;
  /** principal amortizado */
  valor: number;
  juros?: number;
  multa?: number;
  desconto?: number;
  observacao?: string | null;
};

/** Registra pagamento/recebimento (total ou parcial) e o movimento na conta. */
export async function baixarTitulo(tx: Tx, d: DadosBaixa, usuarioId: string | null) {
  const t = await tx.titulo.findUniqueOrThrow({ where: { id: d.tituloId } });
  if (t.status === "CANCELADO") throw new ErroAcao("Título cancelado não pode ser baixado.");
  if (t.status === "QUITADO") throw new ErroAcao(`O título #${t.numero} já está quitado.`);
  const restante = arred2(num(t.valor) - num(t.valorPago));
  const juros = arred2(d.juros ?? 0);
  const multa = arred2(d.multa ?? 0);
  const desconto = arred2(d.desconto ?? 0);
  const valor = arred2(d.valor);
  if (!(valor > 0)) throw new ErroAcao("O valor da baixa precisa ser maior que zero.");
  if (valor > restante + TOLERANCIA) throw new ErroAcao(`O valor excede o saldo em aberto do título #${t.numero} (${restante.toFixed(2)}).`);
  if (juros < 0 || multa < 0 || desconto < 0) throw new ErroAcao("Juros, multa e desconto não podem ser negativos.");
  const valorTotal = arred2(valor + juros + multa - desconto);
  if (valorTotal < 0) throw new ErroAcao("O desconto não pode ser maior que o valor pago.");
  const conta = await tx.contaBancaria.findUnique({ where: { id: d.contaBancariaId } });
  if (!conta || !conta.ativo) throw new ErroAcao("Conta bancária inválida ou inativa.");

  const baixa = await tx.baixa.create({
    data: {
      tituloId: t.id,
      contaBancariaId: d.contaBancariaId,
      formaPagamentoId: d.formaPagamentoId ?? null,
      data: isoParaDate(d.data),
      valor,
      juros,
      multa,
      desconto,
      valorTotal,
      observacao: d.observacao ?? null,
      criadoPorId: usuarioId,
    },
  });
  if (valorTotal > 0) {
    await tx.movimento.create({
      data: {
        contaBancariaId: d.contaBancariaId,
        data: isoParaDate(d.data),
        tipo: t.tipo === "RECEBER" ? "CREDITO" : "DEBITO",
        valor: valorTotal,
        descricao: `${t.tipo === "RECEBER" ? "Recebimento" : "Pagamento"} #${t.numero} · ${t.descricao}`,
        origem: "BAIXA",
        baixaId: baixa.id,
        criadoPorId: usuarioId,
      },
    });
  }
  await recalcularTitulo(tx, t.id);
  return baixa;
}

/** Desfaz uma baixa: remove o movimento da conta (e desfaz conciliação) e reabre o título. */
export async function estornarBaixa(tx: Tx, baixaId: string) {
  const b = await tx.baixa.findUniqueOrThrow({ where: { id: baixaId }, include: { movimento: { include: { extratoItem: true } } } });
  if (b.estornada) throw new ErroAcao("Esta baixa já foi estornada.");
  if (b.movimento) {
    if (b.movimento.extratoItem) {
      await tx.extratoItem.update({ where: { id: b.movimento.extratoItem.id }, data: { status: "PENDENTE", movimentoId: null } });
    }
    await tx.movimento.delete({ where: { id: b.movimento.id } });
  }
  await tx.baixa.update({ where: { id: baixaId }, data: { estornada: true, estornadaEm: new Date() } });
  await recalcularTitulo(tx, b.tituloId);
  return b;
}

export async function cancelarTitulo(tx: Tx, tituloId: string, motivo?: string | null) {
  const t = await tx.titulo.findUniqueOrThrow({ where: { id: tituloId }, include: { baixas: { where: { estornada: false } } } });
  if (t.status === "CANCELADO") throw new ErroAcao("O título já está cancelado.");
  if (t.baixas.length) throw new ErroAcao("Estorne as baixas antes de cancelar o título.");
  return tx.titulo.update({ where: { id: tituloId }, data: { status: "CANCELADO", canceladoEm: new Date(), motivoCancelamento: motivo ?? null } });
}

export async function reabrirTitulo(tx: Tx, tituloId: string) {
  const t = await tx.titulo.findUniqueOrThrow({ where: { id: tituloId } });
  if (t.status !== "CANCELADO") throw new ErroAcao("Só títulos cancelados podem ser reabertos.");
  await tx.titulo.update({ where: { id: tituloId }, data: { status: "ABERTO", canceladoEm: null, motivoCancelamento: null } });
  return recalcularTitulo(tx, tituloId);
}

export async function excluirTitulo(tx: Tx, tituloId: string) {
  const qtd = await tx.baixa.count({ where: { tituloId } });
  if (qtd) throw new ErroAcao("Títulos com baixas (mesmo estornadas) não podem ser excluídos. Cancele-o.");
  return tx.titulo.delete({ where: { id: tituloId } });
}

export type EdicaoTitulo = {
  pessoaId?: string | null;
  descricao: string;
  documento?: string | null;
  contaBancariaId?: string | null;
  formaPagamentoId?: string | null;
  emissao: string;
  competencia: string;
  vencimento: string;
  valor: number;
  rateios: RateioEntrada[];
  observacoes?: string | null;
};

export async function editarTitulo(tx: Tx, tituloId: string, d: EdicaoTitulo) {
  validarRateios(d.rateios);
  const t = await tx.titulo.findUniqueOrThrow({ where: { id: tituloId } });
  if (t.status === "CANCELADO") throw new ErroAcao("Reabra o título antes de editar.");
  if (d.valor < num(t.valorPago) - TOLERANCIA) throw new ErroAcao("O valor não pode ser menor que o total já baixado.");
  await tx.tituloRateio.deleteMany({ where: { tituloId } });
  await tx.titulo.update({
    where: { id: tituloId },
    data: {
      pessoaId: d.pessoaId ?? null,
      descricao: d.descricao,
      documento: d.documento ?? null,
      contaBancariaId: d.contaBancariaId ?? null,
      formaPagamentoId: d.formaPagamentoId ?? null,
      emissao: isoParaDate(d.emissao),
      competencia: isoParaDate(d.competencia),
      vencimento: isoParaDate(d.vencimento),
      valor: d.valor,
      categoriaId: d.rateios[0].categoriaId,
      centroCustoId: d.rateios[0].centroCustoId ?? null,
      observacoes: d.observacoes ?? null,
      rateios: {
        create: distribuirRateio(d.valor, d.rateios).map((r) => ({
          categoriaId: r.categoriaId,
          centroCustoId: r.centroCustoId ?? null,
          percentual: r.percentual,
          valor: r.valor,
        })),
      },
    },
  });
  return recalcularTitulo(tx, tituloId);
}

// ───────────── Movimentações avulsas ─────────────

export async function transferir(
  tx: Tx,
  d: { contaOrigemId: string; contaDestinoId: string; data: string; valor: number; descricao?: string | null },
  usuarioId: string | null,
) {
  if (d.contaOrigemId === d.contaDestinoId) throw new ErroAcao("Escolha contas diferentes.");
  if (!(d.valor > 0)) throw new ErroAcao("O valor precisa ser maior que zero.");
  const [origem, destino] = await Promise.all([
    tx.contaBancaria.findUniqueOrThrow({ where: { id: d.contaOrigemId } }),
    tx.contaBancaria.findUniqueOrThrow({ where: { id: d.contaDestinoId } }),
  ]);
  if (!origem.ativo || !destino.ativo) throw new ErroAcao("As duas contas precisam estar ativas.");
  const data = isoParaDate(d.data);
  const desc = d.descricao || `Transferência ${origem.nome} → ${destino.nome}`;
  return tx.transferencia.create({
    data: {
      contaOrigemId: origem.id,
      contaDestinoId: destino.id,
      data,
      valor: d.valor,
      descricao: d.descricao ?? null,
      criadoPorId: usuarioId,
      movimentos: {
        create: [
          { contaBancariaId: origem.id, data, tipo: "DEBITO", valor: d.valor, descricao: desc, origem: "TRANSFERENCIA", criadoPorId: usuarioId },
          { contaBancariaId: destino.id, data, tipo: "CREDITO", valor: d.valor, descricao: desc, origem: "TRANSFERENCIA", criadoPorId: usuarioId },
        ],
      },
    },
  });
}

async function liberarConciliacao(tx: Tx, movimentoIds: string[]) {
  if (!movimentoIds.length) return;
  await tx.extratoItem.updateMany({ where: { movimentoId: { in: movimentoIds } }, data: { status: "PENDENTE", movimentoId: null } });
}

export async function excluirTransferencia(tx: Tx, transferenciaId: string) {
  const movs = await tx.movimento.findMany({ where: { transferenciaId }, select: { id: true } });
  await liberarConciliacao(tx, movs.map((m) => m.id));
  return tx.transferencia.delete({ where: { id: transferenciaId } });
}

export async function criarAjuste(
  tx: Tx,
  d: { contaBancariaId: string; data: string; tipo: "CREDITO" | "DEBITO"; valor: number; descricao: string },
  usuarioId: string | null,
) {
  if (!(d.valor > 0)) throw new ErroAcao("O valor precisa ser maior que zero.");
  const conta = await tx.contaBancaria.findUnique({ where: { id: d.contaBancariaId } });
  if (!conta || !conta.ativo) throw new ErroAcao("Conta bancária inválida ou inativa.");
  return tx.movimento.create({
    data: {
      contaBancariaId: d.contaBancariaId,
      data: isoParaDate(d.data),
      tipo: d.tipo,
      valor: d.valor,
      descricao: d.descricao,
      origem: "AJUSTE",
      criadoPorId: usuarioId,
    },
  });
}

export async function excluirAjuste(tx: Tx, movimentoId: string) {
  const m = await tx.movimento.findUniqueOrThrow({ where: { id: movimentoId } });
  if (m.origem !== "AJUSTE") throw new ErroAcao("Só ajustes avulsos podem ser excluídos aqui. Estorne a baixa ou a transferência.");
  await liberarConciliacao(tx, [m.id]);
  return tx.movimento.delete({ where: { id: movimentoId } });
}

// ───────────── Saldos ─────────────

export type SaldoConta = { id: string; nome: string; tipo: string; saldo: number; empresaId: string };

/**
 * Saldo de cada conta ativa até a data (inclusive). Sem data = saldo atual (todos os movimentos).
 * `empresaIds` restringe às contas da empresa ativa (matriz e filiais); sem ele, todas as empresas.
 */
export async function saldosContas(db: DB = prisma, ate?: string, incluirInativas = false, empresaIds?: string[]): Promise<SaldoConta[]> {
  const porEmpresa = empresaIds ? { empresaId: { in: empresaIds } } : {};
  const [contas, somas] = await Promise.all([
    db.contaBancaria.findMany({ where: { ...porEmpresa, ...(incluirInativas ? {} : { ativo: true }) }, orderBy: { nome: "asc" } }),
    db.movimento.groupBy({
      by: ["contaBancariaId", "tipo"],
      where: { ...(ate ? { data: { lte: isoParaDate(ate) } } : {}), ...(empresaIds ? { contaBancaria: { empresaId: { in: empresaIds } } } : {}) },
      _sum: { valor: true },
    }),
  ]);
  return contas.map((c) => {
    const inicialConta = !ate || dateParaISO(c.dataSaldoInicial) <= ate ? num(c.saldoInicial) : 0;
    const mov = somas
      .filter((s) => s.contaBancariaId === c.id)
      .reduce((a, s) => a + (s.tipo === "CREDITO" ? 1 : -1) * num(s._sum.valor), 0);
    return { id: c.id, nome: c.nome, tipo: c.tipo, empresaId: c.empresaId, saldo: arred2(inicialConta + mov) };
  });
}
