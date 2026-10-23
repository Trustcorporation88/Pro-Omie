"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao } from "@/lib/auth/sessao";
import { escopoEmpresa, exigirEmpresaNoEscopo, type EscopoEmpresa } from "@/lib/auth/empresa";
import { auditar } from "@/lib/auditoria";
import { isoParaDate } from "@/lib/datas";
import { fmtMoeda } from "@/lib/format";
import { num } from "@/lib/serial";
import { esquemaAjuste, esquemaEntrada, esquemaMateriaisPadrao, esquemaPrecos, type EntradaAjuste, type EntradaEstoque, type EntradaPrecos } from "./esquemas";
import { proximoNumeroEstoque, somarSaldo, tirarSaldo } from "./servicos";
import { MATERIAIS_PADRAO, MOTIVOS_AJUSTE, fmtQtd, type MotivoAjuste } from "./tipos";

const arred3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const numeroDoc = (n: number) => String(n).padStart(4, "0");

function revalidarEstoque() {
  revalidatePath("/estoque", "layout");
  revalidatePath("/vendas/pedidos");
}

/** Estabelecimento do escopo e ativo (lançamentos novos só em estabelecimento ativo). */
async function estabelecimentoAtivo(escopo: EscopoEmpresa, empresaId: string) {
  exigirEmpresaNoEscopo(escopo, empresaId, "Estabelecimento fora da empresa atual. Troque de empresa no menu.");
  const e = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { ativo: true, nomeFantasia: true, razaoSocial: true } });
  if (!e) throw new ErroAcao("Estabelecimento não encontrado.");
  if (!e.ativo) throw new ErroAcao("Estabelecimento inativo. Reative em Configurações › Empresas e filiais.", { empresaId: "Estabelecimento inativo." });
  return e;
}

/** Materiais (produtos com controle de estoque) da empresa ativa; todos precisam existir. */
async function materiaisDaEmpresa(escopo: EscopoEmpresa, ids: string[], exigirAtivo: boolean) {
  const produtos = await prisma.produto.findMany({
    where: { id: { in: ids }, empresaId: escopo.ativa.id },
    select: { id: true, codigo: true, descricao: true, unidade: true, tipo: true, controlaEstoque: true, ativo: true },
  });
  const mapa = new Map(produtos.map((p) => [p.id, p]));
  ids.forEach((id, n) => {
    const p = mapa.get(id);
    if (!p) throw new ErroAcao("Material não encontrado nesta empresa. Recarregue a página.", { [`itens.${n}.produtoId`]: "Material não encontrado." });
    if (p.tipo !== "PRODUTO" || !p.controlaEstoque) {
      throw new ErroAcao(`${p.descricao} não controla estoque. Marque "Controla estoque" no cadastro do produto.`, { [`itens.${n}.produtoId`]: "Não controla estoque." });
    }
    if (exigirAtivo && !p.ativo) throw new ErroAcao(`${p.descricao} está inativo. Reative no cadastro de produtos.`, { [`itens.${n}.produtoId`]: "Material inativo." });
  });
  return mapa;
}

const resumoItens = (itens: { descricao: string; unidade: string; quantidade: number }[]) => {
  const t = itens.map((i) => `${i.descricao} ${fmtQtd(i.quantidade, i.unidade)}`).join(", ");
  return t.length > 220 ? `${t.slice(0, 217)}…` : t;
};

// ───────────────────────── Materiais ─────────────────────────

