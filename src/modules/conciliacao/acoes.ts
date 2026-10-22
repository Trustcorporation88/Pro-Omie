"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, type Prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao } from "@/lib/auth/sessao";
import { escopoEmpresa, exigirContaNoEscopo, type EscopoEmpresa } from "@/lib/auth/empresa";
import { auditar } from "@/lib/auditoria";
import { addDias, diffDias, isoParaDate } from "@/lib/datas";
import { fmtData, fmtMoeda } from "@/lib/format";
import { isoReq, num } from "@/lib/serial";
import { ErroOfx, lerOfx, type ExtratoOfx, type TransacaoOfx } from "@/lib/ofx";
import { baixarTitulo, criarLancamento } from "@/modules/financeiro/servicos";
import { JANELA_AUTO, sugerirMovimentos } from "./sugestoes";
import { bancoConfere, contaConfere, normalizarTexto } from "./utils";
import type { EntradaLancamento, EntradaRegra, MovimentoOpcao, ResultadoImportacao, TipoLancamento } from "./tipos";

type Tx = Prisma.TransactionClient;

const TAMANHO_MAXIMO = 2 * 1024 * 1024;
const OPCOES_TX = { timeout: 30_000, maxWait: 10_000 };

// ───────────── Apoio ─────────────

function revalidar(financeiro: boolean, tituloId?: string) {
  revalidatePath("/financeiro/conciliacao");
  revalidatePath("/financeiro/movimentacoes");
  if (financeiro) {
    revalidatePath("/financeiro/receber");
    revalidatePath("/financeiro/pagar");
    revalidatePath("/");
    if (tituloId) revalidatePath(`/financeiro/titulos/${tituloId}`);
  }
}

type ItemDb = {
  id: string;
  contaBancariaId: string;
  data: Date;
  valor: Prisma.Decimal;
  descricao: string;
  documento: string | null;
  status: string;
  movimentoId: string | null;
};

function resumoItem(i: Pick<ItemDb, "data" | "valor" | "descricao">): string {
  return `${fmtData(i.data)} · ${fmtMoeda(num(i.valor))} · ${i.descricao}`.slice(0, 250);
}

/** Item do extrato de uma conta da empresa ativa. Fora dela, responde como se não existisse. */
async function itemNoEscopo(tx: Tx | typeof prisma, id: string, escopo: EscopoEmpresa): Promise<ItemDb> {
  const item = await tx.extratoItem.findFirst({ where: { id, contaBancaria: { empresaId: { in: escopo.ids } } } });
  if (!item) throw new ErroAcao("Lançamento do extrato não encontrado nesta empresa.");
  return item;
}

async function itemPendente(tx: Tx, id: string, escopo: EscopoEmpresa): Promise<ItemDb> {
  const item = await itemNoEscopo(tx, id, escopo);
  if (item.status !== "PENDENTE") throw new ErroAcao("Este lançamento do extrato já foi tratado. Atualize a página.");
  return item;
}

/** Marca o item como conciliado com o movimento (ambos condicionados ao estado atual, contra corridas). */
async function vincular(tx: Tx, itemId: string, movimentoId: string) {
  const it = await tx.extratoItem.updateMany({ where: { id: itemId, status: "PENDENTE" }, data: { status: "CONCILIADO", movimentoId } });
  if (it.count !== 1) throw new ErroAcao("Este lançamento do extrato já foi tratado. Atualize a página.");
  const mv = await tx.movimento.updateMany({ where: { id: movimentoId, conciliado: false }, data: { conciliado: true } });
  if (mv.count !== 1) throw new ErroAcao("Este movimento já está conciliado com outro lançamento.");
}

