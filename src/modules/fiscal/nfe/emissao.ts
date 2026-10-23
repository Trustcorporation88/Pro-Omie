// Orquestração da emissão de NF-e: numeração, montagem, assinatura, envio, recuperação e eventos. Só servidor.
//
// Regras de segurança da numeração e da situação:
// - O número é reservado de forma atômica na configuração do estabelecimento. Nota rejeitada guarda o número para o
//   reenvio corrigido (a não ser que a faixa tenha sido inutilizada).
// - O XML assinado (e a chave) é gravado ANTES do envio: se a resposta não chegar, a situação é consultada pela chave
//   antes de qualquer reenvio (evita nota em duplicidade).
// - Contingência SVC-AN só por escolha explícita, depois de a SEFAZ-SP falhar; gera outra chave (tpEmis 6).
import "server-only";
import { prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { certificadoParaEmissao } from "@/modules/configuracoes/certificado";
import { decifrarTokenFocus } from "../captacao";
import { criarAgente, materialDoPfx, mensagemDeErro, CODIGO_UF } from "../sefaz/conexao";
import { assinarElemento } from "../sefaz/assinatura";
import { baixarXmlFocus, cancelarNaFocus, consultarNaFocus, corrigirNaFocus, emitirNaFocus, type RespostaNfeFocus } from "../focus/nfe";
import { gerarCNF, montarChave } from "./chave";
import { prepararNfe } from "./dados";
import { montarNfe, NS_NFE, type DadosNfe } from "./montagem";
import {
  autorizar,
  consultarProtocolo,
  consultarRecibo,
  enviarEventoNfe,
  ErroTransporte,
  inutilizar,
  montarNfeProc,
  urlsPara,
  type ResultadoAutorizacao,
} from "./sefaz";
import type { StatusNota } from "./tipos";

export type ResultadoEmissao = { notaId: string; status: StatusNota; cStat?: string | null; mensagem: string; numero: number; serie: number };

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function abrirSefaz(empresaId: string) {
  const cert = await certificadoParaEmissao(empresaId);
  if (!cert) throw new ErroAcao("Envie o certificado digital A1 em Configurações › Empresas e filiais.");
  if (cert.registro.validoAte < new Date()) throw new ErroAcao("O certificado digital A1 venceu. Envie o renovado.");
  const material = materialDoPfx(cert.pfx, cert.senha);
  return { material, agente: criarAgente(material) };
}

export function tokenFocus(empresaId: string, config: { focusTokenProducao: Uint8Array | null; focusTokenHomologacao: Uint8Array | null }, ambiente: 1 | 2) {
  const pacote = ambiente === 1 ? config.focusTokenProducao : config.focusTokenHomologacao;
  if (!pacote) throw new ErroAcao("O estabelecimento não foi ativado na Focus NFe para este ambiente.");
  return decifrarTokenFocus(empresaId, ambiente, pacote);
}

async function numeroInutilizado(empresaId: string, ambiente: number, serie: number, numero: number) {
  return !!(await prisma.inutilizacaoNfe.findFirst({ where: { empresaId, ambiente, serie, ok: true, numeroInicial: { lte: numero }, numeroFinal: { gte: numero } }, select: { id: true } }));
}

/** Grava o resultado da autorização na nota (SEFAZ direto). */
async function registrarAutorizacao(notaId: string, xmlAssinado: string, r: ResultadoAutorizacao) {
  const base = { cStat: r.cStat, xMotivo: r.xMotivo.slice(0, 500) };
  if (r.situacao === "AUTORIZADA" && r.protNFe) {
    await prisma.notaFiscal.update({
      where: { id: notaId },
      data: { ...base, status: "AUTORIZADA", protocolo: r.protocolo ?? null, autorizadaEm: r.autorizadaEm ?? new Date(), xmlAutorizado: montarNfeProc(xmlAssinado, r.protNFe) },
    });
    return "AUTORIZADA" as const;
  }
  if (r.situacao === "DENEGADA") {
    await prisma.notaFiscal.update({ where: { id: notaId }, data: { ...base, status: "DENEGADA", protocolo: r.protocolo ?? null, xmlAutorizado: r.protNFe ? montarNfeProc(xmlAssinado, r.protNFe) : null } });
    return "DENEGADA" as const;
  }
  if (r.situacao === "PROCESSANDO") {
    await prisma.notaFiscal.update({ where: { id: notaId }, data: { ...base, status: "PROCESSANDO" } });
    return "PROCESSANDO" as const;
  }
  await prisma.notaFiscal.update({ where: { id: notaId }, data: { ...base, status: "REJEITADA" } });
  return "REJEITADA" as const;
}

function mensagemStatus(status: StatusNota, cStat: string | null | undefined, xMotivo: string | null | undefined, ambiente: number) {
  const homolog = ambiente === 2 ? " (homologação, sem valor fiscal)" : "";
  if (status === "AUTORIZADA") return `NF-e autorizada${homolog}.`;
  if (status === "CANCELADA") return `NF-e cancelada na SEFAZ${homolog}.`;
  if (status === "DENEGADA") return `A SEFAZ denegou o uso da NF-e: ${cStat} ${xMotivo}`;
  if (status === "PROCESSANDO") return `Sem resposta definitiva da SEFAZ (${xMotivo ?? "aguardando"}). Use "Consultar situação" antes de reenviar.`;
  return `A SEFAZ recusou a nota: ${cStat ?? ""} ${xMotivo ?? ""}`.trim();
}

// ───────────────────────── emissão ─────────────────────────

export async function emitirNfeDoPedido(
  pedidoId: string,
  opcoes: { escopoIds: string[]; usuarioId: string; contingencia?: { justificativa: string } | null },
): Promise<ResultadoEmissao> {
  const prep = await prepararNfe(pedidoId, opcoes.escopoIds);
  if (!prep) throw new ErroAcao("Pedido não encontrado nesta empresa.");
  if (prep.problemas.length) throw new ErroAcao(`Antes de emitir: ${prep.problemas.map((p) => p.mensagem).join(" ")}`);
  const { empresa, config, dados, motor, totais } = prep;
  if (!config) throw new ErroAcao("A emissão de NF-e não está configurada.");
  if (opcoes.contingencia && motor !== "SEFAZ") throw new ErroAcao("Contingência SVC-AN só existe na emissão direta pela SEFAZ.");
  const ambiente = dados.ambiente;

  const anteriores = await prisma.notaFiscal.findMany({ where: { pedidoId }, orderBy: { createdAt: "desc" } });
  if (anteriores.some((n) => n.status === "AUTORIZADA")) throw new ErroAcao("Este pedido já tem NF-e autorizada. Para emitir outra, cancele a atual.");
  // Nota sem retorno (SEFAZ-SP fora do ar até para a consulta): só a contingência pode seguir, com OUTRO número, e a
  // pendente é resolvida depois (cancelada se tiver sido autorizada, número inutilizado se não) — procedimento do MOC.
  const pendente = anteriores.find((n) => n.status === "PROCESSANDO") ?? null;
  if (pendente && !(opcoes.contingencia && pendente.tpEmis === 1 && pendente.motor === "SEFAZ"))
    throw new ErroAcao('Há uma NF-e deste pedido em processamento. Use "Consultar situação" nela antes de emitir de novo.');
  let reaproveitar = pendente ? null : (anteriores.find((n) => n.status === "REJEITADA" && n.ambiente === ambiente && n.motor === motor) ?? null);
  if (reaproveitar && (await numeroInutilizado(empresa.id, ambiente, reaproveitar.serie, reaproveitar.numero))) reaproveitar = null;

  let numero: number;
  let serie: number;
  if (reaproveitar) {
    numero = reaproveitar.numero;
    serie = reaproveitar.serie;
  } else {
    const r = await prisma.configuracaoFiscal.update({ where: { empresaId: empresa.id }, data: { nfeProximoNumero: { increment: 1 } }, select: { nfeProximoNumero: true, nfeSerie: true } });
    numero = r.nfeProximoNumero - 1;
    serie = r.nfeSerie;
  }

  const emissao = new Date(Date.now() - 60_000); // um minuto antes: relógio adiantado não gera "data de emissão futura" (703)
  const tpEmis = (opcoes.contingencia ? 6 : 1) as 1 | 6;
  const cNF = reaproveitar?.chave ? reaproveitar.chave.slice(35, 43) : gerarCNF(numero);
  const { chave, dv } = montarChave({ cUF: dados.cUF, emissao, cnpj: dados.emitente.cnpj, serie, numero, tpEmis, cNF });
  const completos: DadosNfe = {
    ...dados,
    serie,
    numero,
    cNF,
    chave,
    dv,
    emissao,
    tpEmis,
    contingencia: opcoes.contingencia ? { inicio: emissao, justificativa: opcoes.contingencia.justificativa } : null,
  };
  const comum = {
    ambiente,
    motor,
    tpEmis,
    chave: motor === "SEFAZ" ? chave : null,
    status: "PROCESSANDO" as const,
    cStat: null,
    xMotivo: null,
    emitidaEm: emissao,
    naturezaOperacao: dados.naturezaOperacao,
    destinatarioNome: dados.destinatario.nome.slice(0, 200),
    destinatarioDocumento: dados.destinatario.documento,
    valor: totais.vNF,
    contingenciaMotivo: opcoes.contingencia?.justificativa ?? null,
    emitidaPorId: opcoes.usuarioId,
  };

  if (motor === "FOCUS") {
    const nota = reaproveitar
      ? await prisma.notaFiscal.update({ where: { id: reaproveitar.id }, data: { ...comum, xml: null } })
      : await prisma.notaFiscal.create({ data: { ...comum, empresaId: empresa.id, pedidoId, modelo: 55, serie, numero } });
    const ref = nota.focusRef ?? `pro-omie-${nota.id}`;
    await prisma.notaFiscal.update({ where: { id: nota.id }, data: { focusRef: ref } });
    const token = tokenFocus(empresa.id, config, ambiente);
    let r: RespostaNfeFocus;
    try {
      r = await emitirNaFocus(token, ambiente, ref, completos);
      for (let i = 0; i < 6 && r.status === "processando_autorizacao"; i++) {
        await esperar(2000);
        r = await consultarNaFocus(token, ambiente, ref);
      }
    } catch (e) {
      await prisma.notaFiscal.update({ where: { id: nota.id }, data: { xMotivo: mensagemDeErro(e).slice(0, 500) } });
      return { notaId: nota.id, status: "PROCESSANDO", mensagem: 'Sem resposta da Focus NFe. Use "Consultar situação".', numero, serie };
    }
    const status = await registrarFocus(nota.id, token, ambiente, r);
    const atual = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: nota.id }, select: { cStat: true, xMotivo: true } });
    return { notaId: nota.id, status, cStat: atual.cStat, mensagem: mensagemStatus(status, atual.cStat, atual.xMotivo, ambiente), numero, serie };
  }

  // SEFAZ direto: assina e grava antes de enviar
  const { material, agente } = await abrirSefaz(empresa.id);
  try {
    const { xml, id } = montarNfe(completos);
    const assinado = assinarElemento(xml, { tag: "infNFe", id, namespaceHerdado: NS_NFE, chavePem: material.chavePem, certificadoBase64: material.certificadoBase64 });
    const nota = reaproveitar
      ? await prisma.notaFiscal.update({ where: { id: reaproveitar.id }, data: { ...comum, xml: assinado, xmlAutorizado: null, protocolo: null } })
      : await prisma.notaFiscal.create({ data: { ...comum, xml: assinado, empresaId: empresa.id, pedidoId, modelo: 55, serie, numero } });
    if (pendente)
      await prisma.notaFiscal.update({
        where: { id: pendente.id },
        data: { xMotivo: `Sem retorno da SEFAZ-SP; o pedido foi emitido em contingência na nº ${numero}. Quando a SEFAZ-SP voltar, consulte esta nota: se tiver sido autorizada, cancele-a; se não, inutilize o número ${pendente.numero}.`.slice(0, 500) },
      });
    const urls = urlsPara(dados.emitente.endereco.uf, ambiente, tpEmis);
    let r: ResultadoAutorizacao;
    try {
      r = await autorizar(agente, urls, assinado);
      for (let i = 0; i < 3 && r.situacao === "PROCESSANDO" && r.recibo; i++) {
        await esperar(2500);
        r = await consultarRecibo(agente, urls, ambiente, r.recibo);
      }
      if (r.cStat === "204") r = await consultarProtocolo(agente, urls, ambiente, chave); // duplicidade = já autorizada antes
    } catch (e) {
      if (!(e instanceof ErroTransporte)) throw e;
      // sem resposta: descobre pela chave se a SEFAZ recebeu a nota
      try {
        await esperar(1500);
        const c = await consultarProtocolo(agente, urls, ambiente, chave);
        if (c.cStat === "217") {
          await prisma.notaFiscal.update({ where: { id: nota.id }, data: { status: "REJEITADA", cStat: "ERR", xMotivo: `SEFAZ indisponível: a nota não chegou (${e.message.slice(0, 200)}).` } });
          return {
            notaId: nota.id,
            status: "REJEITADA",
            cStat: "ERR",
            mensagem: tpEmis === 1 ? "A SEFAZ-SP não respondeu e a nota não chegou lá. Tente de novo em instantes ou emita em contingência (SVC-AN)." : "A contingência também não respondeu. Tente de novo em instantes.",
            numero,
            serie,
          };
        }
        r = c;
      } catch {
        await prisma.notaFiscal.update({ where: { id: nota.id }, data: { status: "PROCESSANDO", xMotivo: `Sem resposta da SEFAZ: ${e.message.slice(0, 200)}` } });
        return { notaId: nota.id, status: "PROCESSANDO", mensagem: 'A SEFAZ não respondeu. Use "Consultar situação" (ou a contingência, se a SEFAZ-SP seguir fora do ar).', numero, serie };
      }
    }
    const status = await registrarAutorizacao(nota.id, assinado, r);
    return { notaId: nota.id, status, cStat: r.cStat, mensagem: mensagemStatus(status, r.cStat, r.xMotivo, ambiente), numero, serie };
  } finally {
    agente.destroy();
  }
}

