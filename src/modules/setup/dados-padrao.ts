import type { Prisma } from "@/lib/db";
import type { GrupoDRE, MeioPagamento, TipoCategoria } from "@/generated/prisma/enums";

type Cat = [nome: string, tipo: TipoCategoria, grupo: GrupoDRE, codigo: string];

const CATEGORIAS: Cat[] = [
  ["Venda de produtos", "RECEITA", "RECEITA_BRUTA", "1.01"],
  ["Prestação de serviços", "RECEITA", "RECEITA_BRUTA", "1.02"],
  ["Receitas financeiras", "RECEITA", "RECEITAS_FINANCEIRAS", "1.03"],
  ["Outras receitas", "RECEITA", "OUTRAS_RECEITAS", "1.04"],
  ["Aporte de sócios", "RECEITA", "NAO_OPERACIONAL", "1.05"],
  ["Empréstimos recebidos", "RECEITA", "NAO_OPERACIONAL", "1.06"],
  ["Impostos sobre vendas (DAS, ICMS, ISS, PIS, COFINS)", "DESPESA", "DEDUCOES", "2.01"],
  ["Devoluções e cancelamentos", "DESPESA", "DEDUCOES", "2.02"],
  ["Compra de mercadorias", "DESPESA", "CUSTOS", "3.01"],
  ["Custo dos serviços prestados", "DESPESA", "CUSTOS", "3.02"],
  ["Salários e encargos", "DESPESA", "DESPESAS_PESSOAL", "4.01"],
  ["Pró-labore", "DESPESA", "DESPESAS_PESSOAL", "4.02"],
  ["Benefícios (VT, VR, plano de saúde)", "DESPESA", "DESPESAS_PESSOAL", "4.03"],
  ["Aluguel e condomínio", "DESPESA", "DESPESAS_ADMINISTRATIVAS", "5.01"],
  ["Energia, água e internet", "DESPESA", "DESPESAS_ADMINISTRATIVAS", "5.02"],
  ["Contabilidade e honorários", "DESPESA", "DESPESAS_ADMINISTRATIVAS", "5.03"],
  ["Softwares e assinaturas", "DESPESA", "DESPESAS_ADMINISTRATIVAS", "5.04"],
  ["Material de escritório e limpeza", "DESPESA", "DESPESAS_ADMINISTRATIVAS", "5.05"],
  ["Marketing e publicidade", "DESPESA", "DESPESAS_COMERCIAIS", "6.01"],
  ["Comissões de vendas", "DESPESA", "DESPESAS_COMERCIAIS", "6.02"],
  ["Fretes e entregas", "DESPESA", "DESPESAS_COMERCIAIS", "6.03"],
  ["Tarifas bancárias", "DESPESA", "DESPESAS_FINANCEIRAS", "7.01"],
  ["Juros e multas pagos", "DESPESA", "DESPESAS_FINANCEIRAS", "7.02"],
  ["IRPJ e CSLL", "DESPESA", "IMPOSTOS_LUCRO", "8.01"],
  ["Outras despesas", "DESPESA", "OUTRAS_DESPESAS", "9.01"],
  ["Investimentos e imobilizado", "DESPESA", "NAO_OPERACIONAL", "9.02"],
  ["Distribuição de lucros", "DESPESA", "NAO_OPERACIONAL", "9.03"],
  ["Pagamento de empréstimos", "DESPESA", "NAO_OPERACIONAL", "9.04"],
];

const FORMAS: [string, MeioPagamento][] = [
  ["PIX", "PIX"],
  ["Boleto", "BOLETO"],
  ["Transferência (TED)", "TRANSFERENCIA"],
  ["Cartão de crédito", "CARTAO_CREDITO"],
  ["Cartão de débito", "CARTAO_DEBITO"],
  ["Dinheiro", "DINHEIRO"],
  ["Débito automático", "DEBITO_AUTOMATICO"],
];

const CONDICOES: [string, string][] = [
  ["À vista", "0"],
  ["30 dias", "30"],
  ["30/60", "30,60"],
  ["30/60/90", "30,60,90"],
  ["Entrada + 30/60", "0,30,60"],
];

/** Plano de categorias, formas e condições de pagamento, centros de custo e conta Caixa. */
export async function criarDadosPadrao(tx: Prisma.TransactionClient, empresaId: string, hoje: Date) {
  await tx.categoria.createMany({
    data: CATEGORIAS.map(([nome, tipo, grupoDre, codigo]) => ({ nome, tipo, grupoDre, codigo })),
    skipDuplicates: true,
  });
  await tx.formaPagamento.createMany({ data: FORMAS.map(([nome, meio]) => ({ nome, meio })), skipDuplicates: true });
  await tx.condicaoPagamento.createMany({ data: CONDICOES.map(([nome, dias]) => ({ nome, dias })), skipDuplicates: true });
  await tx.centroCusto.createMany({
    data: [
      { nome: "Administrativo", codigo: "01" },
      { nome: "Comercial", codigo: "02" },
      { nome: "Operacional", codigo: "03" },
    ],
    skipDuplicates: true,
  });
  await tx.contaBancaria.create({
    data: { empresaId, nome: "Caixa", tipo: "CAIXA", saldoInicial: 0, dataSaldoInicial: hoje },
  });
}