async function validarClassificacao(
  tx: Tx,
  d: { categoriaId: string; pessoaId: string | null; centroCustoId: string | null; tipo: TipoLancamento | null },
) {
  const cat = await tx.categoria.findUnique({ where: { id: d.categoriaId }, select: { tipo: true, ativo: true } });
  if (!cat || !cat.ativo) throw new ErroAcao("Categoria inválida ou inativa.", { categoriaId: "Escolha uma categoria ativa." });
  if (d.tipo === "RECEBER" && cat.tipo !== "RECEITA")
    throw new ErroAcao("Para entradas, escolha uma categoria de receita.", { categoriaId: "Escolha uma categoria de receita." });
  if (d.tipo === "PAGAR" && cat.tipo !== "DESPESA")
    throw new ErroAcao("Para saídas, escolha uma categoria de despesa.", { categoriaId: "Escolha uma categoria de despesa." });
  if (d.centroCustoId) {
    const c = await tx.centroCusto.findUnique({ where: { id: d.centroCustoId }, select: { ativo: true } });
    if (!c || !c.ativo) throw new ErroAcao("Centro de custo inválido ou inativo.", { centroCustoId: "Escolha um centro de custo ativo." });
  }
  if (d.pessoaId) {
    const p = await tx.pessoa.findUnique({ where: { id: d.pessoaId }, select: { id: true } });
    if (!p) throw new ErroAcao("Cliente/fornecedor não encontrado.", { pessoaId: "Cadastro não encontrado." });
  }
}

/** Cria a regra; se já existir uma com o mesmo termo (sem acentos/maiúsculas) e tipo, atualiza ou recusa. */
async function gravarRegra(
  tx: Tx,
  d: { termo: string; tipo: TipoLancamento | null; categoriaId: string; pessoaId: string | null; centroCustoId: string | null },
  atualizarExistente: boolean,
): Promise<{ id: string; termo: string; criada: boolean }> {
  const termo = d.termo.replace(/\s+/g, " ").trim();
  const alvo = normalizarTexto(termo);
  const mesmas = await tx.regraConciliacao.findMany({ where: { tipo: d.tipo }, select: { id: true, termo: true } });
  const igual = mesmas.find((r) => normalizarTexto(r.termo) === alvo);
  const dados = { termo, categoriaId: d.categoriaId, pessoaId: d.pessoaId, centroCustoId: d.centroCustoId };
  if (igual) {
    if (!atualizarExistente) throw new ErroAcao("Já existe uma regra com este termo para este tipo.", { termo: "Termo já usado em outra regra." });
    await tx.regraConciliacao.update({ where: { id: igual.id }, data: { ...dados, ativo: true } });
    return { id: igual.id, termo, criada: false };
  }
  const r = await tx.regraConciliacao.create({ data: { ...dados, tipo: d.tipo } });
  return { id: r.id, termo, criada: true };
}

const idOpcional = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null));
const termoRegra = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(3, "O termo precisa de ao menos 3 caracteres.").max(100, "Use um termo de até 100 caracteres."));

// ───────────── Importação OFX ─────────────

const centavosDe = (v: number) => Math.round(v * 100);

/**
 * Resolve o identificador de cada transação. Alguns bancos reutilizam FITIDs (ex.: numeração por arquivo):
 * se o FITID já existe na conta para outro lançamento (valor diferente ou data a mais de 3 dias),
 * usamos uma chave composta estável para não descartar o lançamento novo como duplicado.
 */
async function resolverChaves(tx: Tx, contaBancariaId: string, transacoes: TransacaoOfx[]): Promise<{ chaves: string[]; colisoes: number }> {
  const existentes = new Map<string, { data: string; centavos: number }>();
  const fitIds = transacoes.map((t) => t.fitId);
  for (let i = 0; i < fitIds.length; i += 1000) {
    const lote = await tx.extratoItem.findMany({
      where: { contaBancariaId, fitId: { in: fitIds.slice(i, i + 1000) } },
      select: { fitId: true, data: true, valor: true },
    });
    for (const e of lote) existentes.set(e.fitId, { data: isoReq(e.data), centavos: centavosDe(num(e.valor)) });
  }
  let colisoes = 0;
  const chaves = transacoes.map((t) => {
    const e = existentes.get(t.fitId);
    if (!e) return t.fitId;
    const mesma = e.centavos === centavosDe(t.valor) && Math.abs(diffDias(e.data, t.data)) <= 3;
    if (mesma) return t.fitId; // duplicado: ignorado pelo skipDuplicates
    colisoes++;
    return `${t.fitId}|${t.data}|${centavosDe(t.valor)}`;
  });
  return { chaves, colisoes };
}

