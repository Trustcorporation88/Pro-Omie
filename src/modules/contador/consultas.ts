// Fechamento mensal para o contador: resumo da competência, XML em ZIP e relatórios CSV. Só servidor.
import "server-only";
import { zipSync, strToU8 } from "fflate";
import { prisma, Prisma } from "@/lib/db";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { num } from "@/lib/serial";

export type Periodo = { ano: number; mes: number; de: Date; ate: Date; rotulo: string; competencia: string };

/** Período de uma competência (mês) em Brasília. */
export function periodoDe(competencia: string | undefined): Periodo {
  const hoje = new Date(Date.now() - 3 * 3_600_000);
  const m = /^(\d{4})-(\d{2})$/.exec(competencia ?? "");
  const ano = m ? Number(m[1]) : hoje.getUTCFullYear();
  const mes = m ? Math.min(12, Math.max(1, Number(m[2]))) : hoje.getUTCMonth() + 1;
  const de = new Date(Date.UTC(ano, mes - 1, 1, 3));
  const ate = new Date(Date.UTC(ano, mes, 1, 3));
  const rotulo = new Date(Date.UTC(ano, mes - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return { ano, mes, de, ate, rotulo: rotulo.charAt(0).toUpperCase() + rotulo.slice(1), competencia: `${ano}-${String(mes).padStart(2, "0")}` };
}

const fmtData = (d: Date | null | undefined) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const fmtNum = (v: Prisma.Decimal | number) => num(v).toFixed(2).replace(".", ",");
const csvLinha = (campos: (string | number | null | undefined)[]) => campos.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";");
const csv = (cabecalho: string[], linhas: (string | number | null | undefined)[][]) => "\uFEFF" + [csvLinha(cabecalho), ...linhas.map(csvLinha)].join("\r\n") + "\r\n";

async function escopoDoContador() {
  const escopo = await escopoEmpresa();
  const empresas = await prisma.empresa.findMany({ where: { id: { in: escopo.ids } }, select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true } });
  return { ids: escopo.ids, ativa: escopo.ativa, empresas };
}

/** Resumo da competência: emitidas, recebidas, recebimentos e pagamentos. */
export async function resumoFechamento(p: Periodo) {
  const { ids, empresas } = await escopoDoContador();
  const [nfe, nfse, recebidas, baixas, titulosAbertos] = await Promise.all([
    prisma.notaFiscal.groupBy({ by: ["status"], where: { empresaId: { in: ids }, emitidaEm: { gte: p.de, lt: p.ate } }, _count: { _all: true }, _sum: { valor: true } }),
    prisma.notaServico.groupBy({ by: ["status"], where: { empresaId: { in: ids }, emitidaEm: { gte: p.de, lt: p.ate } }, _count: { _all: true }, _sum: { valor: true } }),
    prisma.documentoRecebido.groupBy({ by: ["tipo"], where: { empresaId: { in: ids }, emitidoEm: { gte: p.de, lt: p.ate }, situacao: "AUTORIZADO" }, _count: { _all: true }, _sum: { valor: true } }),
    prisma.baixa.findMany({ where: { estornada: false, data: { gte: p.de, lt: p.ate }, titulo: { empresaId: { in: ids } } }, select: { valorTotal: true, titulo: { select: { tipo: true } } } }),
    prisma.titulo.groupBy({ by: ["tipo"], where: { empresaId: { in: ids }, status: { in: ["ABERTO", "PARCIAL"] }, vencimento: { lt: p.ate } }, _count: { _all: true }, _sum: { valor: true, valorPago: true } }),
  ]);
  const dec = (v: Prisma.Decimal | null | undefined) => (v ? num(v) : 0);
  const soma = (lista: { status: string; _count: { _all: number }; _sum: { valor: Prisma.Decimal | null } }[], status: string[]) => ({
    quantidade: lista.filter((x) => status.includes(x.status)).reduce((a, x) => a + x._count._all, 0),
    valor: lista.filter((x) => status.includes(x.status)).reduce((a, x) => a + dec(x._sum.valor), 0),
  });
  const rec = (tipo: string) => {
    const r = recebidas.find((x) => x.tipo === tipo);
    return { quantidade: r?._count._all ?? 0, valor: dec(r?._sum.valor) };
  };
  const aberto = (tipo: string) => {
    const t = titulosAbertos.find((x) => x.tipo === tipo);
    return { quantidade: t?._count._all ?? 0, valor: dec(t?._sum.valor) - dec(t?._sum.valorPago) };
  };
  return {
    empresas,
    nfe: { autorizadas: soma(nfe, ["AUTORIZADA"]), canceladas: soma(nfe, ["CANCELADA"]) },
    nfse: { geradas: soma(nfse, ["AUTORIZADA"]), canceladas: soma(nfse, ["CANCELADA"]) },
    recebidas: { nfe: rec("NFE"), cte: rec("CTE"), nfse: rec("NFSE") },
    recebimentos: baixas.filter((b) => b.titulo.tipo === "RECEBER").reduce((a, b) => a + num(b.valorTotal), 0),
    pagamentos: baixas.filter((b) => b.titulo.tipo === "PAGAR").reduce((a, b) => a + num(b.valorTotal), 0),
    emAberto: { receber: aberto("RECEBER"), pagar: aberto("PAGAR") },
  };
}