/** Cadastra os materiais recicláveis marcados na lista padrão (os que já existem pelo código ficam como estão). */
export async function cadastrarMateriaisPadrao(codigos: string[]): Promise<Resultado<{ criados: number; existentes: number }>> {
  const r = await executar(async () => {
    await exigirPermissao("estoque:editar");
    const escopo = await escopoEmpresa();
    const escolhidos = [...new Set(esquemaMateriaisPadrao.parse(codigos))];
    const existentes = await prisma.produto.findMany({ where: { empresaId: escopo.ativa.id, codigo: { in: escolhidos } }, select: { codigo: true } });
    const ja = new Set(existentes.map((p) => p.codigo));
    const novos = MATERIAIS_PADRAO.filter((m) => escolhidos.includes(m.codigo) && !ja.has(m.codigo));
    if (novos.length) {
      await prisma.produto.createMany({
        data: novos.map((m) => ({
          empresaId: escopo.ativa.id,
          tipo: "PRODUTO" as const,
          codigo: m.codigo,
          descricao: m.descricao,
          unidade: "KG",
          ncm: m.ncm,
          origem: 0,
          controlaEstoque: true,
          grupoMaterial: m.grupo,
        })),
        skipDuplicates: true,
      });
      await auditar("materiais_padrao", "produto", null, `Materiais recicláveis cadastrados: ${novos.map((m) => m.descricao).join(", ")}`, {
        codigos: novos.map((m) => m.codigo),
      });
    }
    revalidarEstoque();
    revalidatePath("/cadastros/produtos");
    return { criados: novos.length, existentes: ja.size };
  });
  if (r.ok && r.data) {
    const { criados, existentes } = r.data;
    r.mensagem = criados
      ? `${criados === 1 ? "1 material cadastrado" : `${criados} materiais cadastrados`}. Informe o preço por kg em Atualizar preços.`
      : `Os ${existentes === 1 ? "material escolhido já estava cadastrado" : "materiais escolhidos já estavam cadastrados"}.`;
  }
  return r;
}

/** Atualiza o preço de venda (por unidade, em geral por kg) de vários materiais de uma vez. */
export async function atualizarPrecos(lista: EntradaPrecos): Promise<Resultado<{ alterados: number }>> {
  const r = await executar(async () => {
    await exigirPermissao("cadastros:editar");
    const escopo = await escopoEmpresa();
    const precos = esquemaPrecos.parse(lista);
    const produtos = await prisma.produto.findMany({
      where: { id: { in: precos.map((p) => p.produtoId) }, empresaId: escopo.ativa.id },
      select: { id: true, descricao: true, unidade: true, precoVenda: true },
    });
    if (produtos.length !== new Set(precos.map((p) => p.produtoId)).size) throw new ErroAcao("Material não encontrado nesta empresa. Recarregue a página.");
    const mapa = new Map(produtos.map((p) => [p.id, p]));
    const mudancas = precos
      .map((p) => ({ ...p, atual: mapa.get(p.produtoId)! }))
      .filter((p) => Math.abs(num(p.atual.precoVenda) - p.preco) >= 0.005);
    if (mudancas.length) {
      await prisma.$transaction(mudancas.map((m) => prisma.produto.update({ where: { id: m.produtoId }, data: { precoVenda: m.preco } })));
      await auditar(
        "precos",
        "produto",
        null,
        `Preços atualizados: ${mudancas.map((m) => `${m.atual.descricao} ${fmtMoeda(m.preco)}/${m.atual.unidade.toLowerCase()}`).join(", ")}`.slice(0, 500),
        { antes: Object.fromEntries(mudancas.map((m) => [m.atual.descricao, num(m.atual.precoVenda)])), depois: Object.fromEntries(mudancas.map((m) => [m.atual.descricao, m.preco])) },
      );
    }
    revalidarEstoque();
    revalidatePath("/cadastros/produtos");
    return { alterados: mudancas.length };
  });
  if (r.ok && r.data) r.mensagem = r.data.alterados ? `${r.data.alterados === 1 ? "1 preço atualizado" : `${r.data.alterados} preços atualizados`}.` : "Nenhum preço mudou.";
  return r;
}

// ───────────────────────── Lançamentos ─────────────────────────

