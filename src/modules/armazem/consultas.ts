// Consultas do armazém geral para as telas (itens armazenados, recebimentos, volumes e endereços). Só servidor.
import "server-only";
import { prisma, type Prisma } from "@/lib/db";
import { escopoEmpresa, type EscopoEmpresa } from "@/lib/auth/empresa";
import { num } from "@/lib/serial";
import {
  arred3,
  codigoVolume,
  compararRecebimento,
  lerCodigoVolume,
  normalizarCodigoEndereco,
  restantesDoRecebimento,
  type ItemQuantidade,
  type StatusRecebimento,
  type StatusVolume,
  type TipoVolume,
} from "./tipos";

type Busca = Record<string, string | string[] | undefined>;
const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const nomePessoa = (p: { nome: string; nomeFantasia?: string | null }) => p.nomeFantasia || p.nome;
const pagina = (v: string | string[] | undefined) => Math.max(1, Math.min(10_000, Number(primeiro(v)) || 1));

export const POR_PAGINA_ARMAZEM = 50;

export type EstabelecimentoOpcao = { id: string; nome: string; cnpj: string; matriz: boolean };

/** Estabelecimentos ativos do escopo (o armazém é por estabelecimento). */
export async function estabelecimentosArmazem(escopo?: EscopoEmpresa): Promise<EstabelecimentoOpcao[]> {
  const e = escopo ?? (await escopoEmpresa());
  const lista = await prisma.empresa.findMany({ where: { id: { in: e.ids }, ativo: true }, select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true, matrizId: true } });
  return lista.map((x) => ({ id: x.id, nome: x.nomeFantasia || x.razaoSocial, cnpj: x.cnpj, matriz: !x.matrizId })).sort((a, b) => Number(b.matriz) - Number(a.matriz) || a.nome.localeCompare(b.nome, "pt-BR"));
}

const idsDoFiltro = (escopo: EscopoEmpresa, estab: string) => (estab && escopo.ids.includes(estab) ? [estab] : escopo.ids);

/** Depositantes com algum recebimento no escopo (filtros). */
export async function depositantesArmazem(escopo: EscopoEmpresa) {
  const lista = await prisma.pessoa.findMany({
    where: { empresaId: escopo.ativa.id, recebimentosArmazem: { some: { empresaId: { in: escopo.ids } } } },
    select: { id: true, nome: true, nomeFantasia: true, documento: true },
    orderBy: { nome: "asc" },
  });
  return lista.map((p) => ({ id: p.id, nome: nomePessoa(p), documento: p.documento }));
}

// ───────────────────────── Itens armazenados ─────────────────────────

export type FiltrosItens = { q: string; depositante: string; estab: string; agrupar: "volume" | "item"; pagina: number };

export function lerFiltrosItens(sp: Busca): FiltrosItens {
  return {
    q: primeiro(sp.q).trim().slice(0, 100),
    depositante: primeiro(sp.depositante),
    estab: primeiro(sp.estab),
    agrupar: primeiro(sp.agrupar) === "item" ? "item" : "volume",
    pagina: pagina(sp.pagina),
  };
}

function whereItens(ids: string[], f: Pick<FiltrosItens, "q" | "depositante">): Prisma.ConteudoVolumeWhereInput {
  const q = f.q;
  const vol = q ? lerCodigoVolume(q) : null;
  const end = q ? normalizarCodigoEndereco(q) : "";
  return {
    volume: { empresaId: { in: ids }, status: { not: "EXPEDIDO" }, ...(f.depositante ? { depositanteId: f.depositante } : {}) },
    ...(q
      ? {
          OR: [
            { produto: { codigo: { contains: q, mode: "insensitive" } } },
            { produto: { descricao: { contains: q, mode: "insensitive" } } },
            { lote: { contains: q, mode: "insensitive" } },
            { volume: { referenciaDepositante: { contains: q, mode: "insensitive" } } },
            ...(vol ? [{ volume: { tipo: vol.tipo, numero: vol.numero } }] : []),
            ...(end ? [{ volume: { endereco: { codigo: { contains: end } } } }] : []),
          ],
        }
      : {}),
  };
}

export type LinhaItem = {
  id: string;
  depositante: string;
  codigo: string;
  descricao: string;
  unidade: string;
  lote: string;
  quantidade: number;
  valorUnitario: number | null;
  volume: { id: string; codigo: string; status: StatusVolume };
  endereco: { id: string; codigo: string } | null;
  recebimento: { id: string; numero: number; notas: string };
};

export type GrupoItem = { produtoId: string; depositante: string; codigo: string; descricao: string; unidade: string; lote: string; quantidade: number; volumes: { id: string; codigo: string; endereco: string | null }[] };

