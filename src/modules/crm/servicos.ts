// Regras do CRM usadas por outros módulos (vendas). Não são server actions.
import "server-only";
import { prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { auditar } from "@/lib/auditoria";
import { fmtMoeda } from "@/lib/format";
import { ROTULO_ETAPA, ehAberta } from "./tipos";

/** Confere que a oportunidade é da empresa (matriz) ativa e está aberta, antes de ligar uma proposta a ela. */
export async function oportunidadeParaProposta(matrizId: string, oportunidadeId: string) {
  const o = await prisma.oportunidade.findFirst({ where: { id: oportunidadeId, empresaId: matrizId }, select: { id: true, titulo: true, etapa: true, pessoaId: true } });
  if (!o) throw new ErroAcao("Oportunidade não encontrada nesta empresa.");
  if (!ehAberta(o.etapa)) throw new ErroAcao("A oportunidade está fechada. Reabra no funil antes de criar a proposta.");
  return o;
}

/** Proposta criada a partir da oportunidade: se ainda estava em Descoberta, avança para Proposta. */
export async function avancarParaProposta(oportunidadeId: string, empresaId: string, propostaNumero: string) {
  const o = await prisma.oportunidade.findUnique({ where: { id: oportunidadeId }, select: { titulo: true, etapa: true } });
  if (!o || o.etapa !== "DESCOBERTA") return;
  const r = await prisma.oportunidade.updateMany({ where: { id: oportunidadeId, etapa: "DESCOBERTA" }, data: { etapa: "PROPOSTA", etapaDesde: new Date() } });
  if (r.count === 1)
    await auditar("mover", "oportunidade", oportunidadeId, `${o.titulo} · ${ROTULO_ETAPA.DESCOBERTA} → ${ROTULO_ETAPA.PROPOSTA} (proposta nº ${propostaNumero})`, { de: "DESCOBERTA", para: "PROPOSTA" }, { empresaId });
}

/** Proposta aprovada: a oportunidade ligada (se aberta) vira ganha com o valor da proposta. */
export async function ganharPelaProposta(oportunidadeId: string, empresaId: string, propostaNumero: string, total: number) {
  const o = await prisma.oportunidade.findUnique({ where: { id: oportunidadeId }, select: { titulo: true, etapa: true } });
  if (!o || !ehAberta(o.etapa)) return false;
  const agora = new Date();
  const r = await prisma.oportunidade.updateMany({
    where: { id: oportunidadeId, etapa: o.etapa },
    data: { etapa: "GANHA", etapaAntesFechar: o.etapa, etapaDesde: agora, ganhaEm: agora, valor: total, perdidaEm: null, motivoPerda: null, detalhePerda: null },
  });
  if (r.count !== 1) return false;
  await auditar("ganhar", "oportunidade", oportunidadeId, `${o.titulo} · ${fmtMoeda(total)} · proposta nº ${propostaNumero} aprovada`, { de: o.etapa, total }, { empresaId });
  return true;
}
