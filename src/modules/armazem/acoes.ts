"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao } from "@/lib/auth/sessao";
import { escopoEmpresa, exigirEmpresaNoEscopo, type EscopoEmpresa } from "@/lib/auth/empresa";
import { auditar } from "@/lib/auditoria";
import { ehISOValido, hojeISO, isoParaDate } from "@/lib/datas";
import { num } from "@/lib/serial";
import {
  conferirDuplicados,
  depositanteDosDocumentos,
  depositantePorDocumento,
  diferencasConteudo,
  estabelecimentoDosDocumentos,
  gravarDocumentos,
  lerXmlArmazem,
  produtoDoDepositante,
  proximoNumeroArmazem,
  registrarMovimento,
  resumoLinhas,
  rotuloDoc,
  somarAoConteudo,
  substituirConteudo,
  textoDoArquivo,
  tipoSequenciaVolume,
  validarEnderecamento,
  type DocLido,
  type EntradaDocumento,
  type EstabelecimentoArmazem,
  type LinhaConteudo,
} from "./servicos";
import {
  TIPOS_ENDERECO,
  arred3,
  codigoVolume,
  compararRecebimento,
  gerarCodigosEnderecos,
  lerCodigoVolume,
  normalizarCodigoEndereco,
  normalizarCodigoProduto,
  normalizarLote,
  numero4,
  restantesDoRecebimento,
  type ItemQuantidade,
  type TipoVolume,
} from "./tipos";

const OPCOES_TX = { timeout: 60_000, maxWait: 10_000 };
const MAX_ARQUIVOS = 20;
const MAX_BYTES_XML = 2_000_000;

function revalidarArmazem() {
  revalidatePath("/servicos/armazem", "layout");
}

const textoOpc = (v: FormDataEntryValue | null | undefined, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

function dataISO(v: unknown, campo: string, rotulo: string): Date {
  const s = typeof v === "string" && v ? v : hojeISO();
  if (!ehISOValido(s)) throw new ErroAcao(`${rotulo} inválida.`, { [campo]: `${rotulo} inválida.` });
  if (s > hojeISO()) throw new ErroAcao(`${rotulo} não pode ser no futuro.`, { [campo]: "Data no futuro." });
  return isoParaDate(s);
}

/** Estabelecimentos ativos do escopo, com CNPJ (para achar o destino dos documentos). */
async function estabelecimentosAtivos(escopo: EscopoEmpresa): Promise<EstabelecimentoArmazem[]> {
  const empresas = await prisma.empresa.findMany({ where: { id: { in: escopo.ids }, ativo: true }, select: { id: true, cnpj: true, razaoSocial: true, nomeFantasia: true } });
  return empresas.map((e) => ({ id: e.id, cnpj: e.cnpj, nome: e.nomeFantasia || e.razaoSocial, matrizId: escopo.ativa.id }));
}

async function recebimentoDoEscopo(escopo: EscopoEmpresa, id: string) {
  const r = await prisma.recebimentoArmazem.findFirst({
    where: { id, empresaId: { in: escopo.ids } },
    include: { depositante: { select: { id: true, nome: true, nomeFantasia: true, documento: true } } },
  });
  if (!r) throw new ErroAcao("Recebimento não encontrado nesta empresa.");
  return r;
}

async function volumeDoEscopo(escopo: EscopoEmpresa, id: string) {
  const v = await prisma.volumeArmazem.findFirst({ where: { id, empresaId: { in: escopo.ids } }, include: { endereco: { select: { id: true, codigo: true } } } });
  if (!v) throw new ErroAcao("Caixa ou pallet não encontrado nesta empresa.");
  return v;
}

async function lerArquivos(formData: FormData): Promise<{ lido: DocLido; xml: string }[]> {
  const arquivos = formData.getAll("arquivos").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);
  if (!arquivos.length) throw new ErroAcao("Escolha o XML da NF-e ou do CT-e.", { arquivos: "Escolha ao menos um arquivo .xml." });
  if (arquivos.length > MAX_ARQUIVOS) throw new ErroAcao(`Envie até ${MAX_ARQUIVOS} arquivos por vez.`);
  const saida: { lido: DocLido; xml: string }[] = [];
  for (const f of arquivos) {
    if (f.size > MAX_BYTES_XML) throw new ErroAcao(`“${f.name}” tem mais de 2 MB: não parece o XML de uma nota.`);
    const xml = textoDoArquivo(new Uint8Array(await f.arrayBuffer()));
    saida.push({ lido: lerXmlArmazem(xml, f.name), xml });
  }
  return saida;
}

/** NF-e transportadas pelos CT-e que a busca de notas já trouxe completas (entram junto, com os itens). */
async function nfesDosCtes(lidos: DocLido[], escopoIds: string[]): Promise<EntradaDocumento[]> {
  const ja = new Set(lidos.map((l) => l.chave));
  let chaves = [...new Set(lidos.flatMap((l) => (l.tipo === "CTE" ? l.nfes : [])))].filter((c) => !ja.has(c));
  if (!chaves.length) return [];
  // NF-e que já deu entrada no armazém (neste ou em outro recebimento) não entra de novo pelo CT-e
  const recebidas = new Set((await prisma.documentoArmazem.findMany({ where: { empresaId: { in: escopoIds }, chave: { in: chaves } }, select: { chave: true } })).map((d) => d.chave));
  chaves = chaves.filter((c) => !recebidas.has(c));
  if (!chaves.length) return [];
  const docs = await prisma.documentoRecebido.findMany({ where: { empresaId: { in: escopoIds }, tipo: "NFE", chave: { in: chaves }, completo: true, situacao: "AUTORIZADO" }, select: { id: true, xml: true } });
  const saida: EntradaDocumento[] = [];
  for (const d of docs) {
    try {
      saida.push({ lido: lerXmlArmazem(d.xml, ""), xml: null, documentoRecebidoId: d.id });
    } catch {
      // nota capturada ilegível: fica de fora (a pessoa pode enviar o XML)
    }
  }
  return saida;
}

/** Vínculo com a nota capturada (Notas recebidas) quando a mesma chave já chegou pela busca. */
async function vincularCapturadas(docs: EntradaDocumento[], escopoIds: string[]) {
  const soltas = docs.filter((d) => !d.documentoRecebidoId);
  if (!soltas.length) return docs;
  const capturadas = await prisma.documentoRecebido.findMany({ where: { empresaId: { in: escopoIds }, chave: { in: soltas.map((d) => d.lido.chave) } }, select: { id: true, chave: true } });
  const porChave = new Map(capturadas.map((c) => [c.chave, c.id]));
  return docs.map((d) => (d.documentoRecebidoId ? d : { ...d, documentoRecebidoId: porChave.get(d.lido.chave) ?? null }));
}

const avisosDosDocumentos = (docs: EntradaDocumento[]) =>
  docs
    .filter((d) => d.lido.tipo === "NFE" && !d.lido.armazenagem)
    .map((d) => `A ${rotuloDoc(d.lido)} não tem CFOP de remessa para armazém geral (5.905/6.905). Confira com o depositante ou com o contador.`);

