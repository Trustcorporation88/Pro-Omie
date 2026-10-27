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
  | "estoque:ver"
  | "estoque:editar"
  | "fiscal:ver"
  | "fiscal:editar"
  | "armazem:ver"
  | "armazem:editar"
  | "config:admin";

const MATRIZ: Record<PapelUsuario, Permissao[]> = {
  ADMIN: [
    "financeiro:ver",
    "financeiro:editar",
    "cadastros:ver",
    "cadastros:editar",
    "relatorios:ver",
    "vendas:ver",
    "vendas:editar",
    "crm:ver",
    "crm:editar",
    "estoque:ver",
    "estoque:editar",
    "fiscal:ver",
    "fiscal:editar",
    "armazem:ver",
    "armazem:editar",
    "config:admin",
  ],
  FINANCEIRO: [
    "financeiro:ver",
    "financeiro:editar",
    "cadastros:ver",
    "cadastros:editar",
    "relatorios:ver",
    "vendas:ver",
    "vendas:editar",
    "crm:ver",
    "crm:editar",
    "estoque:ver",
    "estoque:editar",
    "fiscal:ver",
    "fiscal:editar",
    "armazem:ver",
    "armazem:editar",
  ],
  // notas recebidas: financeiro manifesta e lança no contas a pagar; estoque e contador só consultam
  // vendas cria propostas e pedidos; faturar (gerar contas a receber) exige também financeiro:editar
  // vendas consulta o saldo para vender; a baixa no estoque acontece sozinha ao faturar
  // armazém geral: estoque (operação) e financeiro editam; vendas e contador consultam o que está guardado
  VENDAS: ["cadastros:ver", "cadastros:editar", "vendas:ver", "vendas:editar", "crm:ver", "crm:editar", "estoque:ver", "armazem:ver"],
  ESTOQUE: ["cadastros:ver", "cadastros:editar", "vendas:ver", "estoque:ver", "estoque:editar", "fiscal:ver", "armazem:ver", "armazem:editar"],
  CONTADOR: ["financeiro:ver", "cadastros:ver", "relatorios:ver", "vendas:ver", "estoque:ver", "fiscal:ver", "armazem:ver"],
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