const nomeSeguro = (s: string) => s.replace(/[^\w.-]+/g, "_").slice(0, 80);

/** ZIP com os XML da competência: emitidas (NF-e com eventos, NFS-e com cancelamentos) e recebidas (NF-e, CT-e, NFS-e). */
export async function zipXmlFechamento(p: Periodo): Promise<{ zip: Uint8Array; arquivos: number }> {
  const { ids, empresas } = await escopoDoContador();
  const nomeEmpresa = (id: string) => {
    const e = empresas.find((x) => x.id === id);
    return nomeSeguro(e ? `${e.cnpj}-${e.nomeFantasia || e.razaoSocial}` : id);
  };
  const [nfes, nfses, recebidas] = await Promise.all([
    prisma.notaFiscal.findMany({ where: { empresaId: { in: ids }, emitidaEm: { gte: p.de, lt: p.ate }, status: { in: ["AUTORIZADA", "CANCELADA", "DENEGADA"] }, xmlAutorizado: { not: null } }, select: { empresaId: true, numero: true, serie: true, chave: true, status: true, xmlAutorizado: true, eventos: { where: { ok: true, xml: { not: null } }, select: { tipoEvento: true, sequencia: true, xml: true } } } }),
    prisma.notaServico.findMany({ where: { empresaId: { in: ids }, emitidaEm: { gte: p.de, lt: p.ate }, status: { in: ["AUTORIZADA", "CANCELADA"] }, xmlAutorizado: { not: null } }, select: { empresaId: true, numeroNfse: true, numero: true, chave: true, status: true, xmlAutorizado: true, cancelamentoXml: true } }),
    prisma.documentoRecebido.findMany({ where: { empresaId: { in: ids }, emitidoEm: { gte: p.de, lt: p.ate }, completo: true }, select: { empresaId: true, tipo: true, chave: true, xml: true, situacao: true } }),
  ]);
  const arquivos: Record<string, Uint8Array> = {};
  const indice: (string | number | null)[][] = [];
  for (const n of nfes) {
    const pasta = `${nomeEmpresa(n.empresaId)}/emitidas/NF-e`;
    const base = `${pasta}/${n.chave ?? `${n.serie}-${n.numero}`}`;
    arquivos[`${base}-procNFe.xml`] = strToU8(n.xmlAutorizado!);
    indice.push(["NF-e emitida", n.numero, n.chave, n.status, `${base}-procNFe.xml`]);
    for (const ev of n.eventos) arquivos[`${base}-evento-${ev.tipoEvento}-${ev.sequencia}.xml`] = strToU8(ev.xml!);
  }
  for (const n of nfses) {
    const pasta = `${nomeEmpresa(n.empresaId)}/emitidas/NFS-e`;
    const base = `${pasta}/${n.chave ?? `DPS-${n.numero}`}`;
    arquivos[`${base}.xml`] = strToU8(n.xmlAutorizado!);
    indice.push(["NFS-e emitida", n.numeroNfse ?? n.numero, n.chave, n.status, `${base}.xml`]);
    if (n.cancelamentoXml) arquivos[`${base}-cancelamento.xml`] = strToU8(n.cancelamentoXml);
  }
  for (const d of recebidas) {
    const pasta = `${nomeEmpresa(d.empresaId)}/recebidas/${d.tipo === "NFE" ? "NF-e" : d.tipo === "CTE" ? "CT-e" : "NFS-e"}`;
    const nome = `${pasta}/${d.chave}.xml`;
    arquivos[nome] = strToU8(d.xml);
    indice.push([`${d.tipo} recebida`, null, d.chave, d.situacao, nome]);
  }
  arquivos[`indice-${p.competencia}.csv`] = strToU8(csv(["Documento", "Número", "Chave", "Situação", "Arquivo"], indice));
  return { zip: zipSync(arquivos, { level: 6 }), arquivos: Object.keys(arquivos).length - 1 };
}

