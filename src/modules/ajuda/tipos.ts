// Manual do usuário: tipos, texto com marcação simples e ligação com o menu. Seguro para client e server.
//
// Marcação aceita nos textos do manual:
//   **negrito**                       → nomes de botões e campos
//   [[/rota]]                         → caminho do menu ("Estoque › Importar planilha"), com link para a tela
//   [[ajuda:secao#topico|texto]]      → link para outra parte do manual
import { NAVEGACAO } from "@/components/layout/navegacao";
import { pode, type PapelUsuario, type Permissao } from "@/lib/auth/permissoes";
import type { IdImagem } from "./imagens";

export type Bloco =
  | { tipo: "texto"; texto: string }
  | { tipo: "passos"; titulo?: string; itens: string[] }
  | { tipo: "lista"; titulo?: string; itens: string[] }
  | { tipo: "dica"; texto: string }
  | { tipo: "atencao"; texto: string }
  | { tipo: "tabela"; colunas: string[]; linhas: string[][] }
  /** imagem da tela (public/manual/<imagem>.png); marcas = o que é cada número laranja da imagem, na ordem */
  | { tipo: "imagem"; imagem: IdImagem; legenda: string; alt: string; marcas?: string[] };

export type Topico = {
  id: string;
  titulo: string;
  /** telas (prefixos de caminho) que abrem direto neste tópico pelo botão Manual */
  caminhos?: string[];
  blocos: Bloco[];
};

export type Secao = {
  id: string;
  titulo: string;
  resumo: string;
  icone: string;
  /** quem vê esta parte do manual (a mesma permissão das telas dela); vazio = todos */
  permissao?: Permissao;
  /** quem usa, em uma frase */
  quem: string;
  /** telas (prefixos de caminho) desta seção; "/" casa só com o painel */
  caminhos: string[];
  topicos: Topico[];
};

export type ParteTexto = { tipo: "texto"; valor: string } | { tipo: "negrito"; valor: string } | { tipo: "link"; valor: string; href: string; menu: boolean };

const MARCACAO = /\*\*(.+?)\*\*|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/** Item do menu de uma rota (sem query nem âncora). */
export function itemDoMenu(rota: string) {
  const caminho = rota.split(/[?#]/)[0]!;
  for (const g of NAVEGACAO) for (const i of g.itens) if (!i.emBreve && i.href === caminho) return { grupo: g.titulo, item: i.titulo, href: i.href, permissao: i.permissao };
  return null;
}

/** "Estoque › Importar planilha" para a rota; null se a rota não está no menu. */
export function caminhoDoMenu(rota: string): string | null {
  const m = itemDoMenu(rota);
  return m ? `${m.grupo} › ${m.item}` : null;
}

/** Quebra o texto em partes (texto, negrito, link do menu ou do manual). Referência desconhecida vira texto. */
export function partesTexto(texto: string): ParteTexto[] {
  const partes: ParteTexto[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(MARCACAO)) {
    if (m.index! > ultimo) partes.push({ tipo: "texto", valor: texto.slice(ultimo, m.index) });
    if (m[1] !== undefined) partes.push({ tipo: "negrito", valor: m[1] });
    else {
      const alvo = m[2]!.trim();
      if (alvo.startsWith("ajuda:")) {
        const [secao, topico] = alvo.slice(6).split("#");
        partes.push({ tipo: "link", valor: m[3]?.trim() || secao!, href: `/ajuda/${secao}${topico ? `#${topico}` : ""}`, menu: false });
      } else {
        const rotulo = caminhoDoMenu(alvo);
        partes.push(rotulo ? { tipo: "link", valor: m[3]?.trim() || rotulo, href: alvo, menu: true } : { tipo: "texto", valor: m[3]?.trim() || alvo });
      }
    }
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ tipo: "texto", valor: texto.slice(ultimo) });
  return partes;
}

/** Texto sem marcação (busca e PDF). */
export function textoPlano(texto: string): string {
  return partesTexto(texto)
    .map((p) => p.valor)
    .join("");
}

/** Todas as referências do texto (para os testes conferirem que existem). */
export function referencias(texto: string): string[] {
  return [...texto.matchAll(MARCACAO)].filter((m) => m[2] !== undefined).map((m) => m[2]!.trim());
}

export const podeVerSecao = (s: Secao, papel: PapelUsuario) => !s.permissao || pode(papel, s.permissao);

/** Seção (e tópico) do manual da tela: o prefixo mais longo que casa com o caminho. */
export function destinoDaTela(secoes: Secao[], caminho: string): { secao: Secao; topico?: string } | null {
  const casa = (prefixo: string) => (prefixo === "/" ? caminho === "/" : caminho === prefixo || caminho.startsWith(`${prefixo}/`));
  let melhor: { secao: Secao; topico?: string; tamanho: number } | null = null;
  for (const s of secoes) {
    for (const c of s.caminhos) if (casa(c) && (!melhor || c.length > melhor.tamanho)) melhor = { secao: s, tamanho: c.length };
    // no empate com o caminho da seção, vale o tópico (mais específico)
    for (const t of s.topicos) for (const c of t.caminhos ?? []) if (casa(c) && (!melhor || c.length > melhor.tamanho || (c.length === melhor.tamanho && !melhor.topico))) melhor = { secao: s, topico: t.id, tamanho: c.length };
  }
  return melhor ? { secao: melhor.secao, topico: melhor.topico } : null;
}

/** Texto plano de um bloco (busca e PDF). */
export function textoDoBloco(b: Bloco): string {
  if (b.tipo === "texto" || b.tipo === "dica" || b.tipo === "atencao") return textoPlano(b.texto);
  if (b.tipo === "passos" || b.tipo === "lista") return [b.titulo ?? "", ...b.itens.map(textoPlano)].join(" ");
  if (b.tipo === "imagem") return [b.legenda, ...(b.marcas ?? [])].map(textoPlano).join(" ");
  return [...b.colunas, ...b.linhas.flat()].map(textoPlano).join(" ");
}