const notasDoRecebimento = (docs: { tipo: string; numero: string | null }[]) =>
  docs
    .filter((d) => d.tipo === "NFE")
    .map((d) => d.numero ?? "")
    .filter(Boolean)
    .join(", ");

export async function carregarItensArmazenados(f: FiltrosItens) {
  const escopo = await escopoEmpresa();
  const ids = idsDoFiltro(escopo, f.estab);
  const where = whereItens(ids, f);
  if (f.agrupar === "item") {
    const grupos = await prisma.conteudoVolume.groupBy({ by: ["produtoId", "lote"], where, _sum: { quantidade: true }, orderBy: [{ produtoId: "asc" }, { lote: "asc" }] });
    const fatia = grupos.slice((f.pagina - 1) * POR_PAGINA_ARMAZEM, f.pagina * POR_PAGINA_ARMAZEM);
    const produtos = await prisma.produtoDepositante.findMany({ where: { id: { in: fatia.map((g) => g.produtoId) } }, include: { depositante: { select: { nome: true, nomeFantasia: true } } } });
    const porId = new Map(produtos.map((p) => [p.id, p]));
    const onde = !fatia.length ? [] : await prisma.conteudoVolume.findMany({
      where: { AND: [where, { OR: fatia.map((g) => ({ produtoId: g.produtoId, lote: g.lote })) }] },
      select: { produtoId: true, lote: true, volume: { select: { id: true, tipo: true, numero: true, endereco: { select: { codigo: true } } } } },
    });
    const linhas: GrupoItem[] = fatia
      .map((g) => {
        const p = porId.get(g.produtoId)!;
        const vols = onde.filter((o) => o.produtoId === g.produtoId && o.lote === g.lote).map((o) => ({ id: o.volume.id, codigo: codigoVolume(o.volume.tipo, o.volume.numero), endereco: o.volume.endereco?.codigo ?? null }));
        return { produtoId: g.produtoId, depositante: nomePessoa(p.depositante), codigo: p.codigo, descricao: p.descricao, unidade: p.unidade, lote: g.lote, quantidade: arred3(num(g._sum.quantidade ?? 0)), volumes: vols };
      })
      .sort((a, b) => a.depositante.localeCompare(b.depositante, "pt-BR") || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }) || a.lote.localeCompare(b.lote, "pt-BR", { numeric: true }));
    return { agrupado: true as const, grupos: linhas, linhas: [] as LinhaItem[], total: grupos.length };
  }
  const [total, lista] = await Promise.all([
    prisma.conteudoVolume.count({ where }),
    prisma.conteudoVolume.findMany({
      where,
      orderBy: [{ volume: { depositanteId: "asc" } }, { produto: { codigo: "asc" } }, { lote: "asc" }],
      skip: (f.pagina - 1) * POR_PAGINA_ARMAZEM,
      take: POR_PAGINA_ARMAZEM,
      include: {
        produto: { select: { codigo: true, descricao: true, unidade: true, valorUnitario: true } },
        volume: { select: { id: true, tipo: true, numero: true, status: true, depositante: { select: { nome: true, nomeFantasia: true } }, endereco: { select: { id: true, codigo: true } } } },
        recebimento: { select: { id: true, numero: true, documentos: { select: { tipo: true, numero: true } } } },
      },
    }),
  ]);
  const linhas: LinhaItem[] = lista.map((c) => ({
    id: c.id,
    depositante: nomePessoa(c.volume.depositante),
    codigo: c.produto.codigo,
    descricao: c.produto.descricao,
    unidade: c.produto.unidade,
    lote: c.lote,
    quantidade: num(c.quantidade),
    valorUnitario: c.produto.valorUnitario === null ? null : num(c.produto.valorUnitario),
    volume: { id: c.volume.id, codigo: codigoVolume(c.volume.tipo, c.volume.numero), status: c.volume.status },
    endereco: c.volume.endereco,
    recebimento: { id: c.recebimento.id, numero: c.recebimento.numero, notas: notasDoRecebimento(c.recebimento.documentos) },
  }));
  return { agrupado: false as const, grupos: [] as GrupoItem[], linhas, total };
}

/** Todas as linhas do filtro (CSV). */
export async function itensParaCsv(f: Omit<FiltrosItens, "pagina" | "agrupar">) {
  const escopo = await escopoEmpresa();
  const lista = await prisma.conteudoVolume.findMany({
    where: whereItens(idsDoFiltro(escopo, f.estab), f),
    orderBy: [{ volume: { depositanteId: "asc" } }, { produto: { codigo: "asc" } }, { lote: "asc" }],
    take: 50_000,
    include: {
      produto: { select: { codigo: true, descricao: true, unidade: true, ncm: true, valorUnitario: true } },
      volume: { select: { tipo: true, numero: true, referenciaDepositante: true, depositante: { select: { nome: true, documento: true } }, endereco: { select: { codigo: true } }, empresa: { select: { nomeFantasia: true, razaoSocial: true } } } },
      recebimento: { select: { numero: true, chegadaEm: true, documentos: { select: { tipo: true, numero: true } } } },
    },
  });
  return lista;
}

