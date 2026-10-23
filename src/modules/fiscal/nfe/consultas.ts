// Consultas da emissão de NF-e (telas). Só servidor.
import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { ehISOValido, isoParaDate } from "@/lib/datas";
import { num } from "@/lib/serial";
import { certificadoParaEmissao } from "@/modules/configuracoes/certificado";
import { prepararNfe } from "./dados";
import type { StatusNota } from "./tipos";

type Parametros = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const POR_PAGINA_NOTAS = 30;

export type LinhaNota = {
  id: string;
  numero: number;
  serie: number;
  status: StatusNota;
  ambiente: number;
  motor: string;
  tpEmis: number;
  emitidaEm: string;
  destinatarioNome: string;
  destinatarioDocumento: string | null;
  valor: number;
  cStat: string | null;
  xMotivo: string | null;
  pedido: { id: string; numero: number } | null;
};

const linha = (n: Prisma.NotaFiscalGetPayload<{ include: { pedido: { select: { id: true; numero: true } } } }>): LinhaNota => ({
  id: n.id,
  numero: n.numero,
  serie: n.serie,
  status: n.status,
  ambiente: n.ambiente,
  motor: n.motor,
  tpEmis: n.tpEmis,
  emitidaEm: n.emitidaEm.toISOString(),
  destinatarioNome: n.destinatarioNome,
  destinatarioDocumento: n.destinatarioDocumento,
  valor: num(n.valor),
  cStat: n.cStat,
  xMotivo: n.xMotivo,
  pedido: n.pedido,
});

/** Painel da NF-e no pedido: notas já emitidas e o que falta para emitir (ou o resumo do que vai sair). */
export async function painelNfePedido(pedidoId: string) {
  const escopo = await escopoEmpresa();
  const notas = await prisma.notaFiscal.findMany({ where: { pedidoId, empresaId: { in: escopo.ids } }, orderBy: { createdAt: "desc" }, include: { pedido: { select: { id: true, numero: true } } } });
  const prep = await prepararNfe(pedidoId, escopo.ids);
  if (!prep) return null;
  const autorizada = notas.find((n) => n.status === "AUTORIZADA");
  const processando = notas.find((n) => n.status === "PROCESSANDO");
  const rejeitada = notas.find((n) => n.status === "REJEITADA");
  const proximo = rejeitada && !processando ? { numero: rejeitada.numero, serie: rejeitada.serie, reenvio: true } : prep.config ? { numero: prep.config.nfeProximoNumero, serie: prep.config.nfeSerie, reenvio: false } : null;
  const semRetorno = !!processando && processando.tpEmis === 1 && processando.motor === "SEFAZ";
  const caiuSemChegar = !processando && !!rejeitada && rejeitada.cStat === "ERR" && rejeitada.tpEmis === 1;
  return {
    pedidoFaturado: prep.pedido.status === "FATURADO",
    notas: notas.map(linha),
    podeEmitir: !autorizada && !processando && prep.problemas.length === 0,
    /** SEFAZ-SP fora: contingência SVC-AN (com outro número, se a nota anterior ficou sem retorno). */
    podeContingencia: !autorizada && prep.problemas.length === 0 && prep.motor === "SEFAZ" && (semRetorno || caiuSemChegar),
    pendenteSemRetorno: semRetorno ? { numero: processando!.numero, serie: processando!.serie } : null,
    autorizadas: notas.filter((n) => n.status === "AUTORIZADA").length,
    problemas: prep.problemas,
    proximo,
    ambiente: prep.dados.ambiente,
    motor: prep.motor,
    temServicos: prep.temServicos,
    resumo: {
      destinatario: prep.dados.destinatario.nome,
      natureza: prep.dados.naturezaOperacao,
      itens: prep.dados.itens.map((i) => ({ descricao: i.descricao, ncm: i.ncm, cfop: i.cfop, csosn: i.csosn, quantidade: i.quantidade, unidade: i.unidade, total: Math.round((i.quantidade * i.valorUnitario - i.desconto) * 100) / 100 })),
      totais: prep.totais,
      duplicatas: prep.dados.cobranca?.duplicatas ?? [],
      informacoes: prep.dados.informacoesComplementares ?? "",
    },
  };
}

export type FiltrosNotas = { status: StatusNota | ""; de: string; ate: string; busca: string; pagina: number };

export function lerFiltrosNotas(sp: Parametros): FiltrosNotas {
  const st = um(sp.status).toUpperCase();
  return {
    status: (["PROCESSANDO", "AUTORIZADA", "REJEITADA", "DENEGADA", "CANCELADA"].includes(st) ? st : "") as StatusNota | "",
    de: ehISOValido(um(sp.de)) ? um(sp.de) : "",
    ate: ehISOValido(um(sp.ate)) ? um(sp.ate) : "",
    busca: um(sp.q).trim().slice(0, 80),
    pagina: Math.max(1, Number(um(sp.pagina)) || 1),
  };
}

