// Consultas do módulo fiscal (notas recebidas). Só servidor.
import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { isoParaDate, ehISOValido } from "@/lib/datas";
import { num } from "@/lib/serial";
import { soDigitos } from "@/lib/format";
import { tokenMasterFocus } from "./focus/cliente";
import { detalheNfe, type DetalheNota } from "./leitura";
import type { Direcao, EstadoCaptacao, Motor, Situacao, TipoDoc, TipoManifestacao } from "./tipos";

export const POR_PAGINA_RECEBIDAS = 30;

type Parametros = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export type AbaRecebidas = "pendentes" | "ciencia" | "confirmadas" | "recusadas" | "canceladas" | "todas";
export const ABAS_RECEBIDAS: AbaRecebidas[] = ["pendentes", "ciencia", "confirmadas", "recusadas", "canceladas", "todas"];

export type FiltrosRecebidas = {
  aba: AbaRecebidas;
  tipo: TipoDoc | "";
  estab: string;
  de: string;
  ate: string;
  busca: string;
  lancadas: "" | "sim" | "nao";
  direcao: Direcao | "todas";
  pagina: number;
};

export function lerFiltrosRecebidas(sp: Parametros): FiltrosRecebidas {
  const aba = um(sp.aba) as AbaRecebidas;
  const tipo = um(sp.tipo).toUpperCase() as TipoDoc;
  const direcao = um(sp.direcao).toUpperCase();
  return {
    aba: ABAS_RECEBIDAS.includes(aba) ? aba : "todas",
    tipo: ["NFE", "CTE", "NFSE"].includes(tipo) ? tipo : "",
    estab: um(sp.estab),
    de: ehISOValido(um(sp.de)) ? um(sp.de) : "",
    ate: ehISOValido(um(sp.ate)) ? um(sp.ate) : "",
    busca: um(sp.q).trim().slice(0, 80),
    lancadas: um(sp.lancadas) === "sim" ? "sim" : um(sp.lancadas) === "nao" ? "nao" : "",
    direcao: direcao === "TODAS" ? "todas" : (["SAIDA", "TERCEIRO"].includes(direcao) ? direcao : "ENTRADA") as Direcao,
    pagina: Math.max(1, Number(um(sp.pagina)) || 1),
  };
}

/** NF-e recebidas sem manifestação final (sem nada ou só com ciência) — usado no selo do menu. */
export async function contarNotasPendentes(empresaIds: string[]): Promise<number> {
  return prisma.documentoRecebido.count({
    where: { empresaId: { in: empresaIds }, tipo: "NFE", direcao: "ENTRADA", situacao: "AUTORIZADO", OR: [{ manifestacao: null }, { manifestacao: "CIENCIA" }] },
  });
}

function filtroAba(aba: AbaRecebidas): Prisma.DocumentoRecebidoWhereInput {
  switch (aba) {
    case "pendentes":
      return { tipo: "NFE", situacao: "AUTORIZADO", manifestacao: null };
    case "ciencia":
      return { tipo: "NFE", situacao: "AUTORIZADO", manifestacao: "CIENCIA" };
    case "confirmadas":
      return { OR: [{ manifestacao: "CONFIRMACAO" }, { tipo: { in: ["CTE", "NFSE"] }, situacao: "AUTORIZADO" }] };
    case "recusadas":
      return { manifestacao: { in: ["DESCONHECIMENTO", "NAO_REALIZADA"] } };
    case "canceladas":
      return { situacao: { in: ["CANCELADO", "DENEGADO"] } };
    default:
      return {};
  }
}

export type LinhaRecebida = {
  id: string;
  tipo: TipoDoc;
  chave: string;
  numero: string | null;
  serie: string | null;
  emitenteNome: string | null;
  emitenteDocumento: string | null;
  valor: number | null;
  emitidoEm: string | null;
  situacao: Situacao;
  manifestacao: TipoManifestacao | null;
  manifestacaoErro: string | null;
  completo: boolean;
  direcao: Direcao;
  lancado: boolean;
  estabelecimento: string;
};

