"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao } from "@/lib/auth/sessao";
import { auditar } from "@/lib/auditoria";
import { arred2, fmtData, fmtMoeda } from "@/lib/format";
import { num } from "@/lib/serial";
import type { TipoTitulo } from "@/generated/prisma/enums";
import {
  baixarTitulo,
  cancelarTitulo,
  criarAjuste,
  criarLancamento,
  editarTitulo,
  estornarBaixa,
  excluirAjuste,
  excluirTitulo,
  excluirTransferencia,
  reabrirTitulo,
  transferir,
  type RateioEntrada,
} from "./servicos";
import {
  esquemaAjuste,
  esquemaBaixa,
  esquemaBaixaLote,
  esquemaEdicaoTitulo,
  esquemaId,
  esquemaLancamento,
  esquemaMotivo,
  esquemaTransferencia,
  type EntradaAjuste,
  type EntradaBaixa,
  type EntradaBaixaLote,
  type EntradaEdicaoTitulo,
  type EntradaLancamento,
  type EntradaTransferencia,
} from "./esquemas";
import { ANEXO_TAMANHO_MAX, ANEXO_TIPOS, extensaoArquivo } from "@/components/financeiro/tipos";

type Tx = Prisma.TransactionClient;

/** Transações longas (parcelas em lote, baixa em lote) passam do limite padrão de 5 s do Prisma. */
const TX_LONGA = { timeout: 60_000, maxWait: 15_000 };

const rotuloTipo = (tipo: TipoTitulo) => (tipo === "RECEBER" ? "Conta a receber" : "Conta a pagar");
const rotuloBaixa = (tipo: TipoTitulo) => (tipo === "RECEBER" ? "Recebimento" : "Pagamento");

function revalidarFinanceiro(...tituloIds: (string | null | undefined)[]) {
  for (const p of ["/financeiro/receber", "/financeiro/pagar", "/financeiro/movimentacoes", "/financeiro/conciliacao", "/"]) {
    revalidatePath(p);
  }
  for (const id of new Set(tituloIds)) if (id) revalidatePath(`/financeiro/titulos/${id}`);
}

/**
 * Trava a linha do título até o fim da transação (UPDATE adquire row lock).
 * Evita baixas concorrentes que ultrapassem o saldo: a segunda transação espera a primeira e relê o saldo.
 */
async function travarTitulo(tx: Tx, tituloId: string) {
  await tx.titulo.update({ where: { id: tituloId }, data: { updatedAt: new Date() }, select: { id: true } });
}

/** Confere se categorias, centros, conta, forma, pessoa e empresa existem (mensagens claras em vez de erro de FK). */
async function validarReferencias(
  tx: Tx,
  d: {
    tipo: TipoTitulo;
    rateios: RateioEntrada[];
    empresaId?: string;
    pessoaId?: string | null;
    contaBancariaId?: string | null;
    formaPagamentoId?: string | null;
  },
) {
  const categoriaIds = [...new Set(d.rateios.map((r) => r.categoriaId))];
  const centroIds = [...new Set(d.rateios.map((r) => r.centroCustoId).filter((x): x is string => !!x))];
  const [categorias, centros, conta, forma, pessoa, empresa] = await Promise.all([
    tx.categoria.findMany({ where: { id: { in: categoriaIds } }, select: { id: true, tipo: true } }),
    centroIds.length ? tx.centroCusto.findMany({ where: { id: { in: centroIds } }, select: { id: true } }) : Promise.resolve([]),
    d.contaBancariaId ? tx.contaBancaria.findUnique({ where: { id: d.contaBancariaId }, select: { id: true } }) : Promise.resolve(true),
    d.formaPagamentoId ? tx.formaPagamento.findUnique({ where: { id: d.formaPagamentoId }, select: { id: true } }) : Promise.resolve(true),
    d.pessoaId ? tx.pessoa.findUnique({ where: { id: d.pessoaId }, select: { id: true } }) : Promise.resolve(true),
    d.empresaId ? tx.empresa.findUnique({ where: { id: d.empresaId }, select: { id: true } }) : Promise.resolve(true),
  ]);
  const tipoCategoria = d.tipo === "RECEBER" ? "RECEITA" : "DESPESA";
  if (categorias.length !== categoriaIds.length) throw new ErroAcao("Categoria não encontrada. Recarregue a página.");
  if (categorias.some((c) => c.tipo !== tipoCategoria))
    throw new ErroAcao(`Use categorias de ${tipoCategoria === "RECEITA" ? "receita" : "despesa"} neste lançamento.`);
  if (centros.length !== centroIds.length) throw new ErroAcao("Centro de custo não encontrado. Recarregue a página.");
  if (!conta) throw new ErroAcao("Conta bancária não encontrada.");
  if (!forma) throw new ErroAcao("Forma de pagamento não encontrada.");
  if (!pessoa) throw new ErroAcao("Cliente/fornecedor não encontrado.");
  if (!empresa) throw new ErroAcao("Empresa não encontrada.");
}