async function gravarNovoRecebimento(
  usuarioId: string,
  escopo: EscopoEmpresa,
  entrada: EntradaDocumento[],
  o: { estabelecimentoId: string | null; chegada: Date; observacao: string | null },
): Promise<{ id: string; numero: number; avisos: string[] }> {
  const estabs = await estabelecimentosAtivos(escopo);
  const docs = await vincularCapturadas(entrada, escopo.ids);
  const lidos = docs.map((d) => d.lido);
  const estab = estabelecimentoDosDocumentos(lidos, estabs, o.estabelecimentoId);
  const dep = depositanteDosDocumentos(lidos);
  await conferirDuplicados(estab.id, lidos);
  const origem = `${rotuloDoc(lidos[0])} (chave ${lidos[0].chave})`;
  const r = await prisma.$transaction(async (tx) => {
    const d = await depositantePorDocumento(tx, estab.matrizId, dep, origem);
    const numero = await proximoNumeroArmazem(tx, estab.id, "armazem_recebimento");
    const rec = await tx.recebimentoArmazem.create({ data: { empresaId: estab.id, numero, depositanteId: d.id, chegadaEm: o.chegada, observacao: o.observacao, criadoPorId: usuarioId }, select: { id: true } });
    const itens = await gravarDocumentos(tx, { recebimentoId: rec.id, empresaId: estab.id, matrizId: estab.matrizId, depositanteId: d.id }, docs);
    return { id: rec.id, numero, itens, depositanteCriado: d.criado };
  }, OPCOES_TX);
  await auditar(
    "criar_recebimento",
    "armazem",
    r.id,
    `Recebimento nº ${numero4(r.numero)} · ${dep.nome ?? dep.documento} · ${lidos.map(rotuloDoc).join(", ")} · ${r.itens} ${r.itens === 1 ? "item esperado" : "itens esperados"}${r.depositanteCriado ? " · depositante cadastrado" : ""}`,
    undefined,
    { empresaId: escopo.ativa.id },
  );
  revalidarArmazem();
  return { id: r.id, numero: r.numero, avisos: avisosDosDocumentos(docs) };
}

// ───────────────────────── Recebimentos ─────────────────────────

/** Novo recebimento a partir dos XML enviados (NF-e de remessa e/ou CT-e). Campos: arquivos, estabelecimentoId, chegada, observacao. */
export async function criarRecebimentoXml(formData: FormData): Promise<Resultado<{ id: string; numero: number; avisos: string[] }>> {
  return executar(async () => {
    const u = await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const chegada = dataISO(formData.get("chegada"), "chegada", "Data de chegada");
    const lidos = await lerArquivos(formData);
    const extras = await nfesDosCtes(
      lidos.map((l) => l.lido),
      escopo.ids,
    );
    const docs: EntradaDocumento[] = [...lidos.map((l) => ({ lido: l.lido, xml: l.xml, documentoRecebidoId: null })), ...extras];
    return gravarNovoRecebimento(u.id, escopo, docs, { estabelecimentoId: textoOpc(formData.get("estabelecimentoId"), 40), chegada, observacao: textoOpc(formData.get("observacao"), 500) });
  }, "Recebimento criado. Agora monte as caixas e os pallets na conferência.");
}

/** Novo recebimento a partir de uma nota que a busca de notas trouxe (NF-e de remessa ou CT-e). */
export async function criarRecebimentoDeNota(documentoRecebidoId: string): Promise<Resultado<{ id: string; numero: number; avisos: string[] }>> {
  return executar(async () => {
    const u = await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const doc = await prisma.documentoRecebido.findFirst({ where: { id: String(documentoRecebidoId), empresaId: { in: escopo.ids } }, select: { id: true, tipo: true, completo: true, xml: true, empresaId: true, situacao: true } });
    if (!doc) throw new ErroAcao("Nota não encontrada nesta empresa.");
    if (doc.tipo === "NFSE") throw new ErroAcao("NFS-e não dá entrada no armazém.");
    if (doc.situacao !== "AUTORIZADO") throw new ErroAcao("A nota não está autorizada.");
    if (!doc.completo) throw new ErroAcao("A nota ainda não tem o XML completo. Manifeste a ciência e aguarde a busca seguinte.");
    const lido = lerXmlArmazem(doc.xml, "");
    const extras = await nfesDosCtes([lido], escopo.ids);
    return gravarNovoRecebimento(u.id, escopo, [{ lido, xml: null, documentoRecebidoId: doc.id }, ...extras], { estabelecimentoId: doc.empresaId, chegada: isoParaDate(hojeISO()), observacao: null });
  }, "Recebimento criado com os itens da nota.");
}

const esquemaManual = z.object({
  estabelecimentoId: z.string().min(1, "Escolha o estabelecimento."),
  depositanteId: z.string().min(1, "Escolha o depositante."),
  chegada: z.string().optional().nullable(),
  observacao: z.string().trim().max(500).optional().nullable(),
});

/** Recebimento sem documento (inventário do que já estava no armazém, ou nota que ainda não chegou). */
export async function criarRecebimentoManual(entrada: z.input<typeof esquemaManual>): Promise<Resultado<{ id: string; numero: number }>> {
  return executar(async () => {
    const u = await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaManual.parse(entrada);
    exigirEmpresaNoEscopo(escopo, d.estabelecimentoId, "Estabelecimento fora da empresa atual.");
    const estab = (await estabelecimentosAtivos(escopo)).find((e) => e.id === d.estabelecimentoId);
    if (!estab) throw new ErroAcao("Estabelecimento inativo.", { estabelecimentoId: "Estabelecimento inativo." });
    const dep = await prisma.pessoa.findFirst({ where: { id: d.depositanteId, empresaId: escopo.ativa.id }, select: { id: true, nome: true, cliente: true } });
    if (!dep) throw new ErroAcao("Depositante não encontrado nesta empresa.", { depositanteId: "Depositante não encontrado." });
    const chegada = dataISO(d.chegada, "chegada", "Data de chegada");
    const r = await prisma.$transaction(async (tx) => {
      if (!dep.cliente) await tx.pessoa.update({ where: { id: dep.id }, data: { cliente: true } });
      const numero = await proximoNumeroArmazem(tx, estab.id, "armazem_recebimento");
      const rec = await tx.recebimentoArmazem.create({ data: { empresaId: estab.id, numero, depositanteId: dep.id, chegadaEm: chegada, observacao: d.observacao || null, criadoPorId: u.id }, select: { id: true } });
      return { id: rec.id, numero };
    });
    await auditar("criar_recebimento", "armazem", r.id, `Recebimento nº ${numero4(r.numero)} sem documento · ${dep.nome}`);
    revalidarArmazem();
    return r;
  }, "Recebimento criado. Monte as caixas e os pallets com o que foi conferido.");
}

