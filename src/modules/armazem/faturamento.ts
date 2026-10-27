// Cobrança da armazenagem por posição-pallet: fotografia diária das posições ocupadas por depositante, ocupação dia a dia
// da competência, tela do mês, geração do pedido faturado (conta a receber e cobrança) e desfazer. Só servidor.
// Nada aqui chama escopoEmpresa() ou auditar() dentro de transação.
import "server-only";
import { prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { hojeISO, isoParaDate } from "@/lib/datas";
import { num } from "@/lib/serial";
import { categoriaReceitaPadrao, criarPedidoServicoFaturado } from "@/modules/servicos/recorrencia";
import { cancelarCobranca, gerarCobranca } from "@/modules/cobranca/servicos";
import { excluirTitulo } from "@/modules/financeiro/servicos";
import {
  ESTADO_VAZIO,
  calcularArmazenagem,
  competenciaCurta,
  descricaoArmazenagem,
  diasDaCompetencia,
  ehCompetencia,
  mudarCompetencia,
  ocupacaoDiaADia,
  rotuloCompetencia,
  vencimentoArmazenagem,
  type CalculoArmazenagem,
  type DiaOcupacao,
  type EstadoOcupacao,
  type MetodoArmazenagem,
  type TarifaCalculo,
} from "./tipos";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const nomePessoa = (p: { nome: string; nomeFantasia?: string | null }) => p.nomeFantasia || p.nome;
const nomeEmpresa = (e: { nomeFantasia: string | null; razaoSocial: string }) => e.nomeFantasia || e.razaoSocial;

// ───────────────────────── Fotografia ─────────────────────────

/** Estabelecimentos que usam o armazém (algum endereço ou volume). */
export async function estabelecimentosComArmazem(ids?: string[]): Promise<string[]> {
  const where = ids ? { empresaId: { in: ids } } : {};
  const [e, v] = await Promise.all([
    prisma.enderecoArmazem.findMany({ where, distinct: ["empresaId"], select: { empresaId: true } }),
    prisma.volumeArmazem.findMany({ where, distinct: ["empresaId"], select: { empresaId: true } }),
  ]);
  return [...new Set([...e, ...v].map((x) => x.empresaId))];
}

/**
 * Posições de cada depositante agora. Posição ocupada = endereço (que não seja doca) com volume do depositante que tem itens.
 * Volumes conferidos sem endereço ou na doca não ocupam posição (contam como "fora de posição").
 */
export async function ocupacaoAtual(empresaId: string): Promise<Map<string, EstadoOcupacao>> {
  const [volumes, reservas] = await Promise.all([
    prisma.volumeArmazem.findMany({
      where: { empresaId, status: { not: "EXPEDIDO" } },
      select: { depositanteId: true, status: true, enderecoId: true, endereco: { select: { codigo: true, tipo: true } }, _count: { select: { conteudo: true } } },
    }),
    prisma.enderecoArmazem.findMany({ where: { empresaId, ativo: true, depositanteId: { not: null }, tipo: { not: "DOCA" } }, select: { id: true, depositanteId: true } }),
  ]);
  type Acc = { posicoes: Map<string, string>; volumes: number; fora: number; reservadas: Set<string> };
  const acc = new Map<string, Acc>();
  const de = (id: string) => {
    if (!acc.has(id)) acc.set(id, { posicoes: new Map(), volumes: 0, fora: 0, reservadas: new Set() });
    return acc.get(id)!;
  };
  for (const v of volumes) {
    if (!v._count.conteudo) continue;
    const a = de(v.depositanteId);
    a.volumes++;
    if (v.enderecoId && v.endereco && v.endereco.tipo !== "DOCA") a.posicoes.set(v.enderecoId, v.endereco.codigo);
    else if (v.status === "FECHADO") a.fora++;
  }
  for (const r of reservas) de(r.depositanteId!).reservadas.add(r.id);
  return new Map(
    [...acc].map(([dep, a]) => [
      dep,
      {
        posicoes: a.posicoes.size,
        reservadasVazias: [...a.reservadas].filter((id) => !a.posicoes.has(id)).length,
        volumes: a.volumes,
        volumesForaPosicao: a.fora,
        enderecos: [...a.posicoes.values()].sort((x, y) => x.localeCompare(y, "pt-BR", { numeric: true })),
      },
    ]),
  );
}

/** Fotografa o dia (por padrão, hoje): grava as posições de cada depositante e marca o dia como fotografado. Pode rodar várias vezes: vale a última. */
export async function fotografarOcupacao(opcoes: { empresaIds?: string[]; dia?: string } = {}) {
  const dia = opcoes.dia ?? hojeISO();
  const data = isoParaDate(dia);
  const estabelecimentos = await estabelecimentosComArmazem(opcoes.empresaIds);
  let depositantes = 0;
  let posicoes = 0;
  for (const empresaId of estabelecimentos) {
    const estados = await ocupacaoAtual(empresaId);
    const deps = [...estados.keys()];
    await prisma.$transaction([
      prisma.ocupacaoArmazem.deleteMany({ where: { empresaId, dia: data, depositanteId: { notIn: deps } } }),
      ...[...estados].map(([depositanteId, e]) => {
        const dados = { posicoes: e.posicoes, reservadasVazias: e.reservadasVazias, volumes: e.volumes, volumesForaPosicao: e.volumesForaPosicao, enderecos: e.enderecos };
        return prisma.ocupacaoArmazem.upsert({ where: { empresaId_depositanteId_dia: { empresaId, depositanteId, dia: data } }, create: { empresaId, depositanteId, dia: data, ...dados }, update: dados });
      }),
      prisma.fotografiaArmazem.upsert({ where: { empresaId_dia: { empresaId, dia: data } }, create: { empresaId, dia: data }, update: { feitaEm: new Date() } }),
    ]);
    depositantes += deps.length;
    posicoes += [...estados.values()].reduce((a, e) => a + e.posicoes, 0);
  }
  return { dia, estabelecimentos: estabelecimentos.length, depositantes, posicoes };
}

const estadoDe = (r: { posicoes: number; reservadasVazias: number; volumes: number; volumesForaPosicao: number; enderecos: string[] }): EstadoOcupacao => ({
  posicoes: r.posicoes,
  reservadasVazias: r.reservadasVazias,
  volumes: r.volumes,
  volumesForaPosicao: r.volumesForaPosicao,
  enderecos: r.enderecos,
});

/** Ocupação dia a dia da competência (até `ate`), por estabelecimento e depositante. */
export async function ocupacaoDaCompetencia(empresaIds: string[], competencia: string, ate?: string): Promise<Map<string, Map<string, DiaOcupacao[]>>> {
  const dias = diasDaCompetencia(competencia, ate);
  const saida = new Map<string, Map<string, DiaOcupacao[]>>();
  if (!dias.length || !empresaIds.length) return saida;
  const inicio = isoParaDate(dias[0]);
  const fim = isoParaDate(dias[dias.length - 1]);
  const [marcas, linhas] = await Promise.all([
    prisma.fotografiaArmazem.findMany({ where: { empresaId: { in: empresaIds }, dia: { gte: inicio, lte: fim } }, select: { empresaId: true, dia: true } }),
    prisma.ocupacaoArmazem.findMany({ where: { empresaId: { in: empresaIds }, dia: { gte: inicio, lte: fim } } }),
  ]);
  for (const empresaId of empresaIds) {
    const ultima = await prisma.fotografiaArmazem.findFirst({ where: { empresaId, dia: { lt: inicio } }, orderBy: { dia: "desc" }, select: { dia: true } });
    const anterior = ultima ? new Map((await prisma.ocupacaoArmazem.findMany({ where: { empresaId, dia: ultima.dia } })).map((r) => [r.depositanteId, estadoDe(r)])) : null;
    saida.set(
      empresaId,
      ocupacaoDiaADia(
        dias,
        new Set(marcas.filter((m) => m.empresaId === empresaId).map((m) => iso(m.dia))),
        linhas.filter((l) => l.empresaId === empresaId).map((l) => ({ dia: iso(l.dia), depositanteId: l.depositanteId, estado: estadoDe(l) })),
        anterior,
      ),
    );
  }
  return saida;
}

// ───────────────────────── Tela do mês ─────────────────────────

type TarifaBanco = {
  id: string;
  empresaId: string;
  depositanteId: string;
  valorPosicao: unknown;
  metodo: string;
  minimoPosicoes: number | null;
  cobrarReservadas: boolean;
  inicio: Date;
  diaVencimento: number;
  ativo: boolean;
};
export const tarifaCalculo = (t: TarifaBanco): TarifaCalculo => ({
  valorPosicao: num(t.valorPosicao as number),
  metodo: (t.metodo === "PICO" ? "PICO" : "PRO_RATA") as MetodoArmazenagem,
  minimoPosicoes: t.minimoPosicoes,
  cobrarReservadas: t.cobrarReservadas,
  inicio: iso(t.inicio),
});

export type SituacaoLinha = "SEM_TARIFA" | "PENDENTE" | "NADA_A_COBRAR" | "FATURADO" | "EM_ANDAMENTO";

export type LinhaFaturamento = {
  chave: string;
  empresaId: string;
  estabelecimento: string;
  depositanteId: string;
  depositante: string;
  documento: string | null;
  dias: DiaOcupacao[];
  /** soma dos volumes-dia fora de posição (sem endereço ou na doca) */
  foraPosicaoDia: number;
  tarifa: { id: string; valorPosicao: number; metodo: MetodoArmazenagem; minimoPosicoes: number | null; cobrarReservadas: boolean; ativo: boolean } | null;
  calculo: CalculoArmazenagem | null;
  vencimento: string | null;
  faturamento: {
    id: string;
    valor: number;
    posicoesDia: number;
    pico: number;
    posicoesCobradas: number;
    vencimento: string;
    pedido: { id: string; numero: number; status: string } | null;
    titulo: { id: string; status: string; pago: number } | null;
    cobrancaId: string | null;
    erro: string | null;
  } | null;
  situacao: SituacaoLinha;
};

export type FiltrosFaturamento = { competencia: string; estab: string };

export function lerFiltrosFaturamento(sp: Record<string, string | string[] | undefined>): FiltrosFaturamento {
  const v = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x) ?? "";
  const c = v(sp.competencia);
  // padrão: o mês anterior (o que está para faturar)
  return { competencia: ehCompetencia(c) ? c : mudarCompetencia(hojeISO().slice(0, 7), -1), estab: v(sp.estab) };
}

