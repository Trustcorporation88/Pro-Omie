import "server-only";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { prisma, Prisma } from "@/lib/db";
import { fmtDocumento } from "@/lib/format";
import { ROTULOS } from "@/lib/rotulos";
import { isoReq, num } from "@/lib/serial";
import type { DocumentoVenda, ItemDocumento, LinhaDocumento, OpcoesVenda, TipoDocumentoVenda } from "./tipos";

export const POR_PAGINA_VENDAS = 30;

type Busca = Record<string, string | string[] | undefined>;
const primeiro = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").replaceAll("\0", "").trim();

export type FiltrosVendas = { aba: string; q: string; pagina: number };

export function lerFiltrosVendas(sp: Busca, abaPadrao: string): FiltrosVendas {
  const pagina = Math.max(1, Number(primeiro(sp.pagina)) || 1);
  return { aba: primeiro(sp.aba) || abaPadrao, q: primeiro(sp.q).slice(0, 100), pagina };
}

const ABAS_PROPOSTA: Record<string, Prisma.PropostaWhereInput> = {
  abertas: { status: { in: ["RASCUNHO", "ENVIADA"] } },
  aprovadas: { status: "APROVADA" },
  recusadas: { status: "RECUSADA" },
  canceladas: { status: "CANCELADA" },
  todas: {},
};
const ABAS_PEDIDO: Record<string, Prisma.PedidoWhereInput> = {
  abertos: { status: "ABERTO" },
  faturados: { status: "FATURADO" },
  cancelados: { status: "CANCELADO" },
  todos: {},
};

function buscaTexto(q: string) {
  if (!q) return {};
  const numero = /^\d+$/.test(q) ? Number(q) : null;
  return {
    OR: [
      { pessoa: { nome: { contains: q, mode: "insensitive" as const } } },
      { pessoa: { nomeFantasia: { contains: q, mode: "insensitive" as const } } },
      ...(numero ? [{ numero }] : []),
    ],
  };
}

const nomePessoa = (p: { nome: string; nomeFantasia: string | null }) => p.nomeFantasia || p.nome;

/** Lista paginada de propostas ou pedidos da empresa ativa, com contadores por aba. */
export async function listarDocumentos(tipo: TipoDocumentoVenda, f: FiltrosVendas) {
  const escopo = await escopoEmpresa();
  const daEmpresa = { empresaId: { in: escopo.ids } };
  const incluir = {
    pessoa: { select: { nome: true, nomeFantasia: true } },
    vendedor: { select: { nome: true } },
    empresa: { select: { nomeFantasia: true, razaoSocial: true } },
  } as const;
  const paraLinha = (d: {
    id: string;
    numero: number;
    status: string;
    emissao: Date;
    validade?: Date;
    total: Prisma.Decimal;
    pessoa: { nome: string; nomeFantasia: string | null };
    vendedor: { nome: string } | null;
    empresa: { nomeFantasia: string | null; razaoSocial: string };
  }): LinhaDocumento => ({
    id: d.id,
    numero: d.numero,
    status: d.status as LinhaDocumento["status"],
    pessoaNome: nomePessoa(d.pessoa),
    vendedorNome: d.vendedor?.nome ?? null,
    emissao: isoReq(d.emissao),
    validade: d.validade ? isoReq(d.validade) : null,
    total: num(d.total),
    empresaNome: d.empresa.nomeFantasia || d.empresa.razaoSocial,
  });

  if (tipo === "proposta") {
    const abas = ABAS_PROPOSTA;
    const aba = abas[f.aba] ? f.aba : "abertas";
    const where: Prisma.PropostaWhereInput = { AND: [daEmpresa, abas[aba], buscaTexto(f.q)] };
    const [linhas, total, grupos] = await Promise.all([
      prisma.proposta.findMany({ where, include: incluir, orderBy: [{ emissao: "desc" }, { numero: "desc" }], skip: (f.pagina - 1) * POR_PAGINA_VENDAS, take: POR_PAGINA_VENDAS }),
      prisma.proposta.count({ where }),
      prisma.proposta.groupBy({ by: ["status"], where: { AND: [daEmpresa, buscaTexto(f.q)] }, _count: { _all: true } }),
    ]);
    const n = (s: string) => grupos.find((g) => g.status === s)?._count._all ?? 0;
    const contadores = { abertas: n("RASCUNHO") + n("ENVIADA"), aprovadas: n("APROVADA"), recusadas: n("RECUSADA"), canceladas: n("CANCELADA"), todas: grupos.reduce((a, g) => a + g._count._all, 0) };
    return { linhas: linhas.map(paraLinha), total, contadores, aba };
  }
  const abas = ABAS_PEDIDO;
  const aba = abas[f.aba] ? f.aba : "abertos";
  const where: Prisma.PedidoWhereInput = { AND: [daEmpresa, abas[aba], buscaTexto(f.q)] };
  const [linhas, total, grupos] = await Promise.all([
    prisma.pedido.findMany({ where, include: incluir, orderBy: [{ emissao: "desc" }, { numero: "desc" }], skip: (f.pagina - 1) * POR_PAGINA_VENDAS, take: POR_PAGINA_VENDAS }),
    prisma.pedido.count({ where }),
    prisma.pedido.groupBy({ by: ["status"], where: { AND: [daEmpresa, buscaTexto(f.q)] }, _count: { _all: true } }),
  ]);
  const n = (s: string) => grupos.find((g) => g.status === s)?._count._all ?? 0;
  const contadores = { abertos: n("ABERTO"), faturados: n("FATURADO"), cancelados: n("CANCELADO"), todos: grupos.reduce((a, g) => a + g._count._all, 0) };
  return { linhas: linhas.map(paraLinha), total, contadores, aba };
}

