// Tipos e constantes das telas de Administração, compartilhados entre servidor e cliente.
// Não importe nada exclusivo de servidor aqui (prisma, next/headers, node:crypto…).
import type { PapelUsuario } from "@/lib/auth/permissoes";

// ───────────── Empresa e filiais ─────────────

export type TipoEmpresa = "matriz" | "filial";

/** Valores do formulário de empresa/filial: sempre texto, já formatado para exibição. */
export type ValoresEmpresa = {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string;
  inscricaoMunicipal: string;
  regimeTributario: string;
  cnae: string;
  email: string;
  telefone: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  codigoMunicipio: string;
};

export const VALORES_EMPRESA_VAZIOS: ValoresEmpresa = {
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  inscricaoEstadual: "",
  inscricaoMunicipal: "",
  regimeTributario: "SIMPLES_NACIONAL",
  cnae: "",
  email: "",
  telefone: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  codigoMunicipio: "",
};

// ───────────── Usuários ─────────────

export const PAPEIS: readonly PapelUsuario[] = ["ADMIN", "FINANCEIRO", "VENDAS", "ESTOQUE", "CONTADOR"];

/** Descrição curta do que cada papel pode fazer (espelha a matriz de src/lib/auth/permissoes.ts). */
export const DESCRICAO_PAPEL: Record<PapelUsuario, string> = {
  ADMIN: "Tudo, inclusive usuários e configurações.",
  FINANCEIRO: "Financeiro, vendas, CRM, estoque, cadastros e relatórios.",
  VENDAS: "CRM (funil e atividades), propostas, pedidos de venda e cadastros; consulta o estoque.",
  ESTOQUE: "Estoque (entradas, ajustes e saldos) e cadastros; consulta pedidos de venda.",
  CONTADOR: "Somente leitura do financeiro, das vendas, do estoque e dos relatórios (consulta também os cadastros).",
};

/** O que o cliente precisa saber de uma linha da tabela de usuários para montar as ações. */
/** Empresa (matriz) liberável a um usuário. */
export type EmpresaOpcao = { id: string; nome: string; cnpj: string };

/** Acesso por empresa de um usuário (admin sempre vê todas). */
export type AcessoEmpresas = { todasEmpresas: boolean; empresas: string[] };

export type UsuarioAcao = {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  ativo: boolean;
  todasEmpresas: boolean;
  empresas: string[];
  bloqueado: boolean;
  tentativasFalhas: number;
  /** é o usuário logado */
  souEu: boolean;
  /** é o único administrador ativo */
  ultimoAdminAtivo: boolean;
};

/** Senha provisória exibida uma única vez (vive só na memória do navegador). */
export type SegredoExibido = {
  tipo: "criado" | "redefinida";
  nome: string;
  email: string;
  senha: string;
};

// ───────────── Auditoria ─────────────

/** Registro de auditoria pronto para o cliente (sem Date; JSON já sem campos sensíveis). */
export type RegistroAuditoria = {
  id: string;
  /** dd/mm/aaaa hh:mm (America/Sao_Paulo) */
  dataHora: string;
  /** dd/mm/aaaa hh:mm:ss (America/Sao_Paulo) */
  dataHoraCompleta: string;
  usuario: { nome: string; email: string } | null;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  resumo: string | null;
  ip: string | null;
  dados: unknown;
};

export type FiltrosAuditoria = {
  q: string;
  entidade: string;
  usuario: string;
  de: string;
  ate: string;
  pagina: number;
};
