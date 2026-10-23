// Orquestração da NFS-e nacional: numeração da DPS, montagem, assinatura, envio, recuperação e cancelamento. Só servidor.
// Regras: o número da DPS é reservado de forma atômica; DPS recusada guarda o número para o reenvio; a DPS assinada é
// gravada antes do envio e, sem resposta, a situação é descoberta por GET /dps/{id} antes de qualquer reenvio.
import "server-only";
import { prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { mensagemDeErro } from "../sefaz/conexao";
import { assinarElemento } from "../sefaz/assinatura";
import { ErroTransporte } from "../nfe/sefaz";
import { abrirSefaz, tokenFocus } from "../nfe/emissao";
import type { StatusNota } from "../nfe/tipos";
import { baixarXmlNfsenFocus, cancelarNfsenNaFocus, consultarNfsenNaFocus, emitirNfsenNaFocus, type RespostaNfsenFocus } from "../focus/nfsen";
import { prepararNfse } from "./dados";
import { layoutDps, montarDps, montarPedidoCancelamento, NS_NFSE, type DadosDps } from "./montagem";
import { consultarDps, consultarEventoCancelamento, consultarNfsePorChave, convenioMunicipio, enviarDps, mensagemErros, registrarEvento, type NfseLida } from "./sefin";

export type ResultadoNfse = { notaId: string; status: StatusNota; codigo?: string | null; mensagem: string; numero: number; numeroNfse?: string | null };

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mensagemStatus(status: StatusNota, codigo: string | null | undefined, mensagem: string | null | undefined, ambiente: number, numeroNfse?: string | null) {
  const amb = ambiente === 2 ? " (produção restrita, sem valor fiscal)" : "";
  if (status === "AUTORIZADA") return `NFS-e nº ${numeroNfse ?? ""} gerada${amb}.`.replace("nº  ", "");
  if (status === "CANCELADA") return `NFS-e cancelada${amb}.`;
  if (status === "PROCESSANDO") return `Sem resposta definitiva do emissor nacional (${mensagem ?? "aguardando"}). Use "Consultar situação" antes de reenviar.`;
  return `O emissor nacional recusou a DPS: ${codigo ?? ""} ${mensagem ?? ""}`.trim();
}

async function registrarAutorizada(notaId: string, nfse: NfseLida, idDps?: string | null) {
  await prisma.notaServico.update({
    where: { id: notaId },
    data: { status: "AUTORIZADA", chave: nfse.chave, numeroNfse: nfse.numero, codigo: nfse.cStat, mensagem: "NFS-e gerada", autorizadaEm: nfse.processadaEm ?? new Date(), xmlAutorizado: nfse.xmlNfse, ...(idDps ? { idDps } : {}) },
  });
}

// ───────────────────────── emissão ─────────────────────────

export async function emitirNfseDoPedido(pedidoId: string, opcoes: { escopoIds: string[]; usuarioId: string }): Promise<ResultadoNfse[]> {
  const prep = await prepararNfse(pedidoId, opcoes.escopoIds);
  if (!prep) throw new ErroAcao("Pedido não encontrado nesta empresa.");
  if (prep.problemas.length) throw new ErroAcao(`Antes de emitir: ${prep.problemas.map((p) => p.mensagem).join(" ")}`);
  const { empresa, config, motor, ambiente } = prep;
  if (!config) throw new ErroAcao("A emissão de NFS-e não está configurada.");
  const anteriores = await prisma.notaServico.findMany({ where: { pedidoId }, orderBy: { createdAt: "desc" } });
  if (anteriores.some((n) => n.status === "PROCESSANDO")) throw new ErroAcao('Há uma NFS-e deste pedido em processamento. Use "Consultar situação" nela antes de emitir de novo.');
  const pendentes = prep.grupos.filter((g) => !anteriores.some((n) => n.codigoTributacaoNacional === g.codigoTributacaoNacional && n.status === "AUTORIZADA"));
  if (!pendentes.length) throw new ErroAcao("Este pedido já tem NFS-e gerada para todos os serviços. Para emitir outra, cancele a atual.");

  const resultados: ResultadoNfse[] = [];
  const sefaz = motor === "SEFAZ" ? await abrirSefaz(empresa.id) : null;
  try {
    for (const grupo of pendentes) {
      const reaproveitar = anteriores.find((n) => n.codigoTributacaoNacional === grupo.codigoTributacaoNacional && n.status === "REJEITADA" && n.ambiente === ambiente && n.motor === motor) ?? null;
      let numero: number;
      let serie: number;
      if (reaproveitar) ({ numero, serie } = reaproveitar);
      else {
        const r = await prisma.configuracaoFiscal.update({ where: { empresaId: empresa.id }, data: { nfseProximoNumero: { increment: 1 } }, select: { nfseProximoNumero: true, nfseSerie: true } });
        numero = r.nfseProximoNumero - 1;
        serie = r.nfseSerie;
      }
      const emissao = new Date(Date.now() - 90_000); // relógio adiantado não gera "data futura" (E0008)
      const dados: DadosDps = { ...grupo.dados, serie, numero, emissao };
      const comum = {
        ambiente,
        motor,
        status: "PROCESSANDO" as const,
        codigo: null,
        mensagem: null,
        competencia: dados.competencia,
        emitidaEm: emissao,
        tomadorNome: dados.tomador?.nome.slice(0, 200) ?? "",
        tomadorDocumento: dados.tomador?.documento ?? null,
        codigoTributacaoNacional: grupo.codigoTributacaoNacional,
        descricao: dados.servico.descricao.slice(0, 2000),
        valor: dados.valores.vServ,
        emitidaPorId: opcoes.usuarioId,
        chave: null,
        numeroNfse: null,
        xmlAutorizado: null,
        autorizadaEm: null,
      };
      if (motor === "FOCUS") {
        const nota = reaproveitar
          ? await prisma.notaServico.update({ where: { id: reaproveitar.id }, data: { ...comum, xml: null } })
          : await prisma.notaServico.create({ data: { ...comum, empresaId: empresa.id, pedidoId, serie, numero } });
        const ref = nota.focusRef ?? `pro-omie-nfse-${nota.id}`;
        await prisma.notaServico.update({ where: { id: nota.id }, data: { focusRef: ref } });
        const token = tokenFocus(empresa.id, config, ambiente);
        let r: RespostaNfsenFocus;
        try {
          r = await emitirNfsenNaFocus(token, ambiente, ref, dados);
          for (let i = 0; i < 6 && r.status === "processando_autorizacao"; i++) {
            await esperar(2000);
            r = await consultarNfsenNaFocus(token, ambiente, ref);
          }
        } catch (e) {
          await prisma.notaServico.update({ where: { id: nota.id }, data: { mensagem: mensagemDeErro(e).slice(0, 500) } });
          resultados.push({ notaId: nota.id, status: "PROCESSANDO", mensagem: 'Sem resposta da Focus NFe. Use "Consultar situação".', numero });
          continue;
        }
        const status = await registrarFocus(nota.id, token, ambiente, r);
        const atual = await prisma.notaServico.findUniqueOrThrow({ where: { id: nota.id }, select: { codigo: true, mensagem: true, numeroNfse: true } });
        resultados.push({ notaId: nota.id, status, codigo: atual.codigo, mensagem: mensagemStatus(status, atual.codigo, atual.mensagem, ambiente, atual.numeroNfse), numero, numeroNfse: atual.numeroNfse });
        continue;
      }

      // emissor nacional direto: assina e grava antes de enviar
      const { xml, id } = montarDps(dados, layoutDps(ambiente, emissao));
      const assinado = assinarElemento(xml, { tag: "infDPS", id, namespaceHerdado: NS_NFSE, chavePem: sefaz!.material.chavePem, certificadoBase64: sefaz!.material.certificadoBase64 });
      const nota = reaproveitar
        ? await prisma.notaServico.update({ where: { id: reaproveitar.id }, data: { ...comum, xml: assinado, idDps: id } })
        : await prisma.notaServico.create({ data: { ...comum, xml: assinado, idDps: id, empresaId: empresa.id, pedidoId, serie, numero } });
      try {
        const r = await enviarDps(sefaz!.agente, ambiente, assinado);
        if (r.situacao === "AUTORIZADA") {
          await registrarAutorizada(nota.id, r.nfse, r.idDps || id);
          resultados.push({ notaId: nota.id, status: "AUTORIZADA", codigo: r.nfse.cStat, mensagem: mensagemStatus("AUTORIZADA", null, null, ambiente, r.nfse.numero), numero, numeroNfse: r.nfse.numero });
        } else {
          const codigo = r.erros[0]?.codigo ?? String(r.http);
          const mensagem = mensagemErros(r.erros).slice(0, 500);
          await prisma.notaServico.update({ where: { id: nota.id }, data: { status: "REJEITADA", codigo, mensagem } });
          resultados.push({ notaId: nota.id, status: "REJEITADA", codigo, mensagem: mensagemStatus("REJEITADA", codigo, mensagem, ambiente), numero });
        }
      } catch (e) {
        if (!(e instanceof ErroTransporte)) throw e;
        // sem resposta: a DPS chegou? GET /dps/{id} devolve a chave da NFS-e gerada
        try {
          await esperar(1500);
          const chave = await consultarDps(sefaz!.agente, ambiente, id);
          const nfse = chave ? await consultarNfsePorChave(sefaz!.agente, ambiente, chave) : null;
          if (nfse) {
            await registrarAutorizada(nota.id, nfse, id);
            resultados.push({ notaId: nota.id, status: "AUTORIZADA", codigo: nfse.cStat, mensagem: mensagemStatus("AUTORIZADA", null, null, ambiente, nfse.numero), numero, numeroNfse: nfse.numero });
          } else {
            const mensagem = `Emissor nacional indisponível: a DPS não chegou (${e.message.slice(0, 200)}).`;
            await prisma.notaServico.update({ where: { id: nota.id }, data: { status: "REJEITADA", codigo: "ERR", mensagem } });
            resultados.push({ notaId: nota.id, status: "REJEITADA", codigo: "ERR", mensagem: "O emissor nacional não respondeu e a DPS não chegou lá. Tente de novo em instantes.", numero });
          }
        } catch {
          await prisma.notaServico.update({ where: { id: nota.id }, data: { status: "PROCESSANDO", mensagem: `Sem resposta do emissor nacional: ${e.message.slice(0, 200)}` } });
          resultados.push({ notaId: nota.id, status: "PROCESSANDO", mensagem: 'O emissor nacional não respondeu. Use "Consultar situação" antes de emitir de novo.', numero });
        }
      }
    }
  } finally {
    sefaz?.agente.destroy();
  }
  return resultados;
}

async function registrarFocus(notaId: string, token: string, ambiente: 1 | 2, r: RespostaNfsenFocus): Promise<StatusNota> {
  const base = { codigo: r.status_sefaz ?? null, mensagem: (r.mensagem_sefaz ?? r.erros?.map((e) => e.mensagem).join("; ") ?? r.mensagem ?? r.status ?? "").slice(0, 500) };
  if (r.status === "autorizado") {
    const xml = r.caminho_xml_nota_fiscal ? await baixarXmlNfsenFocus(token, ambiente, r.caminho_xml_nota_fiscal) : null;
    const chave = (r.chave ?? r.chave_nfse ?? "").replace(/^NFS/, "") || null;
    await prisma.notaServico.update({
      where: { id: notaId },
      data: { ...base, status: "AUTORIZADA", mensagem: "NFS-e gerada", chave, numeroNfse: r.numero ?? null, autorizadaEm: new Date(), xmlAutorizado: xml },
    });
    return "AUTORIZADA";
  }
  if (r.status === "cancelado") {
    await prisma.notaServico.update({ where: { id: notaId }, data: { ...base, status: "CANCELADA", canceladaEm: new Date() } });
    return "CANCELADA";
  }
  if (r.status === "erro_autorizacao" || r.status === "nao_encontrada") {
    await prisma.notaServico.update({ where: { id: notaId }, data: { ...base, status: "REJEITADA" } });
    return "REJEITADA";
  }
  await prisma.notaServico.update({ where: { id: notaId }, data: { ...base, status: "PROCESSANDO" } });
  return "PROCESSANDO";
}

// ───────────────────────── consulta e cancelamento ─────────────────────────

async function notaComEmpresa(notaId: string, escopoIds: string[]) {
  const nota = await prisma.notaServico.findFirst({ where: { id: notaId, empresaId: { in: escopoIds } }, include: { empresa: { select: { id: true, cnpj: true, codigoMunicipio: true } } } });
  if (!nota) throw new ErroAcao("Nota não encontrada nesta empresa.");
  const config = await prisma.configuracaoFiscal.findUnique({ where: { empresaId: nota.empresaId } });
  return { nota, config, ambiente: (nota.ambiente === 1 ? 1 : 2) as 1 | 2 };
}

export async function consultarSituacaoNfse(notaId: string, escopoIds: string[]): Promise<ResultadoNfse> {
  const { nota, config, ambiente } = await notaComEmpresa(notaId, escopoIds);
  const fim = (status: StatusNota, codigo?: string | null, mensagem?: string | null, numeroNfse?: string | null): ResultadoNfse => ({ notaId, status, codigo, mensagem: mensagemStatus(status, codigo, mensagem, ambiente, numeroNfse ?? nota.numeroNfse), numero: nota.numero, numeroNfse: numeroNfse ?? nota.numeroNfse });
  if (nota.motor === "FOCUS") {
    if (!config || !nota.focusRef) throw new ErroAcao("Nota sem referência na Focus NFe.");
    const token = tokenFocus(nota.empresaId, config, ambiente);
    const status = await registrarFocus(notaId, token, ambiente, await consultarNfsenNaFocus(token, ambiente, nota.focusRef));
    const atual = await prisma.notaServico.findUniqueOrThrow({ where: { id: notaId }, select: { codigo: true, mensagem: true, numeroNfse: true } });
    return fim(status, atual.codigo, atual.mensagem, atual.numeroNfse);
  }
  if (!nota.idDps) throw new ErroAcao("Nota sem DPS para consultar.");
  const { agente } = await abrirSefaz(nota.empresaId);
  try {
    const chave = nota.chave ?? (await consultarDps(agente, ambiente, nota.idDps));
    if (!chave) {
      const mensagem = "O emissor nacional não tem esta DPS: pode corrigir e reenviar com o mesmo número.";
      await prisma.notaServico.update({ where: { id: notaId }, data: { status: "REJEITADA", codigo: "404", mensagem } });
      return { ...fim("REJEITADA", "404", mensagem), mensagem };
    }
    const cancelamento = await consultarEventoCancelamento(agente, ambiente, chave);
    if (cancelamento) {
      await prisma.notaServico.update({ where: { id: notaId }, data: { status: "CANCELADA", chave, canceladaEm: nota.canceladaEm ?? new Date(), cancelamentoXml: nota.cancelamentoXml ?? cancelamento } });
      return fim("CANCELADA");
    }
    const nfse = await consultarNfsePorChave(agente, ambiente, chave);
    if (!nfse) {
      await prisma.notaServico.update({ where: { id: notaId }, data: { status: "REJEITADA", codigo: "404", mensagem: "A NFS-e não consta no emissor nacional." } });
      return fim("REJEITADA", "404", "NFS-e não consta no emissor nacional");
    }
    await registrarAutorizada(notaId, nfse);
    return fim("AUTORIZADA", nfse.cStat, null, nfse.numero);
  } catch (e) {
    if (e instanceof ErroTransporte) throw new ErroAcao(`O emissor nacional não respondeu: ${mensagemDeErro(e)}`);
    throw e;
  } finally {
    agente.destroy();
  }
}

export async function cancelarNfse(notaId: string, p: { cMotivo: "1" | "2" | "9"; xMotivo: string }, opcoes: { escopoIds: string[]; usuarioId: string }) {
  const { nota, config, ambiente } = await notaComEmpresa(notaId, opcoes.escopoIds);
  if (nota.status !== "AUTORIZADA") throw new ErroAcao("Só NFS-e gerada pode ser cancelada.");
  if (nota.motor === "FOCUS") {
    if (!config || !nota.focusRef) throw new ErroAcao("Nota sem referência na Focus NFe.");
    const r = await cancelarNfsenNaFocus(tokenFocus(nota.empresaId, config, ambiente), ambiente, nota.focusRef, p.xMotivo);
    if (r.status !== "cancelado") throw new ErroAcao(`A Focus NFe recusou o cancelamento: ${r.status_sefaz ?? ""} ${r.mensagem_sefaz ?? r.mensagem ?? r.erros?.map((e) => e.mensagem).join("; ") ?? ""}`.trim());
    await prisma.notaServico.update({ where: { id: notaId }, data: { status: "CANCELADA", canceladaEm: new Date(), cancelamentoCodigo: p.cMotivo, cancelamentoMotivo: p.xMotivo } });
    return { numero: nota.numero, numeroNfse: nota.numeroNfse };
  }
  if (!nota.chave) throw new ErroAcao("Nota sem chave de acesso.");
  const { agente, material } = await abrirSefaz(nota.empresaId);
  try {
    const { xml, id } = montarPedidoCancelamento({ ambiente, chave: nota.chave, cnpjAutor: nota.empresa.cnpj, cMotivo: p.cMotivo, xMotivo: p.xMotivo });
    const assinado = assinarElemento(xml, { tag: "infPedReg", id, namespaceHerdado: NS_NFSE, chavePem: material.chavePem, certificadoBase64: material.certificadoBase64 });
    const r = await registrarEvento(agente, ambiente, nota.chave, assinado);
    if (!r.ok) {
      const texto = mensagemErros(r.erros);
      throw new ErroAcao(`O emissor nacional recusou o cancelamento: ${texto}${/E0822/.test(texto) ? ". O prazo de cancelamento é definido pelo município; fale com o contador sobre a substituição ou o estorno." : ""}`);
    }
    await prisma.notaServico.update({ where: { id: notaId }, data: { status: "CANCELADA", canceladaEm: new Date(), cancelamentoCodigo: p.cMotivo, cancelamentoMotivo: p.xMotivo, cancelamentoXml: r.xmlEvento } });
    return { numero: nota.numero, numeroNfse: nota.numeroNfse };
  } catch (e) {
    if (e instanceof ErroTransporte) throw new ErroAcao(`O emissor nacional não respondeu: ${mensagemDeErro(e)}. Tente de novo.`);
    throw e;
  } finally {
    agente.destroy();
  }
}

/** Confere no ADN se o município do estabelecimento está no Emissor Nacional e guarda o resultado. */
export async function conferirMunicipio(empresaId: string) {
  const [empresa, config] = await Promise.all([
    prisma.empresa.findUniqueOrThrow({ where: { id: empresaId }, select: { codigoMunicipio: true, cidade: true } }),
    prisma.configuracaoFiscal.findUnique({ where: { empresaId }, select: { nfseAmbiente: true } }),
  ]);
  const ibge = (empresa.codigoMunicipio ?? "").replace(/\D/g, "");
  if (ibge.length !== 7) throw new ErroAcao("Cadastre o município (código IBGE) da empresa antes de conferir.");
  const ambiente = (config?.nfseAmbiente === 1 ? 1 : 2) as 1 | 2;
  const { agente } = await abrirSefaz(empresaId);
  try {
    const c = await convenioMunicipio(agente, ambiente, ibge);
    if (c.aderenteEmissorNacional === null) throw new ErroAcao(`O ADN não informou a adesão do município: ${c.mensagem ?? "resposta sem parâmetros"}.`);
    await prisma.configuracaoFiscal.upsert({
      where: { empresaId },
      create: { empresaId, nfseMunicipioAderente: c.aderenteEmissorNacional, nfseMunicipioConferidoEm: new Date() },
      update: { nfseMunicipioAderente: c.aderenteEmissorNacional, nfseMunicipioConferidoEm: new Date() },
    });
    return { aderente: c.aderenteEmissorNacional, ambienteNacional: c.aderenteAmbienteNacional, cidade: empresa.cidade ?? ibge, ambiente };
  } catch (e) {
    if (e instanceof ErroTransporte) throw new ErroAcao(`O ADN não respondeu: ${mensagemDeErro(e)}`);
    throw e;
  } finally {
    agente.destroy();
  }
}
