import "server-only";
import { prisma, type Prisma } from "@/lib/db";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { FUSO, addDias, diffDias, hojeISO, isoParaDate } from "@/lib/datas";
import { fmtDocumento, fmtTelefone } from "@/lib/format";
import { iso, isoReq, num } from "@/lib/serial";
import {
  ETAPAS,
  ETAPAS_ABERTAS,
  MOTIVOS_PERDA,
  PROBABILIDADE,
  type AtividadeItem,
  type CartaoOportunidade,
  type Etapa,
  type Funil,
  type MotivoPerda,
  type OpcoesCrm,
  type OportunidadeDetalhe,
  type TipoAtividadeT,
  type TotaisEtapa,
} from "./tipos";

type Busca = Record<string, string | string[] | undefined>;
const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const nomePessoa = (p: { nome: string; nomeFantasia: string | null }) => p.nomeFantasia || p.nome;
/** Dia (AAAA-MM-DD) de um instante no fuso de São Paulo. */
const diaSP = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: FUSO });
/** Início do dia em São Paulo como instante (o Brasil não tem horário de verão desde 2019). */
const inicioDiaSP = (isoDia: string) => new Date(`${isoDia}T00:00:00-03:00`);

export type FiltrosCrm = { de: string; q: string };

/** `de`: "todos" (padrão do funil), "eu" (padrão das atividades) ou o id de um responsável. */
export function lerFiltrosCrm(sp: Busca, padraoDe: "todos" | "eu"): FiltrosCrm {
  return { de: primeiro(sp.de).trim() || padraoDe, q: primeiro(sp.q).trim().slice(0, 100) };
}

const responsavelDe = (de: string, usuarioId: string) => (de === "eu" ? usuarioId : de && de !== "todos" ? de : null);

const selecaoProxima = {
  where: { concluidaEm: null },
  orderBy: [{ data: "asc" as const }, { hora: { sort: "asc" as const, nulls: "last" as const } }],
  take: 1,
  select: { id: true, data: true, hora: true, tipo: true, assunto: true },
};

const somar = (cs: { valor: number; etapa: Etapa }[]): TotaisEtapa => ({
  quantidade: cs.length,
  valor: Math.round(cs.reduce((a, c) => a + c.valor, 0) * 100) / 100,
  ponderado: Math.round(cs.reduce((a, c) => a + (c.valor * PROBABILIDADE[c.etapa]) / 100, 0) * 100) / 100,
});

