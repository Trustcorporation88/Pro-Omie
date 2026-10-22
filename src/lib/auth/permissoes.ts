// Matriz de permissões por papel. Seguro para client e server.

export type PapelUsuario = "ADMIN" | "FINANCEIRO" | "VENDAS" | "ESTOQUE" | "CONTADOR";

export type Permissao =
  | "financeiro:ver"
  | "financeiro:editar"
  | "cadastros:ver"
  | "cadastros:editar"
  | "relatorios:ver"
  | "vendas:ver"
  | "vendas:editar"
  | "crm:ver"
  | "crm:editar"
  | "config:admin";

const MATRIZ: Record<PapelUsuario, Permissao[]> = {
  ADMIN: ["financeiro:ver", "financeiro:editar", "cadastros:ver", "cadastros:editar", "relatorios:ver", "vendas:ver", "vendas:editar", "crm:ver", "crm:editar", "config:admin"],
  FINANCEIRO: ["financeiro:ver", "financeiro:editar", "cadastros:ver", "cadastros:editar", "relatorios:ver", "vendas:ver", "vendas:editar", "crm:ver", "crm:editar"],
  // vendas cria propostas e pedidos; faturar (gerar contas a receber) exige também financeiro:editar
  VENDAS: ["cadastros:ver", "cadastros:editar", "vendas:ver", "vendas:editar", "crm:ver", "crm:editar"],
  ESTOQUE: ["cadastros:ver", "cadastros:editar", "vendas:ver"],
  CONTADOR: ["financeiro:ver", "cadastros:ver", "relatorios:ver", "vendas:ver"],
};

export function pode(papel: PapelUsuario | null | undefined, permissao: Permissao): boolean {
  if (!papel) return false;
  return MATRIZ[papel]?.includes(permissao) ?? false;
}

export const ROTULO_PAPEL: Record<PapelUsuario, string> = {
  ADMIN: "Administrador",
  FINANCEIRO: "Financeiro",
  VENDAS: "Vendas",
  ESTOQUE: "Estoque",
  CONTADOR: "Contador (somente leitura)",
};