type ItemDb = {
  produtoId: string | null;
  produto: { codigo: string; descricao: string } | null;
  tipo: "PRODUTO" | "SERVICO";
  descricao: string;
  unidade: string;
  quantidade: Prisma.Decimal;
  precoUnitario: Prisma.Decimal;
  descontoPercentual: Prisma.Decimal;
  total: Prisma.Decimal;
};
const paraItem = (i: ItemDb): ItemDocumento => ({
  produtoId: i.produtoId,
  produtoRotulo: i.produto ? `${i.produto.codigo} · ${i.produto.descricao}` : null,
  produtoCodigo: i.produto?.codigo ?? null,
  tipo: i.tipo,
  descricao: i.descricao,
  unidade: i.unidade,
  quantidade: num(i.quantidade),
  precoUnitario: num(i.precoUnitario),
  descontoPercentual: num(i.descontoPercentual),
  total: num(i.total),
});

const incluirDetalhe = {
  empresa: { select: { nomeFantasia: true, razaoSocial: true } },
  pessoa: { select: { nome: true, nomeFantasia: true, documento: true } },
  vendedor: { select: { nome: true } },
  condicaoPagamento: { select: { nome: true, dias: true } },
  formaPagamento: { select: { nome: true } },
} as const;

/** Proposta ou pedido da empresa ativa (fora dela, como se não existisse). */
export async function obterDocumento(tipo: TipoDocumentoVenda, id: string): Promise<DocumentoVenda | null> {
  const escopo = await escopoEmpresa();
  const comum = (d: {
    id: string;
    numero: number;
    status: string;
    empresaId: string;
    empresa: { nomeFantasia: string | null; razaoSocial: string };
    pessoaId: string;
    pessoa: { nome: string; nomeFantasia: string | null; documento: string | null };
    vendedorId: string | null;
    vendedor: { nome: string } | null;
    emissao: Date;
    condicaoPagamentoId: string | null;
    condicaoPagamento: { nome: string; dias: string } | null;
    formaPagamentoId: string | null;
    formaPagamento: { nome: string } | null;
    observacoes: string | null;
    observacoesInternas: string | null;
    subtotal: Prisma.Decimal;
    desconto: Prisma.Decimal;
    total: Prisma.Decimal;
    createdAt: Date;
    itens: ItemDb[];
  }) => ({
    id: d.id,
    numero: d.numero,
    status: d.status as DocumentoVenda["status"],
    empresaId: d.empresaId,
    empresaNome: d.empresa.nomeFantasia || d.empresa.razaoSocial,
    pessoaId: d.pessoaId,
    pessoaNome: nomePessoa(d.pessoa),
    pessoaDocumento: d.pessoa.documento ? fmtDocumento(d.pessoa.documento) : null,
    vendedorId: d.vendedorId,
    vendedorNome: d.vendedor?.nome ?? null,
    emissao: isoReq(d.emissao),
    condicaoPagamentoId: d.condicaoPagamentoId,
    condicaoNome: d.condicaoPagamento?.nome ?? null,
    condicaoDias: d.condicaoPagamento?.dias ?? null,
    formaPagamentoId: d.formaPagamentoId,
    formaNome: d.formaPagamento?.nome ?? null,
    observacoes: d.observacoes,
    observacoesInternas: d.observacoesInternas,
    subtotal: num(d.subtotal),
    desconto: num(d.desconto),
    total: num(d.total),
    itens: d.itens.map(paraItem),
    criadoEm: d.createdAt.toISOString(),
  });
  const itens = { orderBy: { ordem: "asc" as const }, include: { produto: { select: { codigo: true, descricao: true } } } };

  if (tipo === "proposta") {
    const d = await prisma.proposta.findFirst({
      where: { id, empresaId: { in: escopo.ids } },
      include: { ...incluirDetalhe, itens, pedido: { select: { id: true, numero: true } }, oportunidade: { select: { id: true, titulo: true } } },
    });
    if (!d) return null;
    return { ...comum(d), tipo, validade: isoReq(d.validade), motivo: d.motivoRecusa, vinculo: d.pedido, oportunidade: d.oportunidade, titulos: [] };
  }
  const d = await prisma.pedido.findFirst({
    where: { id, empresaId: { in: escopo.ids } },
    include: { ...incluirDetalhe, itens, proposta: { select: { id: true, numero: true } } },
  });
  if (!d) return null;
  const titulos = await prisma.titulo.findMany({
    where: { origem: "VENDA", origemId: d.id, empresaId: { in: escopo.ids } },
    orderBy: [{ parcela: "asc" }],
    select: { id: true, numero: true, vencimento: true, valor: true, status: true },
  });
  return {
    ...comum(d),
    tipo,
    validade: null,
    motivo: d.motivoCancelamento,
    vinculo: d.proposta,
    oportunidade: null,
    titulos: titulos.map((t) => ({ id: t.id, numero: t.numero, vencimento: isoReq(t.vencimento), valor: num(t.valor), status: t.status })),
  };
}

