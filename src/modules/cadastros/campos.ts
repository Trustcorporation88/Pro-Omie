// Definição declarativa dos formulários de cadastro. Seguro para client e server.
import { CSOSN_OPCOES } from "@/modules/fiscal/nfe/tipos";
import { ROTULOS, opcoes, type Opcao } from "@/lib/rotulos";
import { UFS } from "@/lib/format";

export type TipoCampo =
  | "texto"
  | "email"
  | "telefone"
  | "numero"
  | "moeda"
  | "selecao"
  | "booleano"
  | "area"
  | "documento"
  | "cep"
  | "data"
  | "oculto";

export type Campo = {
  nome: string;
  rotulo: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
  opcoes?: Opcao[];
  /** chave de opções carregadas no servidor (ex.: "empresas") */
  opcoesDinamicas?: string;
  placeholder?: string;
  ajuda?: string;
  /** colunas ocupadas numa grade de 6 */
  largura?: 1 | 2 | 3 | 4 | 6;
  secao?: string;
};

export type EntidadeCadastro =
  | "pessoas"
  | "produtos"
  | "categorias"
  | "centros-de-custo"
  | "contas-bancarias"
  | "formas-de-pagamento"
  | "condicoes-de-pagamento";

export const ENTIDADES: EntidadeCadastro[] = [
  "pessoas",
  "produtos",
  "categorias",
  "centros-de-custo",
  "contas-bancarias",
  "formas-de-pagamento",
  "condicoes-de-pagamento",
];

export type MetaEntidade = {
  titulo: string;
  singular: string;
  descricao: string;
  campos: Campo[];
  padrao: Record<string, string | boolean | number>;
};

const ufs: Opcao[] = UFS.map((u) => ({ valor: u, rotulo: u }));