async function registrarFocus(notaId: string, token: string, ambiente: 1 | 2, r: RespostaNfeFocus): Promise<StatusNota> {
  const base = { cStat: r.status_sefaz ?? null, xMotivo: (r.mensagem_sefaz ?? r.erros?.map((e) => e.mensagem).join("; ") ?? r.status ?? "").slice(0, 500) };
  if (r.status === "autorizado") {
    const xml = r.caminho_xml_nota_fiscal ? await baixarXmlFocus(token, ambiente, r.caminho_xml_nota_fiscal) : null;
    await prisma.notaFiscal.update({
      where: { id: notaId },
      data: { ...base, status: "AUTORIZADA", chave: (r.chave_nfe ?? "").replace(/^NFe/, "") || null, protocolo: r.protocolo ?? null, autorizadaEm: new Date(), xmlAutorizado: xml },
    });
    return "AUTORIZADA";
  }
  if (r.status === "cancelado") {
    await prisma.notaFiscal.update({ where: { id: notaId }, data: { ...base, status: "CANCELADA" } });
    return "CANCELADA";
  }
  if (r.status === "denegado") {
    await prisma.notaFiscal.update({ where: { id: notaId }, data: { ...base, status: "DENEGADA" } });
    return "DENEGADA";
  }
  if (r.status === "erro_autorizacao" || r.status === "nao_encontrada") {
    await prisma.notaFiscal.update({ where: { id: notaId }, data: { ...base, status: "REJEITADA" } });
    return "REJEITADA";
  }
  await prisma.notaFiscal.update({ where: { id: notaId }, data: { ...base, status: "PROCESSANDO" } });
  return "PROCESSANDO";
}