/** Entrada da produção ou da triagem: um lançamento com uma linha por material, somando ao saldo do estabelecimento. */
export async function registrarEntrada(entrada: EntradaEstoque): Promise<Resultado<{ id: string; numero: number }>> {
  return executar(async () => {
    const u = await exigirPermissao("estoque:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaEntrada.parse(entrada);
    await estabelecimentoAtivo(escopo, d.empresaId);
    const materiais = await materiaisDaEmpresa(
      escopo,
      d.itens.map((i) => i.produtoId),
      true,
    );
    if (d.pessoaId) {
      const p = await prisma.pessoa.findFirst({ where: { id: d.pessoaId, empresaId: escopo.ativa.id }, select: { id: true } });
      if (!p) throw new ErroAcao("Cliente não encontrado nesta empresa.", { pessoaId: "Cliente não encontrado nesta empresa." });
    }
    const r = await prisma.$transaction(async (tx) => {
      const numero = await proximoNumeroEstoque(tx, d.empresaId);
      const lanc = await tx.lancamentoEstoque.create({
        data: {
          empresaId: d.empresaId,
          numero,
          tipo: "ENTRADA",
          data: isoParaDate(d.data),
          pessoaId: d.pessoaId,
          referencia: d.referencia,
          observacao: d.observacao,
          criadoPorId: u.id,
          itens: { create: d.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade })) },
        },
      });
      for (const i of d.itens) await somarSaldo(tx, d.empresaId, i.produtoId, i.quantidade);
      return { id: lanc.id, numero };
    });
    const itens = d.itens.map((i) => ({ ...materiais.get(i.produtoId)!, quantidade: i.quantidade }));
    await auditar("entrada", "estoque", r.id, `Entrada nº ${numeroDoc(r.numero)} · ${resumoItens(itens)}${d.referencia ? ` · ${d.referencia}` : ""}`, d);
    revalidarEstoque();
    return r;
  }, "Entrada registrada. O saldo já está atualizado.");
}

/**
 * Ajuste pelo saldo contado (inventário, perda, correção). Cada linha leva o saldo que a tela mostrou:
 * se ele mudou enquanto a pessoa contava (uma venda faturada, por exemplo), o ajuste inteiro é recusado.
 */