export type TipoCsv = "nfe" | "nfse" | "recebidas" | "recebimentos" | "pagamentos";

export async function csvFechamento(tipo: TipoCsv, p: Periodo): Promise<string> {
  const { ids, empresas } = await escopoDoContador();
  const nomeEmpresa = (id: string) => {
    const e = empresas.find((x) => x.id === id);
    return e ? e.nomeFantasia || e.razaoSocial : id;
  };
  if (tipo === "nfe") {
    const lista = await prisma.notaFiscal.findMany({ where: { empresaId: { in: ids }, emitidaEm: { gte: p.de, lt: p.ate } }, orderBy: [{ serie: "asc" }, { numero: "asc" }] });
    return csv(
      ["Empresa", "Série", "Número", "Emissão", "Destinatário", "CNPJ/CPF", "Natureza", "Valor", "Situação", "Chave", "Protocolo", "Ambiente"],
      lista.map((n) => [nomeEmpresa(n.empresaId), n.serie, n.numero, fmtData(n.emitidaEm), n.destinatarioNome, n.destinatarioDocumento, n.naturezaOperacao, fmtNum(n.valor), n.status, n.chave, n.protocolo, n.ambiente === 1 ? "Produção" : "Homologação"]),
    );
  }
  if (tipo === "nfse") {
    const lista = await prisma.notaServico.findMany({ where: { empresaId: { in: ids }, emitidaEm: { gte: p.de, lt: p.ate } }, orderBy: [{ serie: "asc" }, { numero: "asc" }] });
    return csv(
      ["Empresa", "Série DPS", "Nº DPS", "Nº NFS-e", "Emissão", "Competência", "Tomador", "CNPJ/CPF", "Cód. tributação", "Descrição", "Valor", "Situação", "Chave", "Ambiente"],
      lista.map((n) => [nomeEmpresa(n.empresaId), n.serie, n.numero, n.numeroNfse, fmtData(n.emitidaEm), fmtData(n.competencia), n.tomadorNome, n.tomadorDocumento, n.codigoTributacaoNacional, n.descricao.replace(/\n/g, " | "), fmtNum(n.valor), n.status, n.chave, n.ambiente === 1 ? "Produção" : "Produção restrita"]),
    );
  }
  if (tipo === "recebidas") {
    const lista = await prisma.documentoRecebido.findMany({ where: { empresaId: { in: ids }, emitidoEm: { gte: p.de, lt: p.ate } }, orderBy: [{ tipo: "asc" }, { emitidoEm: "asc" }] });
    return csv(
      ["Empresa", "Tipo", "Número", "Série", "Emissão", "Emitente", "CNPJ emitente", "Valor", "Situação", "Manifestação", "XML completo", "Chave"],
      lista.map((d) => [nomeEmpresa(d.empresaId), d.tipo, d.numero, d.serie, fmtData(d.emitidoEm), d.emitenteNome, d.emitenteDocumento, d.valor === null ? "" : fmtNum(d.valor), d.situacao, d.manifestacao ?? "", d.completo ? "sim" : "não", d.chave]),
    );
  }
  const lista = await prisma.baixa.findMany({
    where: { estornada: false, data: { gte: p.de, lt: p.ate }, titulo: { empresaId: { in: ids }, tipo: tipo === "recebimentos" ? "RECEBER" : "PAGAR" } },
    orderBy: { data: "asc" },
    include: { titulo: { select: { numero: true, descricao: true, documento: true, empresaId: true, vencimento: true, pessoa: { select: { nome: true, documento: true } }, categoria: { select: { codigo: true, nome: true } } } }, contaBancaria: { select: { nome: true } }, formaPagamento: { select: { nome: true } } },
  });
  return csv(
    ["Empresa", "Data", "Título", "Descrição", "Documento", tipo === "recebimentos" ? "Cliente" : "Fornecedor", "CNPJ/CPF", "Categoria", "Vencimento", "Principal", "Juros", "Multa", "Desconto", "Total", "Conta", "Forma"],
    lista.map((b) => [nomeEmpresa(b.titulo.empresaId), fmtData(b.data), b.titulo.numero, b.titulo.descricao, b.titulo.documento, b.titulo.pessoa?.nome, b.titulo.pessoa?.documento, b.titulo.categoria ? `${b.titulo.categoria.codigo} ${b.titulo.categoria.nome}` : "", fmtData(b.titulo.vencimento), fmtNum(b.valor), fmtNum(b.juros), fmtNum(b.multa), fmtNum(b.desconto), fmtNum(b.valorTotal), b.contaBancaria.nome, b.formaPagamento?.nome]),
  );
}