// ───────────────────────── consulta, cancelamento, carta de correção ─────────────────────────

async function notaComEmpresa(notaId: string, escopoIds: string[]) {
  const nota = await prisma.notaFiscal.findFirst({ where: { id: notaId, empresaId: { in: escopoIds } }, include: { empresa: { select: { id: true, cnpj: true, uf: true } } } });
  if (!nota) throw new ErroAcao("Nota não encontrada nesta empresa.");
  const config = await prisma.configuracaoFiscal.findUnique({ where: { empresaId: nota.empresaId } });
  return { nota, config, ambiente: (nota.ambiente === 1 ? 1 : 2) as 1 | 2 };
}

export async function consultarSituacaoNota(notaId: string, escopoIds: string[]): Promise<ResultadoEmissao> {
  const { nota, config, ambiente } = await notaComEmpresa(notaId, escopoIds);
  const fim = (status: StatusNota, cStat?: string | null, xMotivo?: string | null): ResultadoEmissao => ({
    notaId,
    status,
    cStat,
    mensagem: mensagemStatus(status, cStat, xMotivo, ambiente),
    numero: nota.numero,
    serie: nota.serie,
  });
  if (nota.motor === "FOCUS") {
    if (!config || !nota.focusRef) throw new ErroAcao("Nota sem referência na Focus NFe.");
    const token = tokenFocus(nota.empresaId, config, ambiente);
    const status = await registrarFocus(notaId, token, ambiente, await consultarNaFocus(token, ambiente, nota.focusRef));
    const atual = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaId }, select: { cStat: true, xMotivo: true } });
    return fim(status, atual.cStat, atual.xMotivo);
  }
  if (!nota.chave || !nota.xml) throw new ErroAcao("Nota sem XML assinado para consultar.");
  const { agente } = await abrirSefaz(nota.empresaId);
  try {
    const urls = urlsPara(nota.empresa.uf ?? "SP", ambiente, nota.tpEmis);
    const c = await consultarProtocolo(agente, urls, ambiente, nota.chave);
    if (c.cancelada) {
      await prisma.notaFiscal.update({
        where: { id: notaId },
        data: { status: "CANCELADA", cStat: c.cStat, xMotivo: c.xMotivo, canceladaEm: c.cancelada.em ?? new Date(), cancelamentoProtocolo: c.cancelada.protocolo ?? null, ...(c.protNFe && !nota.xmlAutorizado ? { xmlAutorizado: montarNfeProc(nota.xml, c.protNFe), protocolo: c.protocolo ?? null } : {}) },
      });
      return fim("CANCELADA", c.cStat, c.xMotivo);
    }
    const outra = nota.pedidoId ? await prisma.notaFiscal.findFirst({ where: { pedidoId: nota.pedidoId, id: { not: notaId }, status: "AUTORIZADA" }, select: { numero: true } }) : null;
    if (c.cStat === "217") {
      const xMotivo = outra
        ? `A SEFAZ não tem esta nota e o pedido já saiu na NF-e nº ${outra.numero}: inutilize o número ${nota.numero} (Configurações › Empresas e filiais).`
        : "A SEFAZ não tem esta nota: pode corrigir e reenviar com o mesmo número.";
      await prisma.notaFiscal.update({ where: { id: notaId }, data: { status: "REJEITADA", cStat: "217", xMotivo } });
      return { ...fim("REJEITADA", "217", "NF-e não consta na base da SEFAZ"), ...(outra ? { mensagem: xMotivo } : {}) };
    }
    const status = await registrarAutorizacao(notaId, nota.xml, c);
    if (status === "AUTORIZADA" && outra)
      return { ...fim(status, c.cStat, c.xMotivo), mensagem: `Esta nota foi autorizada, mas o pedido também tem a NF-e nº ${outra.numero} autorizada. Cancele a que não vale (prazo de 24 horas da autorização).` };
    return fim(status, c.cStat, c.xMotivo);
  } catch (e) {
    if (e instanceof ErroTransporte) throw new ErroAcao(`A SEFAZ não respondeu: ${mensagemDeErro(e)}`);
    throw e;
  } finally {
    agente.destroy();
  }
}

