"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao } from "@/lib/auth/sessao";
import { escopoEmpresa, type EscopoEmpresa } from "@/lib/auth/empresa";
import { auditar } from "@/lib/auditoria";
import { isoParaDate } from "@/lib/datas";
import { fmtMoeda } from "@/lib/format";
import { esquemaAtividade, esquemaEtapa, esquemaOportunidade, esquemaPerda, type EntradaAtividade, type EntradaOportunidade, type EntradaPerda } from "./esquemas";
import { MOTIVOS_PERDA, ROTULO_ATIVIDADE, ROTULO_ETAPA, ehAberta, type EtapaAberta, type MotivoPerda } from "./tipos";

const nome = (p: { nome: string; nomeFantasia: string | null }) => p.nomeFantasia || p.nome;

function revalidarCrm(oportunidadeId?: string | null) {
  revalidatePath("/crm/funil");
  revalidatePath("/crm/atividades");
  if (oportunidadeId) revalidatePath(`/crm/oportunidades/${oportunidadeId}`);
}

async function pessoaDaEmpresa(matriz: string, pessoaId: string) {
  const p = await prisma.pessoa.findFirst({ where: { id: pessoaId, empresaId: matriz }, select: { id: true, nome: true, nomeFantasia: true } });
  if (!p) throw new ErroAcao("Cliente não encontrado nesta empresa.", { pessoaId: "Cliente não encontrado nesta empresa." });
  return p;
}

async function validarResponsavel(matriz: string, responsavelId: string | null) {
  if (!responsavelId) return;
  const u = await prisma.usuario.findFirst({
    where: { id: responsavelId, ativo: true, OR: [{ todasEmpresas: true }, { empresas: { has: matriz } }] },
    select: { id: true },
  });
  if (!u) throw new ErroAcao("Responsável não encontrado ou sem acesso a esta empresa.", { responsavelId: "Sem acesso a esta empresa." });
}

/** Oportunidade da empresa (matriz) ativa, ou erro. */
async function oportunidadeDaEmpresa(escopo: EscopoEmpresa, id: string) {
  const o = await prisma.oportunidade.findFirst({
    where: { id, empresaId: escopo.ativa.id },
    select: { id: true, titulo: true, etapa: true, etapaAntesFechar: true, valor: true, pessoa: { select: { nome: true, nomeFantasia: true } } },
  });
  if (!o) throw new ErroAcao("Oportunidade não encontrada nesta empresa.");
  return o;
}

// ───────────────────────── Oportunidades ─────────────────────────

/** Cria ou edita uma oportunidade. A etapa só é escolhida na criação; depois muda pelo funil. */
export async function salvarOportunidade(id: string | null, entrada: EntradaOportunidade): Promise<Resultado<{ id: string }>> {
  return executar(async () => {
    const u = await exigirPermissao("crm:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaOportunidade.parse(entrada);
    const matriz = escopo.ativa.id;
    const pessoa = await pessoaDaEmpresa(matriz, d.pessoaId);
    await validarResponsavel(matriz, d.responsavelId);
    const dados = {
      titulo: d.titulo,
      pessoaId: d.pessoaId,
      contato: d.contato,
      responsavelId: d.responsavelId ?? u.id,
      valor: d.valor,
      previsaoFechamento: d.previsaoFechamento ? isoParaDate(d.previsaoFechamento) : null,
      origem: d.origem,
      observacoes: d.observacoes,
    };
    const resumo = `${d.titulo} · ${nome(pessoa)} · ${fmtMoeda(d.valor)}`;
    if (id) {
      await oportunidadeDaEmpresa(escopo, id);
      await prisma.oportunidade.update({ where: { id }, data: dados });
      await auditar("atualizar", "oportunidade", id, resumo, { ...d, etapa: undefined });
      revalidarCrm(id);
      return { id };
    }
    const o = await prisma.oportunidade.create({ data: { ...dados, empresaId: matriz, etapa: d.etapa, criadoPorId: u.id } });
    await auditar("criar", "oportunidade", o.id, `${resumo} · ${ROTULO_ETAPA[d.etapa]}`, d);
    revalidarCrm(o.id);
    return { id: o.id };
  }, id ? "Oportunidade salva." : "Oportunidade criada.");
}

/** Muda a etapa de uma oportunidade aberta (Descoberta, Proposta ou Negociação). */
export async function moverOportunidade(id: string, etapa: EtapaAberta): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("crm:editar");
    const e = esquemaEtapa.parse(etapa);
    const escopo = await escopoEmpresa();
    const atual = await oportunidadeDaEmpresa(escopo, id);
    if (!ehAberta(atual.etapa)) throw new ErroAcao("Oportunidade fechada: reabra antes de mudar a etapa.");
    if (atual.etapa === e) return undefined;
    const r = await prisma.oportunidade.updateMany({ where: { id, etapa: atual.etapa }, data: { etapa: e, etapaDesde: new Date() } });
    if (r.count !== 1) throw new ErroAcao("A oportunidade mudou. Atualize a página.");
    await auditar("mover", "oportunidade", id, `${atual.titulo} · ${ROTULO_ETAPA[atual.etapa]} → ${ROTULO_ETAPA[e]}`, { de: atual.etapa, para: e });
    revalidarCrm(id);
    return undefined;
  }, `Movida para ${ROTULO_ETAPA[etapa] ?? "outra etapa"}.`);
}