/** Importa um arquivo OFX (FormData: contaBancariaId + arquivo) para a conta, sem duplicar lançamentos. */
export async function importarOfx(formData: FormData): Promise<Resultado<ResultadoImportacao>> {
  const r = await executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const contaBancariaId = String(formData.get("contaBancariaId") ?? "");
    const arquivo = formData.get("arquivo");
    if (!contaBancariaId) throw new ErroAcao("Escolha a conta bancária.");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroAcao("Selecione o arquivo OFX exportado do internet banking.");
    if (arquivo.size > TAMANHO_MAXIMO) throw new ErroAcao("O arquivo passa de 2 MB. Exporte um período menor no internet banking.");
    const nome = (arquivo.name || "extrato.ofx").slice(0, 200);
    if (!/\.(ofx|qfx|ofc)$/i.test(nome)) throw new ErroAcao("Envie um arquivo com extensão .ofx.");

    const escopo = await escopoEmpresa();
    await exigirContaNoEscopo(escopo, contaBancariaId);
    const conta = await prisma.contaBancaria.findUnique({ where: { id: contaBancariaId } });
    if (!conta || !conta.ativo) throw new ErroAcao("Conta bancária inválida ou inativa.");

    let ofx: ExtratoOfx;
    try {
      ofx = lerOfx(new Uint8Array(await arquivo.arrayBuffer()));
    } catch (e) {
      if (e instanceof ErroOfx) throw new ErroAcao(e.message);
      throw e;
    }

    const avisos = [...ofx.avisos];
    if (contaConfere(ofx.conta.numero, conta.numero) === false) {
      avisos.unshift(
        `A conta do arquivo (${ofx.conta.numero}) não parece ser a cadastrada em "${conta.nome}" (${conta.numero}). Confira se escolheu a conta certa.`,
      );
    }
    if (bancoConfere(ofx.conta.banco, conta.bancoCodigo) === false) {
      avisos.unshift(`O banco do arquivo (${ofx.conta.banco}) é diferente do cadastrado na conta (${conta.bancoCodigo}).`);
    }
    if (ofx.moeda && ofx.moeda !== "BRL") avisos.push(`Moeda do extrato: ${ofx.moeda}.`);

    const imp = await prisma.$transaction(async (tx) => {
      const criada = await tx.extratoImportacao.create({
        data: {
          contaBancariaId,
          arquivoNome: nome,
          dataInicio: ofx.inicio ? isoParaDate(ofx.inicio) : null,
          dataFim: ofx.fim ? isoParaDate(ofx.fim) : null,
          saldoFinal: ofx.saldo?.valor ?? null,
          dataSaldo: ofx.saldo?.data ? isoParaDate(ofx.saldo.data) : null,
          totalItens: ofx.transacoes.length,
          novosItens: 0,
          criadoPorId: u.id,
        },
      });
      let novos = 0;
      let colisoes = 0;
      if (ofx.transacoes.length) {
        const resolvidas = await resolverChaves(tx, contaBancariaId, ofx.transacoes);
        colisoes = resolvidas.colisoes;
        const { count } = await tx.extratoItem.createMany({
          data: ofx.transacoes.map((t, i) => ({
            importacaoId: criada.id,
            contaBancariaId,
            fitId: resolvidas.chaves[i],
            data: isoParaDate(t.data),
            valor: t.valor,
            descricao: t.descricao,
            documento: t.documento ?? null,
          })),
          skipDuplicates: true,
        });
        novos = count;
        await tx.extratoImportacao.update({ where: { id: criada.id }, data: { novosItens: novos } });
      }
      return { id: criada.id, novos, colisoes };
    }, OPCOES_TX);

    if (imp.colisoes) {
      avisos.push(`${imp.colisoes} lançamento(s) com identificador (FITID) já usado nesta conta por outro lançamento foram importados com chave própria.`);
    }

    const resultado: ResultadoImportacao = {
      importacaoId: imp.id,
      arquivo: nome,
      contaId: conta.id,
      contaNome: conta.nome,
      total: ofx.transacoes.length,
      novos: imp.novos,
      duplicados: ofx.transacoes.length - imp.novos,
      inicio: ofx.inicio,
      fim: ofx.fim,
      saldo: ofx.saldo?.valor ?? null,
      avisos,
    };
    await auditar(
      "importar_ofx",
      "conciliacao",
      imp.id,
      `${nome}: ${imp.novos} novo(s) de ${ofx.transacoes.length} · ${conta.nome}`,
      {
        contaBancariaId,
        arquivo: nome,
        periodo: [ofx.inicio, ofx.fim],
        total: resultado.total,
        novos: resultado.novos,
        saldo: resultado.saldo,
        contaArquivo: ofx.conta,
        avisos,
      },
      { usuarioId: u.id },
    );
    revalidatePath("/financeiro/conciliacao");
    return resultado;
  });
  if (r.ok && r.data) {
    r.mensagem = r.data.total ? `${r.data.novos} lançamento(s) novo(s) de ${r.data.total} no arquivo.` : "Arquivo importado, sem lançamentos no período.";
  }
  return r;
}