export async function listarNotas(f: FiltrosNotas) {
  const escopo = await escopoEmpresa();
  const where: Prisma.NotaFiscalWhereInput[] = [{ empresaId: { in: escopo.ids } }];
  if (f.de) where.push({ emitidaEm: { gte: isoParaDate(f.de) } });
  if (f.ate) where.push({ emitidaEm: { lt: new Date(isoParaDate(f.ate).getTime() + 86_400_000) } });
  if (f.busca) {
    const dig = f.busca.replace(/\D/g, "");
    where.push({ OR: [{ destinatarioNome: { contains: f.busca, mode: "insensitive" } }, ...(dig ? [{ destinatarioDocumento: { contains: dig } }, { chave: { contains: dig } }, ...(dig.length <= 9 ? [{ numero: Number(dig) }] : [])] : [])] });
  }
  const comuns = { AND: where };
  const [total, linhas, porStatus] = await Promise.all([
    prisma.notaFiscal.count({ where: { AND: [comuns, f.status ? { status: f.status } : {}] } }),
    prisma.notaFiscal.findMany({
      where: { AND: [comuns, f.status ? { status: f.status } : {}] },
      orderBy: [{ emitidaEm: "desc" }],
      skip: (f.pagina - 1) * POR_PAGINA_NOTAS,
      take: POR_PAGINA_NOTAS,
      include: { pedido: { select: { id: true, numero: true } } },
    }),
    prisma.notaFiscal.groupBy({ by: ["status"], where: comuns, _count: true }),
  ]);
  const contadores = Object.fromEntries(porStatus.map((g) => [g.status, g._count])) as Partial<Record<StatusNota, number>>;
  return { total, linhas: linhas.map(linha), contadores: { ...contadores, todas: porStatus.reduce((a, g) => a + g._count, 0) } };
}

export async function obterNota(id: string) {
  const escopo = await escopoEmpresa();
  const n = await prisma.notaFiscal.findFirst({
    where: { id, empresaId: { in: escopo.ids } },
    include: { pedido: { select: { id: true, numero: true } }, eventos: { orderBy: { createdAt: "asc" } }, empresa: { select: { razaoSocial: true, nomeFantasia: true, cnpj: true } } },
  });
  if (!n) return null;
  return {
    ...linha(n),
    chave: n.chave,
    protocolo: n.protocolo,
    autorizadaEm: n.autorizadaEm?.toISOString() ?? null,
    naturezaOperacao: n.naturezaOperacao,
    contingenciaMotivo: n.contingenciaMotivo,
    canceladaEm: n.canceladaEm?.toISOString() ?? null,
    cancelamentoProtocolo: n.cancelamentoProtocolo,
    cancelamentoJustificativa: n.cancelamentoJustificativa,
    temXml: !!(n.xmlAutorizado || n.xml),
    temDanfe: !!n.xmlAutorizado,
    /** Cancelamento vale até 24 horas depois da autorização. */
    cancelavel: n.status === "AUTORIZADA" && Date.now() - (n.autorizadaEm ?? n.emitidaEm).getTime() < 24 * 3_600_000,
    emitente: { nome: n.empresa.nomeFantasia || n.empresa.razaoSocial, cnpj: n.empresa.cnpj },
    eventos: n.eventos.map((e) => ({ id: e.id, tipoEvento: e.tipoEvento, sequencia: e.sequencia, detalhe: e.detalhe, ok: e.ok, cStat: e.cStat, xMotivo: e.xMotivo, protocolo: e.protocolo, criadoEm: e.createdAt.toISOString() })),
  };
}

export type EstadoEmissao = {
  empresaId: string;
  nome: string;
  cnpj: string;
  ativa: boolean;
  ambiente: 1 | 2;
  motor: "SEFAZ" | "FOCUS";
  serie: number;
  proximoNumero: number;
  informacoes: string | null;
  temCertificado: boolean;
  focusAtivada: boolean;
  emitidas: number;
  ultimaInutilizacao: { serie: number; inicio: number; fim: number; ok: boolean; em: string } | null;
};

export async function estadoEmissao(estabs: { id: string; nome: string; cnpj: string }[]): Promise<EstadoEmissao[]> {
  const ids = estabs.map((e) => e.id);
  if (!ids.length) return [];
  const [configs, contagens, inuts] = await Promise.all([
    prisma.configuracaoFiscal.findMany({ where: { empresaId: { in: ids } } }),
    prisma.notaFiscal.groupBy({ by: ["empresaId"], where: { empresaId: { in: ids }, status: { in: ["AUTORIZADA", "CANCELADA"] } }, _count: true }),
    prisma.inutilizacaoNfe.findMany({ where: { empresaId: { in: ids } }, orderBy: { createdAt: "desc" }, distinct: ["empresaId"] }),
  ]);
  return Promise.all(
    estabs.map(async (e) => {
      const c = configs.find((x) => x.empresaId === e.id);
      const inut = inuts.find((x) => x.empresaId === e.id);
      return {
        empresaId: e.id,
        nome: e.nome,
        cnpj: e.cnpj,
        ativa: c?.nfeAtiva ?? false,
        ambiente: (c?.nfeAmbiente === 1 ? 1 : 2) as 1 | 2,
        motor: (c?.nfeMotor ?? "SEFAZ") as "SEFAZ" | "FOCUS",
        serie: c?.nfeSerie ?? 1,
        proximoNumero: c?.nfeProximoNumero ?? 1,
        informacoes: c?.nfeInformacoes ?? null,
        temCertificado: !!(await certificadoParaEmissao(e.id).catch(() => null)),
        focusAtivada: !!c?.focusTokenProducao,
        emitidas: contagens.find((x) => x.empresaId === e.id)?._count ?? 0,
        ultimaInutilizacao: inut ? { serie: inut.serie, inicio: inut.numeroInicial, fim: inut.numeroFinal, ok: inut.ok, em: inut.createdAt.toISOString() } : null,
      };
    }),
  );
}
