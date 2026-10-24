// Compras: NF-e emitidas contra o CNPJ (fornecedor → empresa), com o que falta fazer em cada uma
// (lançar no contas a pagar, dar entrada no estoque, manifestar para receber o XML). Só servidor.
import "server-only";
import { prisma, Prisma } from "@/lib/db";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { num } from "@/lib/serial";
import { periodoDe, type Periodo } from "@/modules/contador/consultas";

export type SituacaoCompras = "todas" | "estoque" | "pagar" | "xml";
export type FiltrosCompras = { competencia?: string; situacao: SituacaoCompras; q: string; estab: string };

type Busca = Record<string, string | string[] | undefined>;
const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function lerFiltrosCompras(sp: Busca): FiltrosCompras {
  const s = primeiro(sp.situacao);
  return {
    competencia: primeiro(sp.competencia) || undefined,
    situacao: s === "estoque" || s === "pagar" || s === "xml" ? s : "todas",
    q: primeiro(sp.q).trim().slice(0, 100),
    estab: primeiro(sp.estab),
  };
}

export type LinhaCompra = {
  id: string;
  emitidoEm: string | null;
  fornecedor: string;
  documento: string | null;
  numero: string | null;
  serie: string | null;
  valor: number;
  situacao: "AUTORIZADO" | "CANCELADO" | "DENEGADO";
  completo: boolean;
  manifestacao: string | null;
  contasAPagar: boolean;
  entradaEstoque: { numero: number } | null;
  estabelecimento: string;
};

/** Notas de compra da competência, com os totais do que está pendente. */
export async function carregarCompras(f: FiltrosCompras): Promise<{ periodo: Periodo; linhas: LinhaCompra[]; totais: { notas: number; valor: number; semEstoque: number; semPagar: number; aguardandoXml: number }; estabelecimentos: { id: string; nome: string }[] }> {
  const escopo = await escopoEmpresa();
  const periodo = periodoDe(f.competencia);
  const estabelecimentos = [escopo.ativa, ...escopo.filiais].map((e) => ({ id: e.id, nome: e.nome }));
  const ids = f.estab && escopo.ids.includes(f.estab) ? [f.estab] : escopo.ids;
  const where: Prisma.DocumentoRecebidoWhereInput[] = [{ empresaId: { in: ids }, tipo: "NFE", direcao: "ENTRADA", emitidoEm: { gte: periodo.de, lt: periodo.ate } }];
  if (f.q) {
    const dig = f.q.replace(/\D/g, "");
    where.push({
      OR: [
        { emitenteNome: { contains: f.q, mode: "insensitive" } },
        ...(dig.length >= 3 ? [{ emitenteDocumento: { contains: dig } }, { chave: { contains: dig } }, { numero: dig.replace(/^0+/, "") || dig }] : []),
      ],
    });
  }
  const docs = await prisma.documentoRecebido.findMany({
    where: { AND: where },
    orderBy: [{ emitidoEm: "desc" }, { createdAt: "desc" }],
    take: 500,
    select: {
      id: true,
      emitidoEm: true,
      emitenteNome: true,
      emitenteDocumento: true,
      numero: true,
      serie: true,
      valor: true,
      situacao: true,
      completo: true,
      manifestacao: true,
      lancadoEm: true,
      empresaId: true,
      lancamentoEstoque: { select: { numero: true } },
    },
  });
  const nomes = new Map(estabelecimentos.map((e) => [e.id, e.nome]));
  const todas: LinhaCompra[] = docs.map((d) => ({
    id: d.id,
    emitidoEm: d.emitidoEm ? d.emitidoEm.toISOString() : null,
    fornecedor: d.emitenteNome ?? "Fornecedor",
    documento: d.emitenteDocumento,
    numero: d.numero,
    serie: d.serie,
    valor: num(d.valor ?? 0),
    situacao: d.situacao,
    completo: d.completo,
    manifestacao: d.manifestacao,
    contasAPagar: !!d.lancadoEm,
    entradaEstoque: d.lancamentoEstoque ? { numero: d.lancamentoEstoque.numero } : null,
    estabelecimento: nomes.get(d.empresaId) ?? "",
  }));
  // recusadas (desconhecimento / não realizada) não são compra a lançar
  const valida = (l: LinhaCompra) => l.situacao === "AUTORIZADO" && l.manifestacao !== "DESCONHECIMENTO" && l.manifestacao !== "NAO_REALIZADA";
  const pendeEstoque = (l: LinhaCompra) => valida(l) && l.completo && !l.entradaEstoque;
  const pendePagar = (l: LinhaCompra) => valida(l) && !l.contasAPagar && l.valor > 0;
  const pendeXml = (l: LinhaCompra) => valida(l) && !l.completo;
  const validas = todas.filter(valida);
  const totais = {
    notas: validas.length,
    valor: Math.round(validas.reduce((a, l) => a + l.valor, 0) * 100) / 100,
    semEstoque: todas.filter(pendeEstoque).length,
    semPagar: todas.filter(pendePagar).length,
    aguardandoXml: todas.filter(pendeXml).length,
  };
  const filtro = f.situacao === "estoque" ? pendeEstoque : f.situacao === "pagar" ? pendePagar : f.situacao === "xml" ? pendeXml : () => true;
  return { periodo, linhas: todas.filter(filtro), totais, estabelecimentos };
}