/** Números do painel: volumes, endereços e conferências. */
export async function resumoArmazem(f: { estab: string }) {
  const escopo = await escopoEmpresa();
  const ids = idsDoFiltro(escopo, f.estab);
  const [porTipo, semEndereco, emConferencia, enderecos, ocupados, porDepositante, conteudos] = await Promise.all([
    prisma.volumeArmazem.groupBy({ by: ["tipo"], where: { empresaId: { in: ids }, status: { not: "EXPEDIDO" } }, _count: true }),
    prisma.volumeArmazem.count({ where: { empresaId: { in: ids }, status: "FECHADO", enderecoId: null } }),
    prisma.recebimentoArmazem.count({ where: { empresaId: { in: ids }, status: "CONFERENCIA" } }),
    prisma.enderecoArmazem.count({ where: { empresaId: { in: ids }, ativo: true } }),
    prisma.volumeArmazem.findMany({ where: { empresaId: { in: ids }, status: { not: "EXPEDIDO" }, enderecoId: { not: null } }, distinct: ["enderecoId"], select: { enderecoId: true } }),
    prisma.volumeArmazem.groupBy({ by: ["depositanteId", "tipo"], where: { empresaId: { in: ids }, status: { not: "EXPEDIDO" } }, _count: true }),
    prisma.conteudoVolume.findMany({ where: { volume: { empresaId: { in: ids }, status: { not: "EXPEDIDO" } } }, take: 50_000, select: { quantidade: true, volume: { select: { depositanteId: true } }, produto: { select: { valorUnitario: true } } } }),
  ]);
  const deps = new Map<string, { caixas: number; pallets: number; quantidade: number; valor: number; linhas: number }>();
  for (const g of porDepositante) {
    const d = deps.get(g.depositanteId) ?? { caixas: 0, pallets: 0, quantidade: 0, valor: 0, linhas: 0 };
    if (g.tipo === "CAIXA") d.caixas += g._count;
    else d.pallets += g._count;
    deps.set(g.depositanteId, d);
  }
  for (const c of conteudos) {
    const d = deps.get(c.volume.depositanteId);
    if (!d) continue;
    const q = num(c.quantidade);
    d.quantidade = arred3(d.quantidade + q);
    d.linhas++;
    if (c.produto.valorUnitario !== null) d.valor = Math.round((d.valor + q * num(c.produto.valorUnitario)) * 100) / 100;
  }
  const pessoas = await prisma.pessoa.findMany({ where: { id: { in: [...deps.keys()] } }, select: { id: true, nome: true, nomeFantasia: true, documento: true } });
  const depositantes = pessoas
    .map((p) => ({ id: p.id, nome: nomePessoa(p), documento: p.documento, ...deps.get(p.id)! }))
    .sort((a, b) => b.caixas + b.pallets - (a.caixas + a.pallets) || a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    caixas: porTipo.find((t) => t.tipo === "CAIXA")?._count ?? 0,
    pallets: porTipo.find((t) => t.tipo === "PALLET")?._count ?? 0,
    semEndereco,
    emConferencia,
    enderecos,
    enderecosOcupados: ocupados.length,
    depositantes,
  };
}

// ───────────────────────── Recebimentos ─────────────────────────

export type FiltrosRecebimentos = { status: "" | StatusRecebimento; depositante: string; q: string; estab: string; pagina: number };

export function lerFiltrosRecebimentos(sp: Busca): FiltrosRecebimentos {
  const s = primeiro(sp.status);
  return { status: s === "CONFERENCIA" || s === "CONCLUIDO" ? s : "", depositante: primeiro(sp.depositante), q: primeiro(sp.q).trim().slice(0, 100), estab: primeiro(sp.estab), pagina: pagina(sp.pagina) };
}

