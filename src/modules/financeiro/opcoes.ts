import { prisma } from "@/lib/db";
import { fmtDocumento } from "@/lib/format";
import { ROTULOS, type Opcao } from "@/lib/rotulos";

export type OpcoesFinanceiras = {
  categoriasReceita: Opcao[];
  categoriasDespesa: Opcao[];
  centros: Opcao[];
  contas: Opcao[];
  formas: Opcao[];
  empresas: Opcao[];
  /** id da empresa matriz (padrão dos lançamentos) */
  empresaPadraoId: string;
};

/** Opções ativas usadas nos formulários financeiros (selects). */
export async function carregarOpcoesFinanceiras(): Promise<OpcoesFinanceiras> {
  const [categorias, centros, contas, formas, empresas] = await Promise.all([
    prisma.categoria.findMany({ where: { ativo: true }, orderBy: [{ codigo: "asc" }, { nome: "asc" }] }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: [{ codigo: "asc" }, { nome: "asc" }] }),
    prisma.contaBancaria.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.formaPagamento.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.empresa.findMany({ where: { ativo: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const cat = (tipo: "RECEITA" | "DESPESA") =>
    categorias
      .filter((c) => c.tipo === tipo)
      .map((c) => ({ valor: c.id, rotulo: `${c.codigo ? `${c.codigo} · ` : ""}${c.nome}` }));
  return {
    categoriasReceita: cat("RECEITA"),
    categoriasDespesa: cat("DESPESA"),
    centros: centros.map((c) => ({ valor: c.id, rotulo: c.nome })),
    contas: contas.map((c) => ({ valor: c.id, rotulo: `${c.nome} (${ROTULOS.tipoConta[c.tipo]})` })),
    formas: formas.map((f) => ({ valor: f.id, rotulo: f.nome })),
    empresas: empresas.map((e) => ({ valor: e.id, rotulo: `${e.nomeFantasia || e.razaoSocial} · ${fmtDocumento(e.cnpj)}` })),
    empresaPadraoId: empresas.find((e) => !e.matrizId)?.id ?? empresas[0]?.id ?? "",
  };
}
