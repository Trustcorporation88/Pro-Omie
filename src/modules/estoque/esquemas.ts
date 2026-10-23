// Validação (zod) das entradas de estoque. Seguro para client e server.
import { z } from "zod";
import { ehISOValido } from "@/lib/datas";
import { lerDecimal } from "@/modules/vendas/calculos";
import { parseMoeda } from "@/lib/format";
import { MATERIAIS_PADRAO, MOTIVOS_AJUSTE } from "./tipos";

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
const data = z
  .string("Informe a data.")
  .trim()
  .refine((s) => ehISOValido(s) && Number(s.slice(0, 4)) >= 2000 && Number(s.slice(0, 4)) <= 2200, "Informe a data.");
/** Quantidade digitada ("1.240,5" ou número), até 3 casas. */
const quantidade = (msg: string) =>
  z.union([z.number(), z.string()]).transform((v, ctx) => {
    const n = lerDecimal(v, 3);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: msg });
      return z.NEVER;
    }
    return n;
  });

const semRepetir = (itens: { produtoId: string }[], ctx: z.RefinementCtx) => {
  const vistos = new Set<string>();
  itens.forEach((i, n) => {
    if (vistos.has(i.produtoId)) ctx.addIssue({ code: "custom", path: ["itens", n, "produtoId"], message: "Material repetido: junte as quantidades numa linha só." });
    vistos.add(i.produtoId);
  });
};

export const esquemaEntrada = z
  .object({
    empresaId: id("Escolha o estabelecimento."),
    data,
    pessoaId: idOpc,
    referencia: textoOpc(120),
    observacao: textoOpc(1000),
    itens: z
      .array(
        z.object({
          produtoId: id("Escolha o material."),
          quantidade: quantidade("Quantidade inválida.").pipe(z.number().positive("A quantidade precisa ser maior que zero.").max(1e9, "Quantidade muito alta.")),
        }),
      )
      .min(1, "Informe a quantidade de ao menos um material.")
      .max(200, "No máximo 200 materiais por entrada."),
  })
  .superRefine((d, ctx) => semRepetir(d.itens, ctx));

export const esquemaAjuste = z
  .object({
    empresaId: id("Escolha o estabelecimento."),
    data,
    motivo: z
      .string("Escolha o motivo do ajuste.")
      .trim()
      .refine((v) => v in MOTIVOS_AJUSTE, "Escolha o motivo do ajuste."),
    observacao: textoOpc(1000),
    itens: z
      .array(
        z.object({
          produtoId: id("Escolha o material."),
          /** saldo que a tela mostrou: se mudou no meio do caminho, o ajuste é recusado */
          saldoEsperado: quantidade("Saldo inválido."),
          contado: quantidade("Quantidade contada inválida.").pipe(z.number().min(0, "O saldo contado não pode ser negativo.").max(1e9, "Quantidade muito alta.")),
        }),
      )
      .min(1, "Informe o saldo contado de ao menos um material.")
      .max(200, "No máximo 200 materiais por ajuste."),
  })
  .superRefine((d, ctx) => semRepetir(d.itens, ctx));

export const esquemaPrecos = z
  .array(
    z.object({
      produtoId: id("Material inválido."),
      preco: z
        .union([z.number(), z.string()])
        .transform((v) => parseMoeda(v))
        .pipe(z.number().min(0, "O preço não pode ser negativo.").max(1e9, "Preço muito alto.")),
    }),
  )
  .min(1, "Nenhum preço para salvar.")
  .max(500, "Lista grande demais.");

const CODIGOS = new Set(MATERIAIS_PADRAO.map((m) => m.codigo));
export const esquemaMateriaisPadrao = z
  .array(z.string())
  .min(1, "Marque ao menos um material.")
  .refine((cs) => cs.every((c) => CODIGOS.has(c)), "Material desconhecido na lista.");

export type EntradaEstoque = z.input<typeof esquemaEntrada>;
export type EntradaAjuste = z.input<typeof esquemaAjuste>;
export type EntradaPrecos = z.input<typeof esquemaPrecos>;