export async function listarRecebimentos(f: FiltrosRecebimentos) {
  const escopo = await escopoEmpresa();
  const ids = idsDoFiltro(escopo, f.estab);
  const digitos = f.q.replace(/\D/g, "");
  const rec = f.q.toUpperCase().match(/^REC[-\s]*0*(\d{1,9})$/);
  const base: Prisma.RecebimentoArmazemWhereInput = {
    empresaId: { in: ids },
    ...(f.depositante ? { depositanteId: f.depositante } : {}),
    ...(f.q
      ? {
          OR: [
            { depositante: { nome: { contains: f.q, mode: "insensitive" } } },
            { depositante: { nomeFantasia: { contains: f.q, mode: "insensitive" } } },
            ...(rec ? [{ numero: Number(rec[1]) }] : []),
            ...(digitos.length >= 1 && digitos.length <= 9 ? [{ numero: Number(digitos) }, { documentos: { some: { numero: digitos.replace(/^0+/, "") || digitos } } }] : []),
            ...(digitos.length >= 10 ? [{ documentos: { some: { chave: { contains: digitos } } } }, { depositante: { documento: { contains: digitos } } }] : []),
          ],
        }
      : {}),
  };
  const where: Prisma.RecebimentoArmazemWhereInput = { ...base, ...(f.status ? { status: f.status } : {}) };
  const [total, contagem, lista] = await Promise.all([
    prisma.recebimentoArmazem.count({ where }),
    prisma.recebimentoArmazem.groupBy({ by: ["status"], where: base, _count: true }),
    prisma.recebimentoArmazem.findMany({
      where,
      orderBy: [{ chegadaEm: "desc" }, { numero: "desc" }],
      skip: (f.pagina - 1) * POR_PAGINA_ARMAZEM,
      take: POR_PAGINA_ARMAZEM,
      include: {
        depositante: { select: { nome: true, nomeFantasia: true, documento: true } },
        empresa: { select: { nomeFantasia: true, razaoSocial: true } },
        documentos: { select: { tipo: true, numero: true } },
        _count: { select: { volumes: true } },
      },
    }),
  ]);
  const idsLista = lista.map((r) => r.id);
  const [esp, conf] = await Promise.all([
    prisma.itemRecebimentoArmazem.groupBy({ by: ["recebimentoId"], where: { recebimentoId: { in: idsLista } }, _sum: { quantidade: true } }),
    prisma.conteudoVolume.groupBy({ by: ["recebimentoId"], where: { recebimentoId: { in: idsLista } }, _sum: { quantidade: true } }),
  ]);
  const somaE = new Map(esp.map((x) => [x.recebimentoId, num(x._sum.quantidade ?? 0)]));
  const somaC = new Map(conf.map((x) => [x.recebimentoId, num(x._sum.quantidade ?? 0)]));
  return {
    total,
    contagem: { CONFERENCIA: contagem.find((c) => c.status === "CONFERENCIA")?._count ?? 0, CONCLUIDO: contagem.find((c) => c.status === "CONCLUIDO")?._count ?? 0 },
    linhas: lista.map((r) => ({
      id: r.id,
      numero: r.numero,
      chegadaEm: r.chegadaEm.toISOString().slice(0, 10),
      status: r.status as StatusRecebimento,
      depositante: nomePessoa(r.depositante),
      documentoDepositante: r.depositante.documento,
      estabelecimento: r.empresa.nomeFantasia || r.empresa.razaoSocial,
      documentos: r.documentos.map((d) => `${d.tipo === "CTE" ? "CT-e" : "NF-e"} ${d.numero ?? ""}`.trim()),
      volumes: r._count.volumes,
      esperado: arred3(somaE.get(r.id) ?? 0),
      conferido: arred3(somaC.get(r.id) ?? 0),
    })),
  };
}

/** NF-e de remessa para armazenagem que a busca de notas trouxe e que ainda não deram entrada no armazém. */
export async function notasAguardandoRecebimento(escopo: EscopoEmpresa) {
  const lista = await prisma.documentoRecebido.findMany({
    where: {
      empresaId: { in: escopo.ids },
      tipo: "NFE",
      armazenagem: true,
      completo: true,
      situacao: "AUTORIZADO",
      documentosArmazem: { none: {} },
      OR: [{ manifestacao: null }, { manifestacao: { notIn: ["DESCONHECIMENTO", "NAO_REALIZADA"] } }],
    },
    orderBy: { emitidoEm: "desc" },
    take: 50,
    select: { id: true, numero: true, serie: true, emitenteNome: true, emitenteDocumento: true, emitidoEm: true, valor: true },
  });
  return lista.map((d) => ({ ...d, emitidoEm: d.emitidoEm?.toISOString() ?? null, valor: d.valor === null ? null : num(d.valor) }));
}

export async function produtosDoDepositante(matrizId: string, depositanteId: string) {
  return prisma.produtoDepositante.findMany({ where: { empresaId: matrizId, depositanteId }, orderBy: { codigo: "asc" }, take: 5000, select: { codigo: true, descricao: true, unidade: true } });
}

export type ConteudoTela = { id: string; produtoId: string; codigo: string; descricao: string; unidade: string; lote: string; quantidade: number; recebimentoId: string; recebimentoNumero: number };

const incluirConteudo = {
  orderBy: [{ produto: { codigo: "asc" } }, { lote: "asc" }],
  include: { produto: { select: { codigo: true, descricao: true, unidade: true } }, recebimento: { select: { numero: true } } },
} satisfies Prisma.VolumeArmazem$conteudoArgs;

