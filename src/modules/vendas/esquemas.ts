// Validação (zod) das entradas de propostas e pedidos. Seguro para client e server.
import { z } from "zod";
import { ehISOValido } from "@/lib/datas";
import { lerDecimal } from "./calculos";

const id = (msg = "Registro inválido.") => z.string({ error: msg }).trim().min(1, msg);
const idOpc = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null));
const textoOpc = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null))
    .refine((v) => v === null || v.length <= max, `Use no máximo ${max} caracteres.`);
const dataISO = (msg = "Data inválida.") =>
  z
    .string({ error: msg })
    .trim()
    .refine((s) => ehISOValido(s) && Number(s.slice(0, 4)) >= 2000 && Number(s.slice(0, 4)) <= 2200, msg);
/** Número vindo do formulário (texto "1.250,500" ou número), com `casas` decimais. */
const decimal = (casas: number, msg: string) =>
  z.union([z.number(), z.string()]).transform((v, ctx) => {
    const n = lerDecimal(v, casas);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: msg });
      return z.NEVER;
    }
    return n;
  });

export const esquemaItemVenda = z.object({
  produtoId: idOpc,
  tipo: z.enum(["PRODUTO", "SERVICO"], "Informe se o item é produto ou serviço."),
  descricao: z.string("Descreva o item.").trim().min(1, "Descreva o item.").max(300, "Descrição muito longa."),
  unidade: z
    .string()
    .trim()
    .transform((s) => (s || "UN").toUpperCase())
    .pipe(z.string().max(6, "Unidade com até 6 letras.")),
  quantidade: decimal(3, "Quantidade inválida.").pipe(z.number().positive("A quantidade precisa ser maior que zero.").max(1e9, "Quantidade muito alta.")),
  precoUnitario: decimal(4, "Preço inválido.").pipe(z.number().min(0, "Preço não pode ser negativo.").max(1e9, "Preço muito alto.")),
  // vazio, nulo ou ausente = sem desconto
  descontoPercentual: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => (v === null || v === undefined || (typeof v === "string" && !v.trim()) ? 0 : v))
    .pipe(decimal(2, "Desconto inválido."))
    .pipe(z.number().min(0, "Desconto não pode ser negativo.").max(100, "Desconto de no máximo 100%.")),
});

const base = {
  empresaId: id("Selecione a empresa."),
  pessoaId: id("Selecione o cliente."),
  vendedorId: idOpc,
  emissao: dataISO("Informe a data de emissão."),
  condicaoPagamentoId: idOpc,
  formaPagamentoId: idOpc,
  observacoes: textoOpc(2000),
  observacoesInternas: textoOpc(2000),
  itens: z.array(esquemaItemVenda).min(1, "Inclua ao menos um item.").max(200, "No máximo 200 itens."),
};

export const esquemaProposta = z
  .object({ ...base, validade: dataISO("Informe a validade.") })
  .refine((d) => d.validade >= d.emissao, { message: "A validade não pode ser anterior à emissão.", path: ["validade"] });

export const esquemaPedido = z.object(base);

export const esquemaMotivo = textoOpc(500);

export const esquemaFaturamento = z.object({
  emissao: dataISO("Informe a data do faturamento."),
  condicaoPagamentoId: idOpc,
  formaPagamentoId: idOpc,
  contaBancariaId: idOpc,
  categoriaProdutosId: idOpc,
  categoriaServicosId: idOpc,
  centroCustoId: idOpc,
});

export type EntradaItemVenda = z.input<typeof esquemaItemVenda>;
export type EntradaProposta = z.input<typeof esquemaProposta>;
export type EntradaPedido = z.input<typeof esquemaPedido>;
export type EntradaFaturamento = z.input<typeof esquemaFaturamento>;
export type DadosItemVenda = z.output<typeof esquemaItemVenda>;
