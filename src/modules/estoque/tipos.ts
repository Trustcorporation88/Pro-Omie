// Estoque: listas fixas, tipos e formatação (seguro para client e server).
import { fmtDecimal } from "@/modules/vendas/calculos";

export const GRUPOS_MATERIAL = {
  PAPEL: "Papel e papelão",
  PLASTICO: "Plásticos",
  METAL_NAO_FERROSO: "Metais não ferrosos",
  METAL_FERROSO: "Metais ferrosos",
  METAL_PRECIOSO: "Metais preciosos",
  VIDRO: "Vidro",
  ELETRONICO: "Eletroeletrônicos",
  OUTROS: "Outros materiais",
} as const;
export type GrupoMaterial = keyof typeof GRUPOS_MATERIAL;
export const ORDEM_GRUPOS = Object.keys(GRUPOS_MATERIAL) as GrupoMaterial[];
export const rotuloGrupo = (g: string | null | undefined) => (g && g in GRUPOS_MATERIAL ? GRUPOS_MATERIAL[g as GrupoMaterial] : "Outros produtos");

/**
 * Materiais recicláveis mais comuns, oferecidos numa lista para marcar. NCM sugerido para desperdícios,
 * resíduos e sucatas (confirmar com o contador antes de emitir NF-e). `marcado`: vem marcado na lista.
 */
export const MATERIAIS_PADRAO: { codigo: string; descricao: string; grupo: GrupoMaterial; ncm: string | null; marcado: boolean }[] = [
  { codigo: "REC-PAPELAO", descricao: "Papelão (aparas)", grupo: "PAPEL", ncm: "47071000", marcado: true },
  { codigo: "REC-PAPEL", descricao: "Papel misto (aparas)", grupo: "PAPEL", ncm: "47079000", marcado: true },
  { codigo: "REC-PAPEL-BRANCO", descricao: "Papel branco (aparas)", grupo: "PAPEL", ncm: "47072000", marcado: false },
  { codigo: "REC-PLASTICO", descricao: "Plástico misto (aparas)", grupo: "PLASTICO", ncm: "39159000", marcado: true },
  { codigo: "REC-PET", descricao: "Plástico PET", grupo: "PLASTICO", ncm: "39159000", marcado: false },
  { codigo: "REC-PEAD", descricao: "Plástico PEAD", grupo: "PLASTICO", ncm: "39151000", marcado: false },
  { codigo: "REC-PP", descricao: "Plástico PP", grupo: "PLASTICO", ncm: "39159000", marcado: false },
  { codigo: "REC-FILME", descricao: "Plástico filme (PEBD)", grupo: "PLASTICO", ncm: "39151000", marcado: false },
  { codigo: "REC-ALUMINIO", descricao: "Sucata de alumínio", grupo: "METAL_NAO_FERROSO", ncm: "76020000", marcado: true },
  { codigo: "REC-COBRE", descricao: "Sucata de cobre", grupo: "METAL_NAO_FERROSO", ncm: "74040000", marcado: true },
  { codigo: "REC-LATAO", descricao: "Sucata de latão", grupo: "METAL_NAO_FERROSO", ncm: "74040000", marcado: false },
  { codigo: "REC-CHUMBO", descricao: "Sucata de chumbo", grupo: "METAL_NAO_FERROSO", ncm: "78020000", marcado: false },
  { codigo: "REC-FERRO", descricao: "Sucata de ferro", grupo: "METAL_FERROSO", ncm: "72044900", marcado: true },
  { codigo: "REC-INOX", descricao: "Sucata de aço inox", grupo: "METAL_FERROSO", ncm: "72042100", marcado: false },
  { codigo: "REC-PRATA", descricao: "Sucata de prata", grupo: "METAL_PRECIOSO", ncm: "71129900", marcado: true },
  { codigo: "REC-VIDRO", descricao: "Vidro (cacos)", grupo: "VIDRO", ncm: "70010000", marcado: false },
  { codigo: "REC-ELETRONICO", descricao: "Sucata eletrônica", grupo: "ELETRONICO", ncm: null, marcado: false },
];

export const MOTIVOS_AJUSTE = {
  INVENTARIO: "Inventário (contagem física)",
  PERDA: "Perda (umidade, quebra, impurezas)",
  CORRECAO: "Correção de lançamento",
  DESTINACAO: "Destinação sem venda (descarte, doação)",
  OUTRO: "Outro",
} as const;
export type MotivoAjuste = keyof typeof MOTIVOS_AJUSTE;

export type TipoLancamentoT = "ENTRADA" | "VENDA" | "AJUSTE";
export const ROTULO_TIPO_LANC: Record<TipoLancamentoT, string> = { ENTRADA: "Entrada", VENDA: "Venda", AJUSTE: "Ajuste" };
export const TOM_TIPO_LANC: Record<TipoLancamentoT, "sucesso" | "info" | "alerta"> = { ENTRADA: "sucesso", VENDA: "info", AJUSTE: "alerta" };

/** Fator para converter a unidade em quilos (unidades de massa); null para as demais. */
export function fatorKg(unidade: string): number | null {
  const u = unidade.trim().toUpperCase();
  if (u === "KG") return 1;
  if (u === "T" || u === "TON" || u === "TN") return 1000;
  if (u === "G" || u === "GR") return 0.001;
  return null;
}

const rotuloUnidade = (u: string) => (u.trim().toUpperCase() === "KG" ? "kg" : u.trim().toUpperCase() === "G" ? "g" : u.trim().toUpperCase());

/** "1.240,5 kg", "3 UN". */
export function fmtQtd(q: number, unidade: string): string {
  return `${fmtDecimal(q, 0, 3)} ${rotuloUnidade(unidade)}`;
}

/** Peso total em kg formatado: "850 kg" ou "12,45 t" a partir de 1 tonelada. */
export function fmtPeso(kg: number): string {
  if (Math.abs(kg) >= 1000) return `${fmtDecimal(kg / 1000, 0, 2)} t`;
  return `${fmtDecimal(kg, 0, 1)} kg`;
}

export type Opcao = { valor: string; rotulo: string };

/** Material (produto com controle de estoque) com os saldos por estabelecimento. */
export type MaterialEstoque = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  grupo: string | null;
  precoVenda: number;
  ativo: boolean;
  saldos: Record<string, number>;
  /** custo médio por estabelecimento (entradas por nota fiscal) */
  custos: Record<string, number>;
};

export type LinhaSaldo = MaterialEstoque & {
  saldo: number;
  valorEstimado: number;
  /** custo médio ponderado pelos saldos dos estabelecimentos */
  custoMedio: number;
  ultimaEntrada: string | null;
  vendido30: number;
};

export type ItemLancamento = { produtoId: string; codigo: string; descricao: string; unidade: string; quantidade: number; saldoContado: number | null };

export type LancamentoLista = {
  id: string;
  numero: number;
  tipo: TipoLancamentoT;
  data: string;
  empresaId: string;
  empresaNome: string;
  pessoaNome: string | null;
  referencia: string | null;
  motivo: string | null;
  observacao: string | null;
  pedido: { id: string; numero: number; cliente: string } | null;
  usuarioNome: string | null;
  itens: ItemLancamento[];
  pesoKg: number;
};

/** Linha de estoque de um pedido em aberto (diálogo de faturar). */
export type EstoquePedido = { produtoId: string; descricao: string; unidade: string; quantidade: number; saldo: number };