// ───────────── Conciliação item a item ─────────────

/** Concilia o item com um movimento existente (sugerido ou escolhido manualmente). */
export async function conciliarItem(itemId: string, movimentoId: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const escopo = await escopoEmpresa();
    const info = await prisma.$transaction(async (tx) => {
      const item = await itemPendente(tx, itemId, escopo);
      const mov = await tx.movimento.findUnique({ where: { id: movimentoId }, include: { extratoItem: { select: { id: true } } } });
      if (!mov || mov.contaBancariaId !== item.contaBancariaId) throw new ErroAcao("Movimento não encontrado nesta conta.");
      if (mov.conciliado || mov.extratoItem) throw new ErroAcao("Este movimento já está conciliado com outro lançamento do extrato.");
      const credito = num(item.valor) > 0;
      if ((mov.tipo === "CREDITO") !== credito) {
        throw new ErroAcao(credito ? "O extrato é uma entrada: escolha um movimento de crédito." : "O extrato é uma saída: escolha um movimento de débito.");
      }
      await vincular(tx, item.id, mov.id);
      return { item, mov };
    }, OPCOES_TX);
    await auditar(
      "conciliar",
      "conciliacao",
      itemId,
      resumoItem(info.item),
      { movimentoId, movimento: { data: isoReq(info.mov.data), valor: num(info.mov.valor), descricao: info.mov.descricao } },
      { usuarioId: u.id },
    );
    revalidar(false);
    return undefined;
  }, "Lançamento conciliado.");
}

/** Baixa o título sugerido com a data e o valor do extrato e concilia o movimento gerado. */
export async function baixarEConciliar(itemId: string, tituloId: string): Promise<Resultado<{ numero: number }>> {
  const r = await executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const escopo = await escopoEmpresa();
    const info = await prisma.$transaction(async (tx) => {
      const item = await itemPendente(tx, itemId, escopo);
      const valor = num(item.valor);
      const titulo = await tx.titulo.findFirst({ where: { id: tituloId, empresaId: { in: escopo.ids } }, select: { id: true, numero: true, tipo: true } });
      if (!titulo) throw new ErroAcao("Título não encontrado nesta empresa.");
      if (titulo.tipo !== (valor > 0 ? "RECEBER" : "PAGAR")) {
        throw new ErroAcao(valor > 0 ? "Entradas do extrato só baixam títulos a receber." : "Saídas do extrato só baixam títulos a pagar.");
      }
      const baixa = await baixarTitulo(
        tx,
        {
          tituloId,
          data: isoReq(item.data),
          contaBancariaId: item.contaBancariaId,
          valor: Math.abs(valor),
          observacao: "Baixa pela conciliação bancária",
        },
        u.id,
      );
      const mov = await tx.movimento.findUnique({ where: { baixaId: baixa.id }, select: { id: true } });
      if (!mov) throw new ErroAcao("A baixa não gerou movimento na conta.");
      await vincular(tx, item.id, mov.id);
      return { item, numero: titulo.numero, baixaId: baixa.id, movimentoId: mov.id };
    }, OPCOES_TX);
    await auditar(
      "baixar_conciliar",
      "conciliacao",
      itemId,
      `${resumoItem(info.item)} → título #${info.numero}`,
      { tituloId, baixaId: info.baixaId, movimentoId: info.movimentoId },
      { usuarioId: u.id },
    );
    revalidar(true, tituloId);
    return { numero: info.numero };
  });
  if (r.ok && r.data) r.mensagem = `Título #${r.data.numero} baixado e conciliado.`;
  return r;
}