/** Funil da empresa ativa: abertas por etapa, fechadas nos últimos 30 dias e resultado dos últimos 90. */
export async function carregarFunil(f: FiltrosCrm, usuarioId: string): Promise<Funil> {
  const escopo = await escopoEmpresa();
  const hoje = hojeISO();
  const resp = responsavelDe(f.de, usuarioId);
  const base: Prisma.OportunidadeWhereInput = { empresaId: escopo.ativa.id, ...(resp ? { responsavelId: resp } : {}) };
  const busca: Prisma.OportunidadeWhereInput = f.q
    ? {
        OR: [
          { titulo: { contains: f.q, mode: "insensitive" } },
          { pessoa: { nome: { contains: f.q, mode: "insensitive" } } },
          { pessoa: { nomeFantasia: { contains: f.q, mode: "insensitive" } } },
        ],
      }
    : {};
  const desde30 = inicioDiaSP(addDias(hoje, -30));
  const desde90 = inicioDiaSP(addDias(hoje, -90));
  const incluir = { pessoa: { select: { nome: true, nomeFantasia: true } }, responsavel: { select: { nome: true } }, atividades: selecaoProxima };
  const [abertas, fechadas, resultado] = await Promise.all([
    prisma.oportunidade.findMany({
      where: { AND: [base, busca, { etapa: { in: ETAPAS_ABERTAS } }] },
      include: incluir,
      orderBy: [{ previsaoFechamento: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    prisma.oportunidade.findMany({
      where: { AND: [base, busca, { OR: [{ etapa: "GANHA", ganhaEm: { gte: desde30 } }, { etapa: "PERDIDA", perdidaEm: { gte: desde30 } }] }] },
      include: incluir,
      orderBy: { etapaDesde: "desc" },
    }),
    prisma.oportunidade.findMany({
      where: { AND: [base, { OR: [{ etapa: "GANHA", ganhaEm: { gte: desde90 } }, { etapa: "PERDIDA", perdidaEm: { gte: desde90 } }] }] },
      select: { etapa: true, valor: true, motivoPerda: true },
    }),
  ]);

  const paraCartao = (o: (typeof abertas)[number]): CartaoOportunidade => {
    const prox = o.atividades[0];
    const fechada = o.ganhaEm ?? o.perdidaEm;
    return {
      id: o.id,
      titulo: o.titulo,
      pessoaNome: nomePessoa(o.pessoa),
      valor: num(o.valor),
      etapa: o.etapa,
      diasNaEtapa: Math.max(0, diffDias(diaSP(o.etapaDesde), hoje)),
      previsaoFechamento: iso(o.previsaoFechamento),
      responsavelId: o.responsavelId,
      responsavelNome: o.responsavel?.nome ?? null,
      proxima: prox ? { id: prox.id, data: isoReq(prox.data), hora: prox.hora, tipo: prox.tipo as TipoAtividadeT, assunto: prox.assunto } : null,
      fechadaEm: fechada ? diaSP(fechada) : null,
      motivoPerda: o.motivoPerda ? (MOTIVOS_PERDA[o.motivoPerda as MotivoPerda] ?? o.motivoPerda) : null,
    };
  };
  const cartoes = [...abertas, ...fechadas].map(paraCartao);
  const colunas = Object.fromEntries(ETAPAS.map((e) => [e, cartoes.filter((c) => c.etapa === e)])) as Record<Etapa, CartaoOportunidade[]>;
  const totais = Object.fromEntries(ETAPAS.map((e) => [e, somar(colunas[e])])) as Record<Etapa, TotaisEtapa>;

  const ganhas = resultado.filter((r) => r.etapa === "GANHA");
  const perdidas = resultado.filter((r) => r.etapa === "PERDIDA");
  const valorGanho = Math.round(ganhas.reduce((a, r) => a + num(r.valor), 0) * 100) / 100;
  const contagem = new Map<string, number>();
  for (const p of perdidas) {
    const m = p.motivoPerda ? (MOTIVOS_PERDA[p.motivoPerda as MotivoPerda] ?? p.motivoPerda) : "Sem motivo";
    contagem.set(m, (contagem.get(m) ?? 0) + 1);
  }
  return {
    colunas,
    totais,
    abertas: somar(ETAPAS_ABERTAS.flatMap((e) => colunas[e])),
    resultado: {
      ganhas: ganhas.length,
      perdidas: perdidas.length,
      valorGanho,
      conversao: ganhas.length + perdidas.length ? Math.round((ganhas.length / (ganhas.length + perdidas.length)) * 1000) / 10 : null,
      ticketMedio: ganhas.length ? Math.round((valorGanho / ganhas.length) * 100) / 100 : null,
      motivos: [...contagem.entries()].map(([motivo, quantidade]) => ({ motivo, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
    },
  };
}

const incluirAtividade = {
  responsavel: { select: { nome: true } },
  oportunidade: { select: { id: true, titulo: true } },
  pessoa: { select: { id: true, nome: true, nomeFantasia: true } },
} as const;

type AtividadeDb = Prisma.AtividadeGetPayload<{ include: typeof incluirAtividade }>;

const paraAtividade = (a: AtividadeDb): AtividadeItem => ({
  id: a.id,
  tipo: a.tipo as TipoAtividadeT,
  assunto: a.assunto,
  descricao: a.descricao,
  data: isoReq(a.data),
  hora: a.hora,
  concluidaEm: a.concluidaEm ? a.concluidaEm.toISOString() : null,
  responsavelId: a.responsavelId,
  responsavelNome: a.responsavel?.nome ?? null,
  oportunidade: a.oportunidade,
  pessoa: a.pessoa ? { id: a.pessoa.id, nome: nomePessoa(a.pessoa) } : null,
});

/** Detalhe da oportunidade da empresa ativa (fora dela, como se não existisse). */
export async function carregarOportunidade(id: string): Promise<OportunidadeDetalhe | null> {
  const escopo = await escopoEmpresa();
  const o = await prisma.oportunidade.findFirst({
    where: { id, empresaId: escopo.ativa.id },
    include: {
      pessoa: { select: { nome: true, nomeFantasia: true, documento: true, telefone: true, email: true } },
      responsavel: { select: { nome: true } },
      atividades: { include: incluirAtividade, orderBy: [{ data: "asc" }, { hora: { sort: "asc", nulls: "last" } }] },
      propostas: { select: { id: true, numero: true, status: true, emissao: true, total: true }, orderBy: { numero: "desc" } },
    },
  });
  if (!o) return null;
  const historico = await prisma.auditoria.findMany({
    where: { entidade: "oportunidade", entidadeId: id },
    include: { usuario: { select: { nome: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const hoje = hojeISO();
  return {
    id: o.id,
    titulo: o.titulo,
    pessoaId: o.pessoaId,
    pessoaNome: nomePessoa(o.pessoa),
    pessoaDocumento: o.pessoa.documento ? fmtDocumento(o.pessoa.documento) : null,
    pessoaTelefone: o.pessoa.telefone ? fmtTelefone(o.pessoa.telefone) : null,
    pessoaEmail: o.pessoa.email,
    contato: o.contato,
    responsavelId: o.responsavelId,
    responsavelNome: o.responsavel?.nome ?? null,
    etapa: o.etapa,
    etapaDesde: o.etapaDesde.toISOString(),
    diasNaEtapa: Math.max(0, diffDias(diaSP(o.etapaDesde), hoje)),
    etapaAntesFechar: o.etapaAntesFechar,
    valor: num(o.valor),
    previsaoFechamento: iso(o.previsaoFechamento),
    origem: o.origem,
    motivoPerda: o.motivoPerda,
    detalhePerda: o.detalhePerda,
    observacoes: o.observacoes,
    ganhaEm: o.ganhaEm ? diaSP(o.ganhaEm) : null,
    perdidaEm: o.perdidaEm ? diaSP(o.perdidaEm) : null,
    criadaEm: diaSP(o.createdAt),
    atividades: o.atividades.map(paraAtividade),
    propostas: o.propostas.map((p) => ({ id: p.id, numero: p.numero, status: p.status, emissao: isoReq(p.emissao), total: num(p.total) })),
    historico: historico.map((h) => ({ id: h.id, acao: h.acao, resumo: h.resumo, usuarioNome: h.usuario?.nome ?? null, quando: h.createdAt.toISOString() })),
  };
}

export type AgendaAtividades = { atrasadas: AtividadeItem[]; hoje: AtividadeItem[]; proximas: AtividadeItem[]; depois: number; concluidasHoje: AtividadeItem[] };

/** Atividades pendentes (atrasadas, de hoje e dos próximos 7 dias) e as concluídas hoje. */
export async function carregarAgenda(f: FiltrosCrm, usuarioId: string): Promise<AgendaAtividades> {
  const escopo = await escopoEmpresa();
  const hoje = hojeISO();
  const resp = responsavelDe(f.de, usuarioId);
  const base: Prisma.AtividadeWhereInput = { empresaId: escopo.ativa.id, ...(resp ? { responsavelId: resp } : {}) };
  const limite = isoParaDate(addDias(hoje, 7));
  const ordem = [{ data: "asc" as const }, { hora: { sort: "asc" as const, nulls: "last" as const } }];
  const [pendentes, depois, concluidas] = await Promise.all([
    prisma.atividade.findMany({ where: { ...base, concluidaEm: null, data: { lte: limite } }, include: incluirAtividade, orderBy: ordem }),
    prisma.atividade.count({ where: { ...base, concluidaEm: null, data: { gt: limite } } }),
    prisma.atividade.findMany({ where: { ...base, concluidaEm: { gte: inicioDiaSP(hoje) } }, include: incluirAtividade, orderBy: { concluidaEm: "desc" } }),
  ]);
  const itens = pendentes.map(paraAtividade);
  return {
    atrasadas: itens.filter((a) => a.data < hoje),
    hoje: itens.filter((a) => a.data === hoje),
    proximas: itens.filter((a) => a.data > hoje),
    depois,
    concluidasHoje: concluidas.map(paraAtividade),
  };
}

/** Quantas atividades minhas estão atrasadas ou são para hoje (selo no menu). */
export async function contarPendenciasHoje(usuarioId: string): Promise<number> {
  const escopo = await escopoEmpresa();
  return prisma.atividade.count({
    where: { empresaId: escopo.ativa.id, responsavelId: usuarioId, concluidaEm: null, data: { lte: isoParaDate(hojeISO()) } },
  });
}

/** Responsáveis possíveis: usuários ativos com acesso à empresa ativa. */
export async function carregarOpcoesCrm(): Promise<OpcoesCrm> {
  const escopo = await escopoEmpresa();
  const matriz = escopo.ativa.id;
  const usuarios = await prisma.usuario.findMany({
    where: { ativo: true, OR: [{ todasEmpresas: true }, { empresas: { has: matriz } }] },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });
  return { responsaveis: usuarios.map((u) => ({ valor: u.id, rotulo: u.nome })) };
}

/** Oportunidade aberta para pré-preencher uma proposta nova (cliente e responsável). */
export async function oportunidadeParaNovaProposta(id: string) {
  const escopo = await escopoEmpresa();
  const o = await prisma.oportunidade.findFirst({
    where: { id, empresaId: escopo.ativa.id, etapa: { in: ETAPAS_ABERTAS } },
    select: { id: true, titulo: true, pessoaId: true, responsavelId: true, pessoa: { select: { nome: true, nomeFantasia: true } } },
  });
  return o ? { id: o.id, titulo: o.titulo, pessoaId: o.pessoaId, pessoaNome: nomePessoa(o.pessoa), responsavelId: o.responsavelId } : null;
}