export async function ajustarEstoque(entrada: EntradaAjuste): Promise<Resultado<{ id: string; numero: number }>> {
  return executar(async () => {
    const u = await exigirPermissao("estoque:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaAjuste.parse(entrada);
    await estabelecimentoAtivo(escopo, d.empresaId);
    const materiais = await materiaisDaEmpresa(
      escopo,
      d.itens.map((i) => i.produtoId),
      false,
    );
    const r = await prisma.$transaction(async (tx) => {
      const mudancas: { produtoId: string; diferenca: number; contado: number }[] = [];
      for (const [n, i] of d.itens.entries()) {
        const m = materiais.get(i.produtoId)!;
        const linha = await tx.saldoEstoque.findUnique({ where: { empresaId_produtoId: { empresaId: d.empresaId, produtoId: i.produtoId } } });
        const atual = linha ? num(linha.quantidade) : 0;
        if (Math.abs(atual - i.saldoEsperado) > 0.0005) {
          throw new ErroAcao(`O saldo de ${m.descricao} mudou para ${fmtQtd(atual, m.unidade)} enquanto você contava. Atualize a página e confira.`, {
            [`itens.${n}.contado`]: "O saldo mudou.",
          });
        }
        const diferenca = arred3(i.contado - atual);
        if (diferenca === 0) continue;
        if (linha) {
          const ok = await tx.saldoEstoque.updateMany({
            where: { empresaId: d.empresaId, produtoId: i.produtoId, quantidade: linha.quantidade },
            data: { quantidade: i.contado },
          });
          if (ok.count !== 1) throw new ErroAcao(`O saldo de ${m.descricao} mudou enquanto você contava. Atualize a página e confira.`);
        } else {
          await tx.saldoEstoque.create({ data: { empresaId: d.empresaId, produtoId: i.produtoId, quantidade: i.contado } });
        }
        mudancas.push({ produtoId: i.produtoId, diferenca, contado: i.contado });
      }
      if (!mudancas.length) throw new ErroAcao("Nenhum saldo mudou: a contagem bate com o sistema.");
      const numero = await proximoNumeroEstoque(tx, d.empresaId);
      const lanc = await tx.lancamentoEstoque.create({
        data: {
          empresaId: d.empresaId,
          numero,
          tipo: "AJUSTE",
          data: isoParaDate(d.data),
          motivo: d.motivo,
          observacao: d.observacao,
          criadoPorId: u.id,
          itens: { create: mudancas.map((m) => ({ produtoId: m.produtoId, quantidade: m.diferenca, saldoContado: m.contado })) },
        },
      });
      return { id: lanc.id, numero, mudancas };
    });
    const resumo = r.mudancas
      .map((m) => {
        const mat = materiais.get(m.produtoId)!;
        return `${mat.descricao} ${m.diferenca > 0 ? "+" : "−"}${fmtQtd(Math.abs(m.diferenca), mat.unidade)}`;
      })
      .join(", ");
    await auditar("ajuste", "estoque", r.id, `Ajuste nº ${numeroDoc(r.numero)} · ${MOTIVOS_AJUSTE[d.motivo as MotivoAjuste]} · ${resumo}`.slice(0, 500), d);
    revalidarEstoque();
    return { id: r.id, numero: r.numero };
  }, "Estoque ajustado.");
}

/** Exclui uma entrada ou um ajuste, desfazendo o efeito no saldo. Saída de venda só sai desfazendo o faturamento. */
export async function excluirLancamentoEstoque(id: string): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("estoque:editar");
    const escopo = await escopoEmpresa();
    const lanc = await prisma.lancamentoEstoque.findFirst({
      where: { id: typeof id === "string" ? id : "", empresaId: { in: escopo.ids } },
      include: { itens: { include: { produto: { select: { descricao: true, unidade: true } } } }, pedido: { select: { numero: true } } },
    });
    if (!lanc) throw new ErroAcao("Lançamento não encontrado nesta empresa.");
    if (lanc.tipo === "VENDA") {
      throw new ErroAcao(`Esta saída veio do faturamento do pedido nº ${numeroDoc(lanc.pedido?.numero ?? 0)}. Para devolver ao estoque, desfaça o faturamento no pedido.`);
    }
    await prisma.$transaction(async (tx) => {
      const saldos = await tx.saldoEstoque.findMany({ where: { empresaId: lanc.empresaId, produtoId: { in: lanc.itens.map((i) => i.produtoId) } } });
      const mapa = new Map(saldos.map((s) => [s.produtoId, num(s.quantidade)]));
      const faltas = lanc.itens.filter((i) => num(i.quantidade) > 0 && (mapa.get(i.produtoId) ?? 0) < num(i.quantidade));
      if (faltas.length) {
        const lista = faltas
          .map((i) => `${i.produto.descricao}: lançamento ${fmtQtd(num(i.quantidade), i.produto.unidade)}, saldo ${fmtQtd(mapa.get(i.produtoId) ?? 0, i.produto.unidade)}`)
          .join("; ");
        throw new ErroAcao(`Não dá para excluir: parte do material já saiu do estoque (${lista}). Faça um ajuste em vez de excluir.`);
      }
      for (const i of lanc.itens) {
        const q = num(i.quantidade);
        if (q > 0) {
          if (!(await tirarSaldo(tx, lanc.empresaId, i.produtoId, q))) throw new ErroAcao(`O saldo de ${i.produto.descricao} mudou. Atualize a página e tente de novo.`);
        } else {
          await somarSaldo(tx, lanc.empresaId, i.produtoId, -q);
        }
      }
      await tx.lancamentoEstoque.delete({ where: { id: lanc.id } });
    });
    const rotulo = lanc.tipo === "ENTRADA" ? "Entrada" : "Ajuste";
    await auditar(
      "excluir",
      "estoque",
      lanc.id,
      `${rotulo} nº ${numeroDoc(lanc.numero)} excluído · ${resumoItens(lanc.itens.map((i) => ({ descricao: i.produto.descricao, unidade: i.produto.unidade, quantidade: num(i.quantidade) })))}`,
      { tipo: lanc.tipo, itens: lanc.itens.map((i) => ({ produtoId: i.produtoId, quantidade: num(i.quantidade) })) },
    );
    revalidarEstoque();
    return undefined;
  }, "Lançamento excluído e saldo desfeito.");
}
