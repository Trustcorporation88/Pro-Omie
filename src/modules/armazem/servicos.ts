// Regras do armazém geral usadas pelas server actions: leitura dos XML (NF-e e CT-e), depositante, produtos do
// depositante, gravação do recebimento, conteúdo dos volumes e histórico. Não são server actions.
// Nada aqui chama escopoEmpresa() ou auditar() dentro de transação (abriria outra conexão).
import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { num } from "@/lib/serial";
import { fmtDocumento } from "@/lib/format";
import { detalheCte, detalheNfe, ehRemessaArmazenagem, lerNfe, type DetalheCte, type EnderecoParte, type ItemNota } from "@/modules/fiscal/leitura";
import { arred3, codigoVolume, fmtQuantidade, linhasDoItemNota, normalizarCodigoProduto, normalizarLote, type TipoVolume } from "./tipos";

export type Tx = Prisma.TransactionClient;

// ───────────────────────── Leitura dos arquivos ─────────────────────────

export type NotaLida = {
  tipo: "NFE";
  chave: string;
  numero?: string;
  serie?: string;
  emitidoEm?: Date;
  valor?: number;
  emitente: { documento?: string; nome?: string; ie?: string; endereco: EnderecoParte };
  destinatarioDocumento?: string;
  naturezaOperacao?: string;
  itens: ItemNota[];
  /** todos os itens com CFOP de remessa para armazém geral */
  armazenagem: boolean;
};
export type CteLido = { tipo: "CTE"; valor?: number } & DetalheCte;
export type DocLido = NotaLida | CteLido;