export async function carregarFaturamento(f: FiltrosFaturamento) {
  const escopo = await escopoEmpresa();
  const estabelecimentos = (
    await prisma.empresa.findMany({ where: { id: { in: escopo.ids } }, select: { id: true, razaoSocial: true, nomeFantasia: true, matrizId: true, ativo: true } })
  )
    .map((e) => ({ id: e.id, nome: nomeEmpresa(e), matriz: !e.matrizId, ativo: e.ativo }))
    .sort((a, b) => Number(b.matriz) - Number(a.matriz) || a.nome.localeCompare(b.nome, "pt-BR"));
  const ids = f.estab && escopo.ids.includes(f.estab) ? [f.estab] : escopo.ids;
  const hoje = hojeISO();
  const atual = hoje.slice(0, 7);
  const emAndamento = f.competencia === atual;
  const futura = f.competencia > atual;
  const competenciaData = isoParaDate(`${f.competencia}-01`);
  const [ocupacao, tarifas, faturamentos, ultima] = await Promise.all([
    futura ? Promise.resolve(new Map<string, Map<string, DiaOcupacao[]>>()) : ocupacaoDaCompetencia(ids, f.competencia, emAndamento ? hoje : undefined),
    prisma.tarifaArmazem.findMany({
      where: { empresaId: { in: ids } },
      include: { depositante: { select: { nome: true, nomeFantasia: true, documento: true } }, produto: { select: { codigo: true, descricao: true } }, empresa: { select: { nomeFantasia: true, razaoSocial: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.faturamentoArmazem.findMany({ where: { empresaId: { in: ids }, competencia: competenciaData }, include: { pedido: { select: { id: true, numero: true, status: true } } } }),
    prisma.fotografiaArmazem.findFirst({ where: { empresaId: { in: ids } }, orderBy: { feitaEm: "desc" }, select: { feitaEm: true, dia: true } }),
  ]);
  const titulos = await prisma.titulo.findMany({ where: { id: { in: faturamentos.map((x) => x.tituloId).filter((x): x is string => !!x) } }, select: { id: true, status: true, valorPago: true } });
  const chaves = new Set<string>();
  for (const [e, deps] of ocupacao) for (const [d, dias] of deps) if (dias.some((x) => x.posicoes || x.reservadasVazias)) chaves.add(`${e}|${d}`);
  for (const t of tarifas) if (t.ativo) chaves.add(`${t.empresaId}|${t.depositanteId}`);
  for (const x of faturamentos) chaves.add(`${x.empresaId}|${x.depositanteId}`);
  const pessoas = await prisma.pessoa.findMany({ where: { id: { in: [...chaves].map((c) => c.split("|")[1]) } }, select: { id: true, nome: true, nomeFantasia: true, documento: true } });
  const pessoa = new Map(pessoas.map((p) => [p.id, p]));
  const nomeEstab = new Map(estabelecimentos.map((e) => [e.id, e.nome]));
  const diasVazios = (): DiaOcupacao[] => (futura ? [] : diasDaCompetencia(f.competencia, emAndamento ? hoje : undefined).map((dia) => ({ dia, origem: "SEM_DADOS" as const, ...ESTADO_VAZIO })));
  const linhas: LinhaFaturamento[] = [...chaves].map((chave) => {
    const [empresaId, depositanteId] = chave.split("|");
    const dias = ocupacao.get(empresaId)?.get(depositanteId) ?? diasVazios();
    const t = tarifas.find((x) => x.empresaId === empresaId && x.depositanteId === depositanteId) ?? null;
    const fat = faturamentos.find((x) => x.empresaId === empresaId && x.depositanteId === depositanteId) ?? null;
    const calculo = t && t.ativo && !futura ? calcularArmazenagem(dias, tarifaCalculo(t), f.competencia) : null;
    const titulo = fat?.tituloId ? titulos.find((x) => x.id === fat.tituloId) : undefined;
    const p = pessoa.get(depositanteId);
    const situacao: SituacaoLinha = fat ? "FATURADO" : !t || !t.ativo ? "SEM_TARIFA" : emAndamento || futura ? "EM_ANDAMENTO" : (calculo?.valor ?? 0) > 0 ? "PENDENTE" : "NADA_A_COBRAR";
    return {
      chave,
      empresaId,
      estabelecimento: nomeEstab.get(empresaId) ?? "",
      depositanteId,
      depositante: p ? nomePessoa(p) : "Depositante",
      documento: p?.documento ?? null,
      dias,
      foraPosicaoDia: dias.reduce((a, d) => a + d.volumesForaPosicao, 0),
      tarifa: t ? { id: t.id, valorPosicao: num(t.valorPosicao), metodo: t.metodo === "PICO" ? "PICO" : "PRO_RATA", minimoPosicoes: t.minimoPosicoes, cobrarReservadas: t.cobrarReservadas, ativo: t.ativo } : null,
      calculo,
      vencimento: t && calculo ? vencimentoArmazenagem(f.competencia, t.diaVencimento, hoje) : null,
      faturamento: fat
        ? {
            id: fat.id,
            valor: num(fat.valor),
            posicoesDia: fat.posicoesDia,
            pico: fat.pico,
            posicoesCobradas: num(fat.posicoesCobradas),
            vencimento: iso(fat.vencimento),
            pedido: fat.pedido,
            titulo: titulo ? { id: titulo.id, status: titulo.status, pago: num(titulo.valorPago) } : null,
            cobrancaId: fat.cobrancaId,
            erro: fat.erro,
          }
        : null,
      situacao,
    };
  });
  linhas.sort((a, b) => a.depositante.localeCompare(b.depositante, "pt-BR") || a.estabelecimento.localeCompare(b.estabelecimento, "pt-BR"));
  const valorDe = (l: LinhaFaturamento) => l.faturamento?.valor ?? l.calculo?.valor ?? 0;
  return {
    competencia: f.competencia,
    rotulo: rotuloCompetencia(f.competencia),
    emAndamento,
    futura,
    liberada: f.competencia < atual,
    hoje,
    estabelecimentos,
    linhas,
    totais: {
      posicoesDia: linhas.reduce((a, l) => a + l.dias.reduce((s, d) => s + d.posicoes, 0), 0),
      aFaturar: Math.round(linhas.filter((l) => l.situacao === "PENDENTE").reduce((a, l) => a + valorDe(l), 0) * 100) / 100,
      faturado: Math.round(linhas.filter((l) => l.faturamento).reduce((a, l) => a + valorDe(l), 0) * 100) / 100,
      pendentes: linhas.filter((l) => l.situacao === "PENDENTE").length,
      semTarifa: linhas.filter((l) => l.situacao === "SEM_TARIFA").length,
      diasRepetidos: Math.max(0, ...linhas.map((l) => l.dias.filter((d) => d.origem === "REPETIDO").length)),
    },
    ultimaFotografia: ultima ? { em: ultima.feitaEm.toISOString(), dia: iso(ultima.dia) } : null,
    tarifas: tarifas.map((t) => ({
      id: t.id,
      empresaId: t.empresaId,
      estabelecimento: nomeEmpresa(t.empresa),
      depositanteId: t.depositanteId,
      depositante: nomePessoa(t.depositante),
      documento: t.depositante.documento,
      valorPosicao: num(t.valorPosicao),
      metodo: (t.metodo === "PICO" ? "PICO" : "PRO_RATA") as MetodoArmazenagem,
      minimoPosicoes: t.minimoPosicoes,
      cobrarReservadas: t.cobrarReservadas,
      inicio: iso(t.inicio),
      produtoId: t.produtoId,
      produto: t.produto ? `${t.produto.codigo} · ${t.produto.descricao}` : null,
      descricao: t.descricao,
      diaVencimento: t.diaVencimento,
      categoriaId: t.categoriaId,
      contaBancariaId: t.contaBancariaId,
      formaPagamentoId: t.formaPagamentoId,
      gerarCobranca: t.gerarCobranca,
      observacoes: t.observacoes,
      ativo: t.ativo,
    })),
  };
}

export type DadosFaturamento = Awaited<ReturnType<typeof carregarFaturamento>>;
export type TarifaTela = DadosFaturamento["tarifas"][number];

// ───────────────────────── Gerar e desfazer ─────────────────────────

/** Gera o faturamento do mês de um depositante: pedido faturado (serviço) + conta a receber + boleto/Pix opcional. */
export async function gerarFaturamentoArmazem(p: { empresaId: string; depositanteId: string; competencia: string; usuarioId: string | null; urlBase: string }) {
  if (!ehCompetencia(p.competencia)) throw new ErroAcao("Competência inválida.");
  const hoje = hojeISO();
  if (p.competencia >= hoje.slice(0, 7)) throw new ErroAcao(`${rotuloCompetencia(p.competencia)} ainda não terminou: o faturamento fica liberado a partir do dia 1º do mês seguinte.`);
  const competenciaData = isoParaDate(`${p.competencia}-01`);
  const ja = await prisma.faturamentoArmazem.findUnique({ where: { empresaId_depositanteId_competencia: { empresaId: p.empresaId, depositanteId: p.depositanteId, competencia: competenciaData } }, include: { pedido: { select: { numero: true } } } });
  if (ja) throw new ErroAcao(`A armazenagem de ${rotuloCompetencia(p.competencia)} já foi faturada${ja.pedido ? ` (pedido nº ${String(ja.pedido.numero).padStart(4, "0")})` : ""}.`);
  const t = await prisma.tarifaArmazem.findUnique({
    where: { empresaId_depositanteId: { empresaId: p.empresaId, depositanteId: p.depositanteId } },
    include: { depositante: { select: { nome: true, nomeFantasia: true } }, produto: { select: { id: true, unidade: true, ativo: true } }, empresa: { select: { id: true, matrizId: true, ativo: true } } },
  });
  if (!t || !t.ativo) throw new ErroAcao("Cadastre (ou reative) a tarifa de armazenagem deste depositante.");
  if (!t.empresa.ativo) throw new ErroAcao("O estabelecimento está inativo.");
  const matrizId = t.empresa.matrizId ?? t.empresa.id;
  const dias = (await ocupacaoDaCompetencia([p.empresaId], p.competencia)).get(p.empresaId)?.get(p.depositanteId) ?? [];
  const tarifa = tarifaCalculo(t);
  const calculo = calcularArmazenagem(dias, tarifa, p.competencia);
  if (calculo.valor <= 0) throw new ErroAcao(`Nada a cobrar em ${rotuloCompetencia(p.competencia)}: o depositante não ocupou posições no período da tarifa.`);
  const categoriaId = await categoriaReceitaPadrao(matrizId, t.categoriaId);
  if (!categoriaId) throw new ErroAcao("Cadastre uma categoria de receita (ou escolha a da tarifa).");
  const vencimento = vencimentoArmazenagem(p.competencia, t.diaVencimento, hoje);
  const cliente = nomePessoa(t.depositante);
  const itemDescricao = descricaoArmazenagem(t.descricao, p.competencia, calculo, tarifa);
  let r: { faturamentoId: string; pedidoId: string; numero: number; tituloId: string };
  try {
    r = await prisma.$transaction(async (tx) => {
      const pedido = await criarPedidoServicoFaturado(tx, {
        empresaId: p.empresaId,
        pessoaId: p.depositanteId,
        cliente,
        produto: t.produto && t.produto.ativo ? { id: t.produto.id, unidade: t.produto.unidade } : null,
        itemDescricao,
        observacoes: `Armazenagem - competência ${competenciaCurta(p.competencia)}${t.observacoes ? `\n${t.observacoes}` : ""}`,
        tituloComplemento: `${t.descricao} ${competenciaCurta(p.competencia)}`,
        valor: calculo.valor,
        formaPagamentoId: t.formaPagamentoId,
        contaBancariaId: t.contaBancariaId,
        categoriaId,
        competencia: `${p.competencia}-01`,
        vencimento,
        usuarioId: p.usuarioId,
      });
      const fat = await tx.faturamentoArmazem.create({
        data: {
          empresaId: p.empresaId,
          depositanteId: p.depositanteId,
          tarifaId: t.id,
          competencia: competenciaData,
          metodo: tarifa.metodo,
          valorPosicao: tarifa.valorPosicao,
          minimoPosicoes: tarifa.minimoPosicoes,
          cobrarReservadas: tarifa.cobrarReservadas,
          diasMes: calculo.diasMes,
          diasVigencia: calculo.diasVigencia,
          diasRepetidos: calculo.diasRepetidos,
          posicoesDia: calculo.posicoesDia,
          reservadasDia: calculo.reservadasDia,
          pico: calculo.pico,
          posicoesCobradas: calculo.posicoesCobradas,
          valor: calculo.valor,
          vencimento: isoParaDate(vencimento),
          pedidoId: pedido.pedidoId,
          tituloId: pedido.tituloId,
          criadoPorId: p.usuarioId,
        },
        select: { id: true },
      });
      return { faturamentoId: fat.id, ...pedido };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new ErroAcao(`A armazenagem de ${rotuloCompetencia(p.competencia)} acabou de ser faturada por outra pessoa.`);
    throw e;
  }
  let cobrancaId: string | null = null;
  let erroCobranca: string | null = null;
  if (t.gerarCobranca) {
    try {
      const g = await gerarCobranca(r.tituloId, { tipo: null, enviarEmail: true, usuarioId: p.usuarioId ?? "", escopoIds: [p.empresaId], urlBase: p.urlBase });
      cobrancaId = g.cobranca.id;
      await prisma.faturamentoArmazem.update({ where: { id: r.faturamentoId }, data: { cobrancaId } });
    } catch (e) {
      erroCobranca = (e instanceof Error ? e.message : String(e)).slice(0, 400);
      await prisma.faturamentoArmazem.update({ where: { id: r.faturamentoId }, data: { erro: `Cobrança não gerada: ${erroCobranca}` } });
    }
  }
  return { ...r, cliente, valor: calculo.valor, vencimento, calculo, cobrancaId, erroCobranca };
}

/** Desfaz o faturamento: cancela a cobrança em aberto no Asaas, exclui a conta a receber e cancela o pedido. Bloqueado com recebimento ou nota emitida. */
export async function desfazerFaturamentoArmazem(id: string, escopoIds: string[]) {
  const f = await prisma.faturamentoArmazem.findFirst({ where: { id, empresaId: { in: escopoIds } }, include: { pedido: { select: { id: true, numero: true, status: true } }, depositante: { select: { nome: true, nomeFantasia: true } } } });
  if (!f) throw new ErroAcao("Faturamento não encontrado nesta empresa.");
  const pedidoId = f.pedido?.id ?? null;
  if (pedidoId) {
    const [nfse, nfe] = await Promise.all([
      prisma.notaServico.count({ where: { pedidoId, status: { in: ["AUTORIZADA", "PROCESSANDO"] } } }),
      prisma.notaFiscal.count({ where: { pedidoId, status: { in: ["AUTORIZADA", "PROCESSANDO"] } } }),
    ]);
    if (nfse || nfe) throw new ErroAcao("O pedido tem nota fiscal emitida (ou em processamento). Cancele a nota antes de desfazer o faturamento.");
  }
  const titulos = pedidoId
    ? await prisma.titulo.findMany({ where: { origem: "VENDA", origemId: pedidoId }, select: { id: true, numero: true, baixas: { select: { estornada: true } } } })
    : [];
  const ativas = titulos.filter((t) => t.baixas.some((b) => !b.estornada));
  if (ativas.length) throw new ErroAcao(`Há recebimento registrado (título nº ${ativas.map((t) => t.numero).join(", ")}). Estorne o recebimento antes de desfazer.`);
  const estornadas = titulos.filter((t) => t.baixas.length > 0);
  if (estornadas.length)
    throw new ErroAcao(`O título nº ${estornadas.map((t) => t.numero).join(", ")} teve baixa (estornada) e fica no histórico: cancele o título no contas a receber e o pedido em Vendas, se precisar refazer.`);
  const abertas = await prisma.cobranca.findMany({ where: { tituloId: { in: titulos.map((t) => t.id) }, status: { in: ["PENDING", "OVERDUE"] } }, select: { id: true } });
  for (const c of abertas) await cancelarCobranca(c.id, escopoIds);
  await prisma.$transaction(async (tx) => {
    for (const t of titulos) await excluirTitulo(tx, t.id);
    if (pedidoId) await tx.pedido.update({ where: { id: pedidoId }, data: { status: "CANCELADO", canceladoEm: new Date(), motivoCancelamento: `Faturamento da armazenagem de ${competenciaCurta(iso(f.competencia).slice(0, 7))} desfeito` } });
    await tx.faturamentoArmazem.delete({ where: { id: f.id } });
  });
  return { competencia: iso(f.competencia).slice(0, 7), numero: f.pedido?.numero ?? null, depositante: nomePessoa(f.depositante), cobrancasCanceladas: abertas.length, valor: num(f.valor) };
}