export const META: Record<EntidadeCadastro, MetaEntidade> = {
  pessoas: {
    titulo: "Clientes e fornecedores",
    singular: "cliente/fornecedor",
    descricao: "Cadastro único de pessoas físicas e jurídicas. Busque o CNPJ para preencher os dados da Receita.",
    padrao: { tipoPessoa: "JURIDICA", cliente: true, fornecedor: false, indicadorIE: "NAO_CONTRIBUINTE" },
    campos: [
      { nome: "tipoPessoa", rotulo: "Tipo", tipo: "selecao", opcoes: opcoes(ROTULOS.tipoPessoa), largura: 2, secao: "Identificação" },
      { nome: "documento", rotulo: "CNPJ / CPF", tipo: "documento", largura: 4, secao: "Identificação" },
      { nome: "nome", rotulo: "Nome / razão social", tipo: "texto", obrigatorio: true, largura: 6, secao: "Identificação" },
      { nome: "nomeFantasia", rotulo: "Nome fantasia", tipo: "texto", largura: 6, secao: "Identificação" },
      { nome: "cliente", rotulo: "É cliente", tipo: "booleano", largura: 3, secao: "Identificação" },
      { nome: "fornecedor", rotulo: "É fornecedor", tipo: "booleano", largura: 3, secao: "Identificação" },
      { nome: "indicadorIE", rotulo: "Indicador de IE", tipo: "selecao", opcoes: opcoes(ROTULOS.indicadorIE), largura: 2, secao: "Fiscal" },
      { nome: "inscricaoEstadual", rotulo: "Inscrição estadual", tipo: "texto", largura: 2, secao: "Fiscal" },
      { nome: "inscricaoMunicipal", rotulo: "Inscrição municipal", tipo: "texto", largura: 2, secao: "Fiscal" },
      { nome: "email", rotulo: "E-mail", tipo: "email", largura: 3, secao: "Contato" },
      { nome: "telefone", rotulo: "Telefone", tipo: "telefone", largura: 3, secao: "Contato" },
      { nome: "contato", rotulo: "Pessoa de contato", tipo: "texto", largura: 6, secao: "Contato" },
      { nome: "cep", rotulo: "CEP", tipo: "cep", largura: 2, secao: "Endereço" },
      { nome: "logradouro", rotulo: "Endereço", tipo: "texto", largura: 4, secao: "Endereço" },
      { nome: "numero", rotulo: "Número", tipo: "texto", largura: 2, secao: "Endereço" },
      { nome: "complemento", rotulo: "Complemento", tipo: "texto", largura: 2, secao: "Endereço" },
      { nome: "bairro", rotulo: "Bairro", tipo: "texto", largura: 2, secao: "Endereço" },
      { nome: "cidade", rotulo: "Cidade", tipo: "texto", largura: 4, secao: "Endereço" },
      { nome: "uf", rotulo: "UF", tipo: "selecao", opcoes: ufs, largura: 2, secao: "Endereço" },
      { nome: "codigoMunicipio", rotulo: "Código IBGE", tipo: "oculto" },
      { nome: "limiteCredito", rotulo: "Limite de crédito", tipo: "moeda", largura: 3, secao: "Financeiro" },
      { nome: "observacoes", rotulo: "Observações", tipo: "area", largura: 6, secao: "Financeiro" },
    ],
  },
  produtos: {
    titulo: "Produtos e serviços",
    singular: "produto/serviço",
    descricao: "Itens vendidos e comprados, com dados fiscais (NCM, CEST, origem, item da LC 116) para a emissão de notas.",
    padrao: { tipo: "PRODUTO", unidade: "UN", origem: "0", controlaEstoque: true },
    campos: [
      { nome: "tipo", rotulo: "Tipo", tipo: "selecao", opcoes: opcoes(ROTULOS.tipoProduto), largura: 2, secao: "Identificação" },
      { nome: "codigo", rotulo: "Código (SKU)", tipo: "texto", obrigatorio: true, largura: 2, secao: "Identificação" },
      { nome: "unidade", rotulo: "Unidade", tipo: "texto", largura: 2, placeholder: "UN, KG, HR…", secao: "Identificação" },
      { nome: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, largura: 6, secao: "Identificação" },
      { nome: "precoVenda", rotulo: "Preço de venda", tipo: "moeda", largura: 3, secao: "Preços" },
      { nome: "precoCusto", rotulo: "Preço de custo", tipo: "moeda", largura: 3, secao: "Preços" },
      { nome: "ncm", rotulo: "NCM", tipo: "texto", largura: 2, placeholder: "8 dígitos", secao: "Fiscal" },
      { nome: "cest", rotulo: "CEST", tipo: "texto", largura: 2, secao: "Fiscal" },
      { nome: "gtin", rotulo: "GTIN/EAN", tipo: "texto", largura: 2, secao: "Fiscal" },
      { nome: "origem", rotulo: "Origem da mercadoria", tipo: "selecao", opcoes: opcoes(ROTULOS.origemProduto), largura: 4, secao: "Fiscal" },
      { nome: "codigoServico", rotulo: "Item LC 116 (serviços)", tipo: "texto", largura: 2, placeholder: "ex.: 01.07", secao: "Fiscal" },
      {
        nome: "cfopInterno",
        rotulo: "CFOP dentro do estado",
        tipo: "texto",
        largura: 2,
        placeholder: "padrão",
        ajuda: "Vazio = 5101 nos recicláveis da produção, 5102 nos demais.",
        secao: "NF-e (confirme com o contador)",
      },
      { nome: "csosnInterno", rotulo: "CSOSN dentro do estado", tipo: "selecao", opcoes: CSOSN_OPCOES, largura: 4, ajuda: "Vazio = 400 nos recicláveis (diferimento do art. 392 do RICMS-SP), 102 nos demais.", secao: "NF-e (confirme com o contador)" },
      { nome: "cfopInterestadual", rotulo: "CFOP para outro estado", tipo: "texto", largura: 2, placeholder: "padrão", ajuda: "Vazio = 6101 ou 6102.", secao: "NF-e (confirme com o contador)" },
      { nome: "csosnInterestadual", rotulo: "CSOSN para outro estado", tipo: "selecao", opcoes: CSOSN_OPCOES, largura: 4, ajuda: "Vazio = 102.", secao: "NF-e (confirme com o contador)" },
      {
        nome: "textoFiscal",
        rotulo: "Texto legal nas vendas dentro do estado",
        tipo: "area",
        largura: 6,
        ajuda: "Vai nas informações complementares da NF-e. Vazio nos recicláveis com CSOSN 400 = texto do diferimento do art. 392 do RICMS/2000.",
        secao: "NF-e (confirme com o contador)",
      },
      { nome: "controlaEstoque", rotulo: "Controla estoque", tipo: "booleano", largura: 2, secao: "Estoque" },
      {
        nome: "grupoMaterial",
        rotulo: "Grupo do material reciclável",
        tipo: "selecao",
        opcoes: opcoes(ROTULOS.grupoMaterial),
        largura: 4,
        ajuda: "Para papel, plástico, metais e outros recicláveis: organiza o estoque e as vendas por material.",
        secao: "Estoque",
      },
      { nome: "estoqueMinimo", rotulo: "Estoque mínimo", tipo: "numero", largura: 2, secao: "Estoque" },
      { nome: "estoqueMaximo", rotulo: "Estoque máximo", tipo: "numero", largura: 2, secao: "Estoque" },
      { nome: "observacoes", rotulo: "Observações", tipo: "area", largura: 6, secao: "Estoque" },
    ],
  },
  categorias: {
    titulo: "Categorias financeiras",
    singular: "categoria",
    descricao: "Plano de contas gerencial. O grupo da DRE define onde cada lançamento aparece no resultado.",
    padrao: { tipo: "DESPESA", grupoDre: "DESPESAS_ADMINISTRATIVAS" },
    campos: [
      { nome: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true, largura: 4 },
      { nome: "codigo", rotulo: "Código", tipo: "texto", largura: 2, placeholder: "ex.: 5.01" },
      { nome: "tipo", rotulo: "Tipo", tipo: "selecao", opcoes: opcoes(ROTULOS.tipoCategoria), largura: 2 },
      { nome: "grupoDre", rotulo: "Grupo da DRE", tipo: "selecao", opcoes: opcoes(ROTULOS.grupoDre), largura: 4 },
    ],
  },
  "centros-de-custo": {
    titulo: "Centros de custo",
    singular: "centro de custo",
    descricao: "Áreas ou projetos para ratear receitas e despesas.",
    padrao: {},
    campos: [
      { nome: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true, largura: 4 },
      { nome: "codigo", rotulo: "Código", tipo: "texto", largura: 2 },
    ],
  },
  "contas-bancarias": {
    titulo: "Contas bancárias e caixa",
    singular: "conta",
    descricao: "Contas correntes, caixa, cartões e investimentos. O saldo inicial é o ponto de partida do extrato.",
    padrao: { tipo: "CORRENTE" },
    campos: [
      { nome: "nome", rotulo: "Nome da conta", tipo: "texto", obrigatorio: true, largura: 4, placeholder: "ex.: Itaú PJ" },
      { nome: "tipo", rotulo: "Tipo", tipo: "selecao", opcoes: opcoes(ROTULOS.tipoConta), largura: 2 },
      { nome: "empresaId", rotulo: "Empresa (CNPJ)", tipo: "selecao", opcoesDinamicas: "empresas", obrigatorio: true, largura: 6 },
      { nome: "bancoCodigo", rotulo: "Cód. banco", tipo: "texto", largura: 2, placeholder: "341" },
      { nome: "bancoNome", rotulo: "Banco", tipo: "texto", largura: 4 },
      { nome: "agencia", rotulo: "Agência", tipo: "texto", largura: 2 },
      { nome: "numero", rotulo: "Conta", tipo: "texto", largura: 4 },
      { nome: "saldoInicial", rotulo: "Saldo inicial", tipo: "moeda", largura: 3, ajuda: "Negativo se a conta começa no vermelho." },
      { nome: "dataSaldoInicial", rotulo: "Data do saldo inicial", tipo: "data", obrigatorio: true, largura: 3 },
    ],
  },
  "formas-de-pagamento": {
    titulo: "Formas de pagamento",
    singular: "forma de pagamento",
    descricao: "Meios usados para pagar e receber.",
    padrao: { meio: "PIX" },
    campos: [
      { nome: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true, largura: 4 },
      { nome: "meio", rotulo: "Meio", tipo: "selecao", opcoes: opcoes(ROTULOS.meioPagamento), largura: 2 },
    ],
  },
  "condicoes-de-pagamento": {
    titulo: "Condições de pagamento",
    singular: "condição de pagamento",
    descricao: "Prazos usados para gerar parcelas automaticamente.",
    padrao: { dias: "30" },
    campos: [
      { nome: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true, largura: 3, placeholder: "ex.: 30/60/90" },
      { nome: "dias", rotulo: "Dias de cada parcela", tipo: "texto", obrigatorio: true, largura: 3, ajuda: "Separados por vírgula. 0 = à vista. Ex.: 30,60,90" },
    ],
  },
};