/** Marca como ganha (guarda a etapa de onde saiu, para reabrir no mesmo ponto). */
export async function ganharOportunidade(id: string): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("crm:editar");
    const escopo = await escopoEmpresa();
    const atual = await oportunidadeDaEmpresa(escopo, id);
    if (atual.etapa === "GANHA") throw new ErroAcao("Esta oportunidade já está ganha.");
    if (!ehAberta(atual.etapa)) throw new ErroAcao("Oportunidade perdida: reabra antes de marcar como ganha.");
    const agora = new Date();
    const r = await prisma.oportunidade.updateMany({
      where: { id, etapa: atual.etapa },
      data: { etapa: "GANHA", etapaAntesFechar: atual.etapa, etapaDesde: agora, ganhaEm: agora, perdidaEm: null, motivoPerda: null, detalhePerda: null },
    });
    if (r.count !== 1) throw new ErroAcao("A oportunidade mudou. Atualize a página.");
    await auditar("ganhar", "oportunidade", id, `${atual.titulo} · ${nome(atual.pessoa)} · ${fmtMoeda(Number(atual.valor))}`, { de: atual.etapa });
    revalidarCrm(id);
    return undefined;
  }, "Oportunidade ganha. Parabéns!");
}

/** Marca como perdida, com motivo obrigatório. */
export async function perderOportunidade(id: string, entrada: EntradaPerda): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("crm:editar");
    const p = esquemaPerda.parse(entrada);
    const escopo = await escopoEmpresa();
    const atual = await oportunidadeDaEmpresa(escopo, id);
    if (atual.etapa === "PERDIDA") throw new ErroAcao("Esta oportunidade já está perdida.");
    if (!ehAberta(atual.etapa)) throw new ErroAcao("Oportunidade ganha: reabra antes de marcar como perdida.");
    const agora = new Date();
    const r = await prisma.oportunidade.updateMany({
      where: { id, etapa: atual.etapa },
      data: { etapa: "PERDIDA", etapaAntesFechar: atual.etapa, etapaDesde: agora, perdidaEm: agora, ganhaEm: null, motivoPerda: p.motivo, detalhePerda: p.detalhe },
    });
    if (r.count !== 1) throw new ErroAcao("A oportunidade mudou. Atualize a página.");
    const motivo = MOTIVOS_PERDA[p.motivo as MotivoPerda];
    await auditar("perder", "oportunidade", id, `${atual.titulo} · ${motivo}${p.detalhe ? ` · ${p.detalhe}` : ""}`, { de: atual.etapa, motivo: p.motivo, detalhe: p.detalhe });
    revalidarCrm(id);
    return undefined;
  }, "Oportunidade marcada como perdida.");
}

/** Reabre uma oportunidade ganha ou perdida, voltando à etapa em que estava. */
export async function reabrirOportunidade(id: string): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("crm:editar");
    const escopo = await escopoEmpresa();
    const atual = await oportunidadeDaEmpresa(escopo, id);
    if (ehAberta(atual.etapa)) throw new ErroAcao("A oportunidade já está aberta.");
    const volta: EtapaAberta = atual.etapaAntesFechar && ehAberta(atual.etapaAntesFechar) ? atual.etapaAntesFechar : "NEGOCIACAO";
    const r = await prisma.oportunidade.updateMany({
      where: { id, etapa: atual.etapa },
      data: { etapa: volta, etapaAntesFechar: null, etapaDesde: new Date(), ganhaEm: null, perdidaEm: null, motivoPerda: null, detalhePerda: null },
    });
    if (r.count !== 1) throw new ErroAcao("A oportunidade mudou. Atualize a página.");
    await auditar("reabrir", "oportunidade", id, `${atual.titulo} · volta para ${ROTULO_ETAPA[volta]}`, { de: atual.etapa, para: volta });
    revalidarCrm(id);
    return undefined;
  }, "Oportunidade reaberta.");
}

