// Tipos de propostas e pedidos compartilhados entre servidor e telas (só dados serializáveis).
import type { Opcao } from "@/lib/rotulos";

export type TipoDocumentoVenda = "proposta" | "pedido";
export type StatusPropostaT = "RASCUNHO" | "ENVIADA" | "APROVADA" | "RECUSADA" | "CANCELADA";
export type StatusPedidoT = "ABERTO" | "FATURADO" | "CANCELADO";

export type ItemDocumento = {
  produtoId: string | null;
  produtoRotulo: string | null;
  produtoCodigo: string | null;
  tipo: "PRODUTO" | "SERVICO";
  descricao: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
  descontoPercentual: number;
  total: number;
};

export type DocumentoVenda = {
  id: string;
  tipo: TipoDocumentoVenda;
  numero: number;
  status: StatusPropostaT | StatusPedidoT;
  empresaId: string;
  empresaNome: string;
  pessoaId: string;
  pessoaNome: string;
  pessoaDocumento: string | null;
  vendedorId: string | null;
  vendedorNome: string | null;
  emissao: string;
  validade: string | null;
  condicaoPagamentoId: string | null;
  condicaoNome: string | null;
  condicaoDias: string | null;
  formaPagamentoId: string | null;
  formaNome: string | null;
  observacoes: string | null;
  observacoesInternas: string | null;
  subtotal: number;
  desconto: number;
  total: number;
  motivo: string | null;
  itens: ItemDocumento[];
  /** proposta: pedido gerado a partir dela; pedido: proposta de origem */
  vinculo: { id: string; numero: number } | null;
  /** proposta: oportunidade do CRM de onde saiu */
  oportunidade: { id: string; titulo: string } | null;
  /** pedido faturado: títulos gerados */
  titulos: { id: string; numero: number; vencimento: string; valor: number; status: string }[];
  criadoEm: string;
};

export type LinhaDocumento = {
  id: string;
  numero: number;
  status: StatusPropostaT | StatusPedidoT;
  pessoaNome: string;
  vendedorNome: string | null;
  emissao: string;
  validade: string | null;
  total: number;
  empresaNome: string;
};

export type OpcoesVenda = {
  emitentes: Opcao[];
  emitentePadraoId: string;
  condicoes: (Opcao & { dias: string })[];
  formas: Opcao[];
  vendedores: Opcao[];
  categoriasReceita: Opcao[];
  centros: Opcao[];
  contas: Opcao[];
  /** categorias sugeridas no faturamento (por nome: venda de produtos / receita de serviços) */
  categoriaSugerida: { PRODUTO: string | null; SERVICO: string | null };
};

export const ROTULO_STATUS: Record<StatusPropostaT | StatusPedidoT, string> = {
  RASCUNHO: "Rascunho",
  ENVIADA: "Enviada",
  APROVADA: "Aprovada",
  RECUSADA: "Recusada",
  CANCELADA: "Cancelada",
  ABERTO: "Aberto",
  FATURADO: "Faturado",
  CANCELADO: "Cancelado",
};

export const TOM_STATUS: Record<StatusPropostaT | StatusPedidoT, "neutro" | "info" | "sucesso" | "alerta" | "perigo"> = {
  RASCUNHO: "neutro",
  ENVIADA: "info",
  APROVADA: "sucesso",
  RECUSADA: "perigo",
  CANCELADA: "neutro",
  ABERTO: "info",
  FATURADO: "sucesso",
  CANCELADO: "neutro",
};
