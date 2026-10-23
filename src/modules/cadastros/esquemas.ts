import { z } from "zod";
import { parseMoeda, soDigitos, validarCNPJ, validarCPF } from "@/lib/format";
import { ehISOValido, isoParaDate } from "@/lib/datas";

// Auxiliares de coerção (valores chegam do formulário como string/boolean).
const opc = z
  .union([z.string(), z.number(), z.null()]).optional()
  .transform((v) => (v === null || v === undefined ? null : String(v).trim() || null));
const obrig = (msg: string) => z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().min(1, msg));
const bool = z.union([z.boolean(), z.string(), z.null()]).optional().transform((v) => v === true || v === "true" || v === "on");
const moeda = z.union([z.number(), z.string(), z.null()]).optional().transform((v) => parseMoeda(v ?? 0));
const moedaOpc = z
  .union([z.number(), z.string(), z.null()]).optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : parseMoeda(v)));
const numOpc = z
  .union([z.number(), z.string(), z.null()]).optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : Number(String(v).replace(",", "."))))
  .refine((v) => v === null || Number.isFinite(v), "Número inválido.");
const digitos = opc.transform((v) => (v ? soDigitos(v) || null : null));
const data = z.string().refine(ehISOValido, "Data inválida.").transform(isoParaDate);
const enumDe = <T extends [string, ...string[]]>(valores: T) => z.enum(valores);
const CSOSN = ["101", "102", "103", "300", "400", "500", "900"];

export const esquemaPessoa = z
  .object({
    tipoPessoa: enumDe(["JURIDICA", "FISICA", "ESTRANGEIRA"]),
    documento: digitos,
    nome: obrig("Informe o nome ou a razão social."),
    nomeFantasia: opc,
    cliente: bool,
    fornecedor: bool,
    indicadorIE: enumDe(["CONTRIBUINTE", "ISENTO", "NAO_CONTRIBUINTE"]),
    inscricaoEstadual: opc,
    inscricaoMunicipal: opc,
    email: opc.refine((v) => !v || z.email().safeParse(v).success, "E-mail inválido."),
    telefone: digitos,
    contato: opc,
    cep: digitos,
    logradouro: opc,
    numero: opc,
    complemento: opc,
    bairro: opc,
    cidade: opc,
    uf: opc.transform((v) => v?.toUpperCase() ?? null),
    codigoMunicipio: opc,
    limiteCredito: moedaOpc,
    observacoes: opc,
  })
  .superRefine((d, ctx) => {
    if (d.documento && d.tipoPessoa === "JURIDICA" && !validarCNPJ(d.documento))
      ctx.addIssue({ code: "custom", path: ["documento"], message: "CNPJ inválido." });
    if (d.documento && d.tipoPessoa === "FISICA" && !validarCPF(d.documento))
      ctx.addIssue({ code: "custom", path: ["documento"], message: "CPF inválido." });
    if (!d.cliente && !d.fornecedor)
      ctx.addIssue({ code: "custom", path: ["cliente"], message: "Marque cliente, fornecedor ou ambos." });
  });

export const esquemaProduto = z.object({
  tipo: enumDe(["PRODUTO", "SERVICO"]),
  codigo: obrig("Informe o código."),
  descricao: obrig("Informe a descrição."),
  unidade: opc.transform((v) => (v ?? "UN").toUpperCase()),
  gtin: digitos,
  ncm: digitos.refine((v) => !v || v.length === 8, "NCM deve ter 8 dígitos."),
  cest: digitos,
  origem: z.union([z.string(), z.number()]).transform((v) => Number(v) || 0),
  codigoServico: opc,
  precoVenda: moeda,
  precoCusto: moeda,
  controlaEstoque: bool,
  grupoMaterial: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null))
    .refine((v) => v === null || ["PAPEL", "PLASTICO", "METAL_NAO_FERROSO", "METAL_FERROSO", "METAL_PRECIOSO", "VIDRO", "ELETRONICO", "OUTROS"].includes(v), "Grupo inválido."),
  estoqueMinimo: numOpc,
  estoqueMaximo: numOpc,
  observacoes: opc,
  // NF-e: vazio = padrão do sistema (reciclável da produção própria ou revenda)
  cfopInterno: digitos.refine((v) => !v || /^5\d{3}$/.test(v), "CFOP de venda dentro do estado tem 4 dígitos e começa com 5."),
  cfopInterestadual: digitos.refine((v) => !v || /^6\d{3}$/.test(v), "CFOP de venda para outro estado tem 4 dígitos e começa com 6."),
  csosnInterno: opc.refine((v) => !v || CSOSN.includes(v), "CSOSN inválido."),
  csosnInterestadual: opc.refine((v) => !v || CSOSN.includes(v), "CSOSN inválido."),
  textoFiscal: opc.refine((v) => !v || v.length <= 500, "Até 500 caracteres."),
  // NFS-e nacional (serviços)
  codigoTributacaoNacional: digitos.refine((v) => !v || v.length === 6, "Código de tributação nacional tem 6 dígitos (ex.: 010701)."),
  codigoTributacaoMunicipal: digitos.refine((v) => !v || v.length <= 20, "Código municipal inválido."),
  codigoNbs: digitos.refine((v) => !v || v.length === 9, "Código NBS tem 9 dígitos."),
  // IBS/CBS (NT 2025.002)
  cstIbsCbs: digitos.refine((v) => !v || v === "000", "Nesta versão só o CST 000 (tributação integral) é aceito."),
  cClassTrib: digitos.refine((v) => !v || /^000\d{3}$/.test(v), "Classificação de 6 dígitos começando por 000 (ex.: 000001)."),
});

