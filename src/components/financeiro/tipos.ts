// Tipos e utilitários do financeiro compartilhados entre servidor e componentes client.
// Seguro para client e server: só tipos e funções puras (sem Prisma, sem Decimal, sem Date).
import type { OrigemMovimento, OrigemTitulo, StatusTitulo, TipoMovimento, TipoTitulo } from "@/generated/prisma/enums";
import type { OpcoesFinanceiras } from "@/modules/financeiro/opcoes";

export type { TipoTitulo, StatusTitulo };

// ───────────── Filtros da lista ─────────────

export type StatusFiltro = "abertos" | "vencidos" | "quitados" | "cancelados" | "todos";
export const STATUS_FILTRO: StatusFiltro[] = ["abertos", "vencidos", "quitados", "cancelados", "todos"];
export const POR_PAGINA_TITULOS = 50;

export type FiltrosTitulos = {
  status: StatusFiltro;
  de: string | null;
  ate: string | null;
  q: string;
  categoria: string | null;
  conta: string | null;
  pagina: number;
  porPagina: number;
};

// ───────────── Situação (status de exibição) ─────────────

export type Situacao = "aberto" | "vencido" | "parcial" | "quitado" | "cancelado";

export function situacaoTitulo(status: StatusTitulo, vencimento: string, hoje: string): Situacao {
  if (status === "CANCELADO") return "cancelado";
  if (status === "QUITADO") return "quitado";
  if (status === "PARCIAL") return "parcial";
  return vencimento < hoje ? "vencido" : "aberto";
}

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  aberto: "Em aberto",
  vencido: "Vencido",
  parcial: "Parcial",
  quitado: "Quitado",
  cancelado: "Cancelado",
};

export function estaAberto(status: StatusTitulo): boolean {
  return status === "ABERTO" || status === "PARCIAL";
}

// ───────────── Textos por tipo ─────────────

export const TEXTOS = {
  RECEBER: {
    singular: "conta a receber",
    Singular: "Conta a receber",
    plural: "Contas a receber",
    pessoa: "Cliente",
    papel: "cliente",
    baixar: "Receber",
    baixado: "Recebido",
    jaBaixado: "Já foi recebido",
    baixa: "Recebimento",
    baixarSelecionados: "Receber selecionados",
    novo: "Nova conta a receber",
    rota: "/financeiro/receber",
    descricao: "Títulos a receber de clientes: vencimentos, recebimentos e saldos.",
  },
  PAGAR: {
    singular: "conta a pagar",
    Singular: "Conta a pagar",
    plural: "Contas a pagar",
    pessoa: "Fornecedor",
    papel: "fornecedor",
    baixar: "Pagar",
    baixado: "Pago",
    jaBaixado: "Já foi pago",
    baixa: "Pagamento",
    baixarSelecionados: "Pagar selecionados",
    novo: "Nova conta a pagar",
    rota: "/financeiro/pagar",
    descricao: "Títulos a pagar a fornecedores: vencimentos, pagamentos e saldos.",
  },
} as const satisfies Record<TipoTitulo, Record<string, string>>;

// ───────────── Opções de formulário ─────────────

export type CondicaoOpcao = { id: string; nome: string; dias: string };
export type OpcoesFormulario = OpcoesFinanceiras & { condicoes: CondicaoOpcao[] };

export type RateioForm = { categoriaId: string; centroCustoId: string | null; percentual: number };

// ───────────── Títulos ─────────────

export type TituloLinha = {
  id: string;
  numero: number;
  tipo: TipoTitulo;
  status: StatusTitulo;
  empresaId: string;
  pessoaId: string | null;
  pessoaNome: string | null;
  descricao: string;
  documento: string | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  centroCustoId: string | null;
  contaBancariaId: string | null;
  formaPagamentoId: string | null;
  emissao: string;
  competencia: string;
  vencimento: string;
  valor: number;
  valorPago: number;
  /** valor − pago (0 para cancelados) */
  saldo: number;
  parcela: number;
  totalParcelas: number;
  observacoes: string | null;
  rateios: RateioForm[];
  /** total de baixas, inclusive estornadas (exclusão só sem nenhuma) */
  qtdBaixas: number;
};

export type ListagemTitulos = {
  linhas: TituloLinha[];
  total: number;
  contadores: Record<StatusFiltro, number>;
};

export type ResumoValor = { valor: number; qtd: number };
export type ResumoTitulos = {
  aberto: ResumoValor;
  vencido: ResumoValor;
  venceHoje: ResumoValor;
  proximos7: ResumoValor;
  quitadoMes: ResumoValor;
};

export type BaixaDetalhe = {
  id: string;
  data: string;
  contaNome: string;
  formaNome: string | null;
  valor: number;
  juros: number;
  multa: number;
  desconto: number;
  valorTotal: number;
  observacao: string | null;
  estornada: boolean;
  estornadaEm: string | null;
  conciliada: boolean;
  criadoPorNome: string | null;
  createdAt: string;
};