/** Nota da contingência ainda não transferida para a SEFAZ-SP: os eventos só valem depois da transferência. */
function dicaContingencia(tpEmis: number, cStat: string) {
  return tpEmis === 6 && cStat === "217" ? ". A nota foi autorizada na contingência (SVC-AN) e a SEFAZ-SP ainda não a recebeu; tente de novo mais tarde." : "";
}

export async function cancelarNota(notaId: string, justificativa: string, opcoes: { escopoIds: string[]; usuarioId: string }) {
  const { nota, config, ambiente } = await notaComEmpresa(notaId, opcoes.escopoIds);
  if (nota.status !== "AUTORIZADA") throw new ErroAcao("Só nota autorizada pode ser cancelada.");
  if (Date.now() - (nota.autorizadaEm ?? nota.emitidaEm).getTime() > 24 * 3_600_000)
    throw new ErroAcao("O prazo de cancelamento (24 horas da autorização) passou. Fale com o contador sobre a nota de devolução ou estorno.");
  let ok: boolean;
  let cStat: string;
  let xMotivo: string;
  let protocolo: string | undefined;
  let procEvento: string | undefined;
  if (nota.motor === "FOCUS") {
    if (!config || !nota.focusRef) throw new ErroAcao("Nota sem referência na Focus NFe.");
    const r = await cancelarNaFocus(tokenFocus(nota.empresaId, config, ambiente), ambiente, nota.focusRef, justificativa);
    ok = r.status === "cancelado";
    cStat = r.status_sefaz ?? (ok ? "135" : "ERR");
    xMotivo = r.mensagem_sefaz ?? r.status ?? "";
  } else {
    if (!nota.chave || !nota.protocolo) throw new ErroAcao("Nota sem chave ou protocolo de autorização.");
    const { agente, material } = await abrirSefaz(nota.empresaId);
    try {
      // o cancelamento vai sempre para a autorizadora do estado (a contingência compartilha as notas com ela)
      const urls = urlsPara(nota.empresa.uf ?? "SP", ambiente, 1);
      const r = await enviarEventoNfe(agente, material, urls, {
        evento: { tipo: "CANCELAMENTO", protocolo: nota.protocolo, justificativa },
        cOrgao: CODIGO_UF[(nota.empresa.uf ?? "SP").toUpperCase()] ?? "35",
        ambiente,
        cnpj: nota.empresa.cnpj,
        chave: nota.chave,
      });
      ({ ok, cStat, xMotivo, protocolo, procEvento } = r);
    } catch (e) {
      if (e instanceof ErroTransporte) throw new ErroAcao(`A SEFAZ não respondeu: ${mensagemDeErro(e)}. Tente de novo.`);
      throw e;
    } finally {
      agente.destroy();
    }
  }
  await prisma.eventoNotaFiscal.create({
    data: { notaId, tipoEvento: "110111", sequencia: 1, detalhe: justificativa, ok, cStat, xMotivo: xMotivo.slice(0, 500), protocolo: protocolo ?? null, registradoEm: ok ? new Date() : null, xml: procEvento ?? null, usuarioId: opcoes.usuarioId },
  });
  if (!ok) throw new ErroAcao(`A SEFAZ recusou o cancelamento: ${cStat} ${xMotivo}${dicaContingencia(nota.tpEmis, cStat)}`);
  await prisma.notaFiscal.update({ where: { id: notaId }, data: { status: "CANCELADA", canceladaEm: new Date(), cancelamentoProtocolo: protocolo ?? null, cancelamentoJustificativa: justificativa } });
  return { numero: nota.numero, serie: nota.serie, protocolo };
}