export const esquemaCategoria = z.object({
  nome: obrig("Informe o nome."),
  codigo: opc,
  tipo: enumDe(["RECEITA", "DESPESA"]),
  grupoDre: enumDe([
    "RECEITA_BRUTA",
    "DEDUCOES",
    "CUSTOS",
    "DESPESAS_PESSOAL",
    "DESPESAS_ADMINISTRATIVAS",
    "DESPESAS_COMERCIAIS",
    "RECEITAS_FINANCEIRAS",
    "DESPESAS_FINANCEIRAS",
    "OUTRAS_RECEITAS",
    "OUTRAS_DESPESAS",
    "IMPOSTOS_LUCRO",
    "NAO_OPERACIONAL",
  ]),
});

export const esquemaCentroCusto = z.object({ nome: obrig("Informe o nome."), codigo: opc });

export const esquemaContaBancaria = z.object({
  nome: obrig("Informe o nome da conta."),
  tipo: enumDe(["CORRENTE", "POUPANCA", "CAIXA", "CARTAO_CREDITO", "INVESTIMENTO", "CONTA_PAGAMENTO"]),
  empresaId: obrig("Selecione a empresa."),
  bancoCodigo: opc,
  bancoNome: opc,
  agencia: opc,
  numero: opc,
  saldoInicial: moeda,
  dataSaldoInicial: data,
});

export const esquemaFormaPagamento = z.object({
  nome: obrig("Informe o nome."),
  meio: enumDe(["DINHEIRO", "PIX", "BOLETO", "CARTAO_CREDITO", "CARTAO_DEBITO", "TRANSFERENCIA", "CHEQUE", "DEBITO_AUTOMATICO", "OUTRO"]),
});

export const esquemaCondicaoPagamento = z.object({
  nome: obrig("Informe o nome."),
  dias: obrig("Informe os dias.")
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => /^\d{1,3}(,\d{1,3})*$/.test(v), "Use números separados por vírgula, ex.: 30,60,90"),
});

const dataOpc = z
  .union([z.string(), z.null()]).optional()
  .transform((v) => (v && v.trim() ? v.trim() : null))
  .refine((v) => v === null || ehISOValido(v), "Data inválida.")
  .transform((v) => (v ? isoParaDate(v) : null));
const idObrig = (msg: string) => z.union([z.string(), z.null()]).optional().transform((v) => (v ?? "").trim()).pipe(z.string().min(1, msg));
const idOpcional = z.union([z.string(), z.null()]).optional().transform((v) => (v && v.trim() ? v.trim() : null));
const inteiro = (min: number, max: number, msg: string) =>
  z.union([z.string(), z.number(), z.null()]).optional().transform((v) => Number(String(v ?? "").replace(",", "."))).refine((n) => Number.isInteger(n) && n >= min && n <= max, msg);

export const esquemaContrato = z
  .object({
    pessoaId: idObrig("Escolha o cliente."),
    produtoId: idOpcional,
    descricao: obrig("Informe a descrição."),
    valor: moeda.refine((v) => v > 0, "Informe o valor."),
    periodicidade: enumDe(["MENSAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"]),
    diaVencimento: inteiro(1, 28, "Dia do vencimento de 1 a 28."),
    inicio: data,
    fim: dataOpc,
    antecedenciaDias: inteiro(0, 60, "Antecedência de 0 a 60 dias."),
    categoriaId: idOpcional,
    contaBancariaId: idOpcional,
    formaPagamentoId: idOpcional,
    gerarCobranca: bool,
    observacoes: opc,
  })
  .refine((d) => !d.fim || d.fim >= d.inicio, { message: "O fim não pode ser antes do início.", path: ["fim"] });

export const esquemaOrdem = z.object({
  pessoaId: idObrig("Escolha o cliente."),
  status: enumDe(["ABERTA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"]),
  descricao: obrig("Informe o serviço."),
  detalhes: opc,
  produtoId: idOpcional,
  quantidade: z.union([z.string(), z.number(), z.null()]).optional().transform((v) => (v === null || v === undefined || v === "" ? 1 : Number(String(v).replace(/\./g, "").replace(",", ".")))).refine((n) => Number.isFinite(n) && n > 0, "Quantidade inválida."),
  valorUnitario: moeda,
  responsavelId: idOpcional,
  abertura: data,
  previsao: dataOpc,
  conclusao: dataOpc,
  observacoes: opc,
});