const paraConteudoTela = (c: { id: string; produtoId: string; lote: string; quantidade: unknown; recebimentoId: string; produto: { codigo: string; descricao: string; unidade: string }; recebimento: { numero: number } }): ConteudoTela => ({
  id: c.id,
  produtoId: c.produtoId,
  codigo: c.produto.codigo,
  descricao: c.produto.descricao,
  unidade: c.produto.unidade,
  lote: c.lote,
  quantidade: num(c.quantidade as number),
  recebimentoId: c.recebimentoId,
  recebimentoNumero: c.recebimento.numero,
});

export async function obterRecebimento(id: string) {
  const escopo = await escopoEmpresa();
  const r = await prisma.recebimentoArmazem.findFirst({
    where: { id, empresaId: { in: escopo.ids } },
    include: {
      depositante: { select: { id: true, nome: true, nomeFantasia: true, documento: true } },
      empresa: { select: { id: true, nomeFantasia: true, razaoSocial: true, cnpj: true } },
      documentos: { orderBy: [{ tipo: "desc" }, { createdAt: "asc" }], include: { _count: { select: { itens: true } } } },
      itens: { orderBy: [{ numeroItem: "asc" }, { lote: "asc" }], include: { produto: { select: { codigo: true, descricao: true, unidade: true } } } },
    },
  });
  if (!r) return null;
  const [volumes, conferidosRaw, produtos] = await Promise.all([
    prisma.volumeArmazem.findMany({
      where: { empresaId: { in: escopo.ids }, OR: [{ recebimentoId: r.id }, { conteudo: { some: { recebimentoId: r.id } } }] },
      orderBy: [{ tipo: "asc" }, { numero: "asc" }],
      include: { endereco: { select: { id: true, codigo: true } }, conteudo: incluirConteudo },
    }),
    prisma.conteudoVolume.findMany({ where: { recebimentoId: r.id }, include: { produto: { select: { codigo: true, descricao: true, unidade: true } } } }),
    produtosDoDepositante(escopo.ativa.id, r.depositanteId),
  ]);
  const esperados: ItemQuantidade[] = r.itens.map((i) => ({ produtoId: i.produtoId, codigo: i.produto.codigo, descricao: i.produto.descricao, unidade: i.produto.unidade, lote: i.lote, quantidade: num(i.quantidade) }));
  const conferidos: ItemQuantidade[] = conferidosRaw.map((c) => ({ produtoId: c.produtoId, codigo: c.produto.codigo, descricao: c.produto.descricao, unidade: c.produto.unidade, lote: c.lote, quantidade: num(c.quantidade) }));
  const comparativo = compararRecebimento(esperados, conferidos);
  const lotesPorCodigo: Record<string, string[]> = {};
  for (const i of esperados) if (i.lote) lotesPorCodigo[i.codigo] = [...new Set([...(lotesPorCodigo[i.codigo] ?? []), i.lote])];
  return {
    id: r.id,
    numero: r.numero,
    status: r.status as StatusRecebimento,
    chegadaEm: r.chegadaEm.toISOString().slice(0, 10),
    observacao: r.observacao,
    concluidoEm: r.concluidoEm?.toISOString() ?? null,
    estabelecimento: { id: r.empresa.id, nome: r.empresa.nomeFantasia || r.empresa.razaoSocial, cnpj: r.empresa.cnpj },
    depositante: { id: r.depositante.id, nome: nomePessoa(r.depositante), documento: r.depositante.documento },
    documentos: r.documentos.map((d) => ({
      id: d.id,
      tipo: d.tipo as "NFE" | "CTE",
      chave: d.chave,
      numero: d.numero,
      serie: d.serie,
      emitenteNome: d.emitenteNome,
      emitenteDocumento: d.emitenteDocumento,
      emitidoEm: d.emitidoEm?.toISOString() ?? null,
      valor: d.valor === null ? null : num(d.valor),
      nfesReferenciadas: d.nfesReferenciadas,
      pesoKg: d.pesoKg === null ? null : num(d.pesoKg),
      volumesDeclarados: d.volumesDeclarados,
      documentoRecebidoId: d.documentoRecebidoId,
      itens: d._count.itens,
    })),
    esperados,
    comparativo,
    restantes: restantesDoRecebimento(esperados, conferidos).length,
    volumes: volumes.map((v) => ({
      id: v.id,
      tipo: v.tipo as TipoVolume,
      numero: v.numero,
      codigo: codigoVolume(v.tipo, v.numero),
      status: v.status as StatusVolume,
      endereco: v.endereco,
      referenciaDepositante: v.referenciaDepositante,
      deOutroRecebimento: v.recebimentoId !== r.id,
      conteudo: v.conteudo.map(paraConteudoTela),
    })),
    produtos,
    lotesPorCodigo,
  };
}