/** Junta mais XML (outra NF-e do mesmo depositante, ou o CT-e) a um recebimento em conferência. Campos: recebimentoId, arquivos. */
export async function adicionarDocumentos(formData: FormData): Promise<Resultado<{ itens: number; avisos: string[] }>> {
  return executar(async () => {
    const u = await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const rec = await recebimentoDoEscopo(escopo, String(formData.get("recebimentoId") ?? ""));
    if (rec.status !== "CONFERENCIA") throw new ErroAcao("A conferência deste recebimento já foi concluída. Reabra para juntar documentos.");
    const lidos = await lerArquivos(formData);
    const extras = await nfesDosCtes(
      lidos.map((l) => l.lido),
      escopo.ids,
    );
    const docs = await vincularCapturadas([...lidos.map((l) => ({ lido: l.lido, xml: l.xml, documentoRecebidoId: null })), ...extras], escopo.ids);
    for (const d of docs)
      if (d.lido.tipo === "NFE" && rec.depositante.documento && d.lido.emitente.documento !== rec.depositante.documento)
        throw new ErroAcao(`A ${rotuloDoc(d.lido)} é de ${d.lido.emitente.nome ?? "outro emitente"}, não de ${rec.depositante.nome}. Faça outro recebimento para ela.`);
    estabelecimentoDosDocumentos(
      docs.map((d) => d.lido),
      await estabelecimentosAtivos(escopo),
      rec.empresaId,
    );
    await conferirDuplicados(
      rec.empresaId,
      docs.map((d) => d.lido),
    );
    const itens = await prisma.$transaction((tx) => gravarDocumentos(tx, { recebimentoId: rec.id, empresaId: rec.empresaId, matrizId: escopo.ativa.id, depositanteId: rec.depositanteId }, docs), OPCOES_TX);
    await auditar("documento_recebimento", "armazem", rec.id, `Recebimento nº ${numero4(rec.numero)} · documentos juntados: ${docs.map((d) => rotuloDoc(d.lido)).join(", ")}`, undefined, { usuarioId: u.id });
    revalidarArmazem();
    return { itens, avisos: avisosDosDocumentos(docs) };
  }, "Documentos juntados ao recebimento.");
}

export async function removerDocumento(documentoId: string): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const d = await prisma.documentoArmazem.findFirst({ where: { id: String(documentoId), empresaId: { in: escopo.ids } }, include: { recebimento: { select: { id: true, numero: true, status: true } } } });
    if (!d) throw new ErroAcao("Documento não encontrado nesta empresa.");
    if (d.recebimento.status !== "CONFERENCIA") throw new ErroAcao("A conferência deste recebimento já foi concluída. Reabra para tirar documentos.");
    await prisma.documentoArmazem.delete({ where: { id: d.id } });
    await auditar("documento_recebimento", "armazem", d.recebimento.id, `Recebimento nº ${numero4(d.recebimento.numero)} · ${rotuloDoc({ tipo: d.tipo, numero: d.numero })} retirado`);
    revalidarArmazem();
    return undefined;
  }, "Documento retirado do recebimento (e os itens esperados dele).");
}

async function esperadosEConferidos(recebimentoId: string) {
  const [esp, conf] = await Promise.all([
    prisma.itemRecebimentoArmazem.findMany({ where: { recebimentoId }, include: { produto: { select: { codigo: true, descricao: true, unidade: true } } } }),
    prisma.conteudoVolume.findMany({ where: { recebimentoId }, include: { produto: { select: { codigo: true, descricao: true, unidade: true } } } }),
  ]);
  const paraItem = (x: { produtoId: string; lote: string; quantidade: unknown; produto: { codigo: string; descricao: string; unidade: string } }): ItemQuantidade => ({
    produtoId: x.produtoId,
    codigo: x.produto.codigo,
    descricao: x.produto.descricao,
    unidade: x.produto.unidade,
    lote: x.lote,
    quantidade: num(x.quantidade as number),
  });
  return { esperados: esp.map(paraItem), conferidos: conf.map(paraItem) };
}

/** Conclui a conferência: as caixas e os pallets montados passam a "armazenados" (mudança de conteúdo vira ajuste, com motivo). */
export async function concluirConferencia(recebimentoId: string, observacao?: string | null): Promise<Resultado<{ falta: number; sobra: number; naoPrevisto: number }>> {
  return executar(async () => {
    await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const rec = await recebimentoDoEscopo(escopo, String(recebimentoId));
    if (rec.status !== "CONFERENCIA") throw new ErroAcao("A conferência já foi concluída.");
    const comConteudo = await prisma.conteudoVolume.count({ where: { recebimentoId: rec.id } });
    if (!comConteudo) throw new ErroAcao("Nenhuma caixa ou pallet tem itens deste recebimento. Monte os volumes antes de concluir.");
    const { esperados, conferidos } = await esperadosEConferidos(rec.id);
    const { resumo } = compararRecebimento(esperados, conferidos);
    const obs = (observacao ?? "").trim().slice(0, 500);
    const divergencias = resumo.falta + resumo.sobra + resumo.naoPrevisto;
    await prisma.$transaction(async (tx) => {
      const marcado = await tx.recebimentoArmazem.updateMany({
        where: { id: rec.id, status: "CONFERENCIA" },
        data: { status: "CONCLUIDO", concluidoEm: new Date(), ...(obs ? { observacao: [rec.observacao, `Conferência: ${obs}`].filter(Boolean).join("\n").slice(0, 1000) } : {}) },
      });
      if (marcado.count !== 1) throw new ErroAcao("A conferência acabou de ser concluída por outra pessoa.");
      await tx.volumeArmazem.updateMany({ where: { recebimentoId: rec.id, status: "ABERTO" }, data: { status: "FECHADO" } });
    });
    await auditar(
      "concluir_conferencia",
      "armazem",
      rec.id,
      `Recebimento nº ${numero4(rec.numero)} conferido · ${divergencias ? `${resumo.falta} com falta, ${resumo.sobra} com sobra, ${resumo.naoPrevisto} fora da nota` : "sem divergência"}${obs ? ` · ${obs}` : ""}`,
    );
    revalidarArmazem();
    return { falta: resumo.falta, sobra: resumo.sobra, naoPrevisto: resumo.naoPrevisto };
  }, "Conferência concluída.");
}

export async function reabrirConferencia(recebimentoId: string): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const rec = await recebimentoDoEscopo(escopo, String(recebimentoId));
    if (rec.status !== "CONCLUIDO") throw new ErroAcao("A conferência está aberta.");
    await prisma.$transaction(async (tx) => {
      await tx.recebimentoArmazem.update({ where: { id: rec.id }, data: { status: "CONFERENCIA", concluidoEm: null } });
      await tx.volumeArmazem.updateMany({ where: { recebimentoId: rec.id, status: "FECHADO" }, data: { status: "ABERTO" } });
    });
    await auditar("reabrir_conferencia", "armazem", rec.id, `Recebimento nº ${numero4(rec.numero)} reaberto para conferência`);
    revalidarArmazem();
    return undefined;
  }, "Conferência reaberta.");
}

