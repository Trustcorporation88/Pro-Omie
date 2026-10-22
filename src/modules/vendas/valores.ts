// Valores dos formulários de proposta e pedido (seguro para client e server).
import { addDias } from "@/lib/datas";
import { fmtDecimal } from "./calculos";
import type { DocumentoVenda, OpcoesVenda } from "./tipos";

export type LinhaDocumentoForm = {
  produtoId: string | null;
  produtoRotulo: string | null;
  tipo: "PRODUTO" | "SERVICO";
  descricao: string;
  unidade: string;
  quantidade: string;
  precoUnitario: string;
  descontoPercentual: string;
};

export type ValoresDocumento = {
  /** proposta aberta a partir de uma oportunidade do CRM */
  oportunidadeId: string | null;
  oportunidadeTitulo: string | null;
  empresaId: string;
  pessoaId: string | null;
  pessoaNome: string | null;
  vendedorId: string;
  emissao: string;
  validade: string;
  condicaoPagamentoId: string;
  formaPagamentoId: string;
  observacoes: string;
  observacoesInternas: string;
  itens: LinhaDocumentoForm[];
};

export const linhaVazia = (): LinhaDocumentoForm => ({
  produtoId: null,
  produtoRotulo: null,
  tipo: "SERVICO",
  descricao: "",
  unidade: "UN",
  quantidade: "1",
  precoUnitario: "",
  descontoPercentual: "",
});

/** Valores de um documento novo: empresa ativa, hoje, validade de 15 dias e o usuário como responsável. */
export function valoresNovos(opcoes: OpcoesVenda, hoje: string, vendedorId: string): ValoresDocumento {
  return {
    oportunidadeId: null,
    oportunidadeTitulo: null,
    empresaId: opcoes.emitentePadraoId,
    pessoaId: null,
    pessoaNome: null,
    vendedorId: opcoes.vendedores.some((x) => x.valor === vendedorId) ? vendedorId : (opcoes.vendedores[0]?.valor ?? ""),
    emissao: hoje,
    validade: addDias(hoje, 15),
    condicaoPagamentoId: "",
    formaPagamentoId: "",
    observacoes: "",
    observacoesInternas: "",
    itens: [],
  };
}

/** Valores para editar (ou duplicar) um documento existente. */
export function valoresDoDocumento(d: DocumentoVenda, hoje: string): ValoresDocumento {
  return {
    oportunidadeId: d.oportunidade?.id ?? null,
    oportunidadeTitulo: d.oportunidade?.titulo ?? null,
    empresaId: d.empresaId,
    pessoaId: d.pessoaId,
    pessoaNome: d.pessoaNome,
    vendedorId: d.vendedorId ?? "",
    emissao: d.emissao,
    validade: d.validade ?? addDias(hoje, 15),
    condicaoPagamentoId: d.condicaoPagamentoId ?? "",
    formaPagamentoId: d.formaPagamentoId ?? "",
    observacoes: d.observacoes ?? "",
    observacoesInternas: d.observacoesInternas ?? "",
    itens: d.itens.map((i) => ({
      produtoId: i.produtoId,
      produtoRotulo: i.produtoRotulo,
      tipo: i.tipo,
      descricao: i.descricao,
      unidade: i.unidade,
      quantidade: fmtDecimal(i.quantidade, 0, 3),
      precoUnitario: fmtDecimal(i.precoUnitario, 2, 4),
      descontoPercentual: i.descontoPercentual ? fmtDecimal(i.descontoPercentual, 0, 2) : "",
    })),
  };
}
