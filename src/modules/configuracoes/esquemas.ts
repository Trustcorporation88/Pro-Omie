import { z } from "zod";
import { UFS, soDigitos, validarCNPJ } from "@/lib/format";

// Valores chegam do formulário como texto. Campos opcionais vazios viram null.
const textoObrigatorio = (msg: string, max = 200) => z.string(msg).trim().min(1, msg).max(max, "Texto muito longo.");
const textoOpcional = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, "Texto muito longo.")
    .nullish()
    .transform((v) => v || null);

/** Só dígitos; vazio vira null. */
const digitosOpcionais = (max = 40) => textoOpcional(max).transform((v) => (v ? soDigitos(v) || null : null));

export const REGIMES_TRIBUTARIOS = ["MEI", "SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"] as const;

// ───────────── Empresa e filiais ─────────────

export const esquemaEmpresa = z.object({
  razaoSocial: textoObrigatorio("Informe a razão social."),
  nomeFantasia: textoOpcional(),
  cnpj: z
    .string("Informe o CNPJ.")
    .trim()
    .refine((v) => validarCNPJ(v), "CNPJ inválido.")
    .transform((v) => soDigitos(v)),
  inscricaoEstadual: textoOpcional(30),
  inscricaoMunicipal: textoOpcional(30),
  regimeTributario: z.enum(REGIMES_TRIBUTARIOS, "Selecione o regime tributário."),
  cnae: digitosOpcionais().refine((v) => v === null || v.length === 7, "CNAE deve ter 7 dígitos (ex.: 6201-5/01)."),
  email: textoOpcional(254)
    .refine((v) => v === null || z.email().safeParse(v).success, "E-mail inválido.")
    .transform((v) => v?.toLowerCase() ?? null),
  telefone: digitosOpcionais().refine((v) => v === null || v.length === 10 || v.length === 11, "Telefone inválido. Informe DDD e número."),
  cep: digitosOpcionais().refine((v) => v === null || v.length === 8, "CEP inválido. Informe 8 dígitos."),
  logradouro: textoOpcional(),
  numero: textoOpcional(30),
  complemento: textoOpcional(),
  bairro: textoOpcional(),
  cidade: textoOpcional(),
  uf: textoOpcional(10)
    .transform((v) => v?.toUpperCase() ?? null)
    .refine((v) => v === null || (UFS as readonly string[]).includes(v), "UF inválida."),
  codigoMunicipio: digitosOpcionais().refine((v) => v === null || v.length === 7, "Código do município deve ter 7 dígitos (IBGE)."),
});

export type DadosEmpresa = z.output<typeof esquemaEmpresa>;

// ───────────── Usuários ─────────────

export const PAPEIS_VALIDOS = ["ADMIN", "FINANCEIRO", "VENDAS", "ESTOQUE", "CONTADOR"] as const;

const nomeUsuario = z.string("Informe o nome.").trim().min(2, "Informe o nome completo.").max(120, "Nome muito longo.");
const papelUsuario = z.enum(PAPEIS_VALIDOS, "Selecione o papel.");

export const esquemaNovoUsuario = z.object({
  nome: nomeUsuario,
  email: z.string("Informe o e-mail.").trim().toLowerCase().max(254, "E-mail muito longo.").pipe(z.email("E-mail inválido.")),
  papel: papelUsuario,
});

export const esquemaEdicaoUsuario = z.object({ nome: nomeUsuario, papel: papelUsuario });
