// Armazém geral (mercadorias de terceiros): tipos, rótulos e regras puras. Seguro para client e server.

export type TipoVolume = "CAIXA" | "PALLET";
export type StatusVolume = "ABERTO" | "FECHADO" | "EXPEDIDO";
export type StatusRecebimento = "CONFERENCIA" | "CONCLUIDO";

export const ROTULO_TIPO_VOLUME: Record<TipoVolume, string> = { CAIXA: "Caixa", PALLET: "Pallet" };
export const PREFIXO_VOLUME: Record<TipoVolume, string> = { CAIXA: "CX", PALLET: "PL" };
export const ROTULO_STATUS_RECEBIMENTO: Record<StatusRecebimento, string> = { CONFERENCIA: "Em conferência", CONCLUIDO: "Conferido" };

/** Número com 4 dígitos (cresce sozinho depois de 9999). */
export const numero4 = (n: number) => String(n).padStart(4, "0");
/** Código curto da caixa ou pallet, impresso na etiqueta e usado na busca: CX-0001, PL-0001. */
export const codigoVolume = (tipo: TipoVolume, numero: number) => `${PREFIXO_VOLUME[tipo]}-${numero4(numero)}`;
/** Nome por extenso: Caixa 0001, Pallet 0001. */
export const nomeVolume = (tipo: TipoVolume, numero: number) => `${ROTULO_TIPO_VOLUME[tipo]} ${numero4(numero)}`;
export const numeroRecebimento = (n: number) => `REC-${numero4(n)}`;

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");

/** Lê o código de uma caixa ou pallet como a pessoa digita ou o leitor lê: "CX-12", "cx 0012", "caixa 12", "PL3", "pallet nº 7". */
export function lerCodigoVolume(texto: string): { tipo: TipoVolume; numero: number } | null {
  const t = semAcento(texto).trim().toUpperCase();
  const m = t.match(/^(CX|CAIXA|PL|PLT|PALLET|PALETE)\s*[-–#.:/]?\s*(?:N[O°º]?\s*[.:]?\s*)?0*(\d{1,9})$/);
  if (!m) return null;
  const numero = Number(m[2]);
  if (!Number.isSafeInteger(numero) || numero < 1) return null;
  return { tipo: m[1].startsWith("C") ? "CAIXA" : "PALLET", numero };
}

/** Situação do volume para a tela: em conferência, sem endereço, armazenado ou expedido. */
export function situacaoVolume(status: StatusVolume, temEndereco: boolean): { rotulo: string; tom: "info" | "alerta" | "sucesso" | "neutro" } {
  if (status === "EXPEDIDO") return { rotulo: "Expedido", tom: "neutro" };
  if (status === "ABERTO") return { rotulo: "Em conferência", tom: "info" };
  return temEndereco ? { rotulo: "Armazenado", tom: "sucesso" } : { rotulo: "Sem endereço", tom: "alerta" };
}

export const TIPOS_ENDERECO = {
  PORTA_PALLET: "Porta-pallet",
  PRATELEIRA: "Prateleira",
  PISO: "Piso / blocado",
  MEZANINO: "Mezanino",
  OUTRO: "Outro",
} as const;
export type TipoEndereco = keyof typeof TIPOS_ENDERECO;
export const rotuloTipoEndereco = (t: string) => (t in TIPOS_ENDERECO ? TIPOS_ENDERECO[t as TipoEndereco] : t);

/** Código do endereço: maiúsculas, espaços viram hífen, só letras, números, hífen, ponto e barra. Até 30 caracteres. */
export function normalizarCodigoEndereco(s: string): string {
  return semAcento(s)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9./-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

/** Código do produto do depositante e lote: sem espaços nas pontas e em maiúsculas, para juntar os iguais ("lotes semelhantes"). */
export const normalizarCodigoProduto = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 60);
export const normalizarLote = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, 60);

export const arred3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function fmtQuantidade(q: number, unidade?: string | null): string {
  const s = q.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return unidade ? `${s} ${unidade.toLowerCase()}` : s;
}

// ───────────────────────── Geração de endereços em lote ─────────────────────────

export type GeracaoEnderecos = {
  /** "A", "A-C", "A,B,D", "1-3" ou "R1,R2" */
  ruas: string;
  moduloDe: number;
  moduloAte: number;
  nivelDe: number;
  nivelAte: number;
  /** posições dentro do nível (opcional) */
  posicaoDe?: number | null;
  posicaoAte?: number | null;
};

export const MAX_ENDERECOS_POR_VEZ = 2000;

/** Expande a lista de ruas: intervalos de uma letra ("A-C") ou de números ("1-3"), separados por vírgula. */
export function expandirRuas(texto: string): string[] | { erro: string } {
  const partes = semAcento(texto)
    .toUpperCase()
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!partes.length) return { erro: "Informe ao menos uma rua (ex.: A, A-C ou 1-3)." };
  const ruas: string[] = [];
  for (const p of partes) {
    const letras = p.match(/^([A-Z])-([A-Z])$/);
    const numeros = p.match(/^(\d{1,3})-(\d{1,3})$/);
    if (letras) {
      const [a, b] = [letras[1].charCodeAt(0), letras[2].charCodeAt(0)];
      if (a > b) return { erro: `Intervalo de ruas invertido: ${p}.` };
      for (let c = a; c <= b; c++) ruas.push(String.fromCharCode(c));
    } else if (numeros) {
      const [a, b] = [Number(numeros[1]), Number(numeros[2])];
      if (a > b) return { erro: `Intervalo de ruas invertido: ${p}.` };
      const largura = Math.max(numeros[1].length, numeros[2].length, 2);
      for (let n = a; n <= b; n++) ruas.push(String(n).padStart(largura, "0"));
    } else if (/^[A-Z0-9]{1,6}$/.test(p)) {
      ruas.push(p);
    } else {
      return { erro: `Rua inválida: "${p}". Use letras e números (ex.: A, B2 ou 1-3).` };
    }
  }
  return [...new Set(ruas)];
}

