// Consultas da NFS-e nacional (telas). Só servidor.
import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { ehISOValido, isoParaDate } from "@/lib/datas";
import { num } from "@/lib/serial";
import { validadeCertificadoEmissao } from "@/modules/configuracoes/certificado";
import { prepararNfse } from "./dados";
import type { StatusNota } from "./tipos";

type Parametros = Record<string, string | string[] | undefined>;
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const POR_PAGINA_NFSE = 30;

export type LinhaNotaServico = {
  id: string;
  numero: number;
  serie: number;
  numeroNfse: string | null;
  status: StatusNota;
  ambiente: number;
  motor: string;
  emitidaEm: string;
  competencia: string;
  tomadorNome: string;
  tomadorDocumento: string | null;
  valor: number;
  codigo: string | null;
  mensagem: string | null;
  codigoTributacaoNacional: string;
  descricao: string;
  pedido: { id: string; numero: number } | null;
};

const linha = (n: Prisma.NotaServicoGetPayload<{ include: { pedido: { select: { id: true; numero: true } } } }>): LinhaNotaServico => ({
  id: n.id,
  numero: n.numero,
  serie: n.serie,
  numeroNfse: n.numeroNfse,
  status: n.status,
  ambiente: n.ambiente,
  motor: n.motor,
  emitidaEm: n.emitidaEm.toISOString(),
  competencia: n.competencia.toISOString(),
  tomadorNome: n.tomadorNome,
  tomadorDocumento: n.tomadorDocumento,
  valor: num(n.valor),
  codigo: n.codigo,
  mensagem: n.mensagem,
  codigoTributacaoNacional: n.codigoTributacaoNacional,
  descricao: n.descricao,
  pedido: n.pedido,
});

/** Painel da NFS-e no pedido: notas por grupo de serviço e o que falta para emitir. */
export async function painelNfsePedido(pedidoId: string) {
  const escopo = await escopoEmpresa();
  const prep = await prepararNfse(pedidoId, escopo.ids);
  if (!prep) return null;
  const notas = await prisma.notaServico.findMany({ where: { pedidoId, empresaId: { in: escopo.ids } }, orderBy: { createdAt: "desc" }, include: { pedido: { select: { id: true, numero: true } } } });
  const processando = notas.some((n) => n.status === "PROCESSANDO");
  const pendentes = prep.grupos.filter((g) => !notas.some((n) => n.codigoTributacaoNacional === g.codigoTributacaoNacional && n.status === "AUTORIZADA"));
  return {
    pedidoFaturado: prep.pedido.status === "FATURADO",
    temServicos: prep.grupos.length > 0,
    temProdutos: prep.temProdutos,
    notas: notas.map(linha),
    problemas: prep.problemas,
    podeEmitir: !processando && pendentes.length > 0 && prep.problemas.length === 0,
    processando,
    ambiente: prep.ambiente,
    motor: prep.motor,
    proximoNumero: prep.config?.nfseProximoNumero ?? 1,
    serie: prep.config?.nfseSerie ?? 1,
    grupos: prep.grupos.map((g) => ({
      codigoTributacaoNacional: g.codigoTributacaoNacional,
      pendente: pendentes.includes(g),
      reenvio: notas.some((n) => n.codigoTributacaoNacional === g.codigoTributacaoNacional && n.status === "REJEITADA"),
      itens: g.itens.map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, unidade: i.unidade, total: i.total })),
      valor: g.dados.valores.vServ,
      descricao: g.dados.servico.descricao,
      aliquotaSimples: g.dados.valores.pTotTribSN,
      informacoes: g.dados.informacoesComplementares ?? "",
      tomador: g.dados.tomador ? { nome: g.dados.tomador.nome, documento: g.dados.tomador.documento, comEndereco: !!g.dados.tomador.endereco } : null,
      municipio: g.dados.cLocEmi,
    })),
  };
}
export type PainelNfse = NonNullable<Awaited<ReturnType<typeof painelNfsePedido>>>;

export type FiltrosNfse = { status: StatusNota | ""; de: string; ate: string; busca: string; pagina: number };

export function lerFiltrosNfse(sp: Parametros): FiltrosNfse {
  const st = um(sp.status).toUpperCase();
  return {
    status: (["PROCESSANDO", "AUTORIZADA", "REJEITADA", "CANCELADA"].includes(st) ? st : "") as StatusNota | "",
    de: ehISOValido(um(sp.de)) ? um(sp.de) : "",
    ate: ehISOValido(um(sp.ate)) ? um(sp.ate) : "",
    busca: um(sp.q).trim().slice(0, 80),
    pagina: Math.max(1, Number(um(sp.pagina)) || 1),
  };
}