// ───────────────────────── Lançamentos ─────────────────────────

export async function criarLancamentoAcao(entrada: EntradaLancamento): Promise<Resultado<{ ids: string[] }>> {
  return executar(
    async () => {
      const u = await exigirPermissao("financeiro:editar");
      const d = esquemaLancamento.parse(entrada);
      const criados = await prisma.$transaction(async (tx) => {
        await validarReferencias(tx, d);
        if (d.baixarAgora) {
          const conta = await tx.contaBancaria.findUnique({ where: { id: d.baixarAgora.contaBancariaId }, select: { ativo: true } });
          if (!conta?.ativo) throw new ErroAcao("A conta escolhida para a baixa está inativa ou não existe.");
        }
        const ids = await criarLancamento(tx, d, u.id);
        return tx.titulo.findMany({
          where: { id: { in: ids } },
          select: { id: true, numero: true, parcela: true, totalParcelas: true, valor: true, vencimento: true },
          orderBy: { parcela: "asc" },
        });
      }, TX_LONGA);
      const rotulo = rotuloTipo(d.tipo);
      for (const t of criados) {
        const parc = t.totalParcelas > 1 ? ` (${t.parcela}/${t.totalParcelas})` : "";
        await auditar(
          "criar",
          "titulo",
          t.id,
          `${rotulo} #${t.numero}${parc} · ${d.descricao} · ${fmtMoeda(num(t.valor))} · venc. ${fmtData(t.vencimento)}${d.baixarAgora ? " · baixado na criação" : ""}`,
          { ...d, parcelas: undefined, valor: num(t.valor), vencimento: t.vencimento, parcela: t.parcela, totalParcelas: t.totalParcelas },
          { usuarioId: u.id },
        );
      }
      revalidarFinanceiro();
      return { ids: criados.map((t) => t.id) };
    },
    "Lançamento criado.",
  );
}

export async function editarTituloAcao(tituloId: string, entrada: EntradaEdicaoTitulo): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const id = esquemaId.parse(tituloId);
    const d = esquemaEdicaoTitulo.parse(entrada);
    const { antes, depois } = await prisma.$transaction(async (tx) => {
      await travarTitulo(tx, id);
      const antes = await tx.titulo.findUniqueOrThrow({
        where: { id },
        include: { rateios: { select: { categoriaId: true, centroCustoId: true, percentual: true } } },
      });
      await validarReferencias(tx, { ...d, tipo: antes.tipo });
      const depois = await editarTitulo(tx, id, d);
      return { antes, depois };
    });
    await auditar(
      "editar",
      "titulo",
      id,
      `${rotuloTipo(antes.tipo)} #${antes.numero} · ${d.descricao} · ${fmtMoeda(d.valor)} · venc. ${fmtData(d.vencimento)}`,
      {
        antes: {
          descricao: antes.descricao,
          documento: antes.documento,
          pessoaId: antes.pessoaId,
          valor: num(antes.valor),
          emissao: antes.emissao,
          competencia: antes.competencia,
          vencimento: antes.vencimento,
          contaBancariaId: antes.contaBancariaId,
          formaPagamentoId: antes.formaPagamentoId,
          observacoes: antes.observacoes,
          rateios: antes.rateios.map((r) => ({ ...r, percentual: num(r.percentual) })),
        },
        depois: d,
        status: depois.status,
      },
      { usuarioId: u.id },
    );
    revalidarFinanceiro(id);
    return undefined;
  }, "Alterações salvas.");
}