/** Códigos RUA-MÓDULO-NÍVEL(-POSIÇÃO), com dois dígitos: A-01-01, A-01-02… */
export function gerarCodigosEnderecos(g: GeracaoEnderecos): { codigos: { codigo: string; zona: string }[] } | { erro: string } {
  const ruas = expandirRuas(g.ruas);
  if (!Array.isArray(ruas)) return ruas;
  const faixa = (de: number | null | undefined, ate: number | null | undefined, nome: string): number[] | { erro: string } => {
    if (!Number.isInteger(de) || !Number.isInteger(ate) || (de as number) < 0 || (ate as number) > 999) return { erro: `Informe ${nome} de 0 a 999.` };
    if ((de as number) > (ate as number)) return { erro: `${nome[0].toUpperCase()}${nome.slice(1)}: o início é maior que o fim.` };
    return Array.from({ length: (ate as number) - (de as number) + 1 }, (_, i) => (de as number) + i);
  };
  const modulos = faixa(g.moduloDe, g.moduloAte, "os módulos");
  if (!Array.isArray(modulos)) return modulos;
  const niveis = faixa(g.nivelDe, g.nivelAte, "os níveis");
  if (!Array.isArray(niveis)) return niveis;
  const comPosicao = g.posicaoDe != null || g.posicaoAte != null;
  const posicoes = comPosicao ? faixa(g.posicaoDe, g.posicaoAte, "as posições") : [null];
  if (!Array.isArray(posicoes)) return posicoes;
  const total = ruas.length * modulos.length * niveis.length * posicoes.length;
  if (total > MAX_ENDERECOS_POR_VEZ) return { erro: `Seriam ${total.toLocaleString("pt-BR")} endereços; gere até ${MAX_ENDERECOS_POR_VEZ.toLocaleString("pt-BR")} por vez.` };
  const d2 = (n: number) => String(n).padStart(2, "0");
  const codigos: { codigo: string; zona: string }[] = [];
  for (const r of ruas)
    for (const m of modulos)
      for (const n of niveis)
        for (const p of posicoes) codigos.push({ codigo: [r, d2(m), d2(n), ...(p === null ? [] : [d2(p)])].join("-"), zona: r });
  return { codigos };
}

// ───────────────────────── Conferência: esperado × conferido ─────────────────────────

export type ItemQuantidade = { produtoId: string; codigo: string; descricao: string; unidade: string; lote: string; quantidade: number };

export type SituacaoComparativo = "OK" | "FALTA" | "SOBRA" | "NAO_PREVISTO";
export const ROTULO_SITUACAO_COMPARATIVO: Record<SituacaoComparativo, string> = { OK: "Confere", FALTA: "Falta", SOBRA: "Sobra", NAO_PREVISTO: "Fora da nota" };

export type LinhaComparativo = {
  produtoId: string;
  codigo: string;
  descricao: string;
  unidade: string;
  /** null: a nota não traz lote, a comparação é pelo total do produto */
  lote: string | null;
  /** lotes encontrados na conferência (quando a comparação é pelo total) */
  lotesConferidos: string[];
  esperado: number;
  conferido: number;
  diferenca: number;
  situacao: SituacaoComparativo;
};

export type ResumoComparativo = { ok: number; falta: number; sobra: number; naoPrevisto: number; esperado: number; conferido: number };