export async function cartaDeCorrecao(notaId: string, correcao: string, opcoes: { escopoIds: string[]; usuarioId: string }) {
  const { nota, config, ambiente } = await notaComEmpresa(notaId, opcoes.escopoIds);
  if (nota.status !== "AUTORIZADA") throw new ErroAcao("Carta de correção só vale para nota autorizada.");
  const feitas = await prisma.eventoNotaFiscal.count({ where: { notaId, tipoEvento: "110110", ok: true } });
  if (feitas >= 20) throw new ErroAcao("Esta nota já tem 20 cartas de correção (o limite da SEFAZ).");
  const sequencia = feitas + 1;
  let ok: boolean;
  let cStat: string;
  let xMotivo: string;
  let protocolo: string | undefined;
  let procEvento: string | undefined;
  if (nota.motor === "FOCUS") {
    if (!config || !nota.focusRef) throw new ErroAcao("Nota sem referência na Focus NFe.");
    const r = await corrigirNaFocus(tokenFocus(nota.empresaId, config, ambiente), ambiente, nota.focusRef, correcao);
    ok = r.status === "autorizado";
    cStat = r.status_sefaz ?? (ok ? "135" : "ERR");
    xMotivo = r.mensagem_sefaz ?? r.status ?? "";
  } else {
    if (!nota.chave) throw new ErroAcao("Nota sem chave de acesso.");
    const { agente, material } = await abrirSefaz(nota.empresaId);
    try {
      const urls = urlsPara(nota.empresa.uf ?? "SP", ambiente, 1);
      const r = await enviarEventoNfe(agente, material, urls, {
        evento: { tipo: "CCE", sequencia, correcao },
        cOrgao: CODIGO_UF[(nota.empresa.uf ?? "SP").toUpperCase()] ?? "35",
        ambiente,
        cnpj: nota.empresa.cnpj,
        chave: nota.chave,
      });
      ({ ok, cStat, xMotivo, protocolo, procEvento } = r);
    } catch (e) {
      if (e instanceof ErroTransporte) throw new ErroAcao(`A SEFAZ não respondeu: ${mensagemDeErro(e)}. Tente de novo.`);
      throw e;
    } finally {
      agente.destroy();
    }
  }
  await prisma.eventoNotaFiscal.create({
    data: { notaId, tipoEvento: "110110", sequencia, detalhe: correcao, ok, cStat, xMotivo: xMotivo.slice(0, 500), protocolo: protocolo ?? null, registradoEm: ok ? new Date() : null, xml: procEvento ?? null, usuarioId: opcoes.usuarioId },
  });
  if (!ok) throw new ErroAcao(`A SEFAZ recusou a carta de correção: ${cStat} ${xMotivo}${dicaContingencia(nota.tpEmis, cStat)}`);
  return { numero: nota.numero, sequencia, protocolo };
}

