// Validação (zod) das entradas do CRM. Seguro para client e server.
import { z } from "zod";
import { ehISOValido } from "@/lib/datas";
import { parseMoeda } from "@/lib/format";
import { ETAPAS_ABERTAS, MOTIVOS_PERDA, ORIGENS } from "./tipos";

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
const dataValida = (s: string) => ehISOValido(s) && Number(s.slice(0, 4)) >= 2000 && Number(s.slice(0, 4)) <= 2200;
const dataOpc = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null))
  .refine((v) => v === null || dataValida(v), "Data inválida.");
const codigoDe = <T extends Record<string, string>>(lista: T, msg: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null))
    .refine((v) => v === null || v in lista, msg);

export const esquemaOportunidade = z.object({
  titulo: z.string("Dê um nome à oportunidade.").trim().min(1, "Dê um nome à oportunidade.").max(160, "Use no máximo 160 caracteres."),
  pessoaId: id("Selecione o cliente."),
  contato: textoOpc(200),
  responsavelId: idOpc,
  // só vale na criação; depois a etapa muda pelo funil
  etapa: z.enum(ETAPAS_ABERTAS, "Etapa inválida.").optional().default("DESCOBERTA"),
  valor: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => (v === null || v === undefined || v === "" ? 0 : parseMoeda(v)))
    .pipe(z.number("Valor inválido.").finite("Valor inválido.").min(0, "O valor não pode ser negativo.").max(1e11, "Valor muito alto.")),
  previsaoFechamento: dataOpc,
  origem: codigoDe(ORIGENS, "Origem inválida."),
  observacoes: textoOpc(4000),
});

export const esquemaEtapa = z.enum(ETAPAS_ABERTAS, "Etapa inválida.");

export const esquemaPerda = z.object({
  motivo: z
    .string("Escolha o motivo da perda.")
    .trim()
    .refine((v) => v in MOTIVOS_PERDA, "Escolha o motivo da perda."),
  detalhe: textoOpc(500),
});

export const esquemaAtividade = z.object({
  tipo: z.enum(["LIGACAO", "WHATSAPP", "EMAIL", "REUNIAO", "VISITA", "TAREFA"], "Tipo inválido."),
  assunto: z.string("Descreva a atividade.").trim().min(1, "Descreva a atividade.").max(200, "Use no máximo 200 caracteres."),
  descricao: textoOpc(4000),
  data: z
    .string("Informe a data.")
    .trim()
    .refine(dataValida, "Informe a data."),
  hora: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null))
    .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Hora inválida (use HH:MM)."),
  responsavelId: idOpc,
  oportunidadeId: idOpc,
  pessoaId: idOpc,
});

export type EntradaOportunidade = z.input<typeof esquemaOportunidade>;
export type EntradaPerda = z.input<typeof esquemaPerda>;
export type EntradaAtividade = z.input<typeof esquemaAtividade>;
