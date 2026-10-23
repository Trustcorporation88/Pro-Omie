// Rótulos em português para os enums do banco. Seguro para client e server.

export const ROTULOS = {
  tipoPessoa: { JURIDICA: "Pessoa jurídica", FISICA: "Pessoa física", ESTRANGEIRA: "Estrangeiro" },
  indicadorIE: { CONTRIBUINTE: "Contribuinte de ICMS", ISENTO: "Contribuinte isento", NAO_CONTRIBUINTE: "Não contribuinte" },
  tipoProduto: { PRODUTO: "Produto", SERVICO: "Serviço" },
  grupoMaterial: {
    PAPEL: "Papel e papelão",
    PLASTICO: "Plásticos",
    METAL_NAO_FERROSO: "Metais não ferrosos",
    METAL_FERROSO: "Metais ferrosos",
    METAL_PRECIOSO: "Metais preciosos",
    VIDRO: "Vidro",
    ELETRONICO: "Eletroeletrônicos",
    OUTROS: "Outros materiais",
  },
  tipoCategoria: { RECEITA: "Receita", DESPESA: "Despesa" },
  grupoDre: {
    RECEITA_BRUTA: "Receita bruta",
    DEDUCOES: "Deduções da receita",
    CUSTOS: "Custos (CMV/CSP)",
    DESPESAS_PESSOAL: "Despesas com pessoal",
    DESPESAS_ADMINISTRATIVAS: "Despesas administrativas",
    DESPESAS_COMERCIAIS: "Despesas comerciais",
    RECEITAS_FINANCEIRAS: "Receitas financeiras",
    DESPESAS_FINANCEIRAS: "Despesas financeiras",
    OUTRAS_RECEITAS: "Outras receitas",
    OUTRAS_DESPESAS: "Outras despesas",
    IMPOSTOS_LUCRO: "IRPJ e CSLL",
    NAO_OPERACIONAL: "Não operacional (fora da DRE)",
  },
  tipoConta: {
    CORRENTE: "Conta corrente",
    POUPANCA: "Poupança",
    CAIXA: "Caixa (dinheiro)",
    CARTAO_CREDITO: "Cartão de crédito",
    INVESTIMENTO: "Investimento",
    CONTA_PAGAMENTO: "Conta de pagamento",
  },
  meioPagamento: {
    PIX: "PIX",
    BOLETO: "Boleto",
    TRANSFERENCIA: "Transferência",
    CARTAO_CREDITO: "Cartão de crédito",
    CARTAO_DEBITO: "Cartão de débito",
    DINHEIRO: "Dinheiro",
    CHEQUE: "Cheque",
    DEBITO_AUTOMATICO: "Débito automático",
    OUTRO: "Outro",
  },
  statusTitulo: { ABERTO: "Em aberto", PARCIAL: "Parcial", QUITADO: "Quitado", CANCELADO: "Cancelado" },
  origemTitulo: {
    MANUAL: "Manual",
    RECORRENCIA: "Recorrência",
    CONCILIACAO: "Conciliação",
    VENDA: "Venda",
    COMPRA: "Compra",
    CONTRATO: "Contrato",
    NOTA_FISCAL: "Nota fiscal",
  },
  regimeTributario: {
    SIMPLES_NACIONAL: "Simples Nacional",
    MEI: "MEI",
    LUCRO_PRESUMIDO: "Lucro Presumido",
    LUCRO_REAL: "Lucro Real",
  },
  origemProduto: {
    "0": "0 · Nacional",
    "1": "1 · Estrangeira (importação direta)",
    "2": "2 · Estrangeira (mercado interno)",
    "3": "3 · Nacional, importação 40%–70%",
    "4": "4 · Nacional, processos básicos",
    "5": "5 · Nacional, importação ≤ 40%",
    "6": "6 · Estrangeira sem similar (CAMEX), importação direta",
    "7": "7 · Estrangeira sem similar (CAMEX), mercado interno",
    "8": "8 · Nacional, importação > 70%",
  },
} as const;

export type Opcao = { valor: string; rotulo: string };

export function opcoes<T extends Record<string, string>>(mapa: T): Opcao[] {
  return Object.entries(mapa).map(([valor, rotulo]) => ({ valor, rotulo }));
}