export async function excluirRecebimento(recebimentoId: string): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const rec = await recebimentoDoEscopo(escopo, String(recebimentoId));
    const conteudos = await prisma.conteudoVolume.count({ where: { recebimentoId: rec.id } });
    if (conteudos) throw new ErroAcao("Há itens deste recebimento em caixas ou pallets. Tire os itens antes de excluir.");
    await prisma.$transaction(async (tx) => {
      await tx.volumeArmazem.deleteMany({ where: { recebimentoId: rec.id, conteudo: { none: {} } } });
      await tx.recebimentoArmazem.delete({ where: { id: rec.id } });
    });
    await auditar("excluir_recebimento", "armazem", rec.id, `Recebimento nº ${numero4(rec.numero)} excluído · ${rec.depositante.nome}`);
    revalidarArmazem();
    return undefined;
  }, "Recebimento excluído.");
}

// ───────────────────────── Caixas e pallets ─────────────────────────

const esquemaNovosVolumes = z.object({
  recebimentoId: z.string().min(1),
  tipo: z.enum(["CAIXA", "PALLET"]),
  quantidade: z.number().int().min(1, "Crie ao menos um.").max(50, "Até 50 por vez."),
  referenciaDepositante: z.string().trim().max(60).optional().nullable(),
});

/** Cria caixas ou pallets numerados para a conferência de um recebimento. */
export async function criarVolumes(entrada: z.input<typeof esquemaNovosVolumes>): Promise<Resultado<{ volumes: { id: string; codigo: string }[] }>> {
  return executar(async () => {
    const u = await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaNovosVolumes.parse(entrada);
    const rec = await recebimentoDoEscopo(escopo, d.recebimentoId);
    const status = rec.status === "CONFERENCIA" ? "ABERTO" : "FECHADO";
    const volumes = await prisma.$transaction(async (tx) => {
      const criados: { id: string; codigo: string }[] = [];
      for (let i = 0; i < d.quantidade; i++) {
        const numero = await proximoNumeroArmazem(tx, rec.empresaId, tipoSequenciaVolume(d.tipo));
        const v = await tx.volumeArmazem.create({
          data: { empresaId: rec.empresaId, tipo: d.tipo, numero, depositanteId: rec.depositanteId, recebimentoId: rec.id, status, referenciaDepositante: d.referenciaDepositante || null },
          select: { id: true },
        });
        await registrarMovimento(tx, { empresaId: rec.empresaId, volumeId: v.id, tipo: "CRIACAO", resumo: `Criado no recebimento nº ${numero4(rec.numero)}`, usuarioId: u.id });
        criados.push({ id: v.id, codigo: codigoVolume(d.tipo, numero) });
      }
      return criados;
    }, OPCOES_TX);
    revalidarArmazem();
    return { volumes };
  });
}

const esquemaConteudo = z.object({
  volumeId: z.string().min(1),
  motivo: z.string().trim().max(300).optional().nullable(),
  linhas: z
    .array(
      z.object({
        codigo: z.string().trim().min(1, "Informe o código.").max(60),
        descricao: z.string().trim().max(200).optional().nullable(),
        unidade: z.string().trim().max(6).optional().nullable(),
        lote: z.string().trim().max(60).optional().nullable(),
        quantidade: z.number({ message: "Informe a quantidade." }).positive("A quantidade precisa ser maior que zero.").max(1e9),
        recebimentoId: z.string().optional().nullable(),
      }),
    )
    .max(500, "Até 500 linhas por volume."),
});
export type EntradaConteudo = z.input<typeof esquemaConteudo>;

/** Grava o conteúdo da caixa ou pallet (código, lote, quantidade). Código novo vira produto do depositante (precisa da descrição). */
export async function salvarConteudoVolume(entrada: EntradaConteudo): Promise<Resultado<{ itens: number }>> {
  return executar(async () => {
    const u = await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaConteudo.parse(entrada);
    const v = await volumeDoEscopo(escopo, d.volumeId);
    if (v.status === "EXPEDIDO") throw new ErroAcao("Este volume já saiu do armazém. Desfaça a saída para mexer no conteúdo.");
    const ajuste = v.status === "FECHADO";
    if (ajuste && !d.motivo) throw new ErroAcao("Este volume já está armazenado: informe o motivo do ajuste (ex.: inventário, avaria, reembalagem).", { motivo: "Informe o motivo." });
    const matriz = escopo.ativa.id;
    const codigos = [...new Set(d.linhas.map((l) => normalizarCodigoProduto(l.codigo)))];
    const existentes = await prisma.produtoDepositante.findMany({ where: { empresaId: matriz, depositanteId: v.depositanteId, codigo: { in: codigos } }, select: { id: true, codigo: true } });
    const porCodigo = new Map(existentes.map((p) => [p.codigo, p.id]));
    const novos = new Map<string, { descricao: string; unidade: string | null }>();
    d.linhas.forEach((l, i) => {
      const c = normalizarCodigoProduto(l.codigo);
      if (porCodigo.has(c) || novos.has(c)) return;
      if (!l.descricao) throw new ErroAcao(`O código ${c} não é deste depositante: informe a descrição para cadastrar.`, { [`linhas.${i}.descricao`]: "Código novo: informe a descrição." });
      novos.set(c, { descricao: l.descricao, unidade: l.unidade ?? null });
    });
    // origem: o recebimento informado na linha (do mesmo depositante) ou o do volume
    const origens = [...new Set(d.linhas.map((l) => l.recebimentoId).filter((x): x is string => !!x))];
    const recebimentosOk = new Set(
      (await prisma.recebimentoArmazem.findMany({ where: { id: { in: origens }, empresaId: { in: escopo.ids }, depositanteId: v.depositanteId }, select: { id: true } })).map((r) => r.id),
    );
    const linhasOrigem = d.linhas.map((l, i) => {
      const origem = l.recebimentoId && recebimentosOk.has(l.recebimentoId) ? l.recebimentoId : v.recebimentoId;
      if (!origem) throw new ErroAcao("Este volume não nasceu num recebimento: inclua itens nele pela transferência.", { [`linhas.${i}.codigo`]: "Sem recebimento de origem." });
      return { ...l, codigo: normalizarCodigoProduto(l.codigo), origem };
    });
    const r = await prisma.$transaction(async (tx) => {
      for (const [codigo, p] of novos) porCodigo.set(codigo, await produtoDoDepositante(tx, matriz, v.depositanteId, { codigo, descricao: p.descricao, unidade: p.unidade }, false));
      const linhas: LinhaConteudo[] = linhasOrigem.map((l) => ({ produtoId: porCodigo.get(l.codigo)!, lote: normalizarLote(l.lote), quantidade: arred3(l.quantidade), recebimentoId: l.origem }));
      const { antes, depois } = await substituirConteudo(tx, v.id, linhas);
      const nomes = new Map([...porCodigo].map(([c, id]) => [id, c]));
      for (const a of antes) if (!nomes.has(a.produtoId)) nomes.set(a.produtoId, (await tx.produtoDepositante.findUnique({ where: { id: a.produtoId }, select: { codigo: true } }))?.codigo ?? "?");
      const difs = diferencasConteudo(antes, depois, nomes);
      if (difs.length)
        await registrarMovimento(tx, {
          empresaId: v.empresaId,
          volumeId: v.id,
          tipo: ajuste ? "AJUSTE" : "CONFERENCIA",
          resumo: ajuste ? `Ajuste (${d.motivo}): ${difs.join(", ")}` : `Conteúdo conferido: ${resumoLinhas(depois)} (${difs.join(", ")})`,
          dados: { antes, depois, motivo: d.motivo ?? null },
          usuarioId: u.id,
        });
      return { itens: depois.length, difs, produtosNovos: novos.size };
    }, OPCOES_TX);
    if (ajuste && r.difs.length) await auditar("ajuste_volume", "armazem", v.id, `${codigoVolume(v.tipo, v.numero)} ajustado (${d.motivo}): ${r.difs.join(", ")}`.slice(0, 900));
    revalidarArmazem();
    return { itens: r.itens };
  }, "Conteúdo salvo.");
}

