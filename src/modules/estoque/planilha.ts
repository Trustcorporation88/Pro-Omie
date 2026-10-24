// Importação do estoque por planilha (.xlsx ou .csv): acha as colunas, monta a prévia linha a linha sem gravar nada
// e aplica tudo ou nada (materiais novos, dados atualizados e um lançamento de entrada ou de inventário).
// Também gera o modelo para baixar, já com os materiais cadastrados e o saldo atual. Só servidor.
import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { num } from "@/lib/serial";
import { gerarXlsx, type AbaSaida, type Celula, type CelulaSaida, type Planilha } from "@/lib/planilha";
import { lerDecimal } from "@/modules/vendas/calculos";
import { GRUPOS_MATERIAL, MATERIAIS_PADRAO, ORDEM_GRUPOS, fatorKg, type GrupoMaterial } from "./tipos";
import { proximoNumeroEstoque, somarSaldo } from "./servicos";

export type ModoQuantidade = "ENTRADA" | "INVENTARIO";
export const MAX_LINHAS_IMPORTACAO = 1000;

/** Cabeçalhos do modelo, na ordem. */
export const COLUNAS_MODELO = ["Código", "Descrição", "Unidade", "Grupo", "NCM", "Preço de venda (R$)", "Quantidade", "Custo unitário (R$)", "Saldo atual (referência)"] as const;

type Campo = "codigo" | "descricao" | "unidade" | "grupo" | "ncm" | "preco" | "quantidade" | "custo";
const ROTULO_CAMPO: Record<Campo, string> = {
  codigo: "Código",
  descricao: "Descrição",
  unidade: "Unidade",
  grupo: "Grupo",
  ncm: "NCM",
  preco: "Preço de venda",
  quantidade: "Quantidade",
  custo: "Custo unitário",
};

/** "Preço de venda (R$)" → "precodevendars". */
const chave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const SINONIMOS: Record<Campo | "ignorar", string[]> = {
  codigo: ["codigo", "cod", "codigodomaterial", "codigodoproduto", "codproduto", "codmaterial", "sku", "codinterno", "codigointerno"],
  descricao: ["descricao", "material", "produto", "nome", "item", "descricaodomaterial", "descricaodoproduto", "nomedomaterial", "nomedoproduto"],
  unidade: ["unidade", "un", "und", "unid", "um", "unidadedemedida", "medida"],
  grupo: ["grupo", "grupodomaterial", "categoria", "tipodematerial", "classe", "familia"],
  ncm: ["ncm", "codigoncm", "ncmsh"],
  preco: ["preco", "precors", "precodevenda", "precodevendars", "precovenda", "precounitario", "valordevenda", "valorvenda", "precokg", "precorskg"],
  quantidade: ["quantidade", "qtd", "qtde", "quant", "quantidadecontada", "contagem", "saldocontado", "saldo", "saldofinal", "peso", "pesokg", "quantidadekg", "estoque"],
  custo: ["custo", "custors", "custounitario", "custounitariors", "customedio", "custokg", "valordecompra", "precodecusto", "precodecompra"],
  ignorar: ["saldoatual", "saldoatualreferencia", "saldoreferencia", "saldodosistema", "saldosistema"],
};

function campoDoCabecalho(titulo: string): Campo | "ignorar" | null {
  const k = chave(titulo);
  if (!k) return null;
  for (const [campo, lista] of Object.entries(SINONIMOS) as [Campo | "ignorar", string[]][]) if (lista.includes(k)) return campo;
  if (k.startsWith("saldoatual")) return "ignorar";
  if (k.startsWith("custo") || k.startsWith("precodecusto") || k.startsWith("precodecompra")) return "custo";
  if (k.startsWith("preco")) return "preco";
  if (k.startsWith("quantidade") || k.startsWith("qtd")) return "quantidade";
  if (k.startsWith("descricao")) return "descricao";
  if (k.startsWith("codigo") && !k.includes("ncm")) return "codigo";
  if (k.startsWith("unidade")) return "unidade";
  if (k.startsWith("grupo")) return "grupo";
  if (k.startsWith("ncm")) return "ncm";
  return null;
}

export type LinhaLida = { numero: number } & Record<Campo, Celula>;
export type PlanilhaLida = { aba: string; formato: Planilha["formato"]; encontradas: string[]; ignoradas: string[]; temQuantidade: boolean; linhas: LinhaLida[] };