const esquemaLancamento = z.object({
  itemId: z.string().min(1),
  descricao: z.string().trim().min(2, "Informe a descrição.").max(300, "Use uma descrição de até 300 caracteres."),
  categoriaId: z.string().min(1, "Escolha a categoria."),
  pessoaId: idOpcional,
  centroCustoId: idOpcional,
  regra: z.object({ termo: termoRegra }).nullish(),
});

/** Cria título já baixado (origem CONCILIACAO) com os dados do extrato e concilia o movimento da baixa. */
export async function criarLancamentoConciliado(
  entrada: EntradaLancamento,
): Promise<Resultado<{ numero: number; regra: "criada" | "atualizada" | null }>> {
  const r = await executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const d = esquemaLancamento.parse(entrada);
    const escopo = await escopoEmpresa();
    const info = await prisma.$transaction(async (tx) => {
      const item = await itemPendente(tx, d.itemId, escopo);
      const valor = num(item.valor);
      const tipo: TipoLancamento = valor > 0 ? "RECEBER" : "PAGAR";
      const conta = await tx.contaBancaria.findUnique({ where: { id: item.contaBancariaId }, select: { id: true, empresaId: true, ativo: true } });
      if (!conta || !conta.ativo) throw new ErroAcao("Conta bancária inválida ou inativa.");
      await validarClassificacao(tx, { categoriaId: d.categoriaId, pessoaId: d.pessoaId, centroCustoId: d.centroCustoId, tipo });
      const data = isoReq(item.data);
      const [tituloId] = await criarLancamento(
        tx,
        {
          tipo,
          empresaId: conta.empresaId,
          pessoaId: d.pessoaId,
          descricao: d.descricao,
          documento: item.documento,
          contaBancariaId: conta.id,
          emissao: data,
          competencia: data,
          parcelas: [{ vencimento: data, valor: Math.abs(valor) }],
          rateios: [{ categoriaId: d.categoriaId, centroCustoId: d.centroCustoId, percentual: 100 }],
          baixarAgora: { data, contaBancariaId: conta.id },
          origem: "CONCILIACAO",
          origemId: item.id,
        },
        u.id,
      );
      const baixa = await tx.baixa.findFirst({
        where: { tituloId, estornada: false },
        orderBy: { createdAt: "desc" },
        select: { id: true, movimento: { select: { id: true } }, titulo: { select: { numero: true } } },
      });
      if (!baixa?.movimento) throw new ErroAcao("O lançamento não gerou movimento na conta.");
      await vincular(tx, item.id, baixa.movimento.id);
      const regra = d.regra
        ? await gravarRegra(tx, { termo: d.regra.termo, tipo, categoriaId: d.categoriaId, pessoaId: d.pessoaId, centroCustoId: d.centroCustoId }, true)
        : null;
      return { item, tituloId, numero: baixa.titulo.numero, movimentoId: baixa.movimento.id, baixaId: baixa.id, regra, tipo };
    }, OPCOES_TX);

    await auditar(
      "criar_lancamento",
      "conciliacao",
      d.itemId,
      `${resumoItem(info.item)} → título #${info.numero}`,
      { tituloId: info.tituloId, baixaId: info.baixaId, movimentoId: info.movimentoId, regraId: info.regra?.id ?? null },
      { usuarioId: u.id },
    );
    await auditar(
      "criar",
      "titulo",
      info.tituloId,
      `#${info.numero} ${d.descricao} (conciliação bancária)`,
      { tipo: info.tipo, categoriaId: d.categoriaId, pessoaId: d.pessoaId, centroCustoId: d.centroCustoId, extratoItemId: d.itemId },
      { usuarioId: u.id },
    );
    if (info.regra) {
      await auditar(info.regra.criada ? "criar" : "atualizar", "regra_conciliacao", info.regra.id, info.regra.termo, d.regra, { usuarioId: u.id });
    }
    revalidar(true, info.tituloId);
    return { numero: info.numero, regra: info.regra ? (info.regra.criada ? ("criada" as const) : ("atualizada" as const)) : null };
  });
  if (r.ok && r.data) {
    r.mensagem = `Lançamento #${r.data.numero} criado e conciliado.${
      r.data.regra === "criada" ? " Regra criada." : r.data.regra === "atualizada" ? " Regra existente atualizada." : ""
    }`;
  }
  return r;
}