/** Põe neste volume tudo o que ainda falta conferir do recebimento (quando a nota inteira vai para um pallet, por exemplo). */
export async function colocarRestantes(volumeId: string): Promise<Resultado<{ itens: number }>> {
  return executar(async () => {
    const u = await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const v = await volumeDoEscopo(escopo, String(volumeId));
    if (v.status !== "ABERTO" || !v.recebimentoId) throw new ErroAcao("Só dá para completar volumes em conferência.");
    const { esperados, conferidos } = await esperadosEConferidos(v.recebimentoId);
    const restantes = restantesDoRecebimento(esperados, conferidos);
    if (!restantes.length) throw new ErroAcao("Não falta nada: tudo o que veio nos documentos já está em caixas ou pallets.");
    const recebimentoId = v.recebimentoId;
    await prisma.$transaction(async (tx) => {
      await somarAoConteudo(
        tx,
        v.id,
        restantes.map((x) => ({ ...x, recebimentoId })),
      );
      await registrarMovimento(tx, { empresaId: v.empresaId, volumeId: v.id, tipo: "CONFERENCIA", resumo: `Completado com o que faltava do recebimento: ${resumoLinhas(restantes)}`, dados: { restantes }, usuarioId: u.id });
    });
    revalidarArmazem();
    return { itens: restantes.length };
  }, "Itens que faltavam colocados no volume.");
}

export async function excluirVolume(volumeId: string): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const v = await volumeDoEscopo(escopo, String(volumeId));
    if (v.status === "EXPEDIDO") throw new ErroAcao("Volume expedido fica no histórico.");
    const itens = await prisma.conteudoVolume.count({ where: { volumeId: v.id } });
    if (itens) throw new ErroAcao("Só volume vazio pode ser excluído. Tire ou transfira os itens antes.");
    await prisma.volumeArmazem.delete({ where: { id: v.id } });
    await auditar("excluir_volume", "armazem", v.id, `${codigoVolume(v.tipo, v.numero)} excluído (vazio)`);
    revalidarArmazem();
    return undefined;
  }, "Volume excluído.");
}

const esquemaEnderecar = z.object({ volumeIds: z.array(z.string().min(1)).min(1, "Escolha ao menos um volume.").max(500), enderecoId: z.string().min(1).nullable() });

/** Coloca um ou vários volumes num endereço (ou tira do endereço, com enderecoId nulo). */
export async function enderecarVolumes(entrada: z.input<typeof esquemaEnderecar>): Promise<Resultado<{ volumes: number; endereco: string | null }>> {
  return executar(async () => {
    const u = await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaEnderecar.parse(entrada);
    const ids = [...new Set(d.volumeIds)];
    const volumes = await prisma.volumeArmazem.findMany({ where: { id: { in: ids }, empresaId: { in: escopo.ids } }, include: { endereco: { select: { codigo: true } } } });
    if (volumes.length !== ids.length) throw new ErroAcao("Algum volume não foi encontrado nesta empresa. Recarregue a página.");
    const endereco = d.enderecoId
      ? await prisma.enderecoArmazem.findFirst({ where: { id: d.enderecoId, empresaId: { in: escopo.ids } }, include: { depositante: { select: { nome: true } } } })
      : null;
    if (d.enderecoId && !endereco) throw new ErroAcao("Endereço não encontrado nesta empresa.");
    if (!endereco) for (const v of volumes) if (v.status === "EXPEDIDO") throw new ErroAcao(`${codigoVolume(v.tipo, v.numero)} já saiu do armazém.`);
    await prisma.$transaction(async (tx) => {
      if (endereco) await validarEnderecamento(tx, endereco, volumes);
      for (const v of volumes) {
        if ((v.enderecoId ?? null) === (endereco?.id ?? null)) continue;
        await tx.volumeArmazem.update({ where: { id: v.id }, data: { enderecoId: endereco?.id ?? null, enderecadoEm: endereco ? new Date() : null } });
        await registrarMovimento(tx, {
          empresaId: v.empresaId,
          volumeId: v.id,
          tipo: "ENDERECAMENTO",
          resumo: endereco ? `Endereçado em ${endereco.codigo}${v.endereco ? ` (antes em ${v.endereco.codigo})` : ""}` : `Retirado do endereço ${v.endereco?.codigo ?? ""}`,
          dados: { de: v.endereco?.codigo ?? null, para: endereco?.codigo ?? null },
          usuarioId: u.id,
        });
      }
    }, OPCOES_TX);
    revalidarArmazem();
    return { volumes: volumes.length, endereco: endereco?.codigo ?? null };
  }, mensagemEnderecar(entrada));
}

function mensagemEnderecar(entrada: z.input<typeof esquemaEnderecar>) {
  const n = entrada?.volumeIds?.length ?? 0;
  if (!entrada?.enderecoId) return n === 1 ? "Volume retirado do endereço." : "Volumes retirados do endereço.";
  return n === 1 ? "Volume endereçado." : `${n} volumes endereçados.`;
}

const esquemaTransferencia = z.object({
  origemId: z.string().min(1),
  destinoId: z.string().min(1).nullable(),
  novoTipo: z.enum(["CAIXA", "PALLET"]).optional().nullable(),
  linhas: z.array(z.object({ conteudoId: z.string().min(1), quantidade: z.number().positive("Quantidade maior que zero.").max(1e9) })).min(1, "Escolha o que transferir.").max(500),
});