// ───────────────────────── Volumes ─────────────────────────

export type SituacaoFiltroVolume = "ativos" | "conferencia" | "sem-endereco" | "armazenados" | "expedidos";
export type FiltrosVolumes = { situacao: SituacaoFiltroVolume; depositante: string; endereco: string; q: string; estab: string; pagina: number };

export function lerFiltrosVolumes(sp: Busca): FiltrosVolumes {
  const s = primeiro(sp.situacao);
  const situacoes: SituacaoFiltroVolume[] = ["ativos", "conferencia", "sem-endereco", "armazenados", "expedidos"];
  return {
    situacao: situacoes.includes(s as SituacaoFiltroVolume) ? (s as SituacaoFiltroVolume) : "ativos",
    depositante: primeiro(sp.depositante),
    endereco: primeiro(sp.endereco),
    q: primeiro(sp.q).trim().slice(0, 100),
    estab: primeiro(sp.estab),
    pagina: pagina(sp.pagina),
  };
}

const whereSituacao: Record<SituacaoFiltroVolume, Prisma.VolumeArmazemWhereInput> = {
  ativos: { status: { not: "EXPEDIDO" } },
  conferencia: { status: "ABERTO" },
  "sem-endereco": { status: "FECHADO", enderecoId: null },
  armazenados: { status: "FECHADO", enderecoId: { not: null } },
  expedidos: { status: "EXPEDIDO" },
};