function somarPorLote(itens: ItemQuantidade[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of itens) m.set(i.lote, arred3((m.get(i.lote) ?? 0) + i.quantidade));
  return m;
}

const situacaoDe = (esperado: number, conferido: number, previsto: boolean): SituacaoComparativo =>
  !previsto ? "NAO_PREVISTO" : Math.abs(conferido - esperado) < 0.0005 ? "OK" : conferido < esperado ? "FALTA" : "SOBRA";

/**
 * Compara o que os documentos dizem com o que foi conferido nas caixas e pallets.
 * Produto cuja nota não traz lote: compara o total (e lista os lotes encontrados). Nota com lote: compara lote a lote.
 */
export function compararRecebimento(esperados: ItemQuantidade[], conferidos: ItemQuantidade[]): { linhas: LinhaComparativo[]; resumo: ResumoComparativo } {
  const produtos = new Map<string, { codigo: string; descricao: string; unidade: string }>();
  for (const i of [...esperados, ...conferidos]) if (!produtos.has(i.produtoId)) produtos.set(i.produtoId, { codigo: i.codigo, descricao: i.descricao, unidade: i.unidade });
  const linhas: LinhaComparativo[] = [];
  for (const [produtoId, p] of produtos) {
    const e = somarPorLote(esperados.filter((i) => i.produtoId === produtoId));
    const c = somarPorLote(conferidos.filter((i) => i.produtoId === produtoId));
    const lotesC = [...c.keys()].filter(Boolean).sort();
    const totalC = arred3([...c.values()].reduce((a, v) => a + v, 0));
    if (e.size === 0) {
      for (const [lote, q] of c) linhas.push({ produtoId, ...p, lote, lotesConferidos: [], esperado: 0, conferido: q, diferenca: q, situacao: "NAO_PREVISTO" });
      continue;
    }
    if (e.size === 1 && e.has("")) {
      const totalE = e.get("")!;
      linhas.push({ produtoId, ...p, lote: null, lotesConferidos: lotesC, esperado: totalE, conferido: totalC, diferenca: arred3(totalC - totalE), situacao: situacaoDe(totalE, totalC, true) });
      continue;
    }
    for (const lote of [...new Set([...e.keys(), ...c.keys()])].sort()) {
      const esp = e.get(lote) ?? 0;
      const conf = c.get(lote) ?? 0;
      linhas.push({ produtoId, ...p, lote, lotesConferidos: [], esperado: esp, conferido: conf, diferenca: arred3(conf - esp), situacao: situacaoDe(esp, conf, true) });
    }
  }
  linhas.sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }) || (a.lote ?? "").localeCompare(b.lote ?? "", "pt-BR", { numeric: true }));
  const resumo: ResumoComparativo = {
    ok: linhas.filter((l) => l.situacao === "OK").length,
    falta: linhas.filter((l) => l.situacao === "FALTA").length,
    sobra: linhas.filter((l) => l.situacao === "SOBRA").length,
    naoPrevisto: linhas.filter((l) => l.situacao === "NAO_PREVISTO").length,
    esperado: arred3(esperados.reduce((a, i) => a + i.quantidade, 0)),
    conferido: arred3(conferidos.reduce((a, i) => a + i.quantidade, 0)),
  };
  return { linhas, resumo };
}

/** O que ainda não foi posto em nenhuma caixa ou pallet: esperado − conferido, por produto e lote (ou pelo total, quando a nota não traz lote). */
export function restantesDoRecebimento(esperados: ItemQuantidade[], conferidos: ItemQuantidade[]): { produtoId: string; lote: string; quantidade: number }[] {
  const { linhas } = compararRecebimento(esperados, conferidos);
  return linhas
    .filter((l) => l.situacao === "FALTA" && l.diferenca < 0)
    .map((l) => ({ produtoId: l.produtoId, lote: l.lote ?? "", quantidade: arred3(-l.diferenca) }));
}

/** Divide a quantidade de um item da nota pelos lotes do rastro; o que sobrar fica sem lote. */
export function linhasDoItemNota(quantidade: number, lotes: { numero: string; quantidade: number }[]): { lote: string; quantidade: number }[] {
  const linhas = new Map<string, number>();
  let resto = arred3(quantidade);
  for (const l of lotes) {
    const lote = normalizarLote(l.numero);
    const q = arred3(Math.min(l.quantidade, resto));
    if (!lote || !(q > 0)) continue;
    linhas.set(lote, arred3((linhas.get(lote) ?? 0) + q));
    resto = arred3(resto - q);
  }
  if (resto > 0) linhas.set("", arred3((linhas.get("") ?? 0) + resto));
  return [...linhas].map(([lote, q]) => ({ lote, quantidade: q }));
}