/** Passa itens de um volume para outro (ou para um volume novo): reembalagem, separação por código e lote, retirada parcial. */
export async function transferirConteudo(entrada: z.input<typeof esquemaTransferencia>): Promise<Resultado<{ destinoId: string; codigo: string }>> {
  return executar(async () => {
    const u = await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaTransferencia.parse(entrada);
    const origem = await volumeDoEscopo(escopo, d.origemId);
    if (origem.status === "EXPEDIDO") throw new ErroAcao("O volume de origem já saiu do armazém.");
    const destino = d.destinoId ? await volumeDoEscopo(escopo, d.destinoId) : null;
    if (destino) {
      if (destino.id === origem.id) throw new ErroAcao("Escolha outro volume de destino.");
      if (destino.status === "EXPEDIDO") throw new ErroAcao("O volume de destino já saiu do armazém.");
      if (destino.depositanteId !== origem.depositanteId) throw new ErroAcao("O volume de destino é de outro depositante.");
      if (destino.empresaId !== origem.empresaId) throw new ErroAcao("O volume de destino é de outro estabelecimento.");
    } else if (!d.novoTipo) throw new ErroAcao("Escolha o volume de destino ou crie um novo.");
    const conteudos = await prisma.conteudoVolume.findMany({ where: { volumeId: origem.id, id: { in: d.linhas.map((l) => l.conteudoId) } }, include: { produto: { select: { codigo: true, unidade: true } } } });
    const porId = new Map(conteudos.map((c) => [c.id, c]));
    const movidas = d.linhas.map((l) => {
      const c = porId.get(l.conteudoId);
      if (!c) throw new ErroAcao("Item não encontrado no volume de origem. Recarregue a página.");
      const q = arred3(l.quantidade);
      if (q > num(c.quantidade) + 0.0005) throw new ErroAcao(`${c.produto.codigo}${c.lote ? ` lote ${c.lote}` : ""}: há só ${num(c.quantidade).toLocaleString("pt-BR")} no volume.`);
      return { c, quantidade: q };
    });
    const r = await prisma.$transaction(async (tx) => {
      let alvo = destino;
      if (!alvo) {
        const tipo = d.novoTipo as TipoVolume;
        const numero = await proximoNumeroArmazem(tx, origem.empresaId, tipoSequenciaVolume(tipo));
        const origensRec = [...new Set(movidas.map((m) => m.c.recebimentoId))];
        const criado = await tx.volumeArmazem.create({
          data: {
            empresaId: origem.empresaId,
            tipo,
            numero,
            depositanteId: origem.depositanteId,
            recebimentoId: origensRec.length === 1 ? origensRec[0] : null,
            status: origem.status === "ABERTO" ? "ABERTO" : "FECHADO",
          },
          include: { endereco: { select: { id: true, codigo: true } } },
        });
        alvo = criado;
        await registrarMovimento(tx, { empresaId: origem.empresaId, volumeId: criado.id, tipo: "CRIACAO", resumo: `Criado na transferência de ${codigoVolume(origem.tipo, origem.numero)}`, usuarioId: u.id });
      }
      for (const m of movidas) {
        const resto = arred3(num(m.c.quantidade) - m.quantidade);
        if (resto <= 0.0005) await tx.conteudoVolume.delete({ where: { id: m.c.id } });
        else await tx.conteudoVolume.update({ where: { id: m.c.id }, data: { quantidade: resto } });
      }
      await somarAoConteudo(
        tx,
        alvo.id,
        movidas.map((m) => ({ produtoId: m.c.produtoId, lote: m.c.lote, recebimentoId: m.c.recebimentoId, quantidade: m.quantidade })),
      );
      const texto = movidas.map((m) => `${m.quantidade.toLocaleString("pt-BR")} ${m.c.produto.codigo}${m.c.lote ? ` lote ${m.c.lote}` : ""}`).join(", ");
      const dados = { linhas: movidas.map((m) => ({ produtoId: m.c.produtoId, lote: m.c.lote, recebimentoId: m.c.recebimentoId, quantidade: m.quantidade })) };
      const codAlvo = codigoVolume(alvo.tipo, alvo.numero);
      const codOrigem = codigoVolume(origem.tipo, origem.numero);
      await registrarMovimento(tx, { empresaId: origem.empresaId, volumeId: origem.id, tipo: "TRANSFERENCIA", resumo: `Transferido para ${codAlvo}: ${texto}`, dados, usuarioId: u.id });
      await registrarMovimento(tx, { empresaId: origem.empresaId, volumeId: alvo.id, tipo: "TRANSFERENCIA", resumo: `Recebido de ${codOrigem}: ${texto}`, dados, usuarioId: u.id });
      return { destinoId: alvo.id, codigo: codAlvo, texto, codOrigem };
    }, OPCOES_TX);
    await auditar("transferir_volume", "armazem", origem.id, `${r.codOrigem} → ${r.codigo}: ${r.texto}`.slice(0, 900));
    revalidarArmazem();
    return { destinoId: r.destinoId, codigo: r.codigo };
  }, "Itens transferidos.");
}

const esquemaSaida = z.object({
  volumeIds: z.array(z.string().min(1)).min(1, "Escolha ao menos um volume.").max(500),
  data: z.string().optional().nullable(),
  documento: z.string().trim().min(1, "Informe o documento da saída (ex.: NF-e de retorno nº 123).").max(120),
  observacao: z.string().trim().max(300).optional().nullable(),
});

/** Saída de volumes inteiros do armazém (retirada pelo depositante). Para saída parcial, transfira antes os itens para outro volume. */
export async function darSaidaVolumes(entrada: z.input<typeof esquemaSaida>): Promise<Resultado<{ volumes: number }>> {
  return executar(async () => {
    const u = await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaSaida.parse(entrada);
    const data = dataISO(d.data, "data", "Data da saída");
    const ids = [...new Set(d.volumeIds)];
    const volumes = await prisma.volumeArmazem.findMany({ where: { id: { in: ids }, empresaId: { in: escopo.ids } }, include: { endereco: { select: { codigo: true } }, _count: { select: { conteudo: true } } } });
    if (volumes.length !== ids.length) throw new ErroAcao("Algum volume não foi encontrado nesta empresa. Recarregue a página.");
    for (const v of volumes) {
      if (v.status === "EXPEDIDO") throw new ErroAcao(`${codigoVolume(v.tipo, v.numero)} já saiu do armazém.`);
      if (v.status === "ABERTO") throw new ErroAcao(`${codigoVolume(v.tipo, v.numero)} ainda está em conferência. Conclua a conferência antes da saída.`);
      if (!v._count.conteudo) throw new ErroAcao(`${codigoVolume(v.tipo, v.numero)} está vazio: exclua em vez de dar saída.`);
    }
    await prisma.$transaction(async (tx) => {
      for (const v of volumes) {
        await tx.volumeArmazem.update({ where: { id: v.id }, data: { status: "EXPEDIDO", expedidoEm: data, documentoSaida: d.documento, enderecoId: null, enderecadoEm: null, observacao: d.observacao || v.observacao } });
        await registrarMovimento(tx, {
          empresaId: v.empresaId,
          volumeId: v.id,
          tipo: "SAIDA",
          resumo: `Saída · ${d.documento}${v.endereco ? ` · estava em ${v.endereco.codigo}` : ""}${d.observacao ? ` · ${d.observacao}` : ""}`,
          dados: { documento: d.documento, endereco: v.endereco?.codigo ?? null },
          usuarioId: u.id,
        });
      }
    }, OPCOES_TX);
    await auditar("saida_volume", "armazem", volumes[0].id, `Saída de ${volumes.map((v) => codigoVolume(v.tipo, v.numero)).join(", ")} · ${d.documento}`.slice(0, 900));
    revalidarArmazem();
    return { volumes: volumes.length };
  }, "Saída registrada.");
}

