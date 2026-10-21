// Tipos serializáveis da conciliação bancária (servidor → componentes client). Sem Decimal/Date.

export type StatusItem = "PENDENTE" | "CONCILIADO" | "IGNORADO";
export type TipoLancamento = "RECEBER" | "PAGAR";
export type OrigemMov = "BAIXA" | "TRANSFERENCIA" | "AJUSTE";

export type ItemExtrato = {
  id: string;
  /** 'YYYY-MM-DD' */
  data: string;
  /** com sinal: crédito > 0, débito < 0 */
  valor: number;
  descricao: string;
  documento: string | null;
  status: StatusItem;
};

export type SugestaoMovimento = {
  movimentoId: string;
  data: string;
  valor: number;
  descricao: string;
  origem: OrigemMov;
  /** diferença absoluta em dias entre o extrato e o movimento */
  distancia: number;
};

export type SugestaoTitulo = {
  tituloId: string;
  numero: number;
  tipo: TipoLancamento;
  descricao: string;
  pessoa: string | null;
  vencimento: string;
  /** saldo em aberto (valor − valorPago) */
  saldo: number;
  distancia: number;
  /** a conta prevista no título é a conta do extrato */
  mesmaConta: boolean;
  /** nome da conta prevista quando é outra conta */
  outraConta: string | null;
};

export type SugestaoRegra = {
  regraId: string;
  termo: string;
  categoriaId: string;
  categoria: string;
  pessoaId: string | null;
  pessoa: string | null;
  centroCustoId: string | null;
  centroCusto: string | null;
};

export type SugestoesItem = {
  movimento: SugestaoMovimento | null;
  titulo: SugestaoTitulo | null;
  regra: SugestaoRegra | null;
};

export type LinhaPendente = ItemExtrato & { sugestoes: SugestoesItem };

export type MovimentoVinculado = {
  id: string;
  data: string;
  valor: number;
  tipo: "CREDITO" | "DEBITO";
  descricao: string;
  origem: OrigemMov;
  titulo: { id: string; numero: number; tipo: TipoLancamento } | null;
};

export type LinhaConciliada = ItemExtrato & { movimento: MovimentoVinculado | null };

export type RegraResumo = {
  id: string;
  termo: string;
  tipo: TipoLancamento | null;
  categoriaId: string;
  categoria: string;
  pessoaId: string | null;
  pessoa: string | null;
  centroCustoId: string | null;
  centroCusto: string | null;
  ativo: boolean;
};

export type ContaConciliacao = {
  id: string;
  nome: string;
  tipo: string;
  bancoCodigo: string | null;
  bancoNome: string | null;
  agencia: string | null;
  numero: string | null;
};

export type ResumoConta = {
  /** saldo atual no sistema (todos os movimentos) */
  saldoAtual: number;
  /** último saldo informado pelo banco (LEDGERBAL da importação mais recente com saldo) */
  extrato: { saldo: number; data: string | null; arquivo: string } | null;
  /** saldo do sistema na data do saldo do extrato */
  saldoSistemaNaData: number | null;
  /** extrato − sistema (na mesma data) */
  diferenca: number | null;
  contadores: { pendentes: number; conciliados: number; ignorados: number };
  ultimaImportacao: {
    arquivo: string;
    /** data e hora ISO da importação */
    criadoEm: string;
    inicio: string | null;
    fim: string | null;
    total: number;
    novos: number;
  } | null;
};

export type ResultadoImportacao = {
  importacaoId: string;
  arquivo: string;
  contaId: string;
  contaNome: string;
  total: number;
  novos: number;
  duplicados: number;
  inicio: string | null;
  fim: string | null;
  saldo: number | null;
  avisos: string[];
};

export type MovimentoOpcao = {
  id: string;
  data: string;
  valor: number;
  descricao: string;
  origem: OrigemMov;
  distancia: number;
  mesmoValor: boolean;
};

export type OpcoesConciliacao = {
  categoriasReceita: { valor: string; rotulo: string }[];
  categoriasDespesa: { valor: string; rotulo: string }[];
  centros: { valor: string; rotulo: string }[];
};

export type EntradaLancamento = {
  itemId: string;
  descricao: string;
  categoriaId: string;
  pessoaId?: string | null;
  centroCustoId?: string | null;
  /** cria (ou atualiza) uma regra para descrições parecidas */
  regra?: { termo: string } | null;
};

export type EntradaRegra = {
  termo: string;
  tipo: TipoLancamento | null;
  categoriaId: string;
  pessoaId?: string | null;
  centroCustoId?: string | null;
};