export async function ignorarItem(itemId: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const item = await itemNoEscopo(prisma, itemId, await escopoEmpresa());
    const r = await prisma.extratoItem.updateMany({ where: { id: itemId, status: "PENDENTE" }, data: { status: "IGNORADO" } });
    if (r.count !== 1) throw new ErroAcao("Só lançamentos pendentes podem ser ignorados. Atualize a página.");
    await auditar("ignorar", "conciliacao", itemId, resumoItem(item), undefined, { usuarioId: u.id });
    revalidatePath("/financeiro/conciliacao");
    return undefined;
  }, "Lançamento ignorado.");
}

export async function restaurarItem(itemId: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const item = await itemNoEscopo(prisma, itemId, await escopoEmpresa());
    const r = await prisma.extratoItem.updateMany({ where: { id: itemId, status: "IGNORADO" }, data: { status: "PENDENTE" } });
    if (r.count !== 1) throw new ErroAcao("Este lançamento não está ignorado. Atualize a página.");
    await auditar("restaurar", "conciliacao", itemId, resumoItem(item), undefined, { usuarioId: u.id });
    revalidatePath("/financeiro/conciliacao");
    return undefined;
  }, "Lançamento restaurado para pendentes.");
}

/** Desfaz a conciliação: item volta a PENDENTE e o movimento deixa de estar conciliado (não exclui baixas). */
export async function desfazerConciliacao(itemId: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const escopo = await escopoEmpresa();
    const item = await prisma.$transaction(async (tx) => {
      const it = await itemNoEscopo(tx, itemId, escopo);
      if (it.status !== "CONCILIADO") throw new ErroAcao("Este lançamento não está conciliado. Atualize a página.");
      const r = await tx.extratoItem.updateMany({ where: { id: itemId, status: "CONCILIADO" }, data: { status: "PENDENTE", movimentoId: null } });
      if (r.count !== 1) throw new ErroAcao("Este lançamento não está conciliado. Atualize a página.");
      if (it.movimentoId) await tx.movimento.updateMany({ where: { id: it.movimentoId }, data: { conciliado: false } });
      return it;
    }, OPCOES_TX);
    await auditar("desfazer_conciliacao", "conciliacao", itemId, resumoItem(item), { movimentoId: item.movimentoId }, { usuarioId: u.id });
    revalidar(false);
    return undefined;
  }, "Conciliação desfeita.");
}

/** Aplica de uma vez as sugestões de movimento com até 3 dias de diferença (uma transação). */
export async function conciliarAutomaticamente(contaBancariaId: string): Promise<Resultado<{ conciliados: number }>> {
  const r = await executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    await exigirContaNoEscopo(await escopoEmpresa(), contaBancariaId);
    const pares = await prisma.$transaction(
      async (tx) => {
        const itens = await tx.extratoItem.findMany({
          where: { contaBancariaId, status: "PENDENTE" },
          select: { id: true, data: true, valor: true, descricao: true },
        });
        const sugestoes = await sugerirMovimentos(
          tx,
          contaBancariaId,
          itens.map((i) => ({ id: i.id, data: isoReq(i.data), valor: num(i.valor), descricao: i.descricao })),
        );
        const escolhidos = Array.from(sugestoes)
          .filter(([, s]) => s.distancia <= JANELA_AUTO)
          .map(([itemId, s]) => ({ itemId, movimentoId: s.movimentoId }));
        if (!escolhidos.length) return escolhidos;
        const movs = await tx.movimento.updateMany({
          where: { id: { in: escolhidos.map((p) => p.movimentoId) }, conciliado: false },
          data: { conciliado: true },
        });
        if (movs.count !== escolhidos.length) throw new ErroAcao("Alguns movimentos mudaram durante a conciliação. Atualize a página e tente de novo.");
        for (const p of escolhidos) {
          const it = await tx.extratoItem.updateMany({
            where: { id: p.itemId, status: "PENDENTE" },
            data: { status: "CONCILIADO", movimentoId: p.movimentoId },
          });
          if (it.count !== 1) throw new ErroAcao("Alguns lançamentos mudaram durante a conciliação. Atualize a página e tente de novo.");
        }
        return escolhidos;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    if (pares.length) {
      await auditar(
        "conciliar_automatico",
        "conciliacao",
        contaBancariaId,
        `${pares.length} lançamento(s) conciliado(s) automaticamente`,
        { pares },
        { usuarioId: u.id },
      );
      revalidar(false);
    }
    return { conciliados: pares.length };
  });
  if (r.ok && r.data) {
    r.mensagem = r.data.conciliados
      ? `${r.data.conciliados} lançamento(s) conciliado(s) automaticamente.`
      : `Nenhuma sugestão com até ${JANELA_AUTO} dias de diferença para conciliar.`;
  }
  return r;
}