/** Opções dos formulários de venda e do faturamento (cadastros da empresa ativa). */
export async function carregarOpcoesVenda(): Promise<OpcoesVenda> {
  const escopo = await escopoEmpresa();
  const matriz = escopo.ativa.id;
  const [condicoes, formas, vendedores, categorias, centros, contas] = await Promise.all([
    prisma.condicaoPagamento.findMany({ where: { empresaId: matriz, ativo: true }, orderBy: { nome: "asc" } }),
    prisma.formaPagamento.findMany({ where: { empresaId: matriz, ativo: true }, orderBy: { nome: "asc" } }),
    prisma.usuario.findMany({
      where: { ativo: true, OR: [{ todasEmpresas: true }, { empresas: { has: matriz } }] },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    prisma.categoria.findMany({ where: { empresaId: matriz, tipo: "RECEITA", ativo: true }, orderBy: [{ codigo: "asc" }, { nome: "asc" }] }),
    prisma.centroCusto.findMany({ where: { empresaId: matriz, ativo: true }, orderBy: [{ codigo: "asc" }, { nome: "asc" }] }),
    prisma.contaBancaria.findMany({ where: { empresaId: { in: escopo.ids }, ativo: true }, orderBy: { nome: "asc" } }),
  ]);
  const sugerir = (re: RegExp) => categorias.find((c) => re.test(c.nome.normalize("NFD").replace(/\p{M}/gu, "")))?.id ?? null;
  return {
    emitentes: [escopo.ativa, ...escopo.filiais].map((e, i) => ({ valor: e.id, rotulo: `${e.nome} · ${fmtDocumento(e.cnpj)}${i === 0 ? " (matriz)" : ""}` })),
    emitentePadraoId: escopo.ativa.id,
    condicoes: condicoes.map((c) => ({ valor: c.id, rotulo: c.nome, dias: c.dias })),
    formas: formas.map((f) => ({ valor: f.id, rotulo: f.nome })),
    vendedores: vendedores.map((v) => ({ valor: v.id, rotulo: v.nome })),
    categoriasReceita: categorias.map((c) => ({ valor: c.id, rotulo: `${c.codigo ? `${c.codigo} · ` : ""}${c.nome}` })),
    centros: centros.map((c) => ({ valor: c.id, rotulo: c.nome })),
    contas: contas.map((c) => ({ valor: c.id, rotulo: `${c.nome} (${ROTULOS.tipoConta[c.tipo]})` })),
    categoriaSugerida: { PRODUTO: sugerir(/venda de produt|mercadori/i), SERVICO: sugerir(/servi/i) },
  };
}