/** Texto do arquivo enviado: UTF-8 (com ou sem BOM) ou ISO-8859-1 quando o XML declara. */
export function textoDoArquivo(bytes: Uint8Array): string {
  const cabeca = Buffer.from(bytes.subarray(0, 120)).toString("latin1");
  const latin = /encoding=["'](iso-8859-1|latin-?1|windows-1252)["']/i.test(cabeca);
  const texto = Buffer.from(bytes).toString(latin ? "latin1" : "utf8");
  return texto.replace(/^\uFEFF/, "");
}

/** Lê um XML de NF-e (nfeProc/NFe) ou CT-e (cteProc/CTe). Lança ErroAcao com o motivo, citando o arquivo. */
export function lerXmlArmazem(xml: string, arquivo: string): DocLido {
  const nome = arquivo ? `“${arquivo}”` : "O arquivo";
  if (/<resNFe[\s>]/.test(xml)) throw new ErroAcao(`${nome} é só o resumo da NF-e. Use o XML completo (nfeProc), que o depositante manda junto com a nota.`);
  if (/<(cteProc|CTe)[\s>]/.test(xml) || /<infCte[\s>]/.test(xml)) {
    const c = detalheCte(xml);
    if (!c || !/^[0-9A-Z]{44}$/.test(c.chave)) throw new ErroAcao(`${nome} parece um CT-e, mas não foi possível ler a chave e os dados.`);
    return { tipo: "CTE", valor: c.valorPrestacao, ...c };
  }
  if (/<(nfeProc|NFe)[\s>]/.test(xml) || /<infNFe[\s>]/.test(xml)) {
    const r = lerNfe(xml, "", { nsu: "", tipo: "NFE", xml });
    const d = detalheNfe(xml);
    if (r.natureza !== "DOCUMENTO" || !d || !/^[0-9A-Z]{44}$/.test(r.chave)) throw new ErroAcao(`${nome} parece uma NF-e, mas não foi possível ler a chave e os itens.`);
    if (r.situacao && r.situacao !== "AUTORIZADO") throw new ErroAcao(`A NF-e nº ${r.numero ?? ""} de ${nome} está ${r.situacao === "CANCELADO" ? "cancelada" : "denegada"}.`);
    if (!d.itens.length) throw new ErroAcao(`A NF-e nº ${r.numero ?? ""} de ${nome} não tem itens.`);
    return {
      tipo: "NFE",
      chave: r.chave,
      numero: r.numero,
      serie: r.serie,
      emitidoEm: r.emitidoEm,
      valor: r.valor,
      emitente: { documento: d.emitente.documento, nome: d.emitente.nome, ie: d.emitente.ie, endereco: d.emitente.partes },
      destinatarioDocumento: d.destinatario.documento,
      naturezaOperacao: d.naturezaOperacao,
      itens: d.itens,
      armazenagem: ehRemessaArmazenagem(d.itens),
    };
  }
  throw new ErroAcao(`${nome} não é XML de NF-e nem de CT-e.`);
}

export const rotuloDoc = (d: { tipo: "NFE" | "CTE" | string; numero?: string | null }) => `${d.tipo === "CTE" ? "CT-e" : "NF-e"}${d.numero ? ` nº ${d.numero}` : ""}`;

// ───────────────────────── Depositante e estabelecimento ─────────────────────────

export type DadosDepositante = { documento: string; nome?: string; ie?: string; endereco?: EnderecoParte };

/** Quem é o dono da mercadoria: o emitente da NF-e de remessa; sem NF-e, o remetente do CT-e. */
export function depositanteDosDocumentos(docs: DocLido[]): DadosDepositante {
  const notas = docs.filter((d): d is NotaLida => d.tipo === "NFE");
  if (notas.length) {
    const emitentes = [...new Set(notas.map((n) => n.emitente.documento ?? ""))];
    if (emitentes.length > 1) throw new ErroAcao(`As NF-e são de depositantes diferentes (${emitentes.map((e) => fmtDocumento(e) || "sem CNPJ").join(" e ")}). Faça um recebimento para cada depositante.`);
    const n = notas[0];
    if (!n.emitente.documento) throw new ErroAcao(`A ${rotuloDoc(n)} não traz o CNPJ ou CPF do emitente.`);
    return { documento: n.emitente.documento, nome: n.emitente.nome, ie: n.emitente.ie, endereco: n.emitente.endereco };
  }
  const ctes = docs.filter((d): d is CteLido => d.tipo === "CTE");
  const remetentes = [...new Set(ctes.map((c) => c.remetente.documento ?? ""))];
  if (remetentes.length > 1) throw new ErroAcao("Os CT-e têm remetentes diferentes. Faça um recebimento para cada depositante.");
  const c = ctes[0];
  if (!c?.remetente.documento) throw new ErroAcao("O CT-e não traz o CNPJ do remetente. Faça o recebimento sem documento e escolha o depositante.");
  return { documento: c.remetente.documento, nome: c.remetente.nome, ie: c.remetente.ie, endereco: c.remetente.endereco };
}

export type EstabelecimentoArmazem = { id: string; cnpj: string; nome: string; matrizId: string };

/** Estabelecimento que recebe: o do CNPJ de destino dos documentos (ou o escolhido, desde que da mesma empresa). */
export function estabelecimentoDosDocumentos(docs: DocLido[], estabelecimentos: EstabelecimentoArmazem[], escolhidoId?: string | null): EstabelecimentoArmazem {
  const destinos = (d: DocLido) => (d.tipo === "NFE" ? [d.destinatarioDocumento ?? ""] : [d.destinatario.documento ?? "", d.recebedor?.documento ?? ""]).filter(Boolean);
  const escolhido = escolhidoId ? estabelecimentos.find((e) => e.id === escolhidoId) : undefined;
  if (escolhidoId && !escolhido) throw new ErroAcao("Estabelecimento não encontrado nesta empresa.");
  if (escolhido) {
    for (const d of docs) {
      const raiz = escolhido.cnpj.slice(0, 8);
      if (!destinos(d).some((x) => x.slice(0, 8) === raiz))
        throw new ErroAcao(`A ${rotuloDoc(d)} é destinada a ${fmtDocumento(destinos(d)[0]) || "outro CNPJ"}, que não é de ${escolhido.nome}.`);
    }
    return escolhido;
  }
  let achado: EstabelecimentoArmazem | undefined;
  for (const d of docs) {
    const e = estabelecimentos.find((x) => destinos(d).includes(x.cnpj));
    if (!e) throw new ErroAcao(`A ${rotuloDoc(d)} é destinada a ${fmtDocumento(destinos(d)[0]) || "outro CNPJ"}, que não é de nenhum estabelecimento desta empresa.`);
    if (achado && achado.id !== e.id) throw new ErroAcao("Os documentos são de estabelecimentos diferentes. Faça um recebimento para cada estabelecimento.");
    achado = e;
  }
  if (!achado) throw new ErroAcao("Envie ao menos uma NF-e ou um CT-e.");
  return achado;
}

/** Depositante pelo CNPJ/CPF no cadastro da matriz; cria como cliente quando não existe. */
export async function depositantePorDocumento(tx: Tx, matrizId: string, dados: DadosDepositante, origem: string): Promise<{ id: string; criado: boolean }> {
  const existente = await tx.pessoa.findFirst({ where: { empresaId: matrizId, documento: dados.documento }, select: { id: true, cliente: true } });
  if (existente) {
    if (!existente.cliente) await tx.pessoa.update({ where: { id: existente.id }, data: { cliente: true } });
    return { id: existente.id, criado: false };
  }
  const e = dados.endereco ?? {};
  const criado = await tx.pessoa.create({
    data: {
      empresaId: matrizId,
      tipoPessoa: dados.documento.length === 11 ? "FISICA" : "JURIDICA",
      documento: dados.documento,
      nome: (dados.nome ?? fmtDocumento(dados.documento)).slice(0, 200),
      cliente: true,
      fornecedor: false,
      indicadorIE: dados.ie ? "CONTRIBUINTE" : "NAO_CONTRIBUINTE",
      inscricaoEstadual: dados.ie ?? null,
      cep: e.cep?.replace(/\D/g, "") || null,
      logradouro: e.logradouro ?? null,
      numero: e.numero ?? null,
      complemento: e.complemento ?? null,
      bairro: e.bairro ?? null,
      cidade: e.cidade ?? null,
      uf: e.uf ?? null,
      codigoMunicipio: e.codigoMunicipio ?? null,
      telefone: e.telefone ?? null,
      observacoes: `Depositante cadastrado a partir da ${origem}`.slice(0, 500),
    },
    select: { id: true },
  });
  return { id: criado.id, criado: true };
}

/** Produto do depositante pelo código (cria; na NF-e, atualiza descrição, NCM e valor declarado). */
export async function produtoDoDepositante(
  tx: Tx,
  matrizId: string,
  depositanteId: string,
  dados: { codigo: string; descricao: string; unidade?: string | null; ncm?: string | null; gtin?: string | null; valorUnitario?: number | null },
  atualizar: boolean,
): Promise<string> {
  const codigo = normalizarCodigoProduto(dados.codigo);
  if (!codigo) throw new ErroAcao("Item sem código.");
  const unidade = (dados.unidade ?? "").trim().toUpperCase().slice(0, 6) || "UN";
  const descricao = dados.descricao.trim().slice(0, 200) || codigo;
  const where = { empresaId_depositanteId_codigo: { empresaId: matrizId, depositanteId, codigo } };
  const p = await tx.produtoDepositante.upsert({
    where,
    create: { empresaId: matrizId, depositanteId, codigo, descricao, unidade, ncm: dados.ncm || null, gtin: dados.gtin || null, valorUnitario: dados.valorUnitario ?? null },
    update: atualizar ? { descricao, unidade, ncm: dados.ncm || undefined, gtin: dados.gtin || undefined, valorUnitario: dados.valorUnitario ?? undefined } : {},
    select: { id: true },
  });
  return p.id;
}

// ───────────────────────── Numeração e histórico ─────────────────────────

export async function proximoNumeroArmazem(tx: Tx, empresaId: string, tipo: "armazem_recebimento" | "armazem_caixa" | "armazem_pallet") {
  const s = await tx.sequenciaDocumento.upsert({ where: { empresaId_tipo: { empresaId, tipo } }, create: { empresaId, tipo, ultimo: 1 }, update: { ultimo: { increment: 1 } } });
  return s.ultimo;
}

export const tipoSequenciaVolume = (tipo: TipoVolume) => (tipo === "CAIXA" ? "armazem_caixa" : "armazem_pallet") as "armazem_caixa" | "armazem_pallet";

export async function registrarMovimento(tx: Tx, m: { empresaId: string; volumeId: string; tipo: string; resumo: string; dados?: unknown; usuarioId?: string | null }) {
  await tx.movimentoArmazem.create({
    data: { empresaId: m.empresaId, volumeId: m.volumeId, tipo: m.tipo, resumo: m.resumo.slice(0, 500), dados: m.dados === undefined ? undefined : (m.dados as Prisma.InputJsonValue), usuarioId: m.usuarioId ?? null },
  });
}

// ───────────────────────── Recebimento ─────────────────────────

export type EntradaDocumento = { lido: DocLido; xml: string | null; documentoRecebidoId: string | null };

/** Não deixa a mesma chave entrar duas vezes no armazém do estabelecimento. */
export async function conferirDuplicados(empresaId: string, docs: DocLido[]) {
  const chaves = docs.map((d) => d.chave);
  const repetida = chaves.find((c, i) => chaves.indexOf(c) !== i);
  if (repetida) throw new ErroAcao("O mesmo documento foi enviado duas vezes.");
  const ja = await prisma.documentoArmazem.findMany({ where: { empresaId, chave: { in: chaves } }, select: { chave: true, tipo: true, numero: true, recebimento: { select: { numero: true } } } });
  if (ja.length) {
    const d = ja[0];
    throw new ErroAcao(`A ${rotuloDoc({ tipo: d.tipo, numero: d.numero })} já está no recebimento nº ${String(d.recebimento.numero).padStart(4, "0")}.`);
  }
}

/** Grava os documentos (e os itens esperados das NF-e) num recebimento, criando os produtos do depositante. */
export async function gravarDocumentos(tx: Tx, r: { recebimentoId: string; empresaId: string; matrizId: string; depositanteId: string }, docs: EntradaDocumento[]) {
  let itens = 0;
  for (const e of docs) {
    const d = e.lido;
    const doc = await tx.documentoArmazem.create({
      data: {
        recebimentoId: r.recebimentoId,
        empresaId: r.empresaId,
        tipo: d.tipo,
        chave: d.chave,
        numero: d.numero ?? null,
        serie: d.serie ?? null,
        emitenteDocumento: d.tipo === "NFE" ? (d.emitente.documento ?? null) : (d.emitente.documento ?? null),
        emitenteNome: d.tipo === "NFE" ? (d.emitente.nome ?? null) : (d.emitente.nome ?? null),
        emitidoEm: d.emitidoEm ?? null,
        valor: d.tipo === "NFE" ? (d.valor ?? null) : (d.valorCarga ?? d.valor ?? null),
        nfesReferenciadas: d.tipo === "CTE" ? d.nfes : [],
        pesoKg: d.tipo === "CTE" ? (d.pesoKg ?? null) : null,
        volumesDeclarados: d.tipo === "CTE" ? (d.volumes ?? null) : null,
        documentoRecebidoId: e.documentoRecebidoId,
        xml: e.xml,
      },
      select: { id: true },
    });
    if (d.tipo !== "NFE") continue;
    for (const item of d.itens) {
      const produtoId = await produtoDoDepositante(
        tx,
        r.matrizId,
        r.depositanteId,
        { codigo: item.codigo, descricao: item.descricao, unidade: item.unidade, ncm: item.ncm, gtin: item.gtin, valorUnitario: item.valorUnitario },
        true,
      );
      for (const l of linhasDoItemNota(item.quantidade, item.lotes)) {
        if (!(l.quantidade > 0)) continue;
        await tx.itemRecebimentoArmazem.create({
          data: { recebimentoId: r.recebimentoId, documentoId: doc.id, numeroItem: item.numero, produtoId, lote: l.lote, quantidade: l.quantidade, valorUnitario: item.valorUnitario, cfop: item.cfop || null },
        });
        itens++;
      }
    }
  }
  return itens;
}

// ───────────────────────── Conteúdo dos volumes ─────────────────────────

export type LinhaConteudo = { produtoId: string; lote: string; quantidade: number; recebimentoId: string };

const chaveLinha = (l: { produtoId: string; lote: string; recebimentoId: string }) => `${l.produtoId}|${l.lote}|${l.recebimentoId}`;

/** Junta linhas iguais (mesmo produto, lote e origem) somando as quantidades. */
export function juntarLinhas(linhas: LinhaConteudo[]): LinhaConteudo[] {
  const m = new Map<string, LinhaConteudo>();
  for (const l of linhas) {
    const lote = normalizarLote(l.lote);
    const k = chaveLinha({ ...l, lote });
    const atual = m.get(k);
    m.set(k, { ...l, lote, quantidade: arred3((atual?.quantidade ?? 0) + l.quantidade) });
  }
  return [...m.values()].filter((l) => l.quantidade > 0);
}

/** Troca o conteúdo do volume pelo novo (apaga, altera e cria o que mudou). Devolve antes e depois para o histórico. */
export async function substituirConteudo(tx: Tx, volumeId: string, novas: LinhaConteudo[]) {
  const atuais = await tx.conteudoVolume.findMany({ where: { volumeId }, select: { id: true, produtoId: true, lote: true, quantidade: true, recebimentoId: true } });
  const alvo = new Map(juntarLinhas(novas).map((l) => [chaveLinha(l), l]));
  const antes = atuais.map((a) => ({ produtoId: a.produtoId, lote: a.lote, recebimentoId: a.recebimentoId, quantidade: num(a.quantidade) }));
  for (const a of atuais) {
    const n = alvo.get(chaveLinha(a));
    if (!n) await tx.conteudoVolume.delete({ where: { id: a.id } });
    else if (Math.abs(num(a.quantidade) - n.quantidade) > 0.0005) await tx.conteudoVolume.update({ where: { id: a.id }, data: { quantidade: n.quantidade } });
    alvo.delete(chaveLinha(a));
  }
  for (const n of alvo.values()) await tx.conteudoVolume.create({ data: { volumeId, produtoId: n.produtoId, lote: n.lote, quantidade: n.quantidade, recebimentoId: n.recebimentoId } });
  return { antes, depois: juntarLinhas(novas) };
}

/** Soma linhas ao conteúdo de um volume (transferência e "colocar o que falta"). */
export async function somarAoConteudo(tx: Tx, volumeId: string, linhas: LinhaConteudo[]) {
  for (const l of juntarLinhas(linhas)) {
    await tx.conteudoVolume.upsert({
      where: { volumeId_produtoId_lote_recebimentoId: { volumeId, produtoId: l.produtoId, lote: l.lote, recebimentoId: l.recebimentoId } },
      create: { volumeId, produtoId: l.produtoId, lote: l.lote, quantidade: l.quantidade, recebimentoId: l.recebimentoId },
      update: { quantidade: { increment: l.quantidade } },
    });
  }
}

/** Resumo legível de um conjunto de linhas: "3 itens · 25 un.". */
export function resumoLinhas(linhas: { quantidade: number }[], unidade?: string): string {
  const total = arred3(linhas.reduce((a, l) => a + l.quantidade, 0));
  return `${linhas.length} ${linhas.length === 1 ? "item" : "itens"} · ${fmtQuantidade(total, unidade)}`;
}

/** Diferenças entre dois conteúdos, por produto e lote, para o histórico ("+5 ABC-1 lote L1", "−2 XYZ"). */
export function diferencasConteudo(antes: LinhaConteudo[] | { produtoId: string; lote: string; quantidade: number }[], depois: { produtoId: string; lote: string; quantidade: number }[], codigos: Map<string, string>): string[] {
  const soma = (ls: { produtoId: string; lote: string; quantidade: number }[]) => {
    const m = new Map<string, number>();
    for (const l of ls) m.set(`${l.produtoId}|${l.lote}`, arred3((m.get(`${l.produtoId}|${l.lote}`) ?? 0) + l.quantidade));
    return m;
  };
  const a = soma(antes);
  const d = soma(depois);
  const saida: string[] = [];
  for (const k of new Set([...a.keys(), ...d.keys()])) {
    const dif = arred3((d.get(k) ?? 0) - (a.get(k) ?? 0));
    if (Math.abs(dif) < 0.0005) continue;
    const [produtoId, lote] = k.split("|");
    saida.push(`${dif > 0 ? "+" : "−"}${fmtQuantidade(Math.abs(dif))} ${codigos.get(produtoId) ?? "?"}${lote ? ` lote ${lote}` : ""}`);
  }
  return saida;
}

/** Volumes que ocupam o endereço (não expedidos). */
export async function ocupacaoEndereco(tx: Tx | typeof prisma, enderecoId: string, ignorar: string[] = []) {
  return tx.volumeArmazem.count({ where: { enderecoId, status: { not: "EXPEDIDO" }, id: { notIn: ignorar } } });
}

/** Confere se os volumes podem ir para o endereço: mesmo estabelecimento, ativo, reserva do depositante e capacidade. */
export async function validarEnderecamento(
  tx: Tx,
  endereco: { id: string; codigo: string; empresaId: string; ativo: boolean; capacidade: number | null; depositanteId: string | null; tipo?: string; depositante?: { nome: string } | null },
  volumes: { id: string; tipo: TipoVolume; numero: number; empresaId: string; depositanteId: string; status: string; enderecoId: string | null }[],
) {
  if (!endereco.ativo) throw new ErroAcao(`O endereço ${endereco.codigo} está inativo.`);
  for (const v of volumes) {
    if (v.status === "EXPEDIDO") throw new ErroAcao(`${codigoVolume(v.tipo, v.numero)} já saiu do armazém.`);
    if (v.empresaId !== endereco.empresaId) throw new ErroAcao(`${codigoVolume(v.tipo, v.numero)} é de outro estabelecimento.`);
    if (endereco.depositanteId && endereco.depositanteId !== v.depositanteId)
      throw new ErroAcao(`O endereço ${endereco.codigo} é reservado para ${endereco.depositante?.nome ?? "outro depositante"}; ${codigoVolume(v.tipo, v.numero)} é de outro depositante.`);
  }
  // uma posição guarda volumes de um só depositante (a cobrança é por posição); a doca é área de passagem e aceita vários
  if (endereco.tipo !== "DOCA") {
    const deps = [...new Set(volumes.map((v) => v.depositanteId))];
    if (deps.length > 1) throw new ErroAcao(`Os volumes são de depositantes diferentes: a posição ${endereco.codigo} guarda volumes de um só depositante (a doca aceita vários).`);
    const outro = await tx.volumeArmazem.findFirst({
      where: { enderecoId: endereco.id, status: { not: "EXPEDIDO" }, id: { notIn: volumes.map((v) => v.id) }, depositanteId: { notIn: deps } },
      select: { depositante: { select: { nome: true, nomeFantasia: true } } },
    });
    if (outro) throw new ErroAcao(`A posição ${endereco.codigo} já tem volumes de ${outro.depositante.nomeFantasia || outro.depositante.nome}. Cada posição guarda volumes de um só depositante (a doca aceita vários).`);
  }
  if (endereco.capacidade !== null) {
    const novos = volumes.filter((v) => v.enderecoId !== endereco.id).length;
    const ocupados = await ocupacaoEndereco(tx, endereco.id, volumes.map((v) => v.id));
    const ficariam = ocupados + volumes.length;
    if (novos > 0 && ficariam > endereco.capacidade)
      throw new ErroAcao(`O endereço ${endereco.codigo} comporta ${endereco.capacidade} ${endereco.capacidade === 1 ? "volume" : "volumes"} e ficaria com ${ficariam}.`);
  }
}