// ───────────────────────── Baixas ─────────────────────────

export async function baixarTituloAcao(entrada: EntradaBaixa): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const d = esquemaBaixa.parse(entrada);
    const { baixa, titulo } = await prisma.$transaction(async (tx) => {
      await travarTitulo(tx, d.tituloId);
      const baixa = await baixarTitulo(tx, d, u.id);
      const titulo = await tx.titulo.findUniqueOrThrow({
        where: { id: d.tituloId },
        select: { id: true, numero: true, tipo: true, status: true, valor: true, valorPago: true },
      });
      return { baixa, titulo };
    });
    await auditar(
      "baixar",
      "baixa",
      baixa.id,
      `${rotuloBaixa(titulo.tipo)} de ${fmtMoeda(num(baixa.valorTotal))} no título #${titulo.numero} em ${fmtData(d.data)}`,
      { ...d, tituloId: titulo.id, valorTotal: num(baixa.valorTotal), statusTitulo: titulo.status },
      { usuarioId: u.id },
    );
    revalidarFinanceiro(titulo.id);
    return undefined;
  }, "Baixa registrada.");
}

export async function baixarEmLoteAcao(entrada: EntradaBaixaLote): Promise<Resultado<{ quantidade: number; total: number }>> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const d = esquemaBaixaLote.parse(entrada);
    // ordem fixa evita deadlock entre lotes concorrentes
    const ids = [...new Set(d.tituloIds)].sort();
    const feitas = await prisma.$transaction(async (tx) => {
      const out: { baixaId: string; tituloId: string; numero: number; tipo: TipoTitulo; valor: number }[] = [];
      for (const tituloId of ids) {
        await travarTitulo(tx, tituloId);
        const t = await tx.titulo.findUniqueOrThrow({
          where: { id: tituloId },
          select: { id: true, numero: true, tipo: true, status: true, valor: true, valorPago: true },
        });
        if (t.status !== "ABERTO" && t.status !== "PARCIAL")
          throw new ErroAcao(`O título #${t.numero} não está em aberto. Atualize a lista e tente de novo.`);
        const saldo = arred2(num(t.valor) - num(t.valorPago));
        if (!(saldo > 0)) throw new ErroAcao(`O título #${t.numero} não tem saldo em aberto.`);
        const baixa = await baixarTitulo(
          tx,
          { tituloId, data: d.data, contaBancariaId: d.contaBancariaId, formaPagamentoId: d.formaPagamentoId, valor: saldo, observacao: "Baixa em lote" },
          u.id,
        );
        out.push({ baixaId: baixa.id, tituloId, numero: t.numero, tipo: t.tipo, valor: saldo });
      }
      return out;
    }, TX_LONGA);
    for (const b of feitas) {
      await auditar(
        "baixar",
        "baixa",
        b.baixaId,
        `${rotuloBaixa(b.tipo)} em lote de ${fmtMoeda(b.valor)} no título #${b.numero} em ${fmtData(d.data)}`,
        { tituloId: b.tituloId, data: d.data, contaBancariaId: d.contaBancariaId, formaPagamentoId: d.formaPagamentoId, valor: b.valor, lote: true },
        { usuarioId: u.id },
      );
    }
    revalidarFinanceiro(...feitas.map((b) => b.tituloId));
    return { quantidade: feitas.length, total: arred2(feitas.reduce((a, b) => a + b.valor, 0)) };
  }, "Baixa em lote registrada.");
}