export async function desfazerSaida(volumeId: string, motivo: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const v = await volumeDoEscopo(escopo, String(volumeId));
    if (v.status !== "EXPEDIDO") throw new ErroAcao("Este volume não saiu do armazém.");
    const m = String(motivo ?? "").trim().slice(0, 300);
    if (!m) throw new ErroAcao("Informe o motivo.", { motivo: "Informe o motivo." });
    await prisma.$transaction(async (tx) => {
      await tx.volumeArmazem.update({ where: { id: v.id }, data: { status: "FECHADO", expedidoEm: null, documentoSaida: null } });
      await registrarMovimento(tx, { empresaId: v.empresaId, volumeId: v.id, tipo: "SAIDA_DESFEITA", resumo: `Saída desfeita (${m}); volume de volta, sem endereço`, usuarioId: u.id });
    });
    await auditar("desfazer_saida", "armazem", v.id, `${codigoVolume(v.tipo, v.numero)}: saída desfeita (${m})`);
    revalidarArmazem();
    return undefined;
  }, "Saída desfeita. Endereçe o volume de novo.");
}

// ───────────────────────── Endereços ─────────────────────────

const tiposEndereco = Object.keys(TIPOS_ENDERECO) as [string, ...string[]];
const esquemaEndereco = z.object({
  id: z.string().optional().nullable(),
  estabelecimentoId: z.string().min(1, "Escolha o estabelecimento."),
  codigo: z.string().trim().min(1, "Informe o código do endereço.").max(40),
  zona: z.string().trim().max(30).optional().nullable(),
  tipo: z.enum(tiposEndereco),
  capacidade: z.number().int().min(1, "Capacidade mínima: 1 volume.").max(10000).optional().nullable(),
  depositanteId: z.string().optional().nullable(),
  observacao: z.string().trim().max(300).optional().nullable(),
});

async function depositanteDaEmpresa(escopo: EscopoEmpresa, id: string | null | undefined) {
  if (!id) return null;
  const p = await prisma.pessoa.findFirst({ where: { id, empresaId: escopo.ativa.id }, select: { id: true, nome: true } });
  if (!p) throw new ErroAcao("Depositante não encontrado nesta empresa.", { depositanteId: "Depositante não encontrado." });
  return p;
}

export async function salvarEndereco(entrada: z.input<typeof esquemaEndereco>): Promise<Resultado<{ id: string }>> {
  return executar(async () => {
    await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaEndereco.parse(entrada);
    const codigo = normalizarCodigoEndereco(d.codigo);
    if (!codigo) throw new ErroAcao("Use letras e números no código (ex.: A-01-02).", { codigo: "Código inválido." });
    const dep = await depositanteDaEmpresa(escopo, d.depositanteId);
    const dados = { codigo, zona: d.zona ? normalizarCodigoEndereco(d.zona) || null : (codigo.split(/[-./]/)[0] ?? null), tipo: d.tipo, capacidade: d.capacidade ?? null, depositanteId: dep?.id ?? null, observacao: d.observacao || null };
    if (d.id) {
      const atual = await prisma.enderecoArmazem.findFirst({ where: { id: d.id, empresaId: { in: escopo.ids } } });
      if (!atual) throw new ErroAcao("Endereço não encontrado nesta empresa.");
      const volumes = await prisma.volumeArmazem.findMany({ where: { enderecoId: atual.id, status: { not: "EXPEDIDO" } }, select: { depositanteId: true } });
      if (dados.capacidade !== null && volumes.length > dados.capacidade) throw new ErroAcao(`Há ${volumes.length} volumes neste endereço; a capacidade não pode ser menor.`, { capacidade: "Menor que a ocupação." });
      if (dados.depositanteId && volumes.some((v) => v.depositanteId !== dados.depositanteId)) throw new ErroAcao("Há volumes de outro depositante neste endereço. Tire-os antes de reservar.", { depositanteId: "Há volumes de outro depositante." });
      try {
        await prisma.enderecoArmazem.update({ where: { id: atual.id }, data: dados });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") throw new ErroAcao(`Já existe o endereço ${codigo} neste estabelecimento.`, { codigo: "Código já usado." });
        throw e;
      }
      await auditar("editar_endereco", "armazem", atual.id, `Endereço ${codigo} alterado`);
      revalidarArmazem();
      return { id: atual.id };
    }
    exigirEmpresaNoEscopo(escopo, d.estabelecimentoId, "Estabelecimento fora da empresa atual.");
    try {
      const criado = await prisma.enderecoArmazem.create({ data: { ...dados, empresaId: d.estabelecimentoId }, select: { id: true } });
      await auditar("criar_endereco", "armazem", criado.id, `Endereço ${codigo} criado`);
      revalidarArmazem();
      return { id: criado.id };
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw new ErroAcao(`Já existe o endereço ${codigo} neste estabelecimento.`, { codigo: "Código já usado." });
      throw e;
    }
  }, "Endereço salvo.");
}

const esquemaGerar = z.object({
  estabelecimentoId: z.string().min(1, "Escolha o estabelecimento."),
  ruas: z.string().trim().min(1, "Informe as ruas.").max(200),
  moduloDe: z.number().int(),
  moduloAte: z.number().int(),
  nivelDe: z.number().int(),
  nivelAte: z.number().int(),
  posicaoDe: z.number().int().optional().nullable(),
  posicaoAte: z.number().int().optional().nullable(),
  tipo: z.enum(tiposEndereco),
  capacidade: z.number().int().min(1).max(10000).optional().nullable(),
  depositanteId: z.string().optional().nullable(),
});

/** Gera endereços em lote: ruas × módulos × níveis (× posições). Os que já existem ficam como estão. */
export async function gerarEnderecos(entrada: z.input<typeof esquemaGerar>): Promise<Resultado<{ criados: number; existentes: number }>> {
  return executar(async () => {
    await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaGerar.parse(entrada);
    exigirEmpresaNoEscopo(escopo, d.estabelecimentoId, "Estabelecimento fora da empresa atual.");
    const g = gerarCodigosEnderecos(d);
    if ("erro" in g) throw new ErroAcao(g.erro);
    const dep = await depositanteDaEmpresa(escopo, d.depositanteId);
    const r = await prisma.enderecoArmazem.createMany({
      data: g.codigos.map((c) => ({ empresaId: d.estabelecimentoId, codigo: c.codigo, zona: c.zona, tipo: d.tipo, capacidade: d.capacidade ?? null, depositanteId: dep?.id ?? null })),
      skipDuplicates: true,
    });
    await auditar("gerar_enderecos", "armazem", d.estabelecimentoId, `${r.count} endereços gerados (${g.codigos[0].codigo} a ${g.codigos[g.codigos.length - 1].codigo})`);
    revalidarArmazem();
    return { criados: r.count, existentes: g.codigos.length - r.count };
  });
}