export type AnexoResumo = {
  id: string;
  nome: string;
  mimeType: string;
  tamanho: number;
  criadoPorNome: string | null;
  createdAt: string;
};

export type ParcelaGrupo = {
  id: string;
  numero: number;
  parcela: number;
  totalParcelas: number;
  vencimento: string;
  valor: number;
  status: StatusTitulo;
};

export type RegistroHistorico = {
  id: string;
  acao: string;
  entidade: string;
  resumo: string | null;
  usuarioNome: string | null;
  createdAt: string;
};

export type TituloDetalhe = TituloLinha & {
  origem: OrigemTitulo;
  origemId: string | null;
  grupoId: string | null;
  empresaNome: string;
  pessoaDocumento: string | null;
  contaNome: string | null;
  formaNome: string | null;
  centroCustoNome: string | null;
  quitadoEm: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
  criadoPorNome: string | null;
  createdAt: string;
  rateiosDetalhe: { categoriaNome: string; centroNome: string | null; percentual: number; valor: number }[];
  baixas: BaixaDetalhe[];
  anexos: AnexoResumo[];
  parcelasGrupo: ParcelaGrupo[];
  historico: RegistroHistorico[];
};

// ───────────── Movimentações ─────────────

export type ExtratoLinha = {
  id: string;
  data: string;
  tipo: TipoMovimento;
  valor: number;
  descricao: string;
  origem: OrigemMovimento | "INICIAL";
  conciliado: boolean;
  tituloId: string | null;
  tituloNumero: number | null;
  pessoaNome: string | null;
  transferenciaId: string | null;
  /** nome da outra conta da transferência */
  contraparte: string | null;
  /** saldo acumulado após o movimento */
  saldo: number;
};

export type Extrato = {
  conta: { id: string; nome: string; tipo: string; ativo: boolean; banco: string | null };
  de: string;
  ate: string;
  saldoAnterior: number;
  entradas: number;
  saidas: number;
  saldoFinal: number;
  saldoInicialNoPeriodo: { data: string; valor: number } | null;
  linhas: ExtratoLinha[];
  truncado: boolean;
};

// ───────────── Formulário de lançamento ─────────────

export type ValoresLancamento = {
  pessoaId: string | null;
  pessoaNome: string | null;
  descricao: string;
  documento: string;
  empresaId: string;
  valor: number;
  emissao: string;
  competencia: string;
  vencimento: string;
  contaBancariaId: string;
  formaPagamentoId: string;
  observacoes: string;
  rateios: RateioForm[];
};

/** Valores do formulário a partir de um título (edição ou duplicação). */
export function valoresDeTitulo(t: TituloLinha, modo: "editar" | "duplicar", hoje: string): ValoresLancamento {
  const rateios: RateioForm[] = t.rateios.length
    ? t.rateios.map((r) => ({ categoriaId: r.categoriaId, centroCustoId: r.centroCustoId, percentual: r.percentual }))
    : [{ categoriaId: t.categoriaId ?? "", centroCustoId: t.centroCustoId, percentual: 100 }];
  return {
    pessoaId: t.pessoaId,
    pessoaNome: t.pessoaNome,
    descricao: t.descricao,
    documento: t.documento ?? "",
    empresaId: t.empresaId,
    valor: t.valor,
    emissao: modo === "duplicar" ? hoje : t.emissao,
    competencia: modo === "duplicar" ? hoje : t.competencia,
    vencimento: t.vencimento,
    contaBancariaId: t.contaBancariaId ?? "",
    formaPagamentoId: t.formaPagamentoId ?? "",
    observacoes: t.observacoes ?? "",
    rateios,
  };
}

// ───────────── Anexos ─────────────

export const ANEXO_TAMANHO_MAX = 5 * 1024 * 1024;

/** Extensões aceitas e o Content-Type gravado (não confiamos no tipo informado pelo navegador). */
export const ANEXO_TIPOS: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  xml: "application/xml",
  ofx: "application/x-ofx",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const ANEXO_ACCEPT = Object.keys(ANEXO_TIPOS)
  .map((e) => `.${e}`)
  .join(",");

export function extensaoArquivo(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i >= 0 ? nome.slice(i + 1).toLowerCase() : "";
}

export function fmtTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

// ───────────── Histórico ─────────────

const ROTULO_ACAO: Record<string, string> = {
  "titulo:criar": "Título criado",
  "titulo:editar": "Título editado",
  "titulo:cancelar": "Título cancelado",
  "titulo:reabrir": "Título reaberto",
  "titulo:excluir": "Título excluído",
  "baixa:baixar": "Baixa registrada",
  "baixa:estornar": "Baixa estornada",
  "anexo:anexar": "Anexo incluído",
  "anexo:excluir": "Anexo excluído",
};

export function rotuloAcao(entidade: string, acao: string): string {
  const r = ROTULO_ACAO[`${entidade}:${acao}`];
  if (r) return r;
  const texto = `${acao} ${entidade}`.replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