/** Exclui a oportunidade e as atividades dela. Não exclui se já tiver proposta. */
export async function excluirOportunidade(id: string): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("crm:editar");
    const escopo = await escopoEmpresa();
    const atual = await oportunidadeDaEmpresa(escopo, id);
    const propostas = await prisma.proposta.count({ where: { oportunidadeId: id } });
    if (propostas) throw new ErroAcao("Esta oportunidade tem proposta. Marque como perdida em vez de excluir.");
    await prisma.oportunidade.delete({ where: { id } });
    await auditar("excluir", "oportunidade", id, `${atual.titulo} · ${nome(atual.pessoa)}`, { etapa: atual.etapa });
    revalidarCrm();
    return undefined;
  }, "Oportunidade excluída.");
}

// ───────────────────────── Atividades ─────────────────────────

/** Cria ou edita uma atividade. Ligada a uma oportunidade, herda o cliente dela. */
export async function salvarAtividade(id: string | null, entrada: EntradaAtividade): Promise<Resultado<{ id: string }>> {
  return executar(async () => {
    const u = await exigirPermissao("crm:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaAtividade.parse(entrada);
    const matriz = escopo.ativa.id;
    let pessoaId = d.pessoaId;
    if (d.oportunidadeId) {
      const o = await prisma.oportunidade.findFirst({ where: { id: d.oportunidadeId, empresaId: matriz }, select: { pessoaId: true } });
      if (!o) throw new ErroAcao("Oportunidade não encontrada nesta empresa.");
      pessoaId = o.pessoaId;
    } else if (pessoaId) {
      await pessoaDaEmpresa(matriz, pessoaId);
    }
    await validarResponsavel(matriz, d.responsavelId);
    const dados = {
      tipo: d.tipo,
      assunto: d.assunto,
      descricao: d.descricao,
      data: isoParaDate(d.data),
      hora: d.hora,
      responsavelId: d.responsavelId ?? u.id,
      oportunidadeId: d.oportunidadeId,
      pessoaId,
    };
    const resumo = `${ROTULO_ATIVIDADE[d.tipo]} · ${d.assunto} · ${d.data.split("-").reverse().join("/")}${d.hora ? ` ${d.hora}` : ""}`;
    if (id) {
      const atual = await prisma.atividade.findFirst({ where: { id, empresaId: matriz }, select: { oportunidadeId: true } });
      if (!atual) throw new ErroAcao("Atividade não encontrada nesta empresa.");
      await prisma.atividade.update({ where: { id }, data: dados });
      await auditar("atualizar", "atividade", id, resumo, d);
      revalidarCrm(d.oportunidadeId ?? atual.oportunidadeId);
      return { id };
    }
    const a = await prisma.atividade.create({ data: { ...dados, empresaId: matriz, criadoPorId: u.id } });
    await auditar("criar", "atividade", a.id, resumo, d);
    revalidarCrm(d.oportunidadeId);
    return { id: a.id };
  }, id ? "Atividade salva." : "Atividade agendada.");
}

/** Marca a atividade como feita (ou desfaz). */
export async function concluirAtividade(id: string, concluida: boolean): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("crm:editar");
    const escopo = await escopoEmpresa();
    const atual = await prisma.atividade.findFirst({ where: { id, empresaId: escopo.ativa.id }, select: { assunto: true, oportunidadeId: true } });
    if (!atual) throw new ErroAcao("Atividade não encontrada nesta empresa.");
    await prisma.atividade.update({ where: { id }, data: { concluidaEm: concluida ? new Date() : null } });
    await auditar(concluida ? "concluir" : "reabrir", "atividade", id, atual.assunto);
    revalidarCrm(atual.oportunidadeId);
    return undefined;
  }, concluida ? "Atividade concluída." : "Atividade reaberta.");
}

export async function excluirAtividade(id: string): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("crm:editar");
    const escopo = await escopoEmpresa();
    const atual = await prisma.atividade.findFirst({ where: { id, empresaId: escopo.ativa.id }, select: { assunto: true, oportunidadeId: true } });
    if (!atual) throw new ErroAcao("Atividade não encontrada nesta empresa.");
    await prisma.atividade.delete({ where: { id } });
    await auditar("excluir", "atividade", id, atual.assunto);
    revalidarCrm(atual.oportunidadeId);
    return undefined;
  }, "Atividade excluída.");
}