export async function alternarEndereco(id: string): Promise<Resultado<{ ativo: boolean }>> {
  return executar(async () => {
    await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const e = await prisma.enderecoArmazem.findFirst({ where: { id: String(id), empresaId: { in: escopo.ids } } });
    if (!e) throw new ErroAcao("Endereço não encontrado nesta empresa.");
    if (e.ativo && (await prisma.volumeArmazem.count({ where: { enderecoId: e.id, status: { not: "EXPEDIDO" } } })))
      throw new ErroAcao(`Há volumes no endereço ${e.codigo}. Mude-os de lugar antes de inativar.`);
    await prisma.enderecoArmazem.update({ where: { id: e.id }, data: { ativo: !e.ativo } });
    revalidarArmazem();
    return { ativo: !e.ativo };
  }, "Endereço atualizado.");
}

export async function excluirEndereco(id: string): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const e = await prisma.enderecoArmazem.findFirst({ where: { id: String(id), empresaId: { in: escopo.ids } } });
    if (!e) throw new ErroAcao("Endereço não encontrado nesta empresa.");
    if (await prisma.volumeArmazem.count({ where: { enderecoId: e.id } })) throw new ErroAcao(`Há volumes no endereço ${e.codigo}. Mude-os de lugar antes de excluir.`);
    await prisma.enderecoArmazem.delete({ where: { id: e.id } });
    await auditar("excluir_endereco", "armazem", e.id, `Endereço ${e.codigo} excluído`);
    revalidarArmazem();
    return undefined;
  }, "Endereço excluído.");
}

// ───────────────────────── Buscas para os diálogos ─────────────────────────

export type OpcaoEndereco = { id: string; codigo: string; zona: string | null; ocupados: number; capacidade: number | null; reservadoPara: string | null; reservadoId: string | null };

/** Endereços ativos do estabelecimento para escolher no diálogo (reservados ao depositante primeiro, depois os vazios). */
export async function buscarEnderecos(estabelecimentoId: string, termo: string, depositanteId?: string | null): Promise<Resultado<OpcaoEndereco[]>> {
  return executar(async () => {
    await exigirPermissao("armazem:ver");
    const escopo = await escopoEmpresa();
    exigirEmpresaNoEscopo(escopo, estabelecimentoId);
    const t = normalizarCodigoEndereco(String(termo ?? ""));
    const lista = await prisma.enderecoArmazem.findMany({
      where: { empresaId: estabelecimentoId, ativo: true, ...(t ? { codigo: { contains: t } } : {}), ...(depositanteId ? { OR: [{ depositanteId: null }, { depositanteId }] } : { depositanteId: null }) },
      include: { depositante: { select: { nome: true, nomeFantasia: true } }, _count: { select: { volumes: { where: { status: { not: "EXPEDIDO" } } } } } },
      orderBy: { codigo: "asc" },
      take: 200,
    });
    return lista
      .map((e) => ({ id: e.id, codigo: e.codigo, zona: e.zona, ocupados: e._count.volumes, capacidade: e.capacidade, reservadoPara: e.depositante ? e.depositante.nomeFantasia || e.depositante.nome : null, reservadoId: e.depositanteId }))
      .sort((a, b) => Number(b.reservadoId === depositanteId && !!depositanteId) - Number(a.reservadoId === depositanteId && !!depositanteId) || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }))
      .slice(0, 40);
  });
}

export type OpcaoVolume = { id: string; codigo: string; endereco: string | null; itens: number };

/** Volumes do mesmo depositante e estabelecimento (destino da transferência). */
export async function buscarVolumes(origemId: string, termo: string): Promise<Resultado<OpcaoVolume[]>> {
  return executar(async () => {
    await exigirPermissao("armazem:ver");
    const escopo = await escopoEmpresa();
    const o = await volumeDoEscopo(escopo, String(origemId));
    const lido = lerCodigoVolume(String(termo ?? ""));
    const digitado = /^\d+$/.test(String(termo ?? "").trim()) ? Number(String(termo).trim()) : null;
    const lista = await prisma.volumeArmazem.findMany({
      where: { empresaId: o.empresaId, depositanteId: o.depositanteId, id: { not: o.id }, status: { not: "EXPEDIDO" }, ...(lido ? { tipo: lido.tipo, numero: lido.numero } : digitado ? { numero: digitado } : {}) },
      include: { endereco: { select: { codigo: true } }, _count: { select: { conteudo: true } } },
      orderBy: [{ tipo: "asc" }, { numero: "desc" }],
      take: 30,
    });
    return lista.map((v) => ({ id: v.id, codigo: codigoVolume(v.tipo, v.numero), endereco: v.endereco?.codigo ?? null, itens: v._count.conteudo }));
  });
}

/** Leva à caixa, ao pallet, ao endereço ou ao recebimento pelo código digitado ou lido no QR. */
export async function localizarNoArmazem(texto: string): Promise<Resultado<{ url: string }>> {
  return executar(async () => {
    await exigirPermissao("armazem:ver");
    const escopo = await escopoEmpresa();
    let t = String(texto ?? "").trim();
    if (!t) throw new ErroAcao("Digite o código da caixa, do pallet ou do endereço.");
    // QR das etiquetas: URL do próprio sistema
    const url = t.match(/\/servicos\/armazem\/(volumes|enderecos|recebimentos)\/([a-z0-9]+)/i);
    if (url) return { url: `/servicos/armazem/${url[1].toLowerCase()}/${url[2]}` };
    const vol = lerCodigoVolume(t);
    if (vol) {
      const v = await prisma.volumeArmazem.findFirst({ where: { empresaId: { in: escopo.ids }, tipo: vol.tipo, numero: vol.numero }, select: { id: true } });
      if (v) return { url: `/servicos/armazem/volumes/${v.id}` };
      throw new ErroAcao(`${codigoVolume(vol.tipo, vol.numero)} não existe nesta empresa.`);
    }
    const rec = t.toUpperCase().match(/^REC[-\s]*0*(\d{1,9})$/);
    if (rec) {
      const r = await prisma.recebimentoArmazem.findFirst({ where: { empresaId: { in: escopo.ids }, numero: Number(rec[1]) }, select: { id: true } });
      if (r) return { url: `/servicos/armazem/recebimentos/${r.id}` };
    }
    t = normalizarCodigoEndereco(t);
    const e = await prisma.enderecoArmazem.findFirst({ where: { empresaId: { in: escopo.ids }, codigo: t }, select: { id: true } });
    if (e) return { url: `/servicos/armazem/enderecos/${e.id}` };
    return { url: `/servicos/armazem?q=${encodeURIComponent(String(texto).trim())}` };
  });
}
