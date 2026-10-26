import type { Permissao } from "@/lib/auth/permissoes";

export type ItemNav = {
  titulo: string;
  href: string;
  icone: string;
  permissao?: Permissao;
  emBreve?: string;
};

export type GrupoNav = { titulo: string; itens: ItemNav[] };

export const NAVEGACAO: GrupoNav[] = [
  {
    titulo: "Visão geral",
    itens: [{ titulo: "Painel", href: "/", icone: "LayoutDashboard" }],
  },
  {
    titulo: "Financeiro",
    itens: [
      { titulo: "Contas a receber", href: "/financeiro/receber", icone: "CircleArrowDown", permissao: "financeiro:ver" },
      { titulo: "Cobranças", href: "/financeiro/cobrancas", icone: "CreditCard", permissao: "financeiro:ver" },
      { titulo: "Contas a pagar", href: "/financeiro/pagar", icone: "CircleArrowUp", permissao: "financeiro:ver" },
      { titulo: "Movimentações", href: "/financeiro/movimentacoes", icone: "Landmark", permissao: "financeiro:ver" },
      { titulo: "Conciliação bancária", href: "/financeiro/conciliacao", icone: "GitCompareArrows", permissao: "financeiro:ver" },
      { titulo: "Fluxo de caixa", href: "/financeiro/fluxo-de-caixa", icone: "ChartLine", permissao: "relatorios:ver" },
      { titulo: "DRE gerencial", href: "/financeiro/dre", icone: "FileChartColumn", permissao: "relatorios:ver" },
    ],
  },
  {
    titulo: "CRM",
    itens: [
      { titulo: "Funil de vendas", href: "/crm/funil", icone: "SquareKanban", permissao: "crm:ver" },
      { titulo: "Atividades", href: "/crm/atividades", icone: "ListTodo", permissao: "crm:ver" },
    ],
  },
  {
    titulo: "Vendas",
    itens: [
      { titulo: "Propostas", href: "/vendas/propostas", icone: "FileText", permissao: "vendas:ver" },
      { titulo: "Pedidos de venda", href: "/vendas/pedidos", icone: "ShoppingCart", permissao: "vendas:ver" },
    ],
  },
  {
    titulo: "Estoque",
    itens: [
      { titulo: "Saldos", href: "/estoque", icone: "Boxes", permissao: "estoque:ver" },
      { titulo: "Movimentações", href: "/estoque/movimentacoes", icone: "ArrowLeftRight", permissao: "estoque:ver" },
      { titulo: "Vendas por material", href: "/estoque/vendas", icone: "ChartColumn", permissao: "estoque:ver" },
      { titulo: "Compras", href: "/estoque/compras", icone: "PackagePlus", permissao: "fiscal:ver" },
      { titulo: "Importar planilha", href: "/estoque/importar", icone: "FileSpreadsheet", permissao: "estoque:editar" },
    ],
  },
  {
    titulo: "Serviços",
    itens: [
      { titulo: "Contratos recorrentes", href: "/cadastros/contratos", icone: "Repeat", permissao: "cadastros:ver" },
      { titulo: "Ordens de serviço", href: "/cadastros/ordens", icone: "Wrench", permissao: "cadastros:ver" },
    ],
  },
  {
    titulo: "Fiscal",
    itens: [
      { titulo: "Notas emitidas", href: "/fiscal/emitidas", icone: "FileText", permissao: "fiscal:ver" },
      { titulo: "Notas de serviço", href: "/fiscal/servicos", icone: "FileBadge", permissao: "fiscal:ver" },
      { titulo: "Notas recebidas", href: "/fiscal/recebidas", icone: "FileInput", permissao: "fiscal:ver" },
      { titulo: "Fechamento mensal", href: "/contador", icone: "FileArchive", permissao: "fiscal:ver" },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { titulo: "Clientes e fornecedores", href: "/cadastros/pessoas", icone: "Users", permissao: "cadastros:ver" },
      { titulo: "Produtos e serviços", href: "/cadastros/produtos", icone: "Package", permissao: "cadastros:ver" },
      { titulo: "Categorias financeiras", href: "/cadastros/categorias", icone: "Tags", permissao: "cadastros:ver" },
      { titulo: "Centros de custo", href: "/cadastros/centros-de-custo", icone: "Target", permissao: "cadastros:ver" },
      { titulo: "Contas bancárias", href: "/cadastros/contas-bancarias", icone: "Wallet", permissao: "cadastros:ver" },
      { titulo: "Formas de pagamento", href: "/cadastros/formas-de-pagamento", icone: "CreditCard", permissao: "cadastros:ver" },
      { titulo: "Condições de pagamento", href: "/cadastros/condicoes-de-pagamento", icone: "CalendarClock", permissao: "cadastros:ver" },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { titulo: "Empresa e filiais", href: "/configuracoes/empresa", icone: "Building", permissao: "config:admin" },
      { titulo: "Usuários", href: "/configuracoes/usuarios", icone: "UserCog", permissao: "config:admin" },
      { titulo: "E-mails", href: "/configuracoes/email", icone: "Mail", permissao: "config:admin" },
      { titulo: "Auditoria", href: "/configuracoes/auditoria", icone: "ScrollText", permissao: "config:admin" },
    ],
  },
  {
    titulo: "Ajuda",
    itens: [{ titulo: "Manual do usuário", href: "/ajuda", icone: "BookOpen" }],
  },
];