export async function inutilizarFaixa(empresaId: string, p: { serie: number; inicio: number; fim: number; justificativa: string; usuarioId: string }) {
  const [empresa, config] = await Promise.all([
    prisma.empresa.findUniqueOrThrow({ where: { id: empresaId }, select: { cnpj: true, uf: true } }),
    prisma.configuracaoFiscal.findUnique({ where: { empresaId } }),
  ]);
  const ambiente = (config?.nfeAmbiente === 1 ? 1 : 2) as 1 | 2;
  if (p.fim < p.inicio) throw new ErroAcao("O número final precisa ser maior ou igual ao inicial.");
  if (p.fim - p.inicio > 999) throw new ErroAcao("Inutilize no máximo 1.000 números por vez.");
  const usadas = await prisma.notaFiscal.count({
    where: { empresaId, ambiente, serie: p.serie, numero: { gte: p.inicio, lte: p.fim }, status: { in: ["AUTORIZADA", "CANCELADA", "DENEGADA", "PROCESSANDO"] } },
  });
  if (usadas) throw new ErroAcao("A faixa inclui número de nota autorizada, cancelada, denegada ou em processamento.");
  const { agente, material } = await abrirSefaz(empresaId);
  let r;
  try {
    r = await inutilizar(agente, material, urlsPara(empresa.uf ?? "SP", ambiente, 1), {
      cUF: CODIGO_UF[(empresa.uf ?? "SP").toUpperCase()] ?? "35",
      ambiente,
      cnpj: empresa.cnpj,
      ano: new Date().getFullYear(),
      serie: p.serie,
      inicio: p.inicio,
      fim: p.fim,
      justificativa: p.justificativa,
    });
  } catch (e) {
    if (e instanceof ErroTransporte) throw new ErroAcao(`A SEFAZ não respondeu: ${mensagemDeErro(e)}. Tente de novo.`);
    throw e;
  } finally {
    agente.destroy();
  }
  await prisma.inutilizacaoNfe.create({
    data: { empresaId, ambiente, serie: p.serie, numeroInicial: p.inicio, numeroFinal: p.fim, justificativa: p.justificativa, ok: r.ok, cStat: r.cStat, xMotivo: r.xMotivo.slice(0, 500), protocolo: r.protocolo ?? null, xml: r.xml ?? null, usuarioId: p.usuarioId },
  });
  if (!r.ok) throw new ErroAcao(`A SEFAZ recusou a inutilização: ${r.cStat} ${r.xMotivo}`);
  // se a faixa alcança o próximo número, ele pula para depois dela
  await prisma.configuracaoFiscal.updateMany({ where: { empresaId, nfeSerie: p.serie, nfeProximoNumero: { gte: p.inicio, lte: p.fim } }, data: { nfeProximoNumero: p.fim + 1 } });
  return { protocolo: r.protocolo, ambiente };
}