export async function listarNotasServico(f: FiltrosNfse) {
  const escopo = await escopoEmpresa();
  const where: Prisma.NotaServicoWhereInput[] = [{ empresaId: { in: escopo.ids } }];
  if (f.de) where.push({ emitidaEm: { gte: isoParaDate(f.de) } });
  if (f.ate) where.push({ emitidaEm: { lt: new Date(isoParaDate(f.ate).getTime() + 86_400_000) } });
  if (f.busca) {
    const dig = f.busca.replace(/\D/g, "");
    where.push({
      OR: [
        { tomadorNome: { contains: f.busca, mode: "insensitive" } },
        { descricao: { contains: f.busca, mode: "insensitive" } },
        ...(dig ? [{ tomadorDocumento: { contains: dig } }, { chave: { contains: dig } }, { numeroNfse: dig }, ...(dig.length <= 9 ? [{ numero: Number(dig) }] : [])] : []),
      ],
    });
  }
  const comuns = { AND: where };
  const [total, linhas, porStatus] = await Promise.all([
    prisma.notaServico.count({ where: { AND: [comuns, f.status ? { status: f.status } : {}] } }),
    prisma.notaServico.findMany({ where: { AND: [comuns, f.status ? { status: f.status } : {}] }, orderBy: [{ emitidaEm: "desc" }], skip: (f.pagina - 1) * POR_PAGINA_NFSE, take: POR_PAGINA_NFSE, include: { pedido: { select: { id: true, numero: true } } } }),
    prisma.notaServico.groupBy({ by: ["status"], where: comuns, _count: { _all: true } }),
  ]);
  const contadores: Record<string, number> = { todas: 0 };
  for (const p of porStatus) {
    contadores[p.status] = p._count._all;
    contadores.todas += p._count._all;
  }
  return { total, linhas: linhas.map(linha), contadores };
}

export async function obterNotaServico(id: string) {
  const escopo = await escopoEmpresa();
  const n = await prisma.notaServico.findFirst({
    where: { id, empresaId: { in: escopo.ids } },
    include: { pedido: { select: { id: true, numero: true } }, empresa: { select: { razaoSocial: true, nomeFantasia: true, cnpj: true, cidade: true } } },
  });
  if (!n) return null;
  return {
    ...linha(n),
    idDps: n.idDps,
    chave: n.chave,
    autorizadaEm: n.autorizadaEm?.toISOString() ?? null,
    canceladaEm: n.canceladaEm?.toISOString() ?? null,
    cancelamentoMotivo: n.cancelamentoMotivo,
    cancelamentoCodigo: n.cancelamentoCodigo,
    emitente: { nome: n.empresa.nomeFantasia || n.empresa.razaoSocial, cnpj: n.empresa.cnpj, cidade: n.empresa.cidade },
    temDanfse: !!n.xmlAutorizado,
    temXml: !!(n.xmlAutorizado ?? n.xml),
    temEvento: !!n.cancelamentoXml,
  };
}

export type EstadoEmissaoNfse = {
  empresaId: string;
  nome: string;
  cnpj: string;
  cidade: string | null;
  codigoMunicipio: string | null;
  ativa: boolean;
  ambiente: 1 | 2;
  motor: "SEFAZ" | "FOCUS";
  serie: number;
  proximoNumero: number;
  aliquotaSimples: number;
  enviarIM: boolean;
  informacoes: string | null;
  municipioAderente: boolean | null;
  municipioConferidoEm: string | null;
  temCertificado: boolean;
  focusAtivada: boolean;
  emitidas: number;
};

/** Estado da emissão de NFS-e por estabelecimento (bloco em Configurações › Empresas e filiais). */
export async function estadoEmissaoNfse(estabs: { id: string; nome: string; cnpj: string }[]): Promise<EstadoEmissaoNfse[]> {
  const ids = estabs.map((e) => e.id);
  if (!ids.length) return [];
  const [configs, contagens, empresas] = await Promise.all([
    prisma.configuracaoFiscal.findMany({ where: { empresaId: { in: ids } } }),
    prisma.notaServico.groupBy({ by: ["empresaId"], where: { empresaId: { in: ids }, status: { in: ["AUTORIZADA", "CANCELADA"] } }, _count: true }),
    prisma.empresa.findMany({ where: { id: { in: ids } }, select: { id: true, cidade: true, codigoMunicipio: true } }),
  ]);
  return Promise.all(
    estabs.map(async (e) => {
      const c = configs.find((x) => x.empresaId === e.id);
      const emp = empresas.find((x) => x.id === e.id);
      return {
        empresaId: e.id,
        nome: e.nome,
        cnpj: e.cnpj,
        cidade: emp?.cidade ?? null,
        codigoMunicipio: emp?.codigoMunicipio ?? null,
        ativa: c?.nfseAtiva ?? false,
        ambiente: (c?.nfseAmbiente === 1 ? 1 : 2) as 1 | 2,
        motor: (c?.nfseMotor ?? "SEFAZ") as "SEFAZ" | "FOCUS",
        serie: c?.nfseSerie ?? 1,
        proximoNumero: c?.nfseProximoNumero ?? 1,
        aliquotaSimples: num(c?.nfseAliquotaSimples ?? 6),
        enviarIM: c?.nfseEnviarIM ?? false,
        informacoes: c?.nfseInformacoes ?? null,
        municipioAderente: c?.nfseMunicipioAderente ?? null,
        municipioConferidoEm: c?.nfseMunicipioConferidoEm?.toISOString() ?? null,
        temCertificado: !!(await validadeCertificadoEmissao(e.id).catch(() => null)),
        focusAtivada: !!c?.focusTokenProducao,
        emitidas: contagens.find((x) => x.empresaId === e.id)?._count ?? 0,
      };
    }),
  );
}