/** Acha o cabeçalho (nas 15 primeiras linhas da primeira aba que tiver Código ou Descrição) e lê as linhas de dados. */
export function interpretarPlanilha(p: Planilha): PlanilhaLida {
  for (const aba of p.abas) {
    const idx = aba.linhas.slice(0, 15).findIndex((l) => l.celulas.some((c) => typeof c === "string" && ["codigo", "descricao"].includes(campoDoCabecalho(c) ?? "")));
    if (idx < 0) continue;
    const cab = aba.linhas[idx]!;
    const posicao = new Map<Campo, number>();
    const encontradas: string[] = [];
    const ignoradas: string[] = [];
    cab.celulas.forEach((c, i) => {
      if (c === null || c === "") return;
      const titulo = String(c);
      const campo = campoDoCabecalho(titulo);
      if (campo && campo !== "ignorar" && !posicao.has(campo)) {
        posicao.set(campo, i);
        encontradas.push(ROTULO_CAMPO[campo]);
      } else ignoradas.push(titulo);
    });
    const linhas: LinhaLida[] = [];
    for (const l of aba.linhas.slice(idx + 1)) {
      const valor = (campo: Campo): Celula => {
        const i = posicao.get(campo);
        const v = i === undefined ? null : (l.celulas[i] ?? null);
        return typeof v === "string" && !v.trim() ? null : v;
      };
      const lida = { numero: l.numero } as LinhaLida;
      for (const campo of Object.keys(ROTULO_CAMPO) as Campo[]) lida[campo] = valor(campo);
      if ((Object.keys(ROTULO_CAMPO) as Campo[]).every((campo) => lida[campo] === null)) continue;
      if (linhas.length >= MAX_LINHAS_IMPORTACAO)
        throw new ErroAcao(`A planilha passa de ${MAX_LINHAS_IMPORTACAO.toLocaleString("pt-BR")} linhas com dados. Divida em mais de um arquivo.`);
      linhas.push(lida);
    }
    if (!linhas.length) throw new ErroAcao(`A aba "${aba.nome}" tem o cabeçalho mas nenhuma linha com dados embaixo dele.`);
    return { aba: aba.nome, formato: p.formato, encontradas, ignoradas, temQuantidade: posicao.has("quantidade"), linhas };
  }
  throw new ErroAcao("Não encontrei o cabeçalho: a planilha precisa de uma linha com as colunas Código e/ou Descrição. Baixe o modelo nesta tela e use-o como base.");
}

// ───────────────────────── valores de cada célula ─────────────────────────

function textoDe(c: Celula): string {
  if (c === null) return "";
  if (typeof c === "number") return String(c);
  if (typeof c === "boolean") return c ? "SIM" : "NÃO";
  return c.replace(/\s+/g, " ").trim();
}

