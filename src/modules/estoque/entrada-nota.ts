// Entrada no estoque a partir de uma NF-e recebida (compra): sugere o produto de cada item (vínculo já usado com o
// fornecedor, GTIN ou NCM), registra o lançamento com custo unitário e atualiza o custo médio. Só servidor.
import "server-only";
import { prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { num } from "@/lib/serial";
import { detalheNfe, type ItemNota } from "@/modules/fiscal/leitura";
import { proximoNumeroEstoque, somarSaldo } from "./servicos";

export type ItemEntradaNota = ItemNota & {
  sugestaoProdutoId: string | null;
  motivoSugestao: "vinculo" | "gtin" | "ncm" | null;
};

export type ProdutoOpcao = { id: string; codigo: string; descricao: string; unidade: string; ncm: string | null; gtin: string | null };

async function documentoDaEmpresa(documentoId: string, escopoIds: string[]) {
  const d = await prisma.documentoRecebido.findFirst({ where: { id: documentoId, empresaId: { in: escopoIds } }, include: { empresa: { select: { id: true, matrizId: true } }, lancamentoEstoque: { select: { id: true, numero: true, createdAt: true } } } });
  if (!d) throw new ErroAcao("Nota não encontrada nesta empresa.");
  return d;
}

/** Itens da nota com a sugestão de produto e a lista de produtos que controlam estoque. */
export async function sugestoesEntradaNota(documentoId: string, escopoIds: string[]) {
  const d = await documentoDaEmpresa(documentoId, escopoIds);
  if (d.tipo !== "NFE" || d.direcao !== "ENTRADA" || !d.completo) return null;
  const detalhe = detalheNfe(d.xml);
  if (!detalhe || !detalhe.itens.length) return null;
  const matriz = d.empresa.matrizId ?? d.empresa.id;
  const [produtos, vinculos] = await Promise.all([
    prisma.produto.findMany({ where: { empresaId: matriz, tipo: "PRODUTO", controlaEstoque: true, ativo: true }, orderBy: { descricao: "asc" }, select: { id: true, codigo: true, descricao: true, unidade: true, ncm: true, gtin: true } }),
    d.emitenteDocumento ? prisma.vinculoProdutoFornecedor.findMany({ where: { empresaId: matriz, fornecedorDocumento: d.emitenteDocumento } }) : Promise.resolve([]),
  ]);
  const porNcm = new Map<string, string[]>();
  for (const p of produtos) if (p.ncm) porNcm.set(p.ncm.replace(/\D/g, ""), [...(porNcm.get(p.ncm.replace(/\D/g, "")) ?? []), p.id]);
  const itens: ItemEntradaNota[] = detalhe.itens.map((i) => {
    const v = vinculos.find((x) => x.codigoFornecedor === i.codigo);
    if (v && produtos.some((p) => p.id === v.produtoId)) return { ...i, sugestaoProdutoId: v.produtoId, motivoSugestao: "vinculo" };
    const g = i.gtin ? produtos.find((p) => p.gtin && p.gtin.replace(/\D/g, "") === i.gtin) : null;
    if (g) return { ...i, sugestaoProdutoId: g.id, motivoSugestao: "gtin" };
    const n = porNcm.get(i.ncm.replace(/\D/g, ""));
    if (n && n.length === 1) return { ...i, sugestaoProdutoId: n[0], motivoSugestao: "ncm" };
    return { ...i, sugestaoProdutoId: null, motivoSugestao: null };
  });
  return {
    documentoId: d.id,
    estabelecimentoId: d.empresaId,
    lancado: d.lancamentoEstoque ? { id: d.lancamentoEstoque.id, numero: d.lancamentoEstoque.numero, em: d.lancamentoEstoque.createdAt.toISOString() } : null,
    podeLancar: d.situacao === "AUTORIZADO" && !d.lancamentoEstoque,
    fornecedor: d.emitenteNome ?? "",
    itens,
    produtos: produtos as ProdutoOpcao[],
  };
}
export type SugestoesEntradaNota = NonNullable<Awaited<ReturnType<typeof sugestoesEntradaNota>>>;

export type ItemEscolhido = { numero: number; produtoId: string | null; quantidade: number };

/** Registra a entrada no estoque da nota (só os itens com produto escolhido), guarda os vínculos e liga a nota ao lançamento. */
export async function lancarEntradaDaNota(documentoId: string, itensEscolhidos: ItemEscolhido[], opcoes: { escopoIds: string[]; usuarioId: string; data?: Date | null }) {
  const d = await documentoDaEmpresa(documentoId, opcoes.escopoIds);
  if (d.tipo !== "NFE" || d.direcao !== "ENTRADA") throw new ErroAcao("Só NF-e de entrada (compra) dá entrada no estoque.");
  if (d.situacao !== "AUTORIZADO") throw new ErroAcao("A nota não está autorizada.");
  if (!d.completo) throw new ErroAcao("A nota ainda não tem o XML completo (manifeste a ciência e aguarde a busca).");
  if (d.lancamentoEstoque) throw new ErroAcao(`Esta nota já deu entrada no estoque (lançamento nº ${String(d.lancamentoEstoque.numero).padStart(4, "0")}).`);
  const detalhe = detalheNfe(d.xml);
  if (!detalhe) throw new ErroAcao("Não foi possível ler os itens da nota.");
  const escolhidos = itensEscolhidos.filter((e) => e.produtoId);
  if (!escolhidos.length) throw new ErroAcao("Escolha o produto de ao menos um item.");
  const matriz = d.empresa.matrizId ?? d.empresa.id;
  const produtos = await prisma.produto.findMany({ where: { id: { in: escolhidos.map((e) => e.produtoId!) }, empresaId: matriz, tipo: "PRODUTO", controlaEstoque: true, ativo: true }, select: { id: true, codigo: true, descricao: true, unidade: true } });
  const linhas = escolhidos.map((e) => {
    const item = detalhe.itens.find((i) => i.numero === e.numero);
    if (!item) throw new ErroAcao(`Item ${e.numero} não existe na nota.`);
    const produto = produtos.find((p) => p.id === e.produtoId);
    if (!produto) throw new ErroAcao(`Produto do item ${e.numero} não controla estoque ou não é desta empresa.`);
    const quantidade = Math.round(e.quantidade * 1000) / 1000;
    if (!(quantidade > 0)) throw new ErroAcao(`Quantidade do item ${e.numero} precisa ser maior que zero.`);
    // custo unitário na unidade do estoque: valor total do item dividido pela quantidade que entra
    const custoUnitario = Math.round((item.valorTotal / quantidade) * 10000) / 10000;
    return { item, produto, quantidade, custoUnitario };
  });
  const repetidos = new Set<string>();
  for (const l of linhas) {
    if (repetidos.has(l.produto.id)) throw new ErroAcao(`O produto ${l.produto.descricao} aparece em mais de um item; some as quantidades num item só.`);
    repetidos.add(l.produto.id);
  }
  const pessoa = d.pessoaId ? { id: d.pessoaId } : d.emitenteDocumento ? await prisma.pessoa.findFirst({ where: { empresaId: matriz, documento: d.emitenteDocumento }, select: { id: true } }) : null;
  const referencia = `NF-e ${d.numero ?? ""}${d.serie ? `/${d.serie}` : ""} · ${d.emitenteNome ?? "fornecedor"}`.slice(0, 200);
  const r = await prisma.$transaction(async (tx) => {
    const numero = await proximoNumeroEstoque(tx, d.empresaId);
    const lanc = await tx.lancamentoEstoque.create({
      data: {
        empresaId: d.empresaId,
        numero,
        tipo: "ENTRADA",
        data: opcoes.data ?? d.emitidoEm ?? new Date(),
        pessoaId: pessoa?.id ?? null,
        documentoId: d.id,
        referencia,
        observacao: `Chave ${d.chave}`,
        criadoPorId: opcoes.usuarioId,
        itens: { create: linhas.map((l) => ({ produtoId: l.produto.id, quantidade: l.quantidade, custoUnitario: l.custoUnitario })) },
      },
    });
    for (const l of linhas) await somarSaldo(tx, d.empresaId, l.produto.id, l.quantidade, l.custoUnitario);
    if (d.emitenteDocumento)
      for (const l of linhas)
        await tx.vinculoProdutoFornecedor.upsert({
          where: { empresaId_fornecedorDocumento_codigoFornecedor: { empresaId: matriz, fornecedorDocumento: d.emitenteDocumento, codigoFornecedor: l.item.codigo } },
          create: { empresaId: matriz, fornecedorDocumento: d.emitenteDocumento, codigoFornecedor: l.item.codigo, produtoId: l.produto.id },
          update: { produtoId: l.produto.id },
        });
    return { id: lanc.id, numero };
  });
  return { ...r, linhas: linhas.map((l) => ({ produto: l.produto.descricao, quantidade: l.quantidade, unidade: l.produto.unidade, custoUnitario: l.custoUnitario })), total: Math.round(linhas.reduce((a, l) => a + l.custoUnitario * l.quantidade, 0) * 100) / 100 };
}

export const valorEstoque = (saldo: { quantidade: unknown; custoMedio: unknown }) => Math.round(num(saldo.quantidade as number) * num(saldo.custoMedio as number) * 100) / 100;
