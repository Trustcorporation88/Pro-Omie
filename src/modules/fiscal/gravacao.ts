// Gravação idempotente dos documentos e eventos capturados. Só servidor.
// Regras (herdadas do HUBCLONE): documento ilegível não entra e a página conta como falha (o cursor não avança);
// o que já existe conta como gravado. Além disso: resumo nunca substitui XML completo; cancelamento marca a nota.
import "server-only";
import { prisma } from "@/lib/db";
import type { DocumentoCapturado, Motor } from "./tipos";
import { detalheNfe, ehRemessaArmazenagem } from "./leitura";

const CANCELAMENTOS = new Set(["110111", "110112", "101101", "105102"]);

export type ResultadoGravacao = { gravados: number; novos: number; completados: number; falhas: string[] };

async function gravarEvento(empresaId: string, d: DocumentoCapturado) {
  const ev = d.evento!;
  const doc = await prisma.documentoRecebido.findUnique({ where: { empresaId_chave: { empresaId, chave: d.chave } }, select: { id: true } });
  const dados = {
    documentoId: doc?.id ?? null,
    descricao: ev.descricao ?? null,
    detalhe: ev.detalhe ?? null,
    ocorridoEm: ev.ocorridoEm ?? null,
    protocolo: ev.protocolo ?? null,
    nsu: d.nsu,
  };
  const existente = await prisma.eventoDocumento.findUnique({
    where: { empresaId_chaveDocumento_tipoEvento_sequencia: { empresaId, chaveDocumento: d.chave, tipoEvento: ev.codigo, sequencia: ev.sequencia } },
    select: { id: true, xml: true },
  });
  let novo = false;
  if (existente) {
    // resumo do evento (resEvento) não substitui o evento completo (procEventoNFe)
    if (d.xml && d.xml.length > existente.xml.length) await prisma.eventoDocumento.update({ where: { id: existente.id }, data: { ...dados, xml: d.xml } });
  } else {
    await prisma.eventoDocumento.create({ data: { empresaId, chaveDocumento: d.chave, tipoEvento: ev.codigo, sequencia: ev.sequencia, xml: d.xml, ...dados } });
    novo = true;
  }
  if (doc && CANCELAMENTOS.has(ev.codigo)) await prisma.documentoRecebido.update({ where: { id: doc.id }, data: { situacao: "CANCELADO" } });
  return novo;
}

async function gravarDocumento(empresaId: string, motor: Motor, d: DocumentoCapturado) {
  const completo = d.natureza === "DOCUMENTO" && !!d.xml;
  // remessa para armazenagem (mercadoria do depositante): vai para o armazém geral, não para compras
  const armazenagem = completo && d.tipo === "NFE" ? ehRemessaArmazenagem(detalheNfe(d.xml)?.itens ?? []) : false;
  const campos = {
    tipo: d.tipo,
    armazenagem,
    direcao: d.direcao ?? "ENTRADA",
    numero: d.numero ?? null,
    serie: d.serie ?? null,
    emitenteDocumento: d.emitenteDocumento ?? null,
    emitenteNome: d.emitenteNome ?? null,
    emitenteIe: d.emitenteIe ?? null,
    destinatarioDocumento: d.destinatarioDocumento ?? null,
    valor: d.valor ?? null,
    emitidoEm: d.emitidoEm ?? null,
    protocolo: d.protocolo ?? null,
  };
  const existente = await prisma.documentoRecebido.findUnique({
    where: { empresaId_chave: { empresaId, chave: d.chave } },
    select: { id: true, completo: true, situacao: true, manifestacao: true },
  });
  let id: string;
  let resultado: "novo" | "completado" | "igual" = "igual";
  if (!existente) {
    const criado = await prisma.documentoRecebido.create({
      data: {
        empresaId,
        chave: d.chave,
        ...campos,
        situacao: d.situacao ?? "AUTORIZADO",
        completo,
        xml: d.xml,
        nsu: d.nsu,
        motor,
        manifestacao: d.manifestacao ?? null,
      },
      select: { id: true },
    });
    id = criado.id;
    resultado = "novo";
  } else {
    id = existente.id;
    const cancelada = existente.situacao === "CANCELADO" || d.situacao === "CANCELADO";
    const situacao = cancelada ? "CANCELADO" : (d.situacao ?? existente.situacao);
    if (completo && !existente.completo) {
      await prisma.documentoRecebido.update({ where: { id }, data: { ...campos, situacao, completo: true, xml: d.xml, nsu: d.nsu } });
      resultado = "completado";
    } else if (situacao !== existente.situacao || (d.manifestacao && d.manifestacao !== existente.manifestacao)) {
      await prisma.documentoRecebido.update({
        where: { id },
        data: { situacao, ...(d.manifestacao && d.manifestacao !== existente.manifestacao ? { manifestacao: d.manifestacao } : {}) },
      });
    }
  }
  // eventos que chegaram antes do documento
  const soltos = await prisma.eventoDocumento.findMany({ where: { empresaId, chaveDocumento: d.chave, documentoId: null }, select: { id: true, tipoEvento: true } });
  if (soltos.length) {
    await prisma.eventoDocumento.updateMany({ where: { id: { in: soltos.map((s) => s.id) } }, data: { documentoId: id } });
    if (soltos.some((s) => CANCELAMENTOS.has(s.tipoEvento))) await prisma.documentoRecebido.update({ where: { id }, data: { situacao: "CANCELADO" } });
  }
  return resultado;
}

export async function gravarDocumentos(empresaId: string, motor: Motor, documentos: DocumentoCapturado[]): Promise<ResultadoGravacao> {
  const r: ResultadoGravacao = { gravados: 0, novos: 0, completados: 0, falhas: [] };
  // documentos antes dos eventos da mesma página (o evento já encontra a nota)
  const ordem = [...documentos].sort((a, b) => Number(a.natureza === "EVENTO") - Number(b.natureza === "EVENTO"));
  for (const d of ordem) {
    if (d.erroLeitura) {
      r.falhas.push(`NSU ${Number(d.nsu) || d.nsu}: ${d.erroLeitura}`);
      continue;
    }
    if (!d.chave || d.natureza === "OUTRO") {
      r.gravados += 1; // documento sem interesse (ex.: resumo de evento de outro modelo): não trava o cursor
      continue;
    }
    try {
      r.gravados += 1;
      if (d.natureza === "EVENTO") {
        if (await gravarEvento(empresaId, d)) r.novos += 1;
      } else {
        const g = await gravarDocumento(empresaId, motor, d);
        if (g === "novo") r.novos += 1;
        else if (g === "completado") r.completados += 1;
      }
    } catch (e) {
      console.error("[fiscal] falha ao gravar documento", { empresaId, nsu: d.nsu, tipo: d.tipo }, e);
      r.falhas.push(`NSU ${Number(d.nsu) || d.nsu}: falha ao gravar`);
    }
  }
  return r;
}