export async function estornarBaixaAcao(baixaId: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const id = esquemaId.parse(baixaId);
    const atual = await prisma.baixa.findUnique({
      where: { id },
      select: { tituloId: true, valorTotal: true, data: true, titulo: { select: { numero: true, tipo: true } } },
    });
    if (!atual) throw new ErroAcao("Baixa não encontrada.");
    await prisma.$transaction(async (tx) => {
      await travarTitulo(tx, atual.tituloId);
      await estornarBaixa(tx, id);
    });
    await auditar(
      "estornar",
      "baixa",
      id,
      `Estorno de ${rotuloBaixa(atual.titulo.tipo).toLowerCase()} de ${fmtMoeda(num(atual.valorTotal))} (${fmtData(atual.data)}) no título #${atual.titulo.numero}`,
      { tituloId: atual.tituloId, valorTotal: num(atual.valorTotal), data: atual.data },
      { usuarioId: u.id },
    );
    revalidarFinanceiro(atual.tituloId);
    return undefined;
  }, "Baixa estornada.");
}

// ───────────────────────── Ciclo de vida do título ─────────────────────────

export async function cancelarTituloAcao(tituloId: string, motivo?: string | null): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const id = esquemaId.parse(tituloId);
    const m = esquemaMotivo.parse(motivo);
    const t = await prisma.$transaction(async (tx) => {
      await travarTitulo(tx, id);
      return cancelarTitulo(tx, id, m);
    });
    await auditar("cancelar", "titulo", id, `${rotuloTipo(t.tipo)} #${t.numero} cancelada${m ? ` · ${m}` : ""}`, { motivo: m }, { usuarioId: u.id });
    revalidarFinanceiro(id);
    return undefined;
  }, "Título cancelado.");
}

export async function reabrirTituloAcao(tituloId: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const id = esquemaId.parse(tituloId);
    const t = await prisma.$transaction(async (tx) => {
      await travarTitulo(tx, id);
      return reabrirTitulo(tx, id);
    });
    await auditar("reabrir", "titulo", id, `${rotuloTipo(t.tipo)} #${t.numero} reaberta`, { status: t.status }, { usuarioId: u.id });
    revalidarFinanceiro(id);
    return undefined;
  }, "Título reaberto.");
}

export async function excluirTituloAcao(tituloId: string): Promise<Resultado<{ tipo: TipoTitulo }>> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const id = esquemaId.parse(tituloId);
    const t = await prisma.$transaction(async (tx) => {
      const atual = await tx.titulo.findUnique({
        where: { id },
        include: { rateios: { select: { categoriaId: true, centroCustoId: true, percentual: true, valor: true } } },
      });
      if (!atual) throw new ErroAcao("Título não encontrado.");
      await excluirTitulo(tx, id);
      return atual;
    });
    await auditar(
      "excluir",
      "titulo",
      id,
      `${rotuloTipo(t.tipo)} #${t.numero} excluída · ${t.descricao} · ${fmtMoeda(num(t.valor))}`,
      {
        numero: t.numero,
        tipo: t.tipo,
        descricao: t.descricao,
        documento: t.documento,
        pessoaId: t.pessoaId,
        valor: num(t.valor),
        vencimento: t.vencimento,
        competencia: t.competencia,
        grupoId: t.grupoId,
        rateios: t.rateios.map((r) => ({ ...r, percentual: num(r.percentual), valor: num(r.valor) })),
      },
      { usuarioId: u.id },
    );
    revalidarFinanceiro(id);
    return { tipo: t.tipo };
  }, "Título excluído.");
}

// ───────────────────────── Anexos ─────────────────────────

