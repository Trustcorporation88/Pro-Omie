// Validação (zod) das entradas das server actions do financeiro. Seguro para client e server.
import { z } from "zod";
import { arred2, parseMoeda } from "@/lib/format";
import { ehISOValido, hojeISO } from "@/lib/datas";

// ───────────── Auxiliares de coerção ─────────────

const id = (msg = "Registro inválido.") => z.string({ error: msg }).trim().min(1, msg);

const idOpc = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null));

const textoOpc = (max = 500) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null))
    .refine((v) => v === null || v.length <= max, `Use no máximo ${max} caracteres.`);

const textoObrig = (msg: string, max = 200) =>
  z
    .string({ error: msg })
    .trim()
    .min(1, msg)
    .max(max, `Use no máximo ${max} caracteres.`);

/** Data 'YYYY-MM-DD' válida (ano entre 1900 e 2200, para pegar erros de digitação). */
const dataISO = (msg = "Data inválida.") =>
  z
    .string({ error: msg })
    .trim()
    .refine((s) => ehISOValido(s) && Number(s.slice(0, 4)) >= 1900 && Number(s.slice(0, 4)) <= 2200, msg);

/** Data de movimento de dinheiro: não pode ser futura (fuso de São Paulo). */
const dataMovimento = (msg = "Informe uma data válida.") =>
  dataISO(msg).refine((s) => s <= hojeISO(), "A data não pode ser futura.");

/** Dinheiro: aceita número ou texto "1.234,56"; arredonda a centavos. */
const dinheiro = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => arred2(parseMoeda(v ?? 0)))
  .refine((v) => Number.isFinite(v), "Valor inválido.");

const dinheiroPositivo = (msg = "Informe um valor maior que zero.") => dinheiro.refine((v) => v > 0, msg);
const dinheiroNaoNegativo = (msg = "O valor não pode ser negativo.") => dinheiro.refine((v) => v >= 0, msg);

/** Percentual do rateio (aceita "33,33"). */
const percentual = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "number" ? v : parseMoeda(v)))
  .transform((v) => Math.round(v * 10_000) / 10_000)
  .refine((v) => Number.isFinite(v) && v > 0 && v <= 100, "Cada percentual deve ficar entre 0 e 100%.");

const intervalo = z.enum(["mensal", "quinzenal", "semanal", "anual"], { error: "Intervalo inválido." });

// ───────────── Lançamentos (títulos) ─────────────

export const esquemaRateio = z.object({
  categoriaId: id("Selecione a categoria."),
  centroCustoId: idOpc,
  percentual,
});

const rateios = z
  .array(esquemaRateio, { error: "Informe a categoria." })
  .min(1, "Informe ao menos uma categoria.")
  .max(50, "Use no máximo 50 linhas de rateio.")
  .superRefine((linhas, ctx) => {
    const soma = arred2(linhas.reduce((a, r) => a + r.percentual, 0));
    if (Math.abs(soma - 100) > 0.01)
      ctx.addIssue({ code: "custom", message: `O rateio precisa somar 100% (está em ${String(soma).replace(".", ",")}%).` });
  });

export const esquemaParcela = z.object({
  vencimento: dataISO("Informe o vencimento de todas as parcelas."),
  valor: dinheiroPositivo("Todas as parcelas precisam ter valor maior que zero."),
});

export const esquemaLancamento = z.object({
  tipo: z.enum(["RECEBER", "PAGAR"], { error: "Tipo inválido." }),
  empresaId: id("Selecione a empresa."),
  pessoaId: idOpc,
  descricao: textoObrig("Informe a descrição."),
  documento: textoOpc(60),
  contaBancariaId: idOpc,
  formaPagamentoId: idOpc,
  emissao: dataISO("Informe a data de emissão."),
  competencia: dataISO("Informe a competência."),
  observacoes: textoOpc(2000),
  rateios,
  parcelas: z
    .array(esquemaParcela, { error: "Informe as parcelas." })
    .min(1, "Informe ao menos uma parcela.")
    .max(360, "Use no máximo 360 parcelas."),
  recorrencia: z.object({ intervalo }).nullish().transform((v) => v ?? null),
  baixarAgora: z
    .object({
      data: dataMovimento("Informe a data da baixa."),
      contaBancariaId: id("Selecione a conta da baixa."),
      formaPagamentoId: idOpc,
    })
    .nullish()
    .transform((v) => v ?? null),
});
export type EntradaLancamento = z.input<typeof esquemaLancamento>;
export type DadosLancamento = z.output<typeof esquemaLancamento>;

export const esquemaEdicaoTitulo = z.object({
  pessoaId: idOpc,
  descricao: textoObrig("Informe a descrição."),
  documento: textoOpc(60),
  contaBancariaId: idOpc,
  formaPagamentoId: idOpc,
  emissao: dataISO("Informe a data de emissão."),
  competencia: dataISO("Informe a competência."),
  vencimento: dataISO("Informe o vencimento."),
  valor: dinheiroPositivo(),
  rateios,
  observacoes: textoOpc(2000),
});
export type EntradaEdicaoTitulo = z.input<typeof esquemaEdicaoTitulo>;

// ───────────── Baixas ─────────────

export const esquemaBaixa = z
  .object({
    tituloId: id("Título inválido."),
    data: dataMovimento("Informe a data da baixa."),
    contaBancariaId: id("Selecione a conta."),
    formaPagamentoId: idOpc,
    valor: dinheiroPositivo("O valor a baixar precisa ser maior que zero."),
    juros: dinheiroNaoNegativo("Juros não podem ser negativos."),
    multa: dinheiroNaoNegativo("A multa não pode ser negativa."),
    desconto: dinheiroNaoNegativo("O desconto não pode ser negativo."),
    observacao: textoOpc(500),
  })
  .refine((d) => arred2(d.valor + d.juros + d.multa - d.desconto) >= 0, {
    message: "O desconto não pode ser maior que o valor pago.",
    path: ["desconto"],
  });
export type EntradaBaixa = z.input<typeof esquemaBaixa>;

export const esquemaBaixaLote = z.object({
  tituloIds: z
    .array(id("Título inválido."), { error: "Selecione os títulos." })
    .min(1, "Selecione ao menos um título.")
    .max(200, "Selecione no máximo 200 títulos por vez."),
  data: dataMovimento("Informe a data da baixa."),
  contaBancariaId: id("Selecione a conta."),
  formaPagamentoId: idOpc,
});
export type EntradaBaixaLote = z.input<typeof esquemaBaixaLote>;

export const esquemaMotivo = textoOpc(500);

// ───────────── Movimentações avulsas ─────────────

export const esquemaTransferencia = z
  .object({
    contaOrigemId: id("Selecione a conta de origem."),
    contaDestinoId: id("Selecione a conta de destino."),
    data: dataMovimento("Informe a data."),
    valor: dinheiroPositivo(),
    descricao: textoOpc(200),
  })
  .refine((d) => d.contaOrigemId !== d.contaDestinoId, {
    message: "Escolha contas diferentes.",
    path: ["contaDestinoId"],
  });
export type EntradaTransferencia = z.input<typeof esquemaTransferencia>;

export const esquemaAjuste = z.object({
  contaBancariaId: id("Selecione a conta."),
  data: dataMovimento("Informe a data."),
  tipo: z.enum(["CREDITO", "DEBITO"], { error: "Escolha crédito ou débito." }),
  valor: dinheiroPositivo(),
  descricao: textoObrig("Informe a descrição do ajuste."),
});
export type EntradaAjuste = z.input<typeof esquemaAjuste>;

export const esquemaId = id();
