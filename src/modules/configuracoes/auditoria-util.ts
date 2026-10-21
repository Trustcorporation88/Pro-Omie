// Apresentação dos registros de auditoria: rótulos, tons, formatação e diferenças antes/depois.
// Seguro para client e server (sem dependências de servidor).
import type { ComponentProps } from "react";
import type { Selo } from "@/components/selos";
import { FUSO } from "@/lib/datas";

export type TomSelo = NonNullable<ComponentProps<typeof Selo>["tom"]>;

// ───────────── Ação ─────────────

/** Tom do selo por ação: criar = sucesso; atualizar = info; excluir/cancelar/estornar = perigo; login_falhou = alerta; demais = neutro. */
export function tomAcao(acao: string): TomSelo {
  switch (acao) {
    case "criar":
    case "configuracao_inicial":
      return "sucesso";
    case "atualizar":
      return "info";
    case "excluir":
    case "cancelar":
    case "estornar":
      return "perigo";
    case "login_falhou":
      return "alerta";
    default:
      return "neutro"; // login, logout e as demais ações
  }
}

const ROTULO_ACAO: Record<string, string> = {
  criar: "Criar",
  atualizar: "Atualizar",
  excluir: "Excluir",
  cancelar: "Cancelar",
  estornar: "Estornar",
  ativar: "Ativar",
  inativar: "Inativar",
  login: "Login",
  logout: "Logout",
  login_falhou: "Login falhou",
  configuracao_inicial: "Configuração inicial",
  trocar_senha: "Troca de senha",
  redefinir_senha: "Redefinição de senha",
  desbloquear: "Desbloqueio",
};

function humanizar(codigo: string): string {
  const t = codigo.replace(/[_-]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function rotuloAcao(acao: string): string {
  return ROTULO_ACAO[acao] ?? humanizar(acao);
}

// ───────────── Entidade ─────────────

const ROTULO_ENTIDADE: Record<string, string> = {
  usuario: "Usuário",
  empresa: "Empresa",
  pessoa: "Pessoa",
  produto: "Produto",
  categoria: "Categoria",
  centro_custo: "Centro de custo",
  conta_bancaria: "Conta bancária",
  forma_pagamento: "Forma de pagamento",
  condicao_pagamento: "Condição de pagamento",
  titulo: "Título",
  baixa: "Baixa",
  transferencia: "Transferência",
  movimento: "Movimento",
  extrato: "Extrato",
  extrato_importacao: "Importação de extrato",
  regra_conciliacao: "Regra de conciliação",
  anexo: "Anexo",
};

export function rotuloEntidade(entidade: string): string {
  return ROTULO_ENTIDADE[entidade] ?? humanizar(entidade);
}

// ───────────── Datas ─────────────

export function fmtDataHoraCompleta(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: FUSO }).format(dt);
}

// ───────────── Dados sensíveis ─────────────

const CHAVE_SENSIVEL = /^(senha|senhaHash|senhaProvisoria|password|passwordHash|token|segredo|secret)$/i;

/** Troca por "[oculto]" o valor de qualquer chave que pareça senha/hash/token (em qualquer nível). */
export function ocultarSensiveis(valor: unknown, nivel = 0): unknown {
  if (nivel > 12) return valor;
  if (Array.isArray(valor)) return valor.map((v) => ocultarSensiveis(v, nivel + 1));
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [
        k,
        CHAVE_SENSIVEL.test(k) ? "[oculto]" : ocultarSensiveis(v, nivel + 1),
      ]),
    );
  }
  return valor;
}

// ───────────── Diferenças antes/depois ─────────────

export type Diferenca = { campo: string; antes: unknown; depois: unknown };

const CAMPOS_IGNORADOS = new Set(["createdAt", "updatedAt", "senhaHash"]);

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Compara como texto: null, undefined e "" são equivalentes; 1500 e "1500" também (Decimal vira string no JSON). */
function normalizar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Quando `dados` tem { antes, depois } (objetos), devolve só os campos alterados.
 * Campos que não aparecem em `depois` não foram informados e não entram na comparação.
 * Devolve null quando `dados` não tem esse formato.
 */
export function extrairDiferencas(dados: unknown): Diferenca[] | null {
  if (!ehObjeto(dados) || !ehObjeto(dados.antes) || !ehObjeto(dados.depois)) return null;
  const { antes, depois } = dados;
  const diferencas: Diferenca[] = [];
  for (const campo of Object.keys(depois)) {
    if (CAMPOS_IGNORADOS.has(campo)) continue;
    if (normalizar(antes[campo]) === normalizar(depois[campo])) continue;
    diferencas.push({ campo, antes: antes[campo], depois: depois[campo] });
  }
  return diferencas;
}

const ROTULO_CAMPO: Record<string, string> = {
  razaoSocial: "Razão social",
  nomeFantasia: "Nome fantasia",
  cnpj: "CNPJ",
  inscricaoEstadual: "Inscrição estadual",
  inscricaoMunicipal: "Inscrição municipal",
  regimeTributario: "Regime tributário",
  cnae: "CNAE",
  email: "E-mail",
  telefone: "Telefone",
  cep: "CEP",
  logradouro: "Logradouro",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  uf: "UF",
  codigoMunicipio: "Código do município",
  matrizId: "Matriz",
  ativo: "Ativo",
  nome: "Nome",
  papel: "Papel",
  trocarSenha: "Troca de senha pendente",
  descricao: "Descrição",
  valor: "Valor",
  vencimento: "Vencimento",
};

/** Rótulo amigável do campo; campos desconhecidos aparecem com o nome original. */
export function rotuloCampo(campo: string): string {
  return ROTULO_CAMPO[campo] ?? campo;
}