/** Confere a assinatura dos formatos binários (evita, p.ex., HTML disfarçado de PNG). */
function assinaturaConfere(ext: string, b: Uint8Array): boolean {
  const comeca = (...bytes: number[]) => bytes.every((x, i) => b[i] === x);
  switch (ext) {
    case "pdf":
      return comeca(0x25, 0x50, 0x44, 0x46); // %PDF
    case "png":
      return comeca(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "jpg":
    case "jpeg":
      return comeca(0xff, 0xd8, 0xff);
    case "webp":
      return comeca(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50; // RIFF....WEBP
    case "xlsx":
    case "docx":
      return comeca(0x50, 0x4b, 0x03, 0x04); // zip
    default:
      return true; // xml, ofx, csv: texto
  }
}

function limparNomeArquivo(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? "arquivo";
  const limpo = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "_").trim();
  if (limpo.length <= 180) return limpo || "arquivo";
  const ext = extensaoArquivo(limpo);
  return `${limpo.slice(0, 170)}${ext ? `.${ext}` : ""}`;
}

export async function anexarArquivoAcao(formData: FormData): Promise<Resultado<{ id: string }>> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const tituloId = esquemaId.parse(formData.get("tituloId"));
    const arquivo = formData.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroAcao("Selecione um arquivo.");
    if (arquivo.size > ANEXO_TAMANHO_MAX) throw new ErroAcao("O arquivo passa de 5 MB.");
    const nome = limparNomeArquivo(arquivo.name);
    const ext = extensaoArquivo(nome);
    const mimeType = ANEXO_TIPOS[ext];
    if (!mimeType) throw new ErroAcao("Formato não aceito. Use PDF, PNG, JPG, WEBP, XML, OFX, CSV, XLSX ou DOCX.");
    const dados = new Uint8Array(await arquivo.arrayBuffer());
    if (!assinaturaConfere(ext, dados)) throw new ErroAcao(`O conteúdo do arquivo não corresponde a um .${ext} válido.`);
    const titulo = await prisma.titulo.findUnique({ where: { id: tituloId }, select: { id: true, numero: true } });
    if (!titulo) throw new ErroAcao("Título não encontrado.");
    const anexo = await prisma.anexo.create({
      data: { tituloId, nome, mimeType, tamanho: dados.byteLength, storage: "db", dados, criadoPorId: u.id },
      select: { id: true },
    });
    await auditar(
      "anexar",
      "anexo",
      anexo.id,
      `Anexo "${nome}" incluído no título #${titulo.numero}`,
      { tituloId, nome, mimeType, tamanho: dados.byteLength },
      { usuarioId: u.id },
    );
    revalidarFinanceiro(tituloId);
    return { id: anexo.id };
  }, "Arquivo anexado.");
}

export async function excluirAnexoAcao(anexoId: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const id = esquemaId.parse(anexoId);
    const anexo = await prisma.anexo.findUnique({
      where: { id },
      select: { id: true, nome: true, tituloId: true, mimeType: true, tamanho: true, titulo: { select: { numero: true } } },
    });
    if (!anexo) throw new ErroAcao("Anexo não encontrado.");
    await prisma.anexo.delete({ where: { id } });
    await auditar(
      "excluir",
      "anexo",
      id,
      `Anexo "${anexo.nome}" excluído${anexo.titulo ? ` do título #${anexo.titulo.numero}` : ""}`,
      { tituloId: anexo.tituloId, nome: anexo.nome, mimeType: anexo.mimeType, tamanho: anexo.tamanho },
      { usuarioId: u.id },
    );
    revalidarFinanceiro(anexo.tituloId);
    return undefined;
  }, "Anexo excluído.");
}

// ───────────────────────── Movimentações avulsas ─────────────────────────

