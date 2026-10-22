import { escopoEmpresa } from "@/lib/auth/empresa";
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
  /** id da empresa ativa (padrão dos lançamentos) */
  empresaPadraoId: string;
};

/** Opções ativas usadas nos formulários financeiros (selects). */
export async function carregarOpcoesFinanceiras(): Promise<OpcoesFinanceiras> {
  const escopo = await escopoEmpresa();
  const [categorias, centros, contas, formas] = await Promise.all([
    prisma.categoria.findMany({ where: { ativo: true, empresaId: escopo.ativa.id }, orderBy: [{ codigo: "asc" }, { nome: "asc" }] }),
    prisma.centroCusto.findMany({ where: { ativo: true, empresaId: escopo.ativa.id }, orderBy: [{ codigo: "asc" }, { nome: "asc" }] }),
    prisma.contaBancaria.findMany({ where: { ativo: true, empresaId: { in: escopo.ids } }, orderBy: { nome: "asc" } }),
    prisma.formaPagamento.findMany({ where: { ativo: true, empresaId: escopo.ativa.id }, orderBy: { nome: "asc" } }),
  ]);
  // Empresa do lançamento: a matriz ativa e as filiais dela (outra empresa do grupo troca-se no menu).
  const empresas = [escopo.ativa, ...escopo.filiais];
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
    empresas: empresas.map((e) => ({ valor: e.id, rotulo: `${e.nome} · ${fmtDocumento(e.cnpj)}` })),
    empresaPadraoId: escopo.ativa.id,
  };
}