/** Movimentos não conciliados da mesma conta e mesmo sentido, a até ±30 dias, para vínculo manual. */
export async function buscarMovimentosParaVincular(itemId: string): Promise<Resultado<MovimentoOpcao[]>> {
  return executar(async () => {
    await exigirPermissao("financeiro:ver");
    const item = await itemNoEscopo(prisma, itemId, await escopoEmpresa());
    const data = isoReq(item.data);
    const valor = num(item.valor);
    const credito = valor > 0;
    const movs = await prisma.movimento.findMany({
      where: {
        contaBancariaId: item.contaBancariaId,
        conciliado: false,
        extratoItem: null,
        tipo: credito ? "CREDITO" : "DEBITO",
        data: { gte: isoParaDate(addDias(data, -30)), lte: isoParaDate(addDias(data, 30)) },
      },
      select: { id: true, data: true, valor: true, descricao: true, origem: true },
      orderBy: [{ data: "asc" }, { createdAt: "asc" }],
      take: 500,
    });
    const alvo = Math.round(Math.abs(valor) * 100);
    return movs
      .map<MovimentoOpcao>((m) => {
        const v = num(m.valor);
        const dataMov = isoReq(m.data);
        return {
          id: m.id,
          data: dataMov,
          valor: credito ? v : -v,
          descricao: m.descricao,
          origem: m.origem,
          distancia: Math.abs(diffDias(data, dataMov)),
          mesmoValor: Math.round(v * 100) === alvo,
        };
      })
      .sort((a, b) => Number(b.mesmoValor) - Number(a.mesmoValor) || a.distancia - b.distancia || (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  });
}

// ───────────── Regras de conciliação ─────────────

const esquemaRegra = z.object({
  termo: termoRegra,
  tipo: z
    .enum(["RECEBER", "PAGAR"])
    .nullish()
    .transform((v) => v ?? null),
  categoriaId: z.string().min(1, "Escolha a categoria."),
  pessoaId: idOpcional,
  centroCustoId: idOpcional,
});

export async function salvarRegra(entrada: EntradaRegra): Promise<Resultado<{ id: string }>> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const d = esquemaRegra.parse(entrada);
    const regra = await prisma.$transaction(async (tx) => {
      await validarClassificacao(tx, d);
      return gravarRegra(tx, d, false);
    }, OPCOES_TX);
    await auditar("criar", "regra_conciliacao", regra.id, regra.termo, d, { usuarioId: u.id });
    revalidatePath("/financeiro/conciliacao");
    return { id: regra.id };
  }, "Regra criada.");
}

export async function alternarRegra(id: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const atual = await prisma.regraConciliacao.findUnique({ where: { id }, select: { ativo: true, termo: true } });
    if (!atual) throw new ErroAcao("Regra não encontrada.");
    await prisma.regraConciliacao.update({ where: { id }, data: { ativo: !atual.ativo } });
    await auditar(atual.ativo ? "inativar" : "ativar", "regra_conciliacao", id, atual.termo, undefined, { usuarioId: u.id });
    revalidatePath("/financeiro/conciliacao");
    return undefined;
  }, "Regra atualizada.");
}

export async function excluirRegra(id: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const r = await prisma.regraConciliacao.delete({ where: { id } });
    await auditar("excluir", "regra_conciliacao", id, r.termo, r, { usuarioId: u.id });
    revalidatePath("/financeiro/conciliacao");
    return undefined;
  }, "Regra excluída.");
}
