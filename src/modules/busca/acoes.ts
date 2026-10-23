"use server";

import { escopoEmpresa } from "@/lib/auth/empresa";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { fmtDocumento, fmtMoeda, soDigitos } from "@/lib/format";
import { saldosParaBusca } from "@/modules/estoque/consultas";

export type ResultadoBusca = { tipo: string; titulo: string; detalhe: string; href: string };

export async function buscaGlobal(termo: string): Promise<ResultadoBusca[]> {
  const u = await usuarioAtual();
  const q = termo.trim();
  if (!u || q.length < 2) return [];
  const digitos = soDigitos(q);
  const out: ResultadoBusca[] = [];

  const escopo = await escopoEmpresa();
  if (pode(u.papel, "cadastros:ver")) {
    const pessoas = await prisma.pessoa.findMany({
      where: {
        empresaId: escopo.ativa.id,
        OR: [
          { nome: { contains: q, mode: "insensitive" } },
          { nomeFantasia: { contains: q, mode: "insensitive" } },
          ...(digitos.length >= 3 ? [{ documento: { contains: digitos } }] : []),
        ],
      },
      take: 5,
      orderBy: { nome: "asc" },
    });
    for (const p of pessoas) {
      out.push({
        tipo: p.cliente && p.fornecedor ? "Cliente/fornecedor" : p.fornecedor ? "Fornecedor" : "Cliente",
        titulo: p.nomeFantasia || p.nome,
        detalhe: fmtDocumento(p.documento) || p.email || "",
        href: `/cadastros/pessoas?q=${encodeURIComponent(p.nome)}`,
      });
    }
    const produtos = await prisma.produto.findMany({
      where: {
        empresaId: escopo.ativa.id,
        OR: [{ descricao: { contains: q, mode: "insensitive" } }, { codigo: { contains: q, mode: "insensitive" } }],
      },
      take: 4,
    });
    for (const p of produtos) {
      out.push({
        tipo: p.tipo === "SERVICO" ? "Serviço" : "Produto",
        titulo: p.descricao,
        detalhe: `${p.codigo} · ${fmtMoeda(Number(p.precoVenda))}`,
        href: `/cadastros/produtos?q=${encodeURIComponent(p.codigo)}`,
      });
    }
  }

  if (pode(u.papel, "financeiro:ver")) {
    const numero = /^\d+$/.test(q) ? Number(q) : null;
    const titulos = await prisma.titulo.findMany({
      where: {
        empresaId: { in: escopo.ids },
        OR: [
          { descricao: { contains: q, mode: "insensitive" } },
          { documento: { contains: q, mode: "insensitive" } },
          ...(numero ? [{ numero }] : []),
        ],
      },
      include: { pessoa: { select: { nome: true } } },
      orderBy: { vencimento: "desc" },
      take: 6,
    });
    for (const t of titulos) {
      out.push({
        tipo: t.tipo === "RECEBER" ? "A receber" : "A pagar",
        titulo: `#${t.numero} · ${t.descricao}`,
        detalhe: `${t.pessoa?.nome ?? "Sem pessoa"} · ${fmtMoeda(Number(t.valor))}`,
        href: `/financeiro/titulos/${t.id}`,
      });
    }
  }
  return out;
}

export type PessoaResumo = { id: string; nome: string; detalhe: string };

/** Busca de clientes/fornecedores para seletores (mínimo 2 caracteres). */
export async function buscarPessoas(termo: string, papel?: "cliente" | "fornecedor"): Promise<PessoaResumo[]> {
  const u = await usuarioAtual();
  if (!u) return [];
  const q = termo.trim();
  const digitos = soDigitos(q);
  const escopo = await escopoEmpresa();
  const pessoas = await prisma.pessoa.findMany({
    where: {
      empresaId: escopo.ativa.id,
      ativo: true,
      ...(papel === "cliente" ? { cliente: true } : papel === "fornecedor" ? { fornecedor: true } : {}),
      ...(q
        ? {
            OR: [
              { nome: { contains: q, mode: "insensitive" } },
              { nomeFantasia: { contains: q, mode: "insensitive" } },
              ...(digitos.length >= 3 ? [{ documento: { contains: digitos } }] : []),
            ],
          }
        : {}),
    },
    orderBy: { nome: "asc" },
    take: 15,
  });
  return pessoas.map((p) => ({
    id: p.id,
    nome: p.nomeFantasia ? `${p.nomeFantasia} (${p.nome})` : p.nome,
    detalhe: [fmtDocumento(p.documento), p.cidade && `${p.cidade}/${p.uf ?? ""}`].filter(Boolean).join(" · "),
  }));
}

/** `saldo`: soma do estoque na empresa ativa (matriz e filiais); null quando o produto não controla estoque. */
export type ProdutoResumo = { id: string; codigo: string; descricao: string; tipo: "PRODUTO" | "SERVICO"; unidade: string; precoVenda: number; saldo: number | null };

/** Busca de produtos e serviços ativos da empresa ativa, para os itens de propostas e pedidos. */
export async function buscarProdutos(termo: string): Promise<ProdutoResumo[]> {
  const u = await usuarioAtual();
  if (!u) return [];
  const q = termo.trim();
  const escopo = await escopoEmpresa();
  const produtos = await prisma.produto.findMany({
    where: {
      empresaId: escopo.ativa.id,
      ativo: true,
      ...(q ? { OR: [{ descricao: { contains: q, mode: "insensitive" } }, { codigo: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { descricao: "asc" },
    take: 20,
  });
  const comEstoque = produtos.filter((p) => p.tipo === "PRODUTO" && p.controlaEstoque).map((p) => p.id);
  const saldos = await saldosParaBusca(comEstoque, escopo);
  return produtos.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    descricao: p.descricao,
    tipo: p.tipo,
    unidade: p.unidade,
    precoVenda: Number(p.precoVenda),
    saldo: comEstoque.includes(p.id) ? (saldos.get(p.id) ?? 0) : null,
  }));
}