export async function listarRecebidas(f: FiltrosRecebidas) {
  const escopo = await escopoEmpresa();
  const estabelecimentos = [escopo.ativa, ...escopo.filiais];
  const ids = f.estab && escopo.ids.includes(f.estab) ? [f.estab] : escopo.ids;
  const base: Prisma.DocumentoRecebidoWhereInput = { empresaId: { in: ids } };
  const where: Prisma.DocumentoRecebidoWhereInput[] = [base];
  if (f.direcao !== "todas") where.push({ direcao: f.direcao });
  if (f.tipo) where.push({ tipo: f.tipo });
  if (f.de) where.push({ emitidoEm: { gte: isoParaDate(f.de) } });
  if (f.ate) where.push({ emitidoEm: { lt: new Date(isoParaDate(f.ate).getTime() + 86_400_000) } });
  if (f.lancadas) where.push({ lancadoEm: f.lancadas === "sim" ? { not: null } : null });
  if (f.busca) {
    const dig = soDigitos(f.busca);
    where.push({
      OR: [
        { emitenteNome: { contains: f.busca, mode: "insensitive" } },
        ...(dig.length >= 3 ? [{ emitenteDocumento: { contains: dig } }, { chave: { contains: dig } }, { numero: dig.replace(/^0+/, "") || dig }] : []),
      ],
    });
  }
  const comuns = { AND: where };
  const [total, linhas, porAba] = await Promise.all([
    prisma.documentoRecebido.count({ where: { AND: [comuns, filtroAba(f.aba)] } }),
    prisma.documentoRecebido.findMany({
      where: { AND: [comuns, filtroAba(f.aba)] },
      orderBy: [{ emitidoEm: "desc" }, { createdAt: "desc" }],
      skip: (f.pagina - 1) * POR_PAGINA_RECEBIDAS,
      take: POR_PAGINA_RECEBIDAS,
      select: {
        id: true,
        tipo: true,
        chave: true,
        numero: true,
        serie: true,
        emitenteNome: true,
        emitenteDocumento: true,
        valor: true,
        emitidoEm: true,
        situacao: true,
        manifestacao: true,
        manifestacaoErro: true,
        completo: true,
        direcao: true,
        lancadoEm: true,
        empresaId: true,
      },
    }),
    Promise.all(ABAS_RECEBIDAS.map((a) => prisma.documentoRecebido.count({ where: { AND: [comuns, filtroAba(a)] } }))),
  ]);
  const nomes = new Map(estabelecimentos.map((e) => [e.id, e.nome]));
  return {
    total,
    contadores: Object.fromEntries(ABAS_RECEBIDAS.map((a, i) => [a, porAba[i]])) as Record<AbaRecebidas, number>,
    estabelecimentos: estabelecimentos.map((e) => ({ id: e.id, nome: e.nome })),
    linhas: linhas.map(
      (l): LinhaRecebida => ({
        id: l.id,
        tipo: l.tipo,
        chave: l.chave,
        numero: l.numero,
        serie: l.serie,
        emitenteNome: l.emitenteNome,
        emitenteDocumento: l.emitenteDocumento,
        valor: l.valor === null ? null : num(l.valor),
        emitidoEm: l.emitidoEm?.toISOString() ?? null,
        situacao: l.situacao,
        manifestacao: l.manifestacao,
        manifestacaoErro: l.manifestacaoErro,
        completo: l.completo,
        direcao: l.direcao,
        lancado: !!l.lancadoEm,
        estabelecimento: nomes.get(l.empresaId) ?? "",
      }),
    ),
  };
}

export type RecebidaDetalhe = Awaited<ReturnType<typeof obterRecebida>>;

export async function obterRecebida(id: string) {
  const escopo = await escopoEmpresa();
  const d = await prisma.documentoRecebido.findFirst({
    where: { id, empresaId: { in: escopo.ids } },
    include: {
      empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true, matrizId: true } },
      pessoa: { select: { id: true, nome: true, documento: true } },
      eventos: { orderBy: [{ ocorridoEm: "asc" }, { createdAt: "asc" }], select: { id: true, tipoEvento: true, sequencia: true, descricao: true, detalhe: true, ocorridoEm: true, protocolo: true } },
    },
  });
  if (!d) return null;
  const titulos = await prisma.titulo.findMany({
    where: { origem: "NOTA_FISCAL", origemId: d.id, empresaId: { in: escopo.ids } },
    orderBy: { parcela: "asc" },
    select: { id: true, numero: true, parcela: true, totalParcelas: true, valor: true, vencimento: true, status: true },
  });
  const matrizId = d.empresa.matrizId ?? d.empresa.id;
  const fornecedor =
    d.pessoa ??
    (d.emitenteDocumento
      ? await prisma.pessoa.findFirst({ where: { empresaId: matrizId, documento: d.emitenteDocumento }, select: { id: true, nome: true, documento: true } })
      : null);
  const detalhe: DetalheNota | null = d.tipo === "NFE" && d.completo ? detalheNfe(d.xml) : null;
  return {
    id: d.id,
    tipo: d.tipo as TipoDoc,
    chave: d.chave,
    direcao: d.direcao as Direcao,
    numero: d.numero,
    serie: d.serie,
    emitenteNome: d.emitenteNome,
    emitenteDocumento: d.emitenteDocumento,
    emitenteIe: d.emitenteIe,
    destinatarioDocumento: d.destinatarioDocumento,
    valor: d.valor === null ? null : num(d.valor),
    emitidoEm: d.emitidoEm?.toISOString() ?? null,
    situacao: d.situacao as Situacao,
    protocolo: d.protocolo,
    completo: d.completo,
    motor: d.motor as Motor,
    manifestacao: d.manifestacao as TipoManifestacao | null,
    manifestadoEm: d.manifestadoEm?.toISOString() ?? null,
    manifestacaoProtocolo: d.manifestacaoProtocolo,
    manifestacaoErro: d.manifestacaoErro,
    lancadoEm: d.lancadoEm?.toISOString() ?? null,
    capturadoEm: d.createdAt.toISOString(),
    estabelecimento: { id: d.empresa.id, nome: d.empresa.nomeFantasia || d.empresa.razaoSocial, cnpj: d.empresa.cnpj, matrizId },
    fornecedor,
    eventos: d.eventos.map((e) => ({ ...e, ocorridoEm: e.ocorridoEm?.toISOString() ?? null })),
    titulos: titulos.map((t) => ({ ...t, valor: num(t.valor), vencimento: t.vencimento.toISOString().slice(0, 10) })),
    detalhe,
  };
}