export async function transferirAcao(entrada: EntradaTransferencia): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const d = esquemaTransferencia.parse(entrada);
    const t = await prisma.$transaction(async (tx) => {
      const contas = await tx.contaBancaria.findMany({
        where: { id: { in: [d.contaOrigemId, d.contaDestinoId] } },
        select: { id: true, nome: true, ativo: true },
      });
      if (contas.length !== 2) throw new ErroAcao("Conta não encontrada. Recarregue a página.");
      if (contas.some((c) => !c.ativo)) throw new ErroAcao("Não é possível transferir de/para uma conta inativa.");
      const criada = await transferir(tx, d, u.id);
      const nome = (cid: string) => contas.find((c) => c.id === cid)?.nome ?? "";
      return { id: criada.id, origem: nome(d.contaOrigemId), destino: nome(d.contaDestinoId) };
    });
    await auditar(
      "criar",
      "transferencia",
      t.id,
      `Transferência de ${fmtMoeda(d.valor)} · ${t.origem} → ${t.destino} em ${fmtData(d.data)}`,
      d,
      { usuarioId: u.id },
    );
    revalidarFinanceiro();
    return undefined;
  }, "Transferência registrada.");
}

export async function excluirTransferenciaAcao(transferenciaId: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const id = esquemaId.parse(transferenciaId);
    const t = await prisma.$transaction(async (tx) => {
      const atual = await tx.transferencia.findUnique({
        where: { id },
        include: { contaOrigem: { select: { nome: true } }, contaDestino: { select: { nome: true } } },
      });
      if (!atual) throw new ErroAcao("Transferência não encontrada.");
      await excluirTransferencia(tx, id);
      return atual;
    });
    await auditar(
      "excluir",
      "transferencia",
      id,
      `Transferência de ${fmtMoeda(num(t.valor))} · ${t.contaOrigem.nome} → ${t.contaDestino.nome} (${fmtData(t.data)}) excluída`,
      { contaOrigemId: t.contaOrigemId, contaDestinoId: t.contaDestinoId, data: t.data, valor: num(t.valor), descricao: t.descricao },
      { usuarioId: u.id },
    );
    revalidarFinanceiro();
    return undefined;
  }, "Transferência excluída.");
}

export async function criarAjusteAcao(entrada: EntradaAjuste): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const d = esquemaAjuste.parse(entrada);
    const conta = await prisma.contaBancaria.findUnique({ where: { id: d.contaBancariaId }, select: { nome: true, ativo: true } });
    if (!conta) throw new ErroAcao("Conta não encontrada.");
    if (!conta.ativo) throw new ErroAcao("Não é possível lançar ajuste em conta inativa.");
    const m = await prisma.$transaction((tx) => criarAjuste(tx, d, u.id));
    await auditar(
      "criar",
      "movimento",
      m.id,
      `Ajuste de saldo (${d.tipo === "CREDITO" ? "crédito" : "débito"}) de ${fmtMoeda(d.valor)} em ${conta.nome} · ${d.descricao}`,
      { ...d, origem: "AJUSTE" },
      { usuarioId: u.id },
    );
    revalidarFinanceiro();
    return undefined;
  }, "Ajuste lançado.");
}

export async function excluirAjusteAcao(movimentoId: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const id = esquemaId.parse(movimentoId);
    const m = await prisma.$transaction(async (tx) => {
      const atual = await tx.movimento.findUnique({ where: { id }, include: { contaBancaria: { select: { nome: true } } } });
      if (!atual) throw new ErroAcao("Movimento não encontrado.");
      await excluirAjuste(tx, id);
      return atual;
    });
    await auditar(
      "excluir",
      "movimento",
      id,
      `Ajuste de ${fmtMoeda(num(m.valor))} (${m.tipo === "CREDITO" ? "crédito" : "débito"}) em ${m.contaBancaria.nome} excluído · ${m.descricao}`,
      { contaBancariaId: m.contaBancariaId, data: m.data, tipo: m.tipo, valor: num(m.valor), descricao: m.descricao, conciliado: m.conciliado },
      { usuarioId: u.id },
    );
    revalidarFinanceiro();
    return undefined;
  }, "Ajuste excluído.");
}