/** Número da célula: vazio = null; "invalido" para texto que não é número ("12kg", "#N/D", "abc"). */
function numeroDe(c: Celula, casas: number): number | null | "invalido" {
  if (c === null) return null;
  if (typeof c === "boolean") return "invalido";
  if (typeof c === "number") return Number.isFinite(c) ? Math.round((c + Number.EPSILON) * 10 ** casas) / 10 ** casas : "invalido";
  const s = c.trim();
  if (!s || s === "-") return null;
  if (!/\d/.test(s) || /[a-zA-Z#]/.test(s.replace(/R\$/gi, ""))) return "invalido";
  const n = lerDecimal(s, casas);
  return Number.isFinite(n) ? n : "invalido";
}

const UNIDADES: Record<string, string> = {
  KG: "KG", KGS: "KG", QUILO: "KG", QUILOS: "KG", QUILOGRAMA: "KG", QUILOGRAMAS: "KG", KILO: "KG", KILOS: "KG", KILOGRAMA: "KG", KILOGRAMAS: "KG",
  G: "G", GR: "G", GRAMA: "G", GRAMAS: "G",
  TONELADA: "TON", TONELADAS: "TON",
  UND: "UN", UNID: "UN", UNIDADE: "UN", UNIDADES: "UN",
  PECA: "PC", PECAS: "PC", PCS: "PC",
  CAIXA: "CX", CAIXAS: "CX",
  LT: "L", LITRO: "L", LITROS: "L",
  METRO: "M", METROS: "M",
};

/** "quilos" → "KG"; códigos curtos (até 6 caracteres, limite da NF-e) ficam como estão, em maiúsculas. */
function normalizarUnidade(s: string): string | null | "invalida" {
  const t = s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!t) return null;
  if (UNIDADES[t]) return UNIDADES[t]!;
  return t.length <= 6 ? t : "invalida";
}

const mesmaUnidade = (a: string, b: string) => {
  const x = normalizarUnidade(a);
  const y = normalizarUnidade(b);
  if (x === y) return true;
  const fx = typeof x === "string" && x !== "invalida" ? fatorKg(x) : null;
  return fx !== null && typeof y === "string" && y !== "invalida" && fatorKg(y) === fx;
};

const APELIDOS_GRUPO: Record<string, GrupoMaterial> = {
  papelao: "PAPEL", papeis: "PAPEL", papelepapelao: "PAPEL", aparas: "PAPEL",
  plasticos: "PLASTICO",
  naoferroso: "METAL_NAO_FERROSO", naoferrosos: "METAL_NAO_FERROSO", metalnaoferroso: "METAL_NAO_FERROSO", aluminio: "METAL_NAO_FERROSO", cobre: "METAL_NAO_FERROSO",
  ferroso: "METAL_FERROSO", ferrosos: "METAL_FERROSO", metalferroso: "METAL_FERROSO", ferro: "METAL_FERROSO", aco: "METAL_FERROSO", sucata: "METAL_FERROSO",
  precioso: "METAL_PRECIOSO", preciosos: "METAL_PRECIOSO", metalprecioso: "METAL_PRECIOSO", prata: "METAL_PRECIOSO", ouro: "METAL_PRECIOSO",
  vidros: "VIDRO",
  eletronico: "ELETRONICO", eletronicos: "ELETRONICO", eletroeletronico: "ELETRONICO", sucataeletronica: "ELETRONICO", lixoeletronico: "ELETRONICO",
  outro: "OUTROS", outros: "OUTROS",
};

function mapearGrupo(s: string): GrupoMaterial | null | "invalido" {
  const k = chave(s);
  if (!k) return null;
  for (const g of ORDEM_GRUPOS) if (k === chave(g) || k === chave(GRUPOS_MATERIAL[g])) return g;
  return APELIDOS_GRUPO[k] ?? "invalido";
}

// ───────────────────────── prévia (plano) ─────────────────────────

export type EfeitoLinha =
  | { tipo: "ENTRADA"; quantidade: number; custo: number | null }
  | { tipo: "INVENTARIO"; atual: number; contado: number; diferenca: number; custo: number | null; custoAtual: number };

export type LinhaPrevia = {
  linha: number;
  codigo: string;
  descricao: string;
  unidade: string;
  grupo: string | null;
  acao: "NOVO" | "ATUALIZA" | "IGUAL" | "ERRO";
  mudancas: string[];
  efeito: EfeitoLinha | null;
  erros: string[];
  avisos: string[];
};

type DadosNovo = { codigo: string; descricao: string; unidade: string; grupoMaterial: GrupoMaterial | null; ncm: string | null; precoVenda: number };
type Alteracoes = { descricao?: string; grupoMaterial?: GrupoMaterial | null; ncm?: string; precoVenda?: number };
type LinhaPlano = LinhaPrevia & { produtoId: string | null; novo: DadosNovo | null; alteracoes: Alteracoes | null };

export type ResumoImportacao = { linhas: number; novos: number; atualizados: number; iguais: number; comErro: number; movimentos: number; quantidadeEntrada: number };

export type PlanoImportacao = {
  arquivo: string;
  aba: string;
  formato: Planilha["formato"];
  modo: ModoQuantidade;
  estabelecimento: { id: string; nome: string };
  colunas: { encontradas: string[]; ignoradas: string[]; semQuantidade: boolean };
  linhas: LinhaPlano[];
  resumo: ResumoImportacao;
  /** avisos gerais (ex.: planilha com o mesmo nome já importada aqui) */
  avisos: string[];
  assinatura: string;
};
export type PreviaImportacao = Omit<PlanoImportacao, "linhas"> & { linhas: LinhaPrevia[] };

const fmt = (n: number, casas = 3) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const fmtR$ = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const arred3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Há mudança de saldo (ou de custo) a gravar nesta linha? */
export function temMovimento(e: EfeitoLinha | null): boolean {
  if (!e) return false;
  if (e.tipo === "ENTRADA") return e.quantidade > 0;
  return e.diferenca !== 0 || (e.custo !== null && e.contado > 0 && Math.abs(e.custo - e.custoAtual) > 0.00005);
}

export async function planejarImportacao(p: {
  matrizId: string;
  estabelecimento: { id: string; nome: string };
  modo: ModoQuantidade;
  lida: PlanilhaLida;
  podeCadastrar: boolean;
  arquivo: string;
}): Promise<PlanoImportacao> {
  const [produtos, saldos, mesmaPlanilha] = await Promise.all([
    prisma.produto.findMany({
      where: { empresaId: p.matrizId },
      select: { id: true, codigo: true, descricao: true, unidade: true, tipo: true, controlaEstoque: true, ativo: true, grupoMaterial: true, ncm: true, precoVenda: true },
    }),
    prisma.saldoEstoque.findMany({ where: { empresaId: p.estabelecimento.id }, select: { produtoId: true, quantidade: true, custoMedio: true } }),
    prisma.lancamentoEstoque.findFirst({
      where: { empresaId: p.estabelecimento.id, referencia: `Planilha ${p.arquivo}`.slice(0, 200), createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      orderBy: { createdAt: "desc" },
      select: { numero: true, tipo: true, createdAt: true },
    }),
  ]);
  const avisosGerais: string[] = [];
  if (mesmaPlanilha)
    avisosGerais.push(
      `Uma planilha com este nome já foi importada em ${p.estabelecimento.nome} em ${mesmaPlanilha.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} (${mesmaPlanilha.tipo === "ENTRADA" ? "entrada" : "ajuste"} nº ${String(mesmaPlanilha.numero).padStart(4, "0")}). Confira para não lançar a mesma quantidade duas vezes.`,
    );
  const porCodigo = new Map(produtos.map((x) => [x.codigo.trim().toUpperCase(), x]));
  const porDescricao = new Map<string, typeof produtos>();
  for (const x of produtos)
    if (x.tipo === "PRODUTO" && x.controlaEstoque) porDescricao.set(chave(x.descricao), [...(porDescricao.get(chave(x.descricao)) ?? []), x]);
  const saldoDe = new Map(saldos.map((s) => [s.produtoId, { quantidade: num(s.quantidade), custo: num(s.custoMedio) }]));
  const vistos = new Map<string, number>();
  const codigosUsados = new Set(porCodigo.keys());
  const semCodigo: LinhaPlano[] = [];
  const linhas: LinhaPlano[] = [];

  for (const l of p.lida.linhas) {
    const erros: string[] = [];
    const avisos: string[] = [];
    let codigo = textoDe(l.codigo);
    const descricao = textoDe(l.descricao);
    const unidadeTexto = textoDe(l.unidade);
    const unidade = unidadeTexto ? normalizarUnidade(unidadeTexto) : null;
    if (unidade === "invalida") erros.push(`Unidade “${unidadeTexto}” inválida: use um código curto, como KG, T ou UN.`);
    const grupoTexto = textoDe(l.grupo);
    const grupo = grupoTexto ? mapearGrupo(grupoTexto) : null;
    if (grupo === "invalido") erros.push(`Grupo “${grupoTexto}” não existe. Use: ${Object.values(GRUPOS_MATERIAL).join(", ")}.`);
    let ncm: string | null = null;
    const ncmTexto = textoDe(l.ncm);
    if (ncmTexto) {
      ncm = ncmTexto.replace(/\D/g, "");
      if (typeof l.ncm === "number" && ncm.length === 7) ncm = `0${ncm}`; // o Excel tira o zero da frente
      if (!/^\d{8}$/.test(ncm)) {
        erros.push(`NCM “${ncmTexto}” inválido: são 8 dígitos (ex.: 4707.10.00).`);
        ncm = null;
      }
    }
    const preco = numeroDe(l.preco, 2);
    if (preco === "invalido") erros.push(`Preço de venda “${textoDe(l.preco)}” não é um número.`);
    else if (preco !== null && preco < 0) erros.push("Preço de venda negativo.");
    const qtd = numeroDe(l.quantidade, 3);
    if (qtd === "invalido") erros.push(`Quantidade “${textoDe(l.quantidade)}” não é um número (escreva só o número; a unidade vai na coluna Unidade).`);
    else if (qtd !== null && qtd < 0) erros.push("Quantidade negativa. Para baixar estoque, use o modo Inventário com o saldo contado.");
    const custo = numeroDe(l.custo, 4);
    if (custo === "invalido") erros.push(`Custo unitário “${textoDe(l.custo)}” não é um número.`);
    else if (custo !== null && custo < 0) erros.push("Custo unitário negativo.");
    if (codigo.length > 60) erros.push("Código com mais de 60 caracteres.");
    if (descricao.length > 120) erros.push("Descrição com mais de 120 caracteres (limite da NF-e).");

    // qual material do cadastro?
    let prod = codigo ? porCodigo.get(codigo.toUpperCase()) : undefined;
    if (!prod && codigo && typeof l.codigo === "number") {
      const parecidos = produtos.filter((x) => /^\d+$/.test(x.codigo.trim()) && Number(x.codigo) === l.codigo);
      if (parecidos.length === 1) {
        prod = parecidos[0];
        avisos.push(`Código ${codigo} entendido como ${prod!.codigo} (o Excel tira os zeros da frente).`);
        codigo = prod!.codigo;
      }
    }
    if (!prod && !codigo) {
      if (!descricao) erros.push("Sem código e sem descrição.");
      else {
        const achados = porDescricao.get(chave(descricao)) ?? [];
        if (achados.length > 1) erros.push(`Há ${achados.length} materiais com essa descrição no cadastro: informe o código.`);
        else prod = achados[0];
      }
    }
    const chaveLinha = prod ? `p:${prod.id}` : codigo ? `c:${codigo.toUpperCase()}` : `d:${chave(descricao)}`;
    const repetida = vistos.get(chaveLinha);
    if (repetida) erros.push(`Material repetido (já está na linha ${repetida}). Junte numa linha só.`);
    else vistos.set(chaveLinha, l.numero);

    let acao: LinhaPrevia["acao"] = "IGUAL";
    const mudancas: string[] = [];
    let novo: DadosNovo | null = null;
    let alteracoes: Alteracoes | null = null;
    let unidadeFinal = typeof unidade === "string" && unidade !== "invalida" ? unidade : "KG";
    let grupoFinal: GrupoMaterial | null = grupo && grupo !== "invalido" ? grupo : null;
    let descricaoFinal = descricao;
    let produtoId: string | null = null;
    if (prod) {
      produtoId = prod.id;
      descricaoFinal = descricao || prod.descricao;
      unidadeFinal = prod.unidade;
      if (prod.tipo !== "PRODUTO") erros.push(`${prod.codigo} é um serviço no cadastro, não um material.`);
      else if (!prod.controlaEstoque) erros.push(`${prod.descricao} não controla estoque. Marque “Controla estoque” no cadastro do produto ou tire a linha.`);
      else if (!prod.ativo) erros.push(`${prod.descricao} está inativo. Reative no cadastro ou tire a linha.`);
      if (typeof unidade === "string" && unidade !== "invalida" && !mesmaUnidade(unidade, prod.unidade))
        erros.push(`Unidade ${unidade} diferente da do cadastro (${prod.unidade}). A planilha não troca a unidade de um material: corrija a coluna ou o cadastro.`);
      alteracoes = {};
      if (descricao && descricao !== prod.descricao) {
        alteracoes.descricao = descricao;
        mudancas.push(`descrição: ${prod.descricao} → ${descricao}`);
      }
      if (grupo && grupo !== "invalido" && grupo !== prod.grupoMaterial) {
        alteracoes.grupoMaterial = grupo;
        mudancas.push(`grupo: ${prod.grupoMaterial && prod.grupoMaterial in GRUPOS_MATERIAL ? GRUPOS_MATERIAL[prod.grupoMaterial as GrupoMaterial] : "sem grupo"} → ${GRUPOS_MATERIAL[grupo]}`);
      }
      grupoFinal = alteracoes.grupoMaterial ?? (prod.grupoMaterial as GrupoMaterial | null);
      if (ncm && ncm !== (prod.ncm ?? "").replace(/\D/g, "")) {
        alteracoes.ncm = ncm;
        mudancas.push(`NCM: ${prod.ncm || "vazio"} → ${ncm}`);
      }
      if (typeof preco === "number" && Math.abs(preco - num(prod.precoVenda)) > 0.0001) {
        alteracoes.precoVenda = preco;
        mudancas.push(`preço: ${fmtR$(num(prod.precoVenda))} → ${fmtR$(preco)}`);
      }
      if (mudancas.length) acao = "ATUALIZA";
      else alteracoes = null;
    } else if (codigo || descricao) {
      acao = "NOVO";
      if (!descricao) erros.push("Material novo sem descrição.");
      novo = {
        codigo,
        descricao,
        unidade: unidadeFinal,
        grupoMaterial: grupoFinal,
        ncm,
        precoVenda: typeof preco === "number" ? preco : 0,
      };
      if (codigo) codigosUsados.add(codigo.toUpperCase());
      if (!unidadeTexto) avisos.push("Sem unidade: entra em KG.");
    }
    if ((acao === "NOVO" || acao === "ATUALIZA") && !p.podeCadastrar)
      erros.push("Seu acesso não permite cadastrar materiais nem mudar preços e dados do cadastro (precisa de Cadastros: editar). Peça a um administrador ou tire essas mudanças.");

    // efeito no saldo
    let efeito: EfeitoLinha | null = null;
    const q = typeof qtd === "number" && qtd >= 0 ? qtd : null;
    const c = typeof custo === "number" && custo >= 0 ? custo : null;
    if (q === null) {
      if (c !== null && qtd === null) avisos.push("Custo sem quantidade: ignorado.");
    } else if (p.modo === "ENTRADA") {
      if (q === 0) avisos.push("Quantidade zero: não entra no estoque.");
      else efeito = { tipo: "ENTRADA", quantidade: q, custo: c };
    } else {
      const s = produtoId ? saldoDe.get(produtoId) : undefined;
      const atual = s?.quantidade ?? 0;
      efeito = { tipo: "INVENTARIO", atual, contado: q, diferenca: arred3(q - atual), custo: c, custoAtual: s?.custo ?? 0 };
      if (c !== null && q === 0) avisos.push("Custo ignorado: o saldo contado é zero.");
    }

    const linha: LinhaPlano = {
      linha: l.numero,
      codigo,
      descricao: descricaoFinal,
      unidade: unidadeFinal,
      grupo: grupoFinal ? GRUPOS_MATERIAL[grupoFinal] : null,
      acao: erros.length ? "ERRO" : acao,
      mudancas,
      efeito,
      erros,
      avisos,
      produtoId,
      novo,
      alteracoes,
    };
    if (novo && !codigo) semCodigo.push(linha);
    linhas.push(linha);
  }

  // códigos para os materiais novos sem código: MAT-0001, MAT-0002…
  let seq = 0;
  for (const c of codigosUsados) {
    const m = /^MAT-(\d+)$/.exec(c);
    if (m) seq = Math.max(seq, Number(m[1]));
  }
  for (const l of semCodigo) {
    let cod = "";
    do cod = `MAT-${String(++seq).padStart(4, "0")}`;
    while (codigosUsados.has(cod));
    codigosUsados.add(cod);
    l.codigo = cod;
    l.novo!.codigo = cod;
    l.avisos.push(`Sem código: vai ser cadastrado como ${cod}.`);
  }

  const semErro = linhas.filter((l) => l.acao !== "ERRO");
  const resumo: ResumoImportacao = {
    linhas: linhas.length,
    novos: semErro.filter((l) => l.acao === "NOVO").length,
    atualizados: semErro.filter((l) => l.acao === "ATUALIZA").length,
    iguais: semErro.filter((l) => l.acao === "IGUAL").length,
    comErro: linhas.length - semErro.length,
    movimentos: semErro.filter((l) => temMovimento(l.efeito)).length,
    quantidadeEntrada: arred3(semErro.reduce((a, l) => a + (l.efeito?.tipo === "ENTRADA" ? l.efeito.quantidade : 0), 0)),
  };
  const assinatura = createHash("sha256")
    .update(
      JSON.stringify([
        p.modo,
        p.estabelecimento.id,
        p.podeCadastrar,
        linhas.map((l) => [l.linha, l.acao, l.produtoId, l.codigo, l.descricao, l.unidade, l.novo, l.alteracoes, l.efeito, l.erros.length]),
      ]),
    )
    .digest("hex")
    .slice(0, 32);
  return {
    arquivo: p.arquivo,
    aba: p.lida.aba,
    formato: p.lida.formato,
    modo: p.modo,
    estabelecimento: p.estabelecimento,
    colunas: { encontradas: p.lida.encontradas, ignoradas: p.lida.ignoradas, semQuantidade: !p.lida.temQuantidade },
    linhas,
    resumo,
    avisos: avisosGerais,
    assinatura,
  };
}

/** O que vai para a tela (sem os dados internos de gravação). */
export function paraPrevia(plano: PlanoImportacao): PreviaImportacao {
  return {
    ...plano,
    linhas: plano.linhas.map((l) => ({ linha: l.linha, codigo: l.codigo, descricao: l.descricao, unidade: l.unidade, grupo: l.grupo, acao: l.acao, mudancas: l.mudancas, efeito: l.efeito, erros: l.erros, avisos: l.avisos })),
  };
}

// ───────────────────────── gravação ─────────────────────────

export type ResultadoImportacao = {
  novos: number;
  atualizados: number;
  lancamento: { id: string; numero: number; tipo: "ENTRADA" | "AJUSTE"; itens: number } | null;
  custosAtualizados: number;
};

/** Grava tudo numa transação: se algo falhar (saldo mudou, código criado por outra pessoa), nada fica gravado. */
export async function aplicarImportacao(
  plano: PlanoImportacao,
  o: { matrizId: string; usuarioId: string; data: Date; observacao: string | null },
): Promise<ResultadoImportacao> {
  if (plano.resumo.comErro) throw new ErroAcao(`A planilha tem ${plano.resumo.comErro === 1 ? "1 linha" : `${plano.resumo.comErro} linhas`} com erro. Corrija e confira de novo: nada foi gravado.`);
  const novos = plano.linhas.filter((l) => l.acao === "NOVO");
  const alterar = plano.linhas.filter((l) => l.acao === "ATUALIZA");
  const movimentos = plano.linhas.filter((l) => temMovimento(l.efeito));
  if (!novos.length && !alterar.length && !movimentos.length) throw new ErroAcao("Nada para importar: a planilha bate com o cadastro e com o estoque.");
  const est = plano.estabelecimento.id;
  const referencia = `Planilha ${plano.arquivo}`.slice(0, 200);
  try {
    return await prisma.$transaction(
      async (tx) => {
        const criados = new Map<number, string>();
        for (const l of novos) {
          const c = await tx.produto.create({ data: { empresaId: o.matrizId, tipo: "PRODUTO", origem: 0, controlaEstoque: true, ...l.novo! }, select: { id: true } });
          criados.set(l.linha, c.id);
        }
        for (const l of alterar) await tx.produto.update({ where: { id: l.produtoId! }, data: l.alteracoes! });
        const idDe = (l: LinhaPlano) => l.produtoId ?? criados.get(l.linha)!;

        if (plano.modo === "ENTRADA") {
          const itens = movimentos.map((l) => {
            const e = l.efeito as Extract<EfeitoLinha, { tipo: "ENTRADA" }>;
            return { produtoId: idDe(l), quantidade: e.quantidade, custo: e.custo };
          });
          if (!itens.length) return { novos: novos.length, atualizados: alterar.length, lancamento: null, custosAtualizados: 0 };
          const numero = await proximoNumeroEstoque(tx, est);
          const lanc = await tx.lancamentoEstoque.create({
            data: {
              empresaId: est,
              numero,
              tipo: "ENTRADA",
              data: o.data,
              referencia,
              observacao: o.observacao,
              criadoPorId: o.usuarioId,
              itens: { create: itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, custoUnitario: i.custo })) },
            },
          });
          for (const i of itens) await somarSaldo(tx, est, i.produtoId, i.quantidade, i.custo);
          return { novos: novos.length, atualizados: alterar.length, lancamento: { id: lanc.id, numero, tipo: "ENTRADA" as const, itens: itens.length }, custosAtualizados: 0 };
        }

        // inventário: o saldo passa a ser o contado (ajuste da diferença), conferindo que não mudou desde a prévia
        const mudancas: { produtoId: string; diferenca: number; contado: number; custo: number | null }[] = [];
        let custosAtualizados = 0;
        for (const l of movimentos) {
          const e = l.efeito as Extract<EfeitoLinha, { tipo: "INVENTARIO" }>;
          const produtoId = idDe(l);
          const linhaSaldo = await tx.saldoEstoque.findUnique({ where: { empresaId_produtoId: { empresaId: est, produtoId } } });
          const atual = linhaSaldo ? num(linhaSaldo.quantidade) : 0;
          if (Math.abs(atual - e.atual) > 0.0005)
            throw new ErroAcao(`O saldo de ${l.descricao} mudou para ${fmt(atual)} ${l.unidade} depois da conferência. Confira a planilha de novo.`);
          const custoNovo = e.custo !== null && e.contado > 0 && Math.abs(e.custo - e.custoAtual) > 0.00005 ? e.custo : undefined;
          if (custoNovo !== undefined) custosAtualizados++;
          if (linhaSaldo) {
            const r = await tx.saldoEstoque.updateMany({
              where: { empresaId: est, produtoId, quantidade: linhaSaldo.quantidade },
              data: { quantidade: e.contado, ...(custoNovo !== undefined ? { custoMedio: custoNovo } : {}) },
            });
            if (r.count !== 1) throw new ErroAcao(`O saldo de ${l.descricao} mudou durante a importação. Confira a planilha de novo.`);
          } else {
            await tx.saldoEstoque.create({ data: { empresaId: est, produtoId, quantidade: e.contado, custoMedio: custoNovo ?? 0 } });
          }
          if (e.diferenca !== 0) mudancas.push({ produtoId, diferenca: e.diferenca, contado: e.contado, custo: e.custo });
        }
        if (!mudancas.length) return { novos: novos.length, atualizados: alterar.length, lancamento: null, custosAtualizados };
        const numero = await proximoNumeroEstoque(tx, est);
        const lanc = await tx.lancamentoEstoque.create({
          data: {
            empresaId: est,
            numero,
            tipo: "AJUSTE",
            data: o.data,
            motivo: "INVENTARIO",
            referencia,
            observacao: o.observacao ?? `Inventário pela planilha ${plano.arquivo}`.slice(0, 500),
            criadoPorId: o.usuarioId,
            itens: { create: mudancas.map((m) => ({ produtoId: m.produtoId, quantidade: m.diferenca, saldoContado: m.contado, custoUnitario: m.custo })) },
          },
        });
        return { novos: novos.length, atualizados: alterar.length, lancamento: { id: lanc.id, numero, tipo: "AJUSTE" as const, itens: mudancas.length }, custosAtualizados };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (e instanceof ErroAcao) throw e;
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002")
      throw new ErroAcao("Um dos códigos novos foi cadastrado por outra pessoa enquanto você importava. Confira a planilha de novo.");
    throw e;
  }
}

// ───────────────────────── modelo para baixar ─────────────────────────

const cab = (valor: string, ref = false): CelulaSaida => ({ valor, estilo: ref ? "cabecalhoReferencia" : "cabecalho" });

/** Modelo .xlsx: os materiais cadastrados com o saldo atual do estabelecimento (ou os recicláveis mais comuns, se ainda não há). */
export async function modeloPlanilha(p: { matrizId: string; empresa: string; estabelecimento: { id: string; nome: string }; geradoEm: string }): Promise<Uint8Array> {
  const [produtos, saldos] = await Promise.all([
    prisma.produto.findMany({
      where: { empresaId: p.matrizId, tipo: "PRODUTO", controlaEstoque: true, ativo: true },
      select: { id: true, codigo: true, descricao: true, unidade: true, grupoMaterial: true, ncm: true, precoVenda: true },
    }),
    prisma.saldoEstoque.findMany({ where: { empresaId: p.estabelecimento.id }, select: { produtoId: true, quantidade: true } }),
  ]);
  const saldo = new Map(saldos.map((s) => [s.produtoId, num(s.quantidade)]));
  const ordem = (g: string | null) => (g && ORDEM_GRUPOS.includes(g as GrupoMaterial) ? ORDEM_GRUPOS.indexOf(g as GrupoMaterial) : ORDEM_GRUPOS.length);
  produtos.sort((a, b) => ordem(a.grupoMaterial) - ordem(b.grupoMaterial) || a.descricao.localeCompare(b.descricao, "pt-BR"));
  const rotulo = (g: string | null) => (g && g in GRUPOS_MATERIAL ? GRUPOS_MATERIAL[g as GrupoMaterial] : null);
  const linhas: CelulaSaida[][] = [COLUNAS_MODELO.map((t, i) => cab(t, i === COLUNAS_MODELO.length - 1))];
  if (produtos.length)
    for (const m of produtos)
      linhas.push([
        m.codigo,
        m.descricao,
        m.unidade,
        rotulo(m.grupoMaterial),
        m.ncm,
        num(m.precoVenda) > 0 ? { valor: num(m.precoVenda), estilo: "moeda" } : null,
        null,
        null,
        { valor: saldo.get(m.id) ?? 0, estilo: "referencia" },
      ]);
  else for (const m of MATERIAIS_PADRAO.filter((x) => x.marcado)) linhas.push([m.codigo, m.descricao, "KG", GRUPOS_MATERIAL[m.grupo], m.ncm, null, null, null, null]);

  const materiais: AbaSaida = {
    nome: "Materiais",
    congelarPrimeiraLinha: true,
    colunas: [
      { largura: 18, estilo: "texto" },
      { largura: 38 },
      { largura: 10 },
      { largura: 22 },
      { largura: 12, estilo: "texto" },
      { largura: 19, estilo: "moeda" },
      { largura: 13 },
      { largura: 19, estilo: "moeda" },
      { largura: 23, estilo: "referencia" },
    ],
    linhas,
    linhasValidadas: MAX_LINHAS_IMPORTACAO + 1,
    validacoes: [
      { coluna: 2, opcoes: ["KG", "T", "UN", "G", "L", "PC", "CX"], estrita: false },
      { coluna: 3, opcoes: Object.values(GRUPOS_MATERIAL), estrita: true, titulo: "Grupo do material", mensagem: "Escolha um grupo da lista (ou deixe vazio)." },
    ],
  };
  const grupos = Object.values(GRUPOS_MATERIAL).join(", ");
  const instrucao = (coluna: string, texto: string): CelulaSaida[] => [{ valor: coluna, estilo: "negrito" }, { valor: texto, estilo: "quebra" }];
  const instrucoes: AbaSaida = {
    nome: "Instruções",
    colunas: [{ largura: 26 }, { largura: 100, estilo: "quebra" }],
    linhas: [
      [{ valor: "Como preencher a planilha de estoque", estilo: "titulo" }],
      [{ valor: `${p.empresa} · saldo de ${p.estabelecimento.nome} em ${p.geradoEm}`, estilo: "referencia" }],
      [],
      [cab("Coluna"), cab("O que é")],
      instrucao("Código", "Identifica o material. Se o código já existe no cadastro, a linha atualiza esse material; se não existe, cria um material novo. Num material novo pode ficar vazio: o sistema cria um código (MAT-0001, MAT-0002…)."),
      instrucao("Descrição", "Nome do material (até 120 caracteres). Obrigatória para material novo. Sem código, o material é procurado pela descrição."),
      instrucao("Unidade", "KG (padrão para material novo), T, UN… Num material já cadastrado precisa ser a mesma do cadastro: a planilha não troca a unidade."),
      instrucao("Grupo", `Um destes: ${grupos}. Vazio mantém o grupo atual.`),
      instrucao("NCM", "8 dígitos (ex.: 4707.10.00). Vazio mantém o atual. Confirme o NCM com o contador antes de emitir NF-e."),
      instrucao("Preço de venda (R$)", "Preço por unidade (por kg, em geral). Vazio mantém o preço atual."),
      instrucao(
        "Quantidade",
        "Na tela de importação você escolhe o que ela é: ENTRADA (soma ao saldo, ex.: produção ou triagem do dia) ou INVENTÁRIO (é o saldo contado; o sistema lança o ajuste da diferença). Vazia: a linha só mexe no cadastro. No inventário, 0 zera o saldo.",
      ),
      instrucao("Custo unitário (R$)", "Opcional. Na entrada, entra no custo médio do material; no inventário, passa a ser o custo médio do saldo contado."),
      instrucao("Saldo atual (referência)", `Só para conferência: o saldo de ${p.estabelecimento.nome} quando a planilha foi gerada. Não é importado.`),
      [],
      instrucao(
        "Regras",
        `Até ${MAX_LINHAS_IMPORTACAO.toLocaleString("pt-BR")} linhas por arquivo. Linhas vazias são ignoradas. Materiais que não estão na planilha não mudam. Antes de gravar, o sistema mostra a prévia de cada linha; se alguma tiver erro, nada é gravado.`,
      ),
      instrucao("Formatos aceitos", "Planilha do Excel (.xlsx) ou .csv separado por ponto e vírgula. Arquivo .xls antigo: abra no Excel e use Salvar como › Pasta de Trabalho do Excel (.xlsx)."),
    ],
  };
  return gerarXlsx([materiais, instrucoes]);
}
