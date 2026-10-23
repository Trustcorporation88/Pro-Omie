// Consultas da cobrança (telas). Só servidor.
import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { num } from "@/lib/serial";
export { ROTULO_STATUS_COBRANCA, ROTULO_TIPO_COBRANCA, TOM_STATUS_COBRANCA } from "./tipos";

export type CobrancaResumo = {
  id: string;
  tipo: string;
  status: string;
  valor: number;
  valorLiquido: number | null;
  vencimento: string;
  urlFatura: string | null;
  urlBoleto: string | null;
  linhaDigitavel: string | null;
  pixPayload: string | null;
  pixExpiraEm: string | null;
  pagoEm: string | null;
  baixaId: string | null;
  asaasPaymentId: string;
  erro: string | null;
  createdAt: string;
};

const resumo = (c: { id: string; tipo: string; status: string; valor: Prisma.Decimal; valorLiquido: Prisma.Decimal | null; vencimento: Date; urlFatura: string | null; urlBoleto: string | null; linhaDigitavel: string | null; pixPayload: string | null; pixExpiraEm: Date | null; pagoEm: Date | null; baixaId: string | null; asaasPaymentId: string; erro: string | null; createdAt: Date }): CobrancaResumo => ({
  id: c.id,
  tipo: c.tipo,
  status: c.status,
  valor: num(c.valor),
  valorLiquido: c.valorLiquido === null ? null : num(c.valorLiquido),
  vencimento: c.vencimento.toISOString(),
  urlFatura: c.urlFatura,
  urlBoleto: c.urlBoleto,
  linhaDigitavel: c.linhaDigitavel,
  pixPayload: c.pixPayload,
  pixExpiraEm: c.pixExpiraEm?.toISOString() ?? null,
  pagoEm: c.pagoEm?.toISOString() ?? null,
  baixaId: c.baixaId,
  asaasPaymentId: c.asaasPaymentId,
  erro: c.erro,
  createdAt: c.createdAt.toISOString(),
});

/** Bloco de cobrança no título: cobranças existentes e se dá para gerar. */
export async function painelCobrancaTitulo(tituloId: string) {
  const escopo = await escopoEmpresa();
  const t = await prisma.titulo.findFirst({ where: { id: tituloId, empresaId: { in: escopo.ids } }, select: { id: true, tipo: true, status: true, empresaId: true, pessoa: { select: { email: true, documento: true } }, empresa: { select: { matrizId: true } } } });
  if (!t || t.tipo !== "RECEBER") return null;
  const configs = await prisma.configuracaoCobranca.findMany({ where: { empresaId: { in: [t.empresaId, ...(t.empresa.matrizId ? [t.empresa.matrizId] : [])] } } });
  const config = configs.find((c) => c.empresaId === t.empresaId) ?? configs.find((c) => c.empresaId === t.empresa.matrizId) ?? null;
  const cobrancas = await prisma.cobranca.findMany({ where: { tituloId }, orderBy: { createdAt: "desc" } });
  const aberta = cobrancas.some((c) => ["PENDING", "OVERDUE", "CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(c.status));
  return {
    configurada: !!config?.chaveCifrada && config.ativa,
    ambiente: (config?.ambiente === 1 ? 1 : 2) as 1 | 2,
    formaPadrao: (config?.formaPadrao ?? "UNDEFINED") as "BOLETO" | "PIX" | "UNDEFINED",
    emailCliente: t.pessoa?.email ?? null,
    temDocumento: !!t.pessoa?.documento,
    podeGerar: (t.status === "ABERTO" || t.status === "PARCIAL") && !aberta,
    cobrancas: cobrancas.map(resumo),
  };
}
export type PainelCobranca = NonNullable<Awaited<ReturnType<typeof painelCobrancaTitulo>>>;

export async function listarCobrancas(status: string) {
  const escopo = await escopoEmpresa();
  const filtro = status === "abertas" ? { in: ["PENDING", "OVERDUE"] } : status === "pagas" ? { in: ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"] } : status === "outras" ? { notIn: ["PENDING", "OVERDUE", "RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"] } : undefined;
  const lista = await prisma.cobranca.findMany({
    where: { empresaId: { in: escopo.ids }, ...(filtro ? { status: filtro } : {}) },
    orderBy: [{ vencimento: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { titulo: { select: { id: true, numero: true, descricao: true, documento: true, pessoa: { select: { nome: true, nomeFantasia: true } } } } },
  });
  const contagem = await prisma.cobranca.groupBy({ by: ["status"], where: { empresaId: { in: escopo.ids } }, _count: { _all: true } });
  const soma = (ss: string[]) => contagem.filter((c) => ss.includes(c.status)).reduce((a, c) => a + c._count._all, 0);
  return {
    linhas: lista.map((c) => ({ ...resumo(c), titulo: { id: c.titulo.id, numero: c.titulo.numero, descricao: c.titulo.descricao, documento: c.titulo.documento, cliente: c.titulo.pessoa?.nomeFantasia || c.titulo.pessoa?.nome || "—" } })),
    contadores: { todas: contagem.reduce((a, c) => a + c._count._all, 0), abertas: soma(["PENDING", "OVERDUE"]), pagas: soma(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"]) },
  };
}

export type EstadoCobranca = {
  empresaId: string;
  nome: string;
  cnpj: string;
  ativa: boolean;
  ambiente: 1 | 2;
  temChave: boolean;
  chaveFinal: string | null;
  contaBancariaId: string | null;
  formaPadrao: "BOLETO" | "PIX" | "UNDEFINED";
  multaPercentual: number;
  jurosMensal: number;
  notificarPeloAsaas: boolean;
  enviarEmailAutomatico: boolean;
  webhookRegistradoEm: string | null;
  testadaEm: string | null;
  abertas: number;
  recebidas: number;
};

export async function estadoCobranca(estabs: { id: string; nome: string; cnpj: string }[]): Promise<EstadoCobranca[]> {
  const ids = estabs.map((e) => e.id);
  if (!ids.length) return [];
  const [configs, contagens] = await Promise.all([
    prisma.configuracaoCobranca.findMany({ where: { empresaId: { in: ids } } }),
    prisma.cobranca.groupBy({ by: ["empresaId", "status"], where: { empresaId: { in: ids } }, _count: { _all: true } }),
  ]);
  return estabs.map((e) => {
    const c = configs.find((x) => x.empresaId === e.id);
    const conta = (ss: string[]) => contagens.filter((x) => x.empresaId === e.id && ss.includes(x.status)).reduce((a, x) => a + x._count._all, 0);
    return {
      empresaId: e.id,
      nome: e.nome,
      cnpj: e.cnpj,
      ativa: c?.ativa ?? false,
      ambiente: (c?.ambiente === 1 ? 1 : 2) as 1 | 2,
      temChave: !!c?.chaveCifrada,
      chaveFinal: c?.chaveFinal ?? null,
      contaBancariaId: c?.contaBancariaId ?? null,
      formaPadrao: (c?.formaPadrao ?? "UNDEFINED") as "BOLETO" | "PIX" | "UNDEFINED",
      multaPercentual: num(c?.multaPercentual ?? 2),
      jurosMensal: num(c?.jurosMensal ?? 1),
      notificarPeloAsaas: c?.notificarPeloAsaas ?? false,
      enviarEmailAutomatico: c?.enviarEmailAutomatico ?? true,
      webhookRegistradoEm: c?.webhookRegistradoEm?.toISOString() ?? null,
      testadaEm: c?.testadaEm?.toISOString() ?? null,
      abertas: conta(["PENDING", "OVERDUE"]),
      recebidas: conta(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]),
    };
  });
}