/** Estado da captação dos estabelecimentos informados (painel da tela e bloco em Configurações). */
export async function estadoCaptacao(estabelecimentos: { id: string; nome: string; cnpj: string; matriz: boolean }[]): Promise<EstadoCaptacao[]> {
  const ids = estabelecimentos.map((e) => e.id);
  if (!ids.length) return [];
  const [configs, cursores, certs, empresas] = await Promise.all([
    prisma.configuracaoFiscal.findMany({ where: { empresaId: { in: ids } } }),
    prisma.cursorCaptura.findMany({ where: { empresaId: { in: ids } } }),
    prisma.certificadoDigital.findMany({ where: { empresaId: { in: ids } }, select: { empresaId: true } }),
    prisma.empresa.findMany({ where: { id: { in: ids } }, select: { id: true, matrizId: true } }),
  ]);
  const matrizDe = new Map(empresas.map((e) => [e.id, e.matrizId]));
  const comCert = new Set(certs.map((c) => c.empresaId));
  // matriz de fora da lista (filial sozinha) também conta para o certificado herdado
  const matrizesFora = [...new Set(empresas.map((e) => e.matrizId).filter((m): m is string => !!m && !comCert.has(m) && !ids.includes(m)))];
  if (matrizesFora.length) {
    for (const c of await prisma.certificadoDigital.findMany({ where: { empresaId: { in: matrizesFora } }, select: { empresaId: true } })) comCert.add(c.empresaId);
  }
  const focusDisponivel = !!tokenMasterFocus();
  return estabelecimentos.map((e) => {
    const c = configs.find((x) => x.empresaId === e.id);
    const motor = (c?.motor ?? "SEFAZ") as Motor;
    const proprio = comCert.has(e.id);
    const matrizId = matrizDe.get(e.id);
    const herdado = !proprio && !!matrizId && comCert.has(matrizId);
    const tipos = (["NFE", "CTE", "NFSE"] as TipoDoc[]).filter((t) => (c ? (t === "NFE" ? c.captarNfe : t === "CTE" ? c.captarCte : c.captarNfse) : true));
    return {
      empresaId: e.id,
      nome: e.nome,
      cnpj: e.cnpj,
      matriz: e.matriz,
      ativa: c?.captacaoAtiva ?? false,
      motor,
      ambiente: (c?.ambiente === 2 ? 2 : 1) as 1 | 2,
      tipos,
      cienciaAutomatica: c?.cienciaAutomatica ?? true,
      temCertificado: proprio || herdado,
      certificadoHerdado: herdado,
      focusDisponivel,
      focusAtivada: !!c?.focusTokenProducao,
      cursores: cursores
        .filter((k) => k.empresaId === e.id && k.motor === motor)
        .map((k) => ({
          tipo: k.tipo as TipoDoc,
          consultadoEm: k.consultadoEm?.toISOString() ?? null,
          status: k.status,
          mensagem: k.mensagem,
          proximaConsulta: k.proximaConsulta?.toISOString() ?? null,
          pendente: k.pendente,
        })),
    };
  });
}

/** Estabelecimentos do escopo ativo no formato do painel. */
export async function estabelecimentosDoEscopo() {
  const escopo = await escopoEmpresa();
  return [
    { id: escopo.ativa.id, nome: escopo.ativa.nome, cnpj: escopo.ativa.cnpj, matriz: true },
    ...escopo.filiais.map((f) => ({ id: f.id, nome: f.nome, cnpj: f.cnpj, matriz: false })),
  ];
}

/** Opções para o lançamento no contas a pagar (categorias de despesa e centros de custo da matriz). */
export async function opcoesLancamento(matrizId: string) {
  const [categorias, centros] = await Promise.all([
    prisma.categoria.findMany({ where: { empresaId: matrizId, tipo: "DESPESA", ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.centroCusto.findMany({ where: { empresaId: matrizId, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  return { categorias, centros };
}