export async function listarVolumes(f: FiltrosVolumes) {
  const escopo = await escopoEmpresa();
  const ids = idsDoFiltro(escopo, f.estab);
  const vol = f.q ? lerCodigoVolume(f.q) : null;
  const end = f.q ? normalizarCodigoEndereco(f.q) : "";
  const base: Prisma.VolumeArmazemWhereInput = {
    empresaId: { in: ids },
    ...(f.depositante ? { depositanteId: f.depositante } : {}),
    ...(f.endereco ? { enderecoId: f.endereco } : {}),
    ...(f.q
      ? {
          OR: [
            ...(vol ? [{ tipo: vol.tipo, numero: vol.numero }] : []),
            ...(/^\d{1,9}$/.test(f.q) ? [{ numero: Number(f.q) }] : []),
            { referenciaDepositante: { contains: f.q, mode: "insensitive" } },
            { documentoSaida: { contains: f.q, mode: "insensitive" } },
            ...(end ? [{ endereco: { codigo: { contains: end } } }] : []),
            { conteudo: { some: { OR: [{ lote: { contains: f.q, mode: "insensitive" } }, { produto: { codigo: { contains: f.q, mode: "insensitive" } } }, { produto: { descricao: { contains: f.q, mode: "insensitive" } } }] } } },
            { depositante: { nome: { contains: f.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const where = { ...base, ...whereSituacao[f.situacao] };
  const [total, contagens, lista, endereco] = await Promise.all([
    prisma.volumeArmazem.count({ where }),
    Promise.all((Object.keys(whereSituacao) as SituacaoFiltroVolume[]).map(async (s) => [s, await prisma.volumeArmazem.count({ where: { ...base, ...whereSituacao[s] } })] as const)),
    prisma.volumeArmazem.findMany({
      where,
      orderBy: f.situacao === "expedidos" ? [{ expedidoEm: "desc" }, { numero: "desc" }] : [{ tipo: "asc" }, { numero: "desc" }],
      skip: (f.pagina - 1) * POR_PAGINA_ARMAZEM,
      take: POR_PAGINA_ARMAZEM,
      include: {
        depositante: { select: { id: true, nome: true, nomeFantasia: true } },
        endereco: { select: { id: true, codigo: true } },
        recebimento: { select: { id: true, numero: true } },
        conteudo: { select: { quantidade: true, produto: { select: { unidade: true } } } },
      },
    }),
    f.endereco ? prisma.enderecoArmazem.findFirst({ where: { id: f.endereco, empresaId: { in: escopo.ids } }, select: { id: true, codigo: true } }) : Promise.resolve(null),
  ]);
  return {
    total,
    contagens: Object.fromEntries(contagens) as Record<SituacaoFiltroVolume, number>,
    endereco,
    linhas: lista.map((v) => {
      const unidades = [...new Set(v.conteudo.map((c) => c.produto.unidade))];
      return {
        id: v.id,
        empresaId: v.empresaId,
        codigo: codigoVolume(v.tipo, v.numero),
        tipo: v.tipo as TipoVolume,
        status: v.status as StatusVolume,
        depositanteId: v.depositante.id,
        depositante: nomePessoa(v.depositante),
        endereco: v.endereco,
        recebimento: v.recebimento,
        referenciaDepositante: v.referenciaDepositante,
        itens: v.conteudo.length,
        quantidade: arred3(v.conteudo.reduce((a, c) => a + num(c.quantidade), 0)),
        unidade: unidades.length === 1 ? unidades[0] : null,
        expedidoEm: v.expedidoEm?.toISOString().slice(0, 10) ?? null,
        documentoSaida: v.documentoSaida,
      };
    }),
  };
}

export async function obterVolume(id: string) {
  const escopo = await escopoEmpresa();
  const v = await prisma.volumeArmazem.findFirst({
    where: { id, empresaId: { in: escopo.ids } },
    include: {
      depositante: { select: { id: true, nome: true, nomeFantasia: true, documento: true } },
      empresa: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
      endereco: { select: { id: true, codigo: true, zona: true } },
      recebimento: { select: { id: true, numero: true, status: true } },
      conteudo: incluirConteudo,
      movimentos: { orderBy: { createdAt: "desc" }, take: 200 },
    },
  });
  if (!v) return null;
  const usuarios = await prisma.usuario.findMany({ where: { id: { in: [...new Set(v.movimentos.map((m) => m.usuarioId).filter((x): x is string => !!x))] } }, select: { id: true, nome: true } });
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  const recebimentosOrigem = [...new Set(v.conteudo.map((c) => c.recebimentoId))];
  const docs = await prisma.documentoArmazem.findMany({ where: { recebimentoId: { in: recebimentosOrigem }, tipo: "NFE" }, select: { recebimentoId: true, numero: true, chave: true } });
  let restantes = 0;
  if (v.status === "ABERTO" && v.recebimentoId) {
    const [esp, conf] = await Promise.all([
      prisma.itemRecebimentoArmazem.findMany({ where: { recebimentoId: v.recebimentoId }, select: { produtoId: true, lote: true, quantidade: true } }),
      prisma.conteudoVolume.findMany({ where: { recebimentoId: v.recebimentoId }, select: { produtoId: true, lote: true, quantidade: true } }),
    ]);
    const item = (x: { produtoId: string; lote: string; quantidade: unknown }): ItemQuantidade => ({ produtoId: x.produtoId, lote: x.lote, quantidade: num(x.quantidade as number), codigo: "", descricao: "", unidade: "" });
    restantes = restantesDoRecebimento(esp.map(item), conf.map(item)).length;
  }
  return {
    id: v.id,
    empresaId: v.empresaId,
    estabelecimento: v.empresa.nomeFantasia || v.empresa.razaoSocial,
    tipo: v.tipo as TipoVolume,
    numero: v.numero,
    codigo: codigoVolume(v.tipo, v.numero),
    status: v.status as StatusVolume,
    depositante: { id: v.depositante.id, nome: nomePessoa(v.depositante), documento: v.depositante.documento },
    endereco: v.endereco,
    enderecadoEm: v.enderecadoEm?.toISOString() ?? null,
    recebimento: v.recebimento,
    referenciaDepositante: v.referenciaDepositante,
    observacao: v.observacao,
    expedidoEm: v.expedidoEm?.toISOString().slice(0, 10) ?? null,
    documentoSaida: v.documentoSaida,
    criadoEm: v.createdAt.toISOString(),
    conteudo: v.conteudo.map(paraConteudoTela),
    notasDeOrigem: recebimentosOrigem.map((r) => ({ recebimentoId: r, numero: v.conteudo.find((c) => c.recebimentoId === r)?.recebimento.numero ?? 0, notas: docs.filter((d) => d.recebimentoId === r).map((d) => ({ numero: d.numero, chave: d.chave })) })),
    movimentos: v.movimentos.map((m) => ({ id: m.id, tipo: m.tipo, resumo: m.resumo, em: m.createdAt.toISOString(), usuario: m.usuarioId ? (nomes.get(m.usuarioId) ?? null) : null })),
    restantes,
    produtos: await produtosDoDepositante(escopo.ativa.id, v.depositanteId),
  };
}

// ───────────────────────── Endereços ─────────────────────────

export type SituacaoEndereco = "todos" | "livres" | "ocupados" | "reservados" | "inativos";
export type FiltrosEnderecos = { situacao: SituacaoEndereco; zona: string; q: string; estab: string; pagina: number };

export function lerFiltrosEnderecos(sp: Busca): FiltrosEnderecos {
  const s = primeiro(sp.situacao);
  const situacoes: SituacaoEndereco[] = ["todos", "livres", "ocupados", "reservados", "inativos"];
  return { situacao: situacoes.includes(s as SituacaoEndereco) ? (s as SituacaoEndereco) : "todos", zona: primeiro(sp.zona), q: primeiro(sp.q).trim().slice(0, 60), estab: primeiro(sp.estab), pagina: pagina(sp.pagina) };
}

export const POR_PAGINA_ENDERECOS = 100;

const ocupado: Prisma.EnderecoArmazemWhereInput = { volumes: { some: { status: { not: "EXPEDIDO" } } } };
const whereSituacaoEndereco: Record<SituacaoEndereco, Prisma.EnderecoArmazemWhereInput> = {
  todos: { ativo: true },
  livres: { ativo: true, volumes: { none: { status: { not: "EXPEDIDO" } } } },
  ocupados: { ativo: true, ...ocupado },
  reservados: { ativo: true, depositanteId: { not: null } },
  inativos: { ativo: false },
};

export async function listarEnderecos(f: FiltrosEnderecos) {
  const escopo = await escopoEmpresa();
  const ids = idsDoFiltro(escopo, f.estab);
  const t = f.q ? normalizarCodigoEndereco(f.q) : "";
  const base: Prisma.EnderecoArmazemWhereInput = {
    empresaId: { in: ids },
    ...(f.zona ? { zona: f.zona } : {}),
    ...(f.q ? { OR: [...(t ? [{ codigo: { contains: t } }] : []), { observacao: { contains: f.q, mode: "insensitive" as const } }, { depositante: { nome: { contains: f.q, mode: "insensitive" as const } } }] } : {}),
  };
  const where = { ...base, ...whereSituacaoEndereco[f.situacao] };
  const [total, contagens, lista, zonas] = await Promise.all([
    prisma.enderecoArmazem.count({ where }),
    Promise.all((Object.keys(whereSituacaoEndereco) as SituacaoEndereco[]).map(async (s) => [s, await prisma.enderecoArmazem.count({ where: { ...base, ...whereSituacaoEndereco[s] } })] as const)),
    prisma.enderecoArmazem.findMany({
      where,
      orderBy: { codigo: "asc" },
      skip: (f.pagina - 1) * POR_PAGINA_ENDERECOS,
      take: POR_PAGINA_ENDERECOS,
      include: {
        empresa: { select: { nomeFantasia: true, razaoSocial: true } },
        depositante: { select: { id: true, nome: true, nomeFantasia: true } },
        volumes: { where: { status: { not: "EXPEDIDO" } }, select: { tipo: true, numero: true, depositante: { select: { nome: true, nomeFantasia: true } } } },
      },
    }),
    prisma.enderecoArmazem.findMany({ where: { empresaId: { in: ids }, zona: { not: null } }, distinct: ["zona"], select: { zona: true }, orderBy: { zona: "asc" } }),
  ]);
  return {
    total,
    contagens: Object.fromEntries(contagens) as Record<SituacaoEndereco, number>,
    zonas: zonas.map((z) => z.zona!).filter(Boolean),
    linhas: lista.map((e) => ({
      id: e.id,
      empresaId: e.empresaId,
      estabelecimento: e.empresa.nomeFantasia || e.empresa.razaoSocial,
      codigo: e.codigo,
      zona: e.zona,
      tipo: e.tipo,
      capacidade: e.capacidade,
      ativo: e.ativo,
      observacao: e.observacao,
      reservado: e.depositante ? { id: e.depositante.id, nome: nomePessoa(e.depositante) } : null,
      volumes: e.volumes.map((v) => codigoVolume(v.tipo, v.numero)),
      depositantes: [...new Set(e.volumes.map((v) => nomePessoa(v.depositante)))],
    })),
  };
}

export async function obterEndereco(id: string) {
  const escopo = await escopoEmpresa();
  const e = await prisma.enderecoArmazem.findFirst({
    where: { id, empresaId: { in: escopo.ids } },
    include: {
      empresa: { select: { id: true, nomeFantasia: true, razaoSocial: true } },
      depositante: { select: { id: true, nome: true, nomeFantasia: true } },
      volumes: {
        where: { status: { not: "EXPEDIDO" } },
        orderBy: [{ tipo: "asc" }, { numero: "asc" }],
        include: { depositante: { select: { nome: true, nomeFantasia: true } }, conteudo: incluirConteudo },
      },
    },
  });
  if (!e) return null;
  return {
    id: e.id,
    empresaId: e.empresaId,
    estabelecimento: e.empresa.nomeFantasia || e.empresa.razaoSocial,
    codigo: e.codigo,
    zona: e.zona,
    tipo: e.tipo,
    capacidade: e.capacidade,
    ativo: e.ativo,
    observacao: e.observacao,
    reservado: e.depositante ? { id: e.depositante.id, nome: nomePessoa(e.depositante) } : null,
    volumes: e.volumes.map((v) => ({ id: v.id, codigo: codigoVolume(v.tipo, v.numero), tipo: v.tipo as TipoVolume, status: v.status as StatusVolume, depositante: nomePessoa(v.depositante), conteudo: v.conteudo.map(paraConteudoTela) })),
  };
}
