// Orquestração da captação de notas recebidas. Só servidor.
//
// Regras (do HUBCLONE, que já roda isso em produção):
// - Uma execução por CNPJ (trava no banco, com validade): consulta paralela faz a SEFAZ bloquear o CNPJ (656).
// - Depois de "nenhum documento novo" (137) ou de chegar ao fim (ultNSU = maxNSU), e depois de 656, só consultar de novo
//   1 hora depois — a guarda é local, sem nem tentar a SEFAZ antes do prazo.
// - Cursor salvo página a página, e só se todos os documentos da página foram gravados (senão a SEFAZ não entrega de novo).
// - Teto de páginas e de tempo por execução; o que sobrar fica para a próxima.
import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { certificadoParaEmissao, cifrar, decifrar } from "@/modules/configuracoes/certificado";
import type { MotorCaptacao } from "./motor";
import { ESPERA_SEFAZ_MS } from "./motor";
import { criarMotorSefaz } from "./sefaz/motor";
import { mensagemDeErro } from "./sefaz/conexao";
import { criarMotorFocus } from "./focus/motor";
import { gravarDocumentos } from "./gravacao";
import type { Motor, ResultadoManifestacao, TipoDoc, TipoManifestacao } from "./tipos";
import { classificarStatus, ROTULO_TIPO_DOC } from "./tipos";

const TRAVA_MS = 15 * 60_000;
const MAX_PAGINAS = 20;
const MAX_CIENCIAS = 20;

// ───────────────────────── tokens da Focus (cifrados como o certificado) ─────────────────────────

const contextoToken = (empresaId: string, ambiente: 1 | 2) => `pro-omie:focus:${empresaId}:${ambiente === 1 ? "producao" : "homologacao"}`;
export const cifrarTokenFocus = (empresaId: string, ambiente: 1 | 2, token: string) => new Uint8Array(cifrar(Buffer.from(token, "utf8"), contextoToken(empresaId, ambiente)));
export const decifrarTokenFocus = (empresaId: string, ambiente: 1 | 2, pacote: Uint8Array) => decifrar(Buffer.from(pacote), contextoToken(empresaId, ambiente)).toString("utf8");

// ───────────────────────── motor do estabelecimento ─────────────────────────

type Estabelecimento = { id: string; cnpj: string; uf: string | null };
type Config = { motor: Motor; ambiente: number; focusTokenProducao: Uint8Array | null; focusTokenHomologacao: Uint8Array | null };

export async function abrirMotor(empresa: Estabelecimento, config: Config): Promise<MotorCaptacao> {
  const ambiente = (config.ambiente === 2 ? 2 : 1) as 1 | 2;
  if (config.motor === "FOCUS") {
    const pacote = ambiente === 1 ? config.focusTokenProducao : config.focusTokenHomologacao;
    if (!pacote) throw new Error("Este estabelecimento ainda não foi ativado na Focus NFe. Use \"Ativar na Focus\" em Configurações › Empresas e filiais.");
    return criarMotorFocus({ cnpj: empresa.cnpj, ambiente, token: decifrarTokenFocus(empresa.id, ambiente, pacote) });
  }
  const cert = await certificadoParaEmissao(empresa.id);
  if (!cert) throw new Error("Sem certificado digital A1. Envie o certificado em Configurações › Empresas e filiais.");
  if (cert.registro.validoAte < new Date()) throw new Error("O certificado digital A1 venceu. Envie o certificado renovado.");
  return criarMotorSefaz({ cnpj: empresa.cnpj, uf: empresa.uf, ambiente, pfx: cert.pfx, senha: cert.senha });
}

// ───────────────────────── trava por CNPJ ─────────────────────────

async function travar(empresaId: string): Promise<string | null> {
  const token = randomUUID();
  const agora = new Date();
  const r = await prisma.configuracaoFiscal.updateMany({
    where: { empresaId, OR: [{ travaAte: null }, { travaAte: { lt: agora } }] },
    data: { travaToken: token, travaAte: new Date(agora.getTime() + TRAVA_MS) },
  });
  return r.count === 1 ? token : null;
}

async function destravar(empresaId: string, token: string) {
  await prisma.configuracaoFiscal
    .updateMany({ where: { empresaId, travaToken: token }, data: { travaToken: null, travaAte: null } })
    .catch((e) => console.error("[fiscal] trava não liberada (expira sozinha)", empresaId, e));
}

// ───────────────────────── captação ─────────────────────────

export type ResumoTipo = { tipo: TipoDoc; status: string; mensagem: string; novos: number; completados?: number; paginas: number; pendente: boolean; proximaConsulta: Date | null; aguardando?: boolean };
export type ResumoCaptura = { empresaId: string; ok: boolean; erro?: string; tipos: ResumoTipo[]; ciencias: number; cienciasFalhas: number };

const horaSP = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

async function capturarTipo(empresaId: string, motor: MotorCaptacao, tipo: TipoDoc, prazo: number): Promise<ResumoTipo> {
  const cursor = await prisma.cursorCaptura.upsert({
    where: { empresaId_tipo_motor: { empresaId, tipo, motor: motor.motor } },
    create: { empresaId, tipo, motor: motor.motor },
    update: {},
  });
  const agora = new Date();
  if (cursor.proximaConsulta && cursor.proximaConsulta > agora) {
    const motivo =
      cursor.status === "656"
        ? `A SEFAZ pediu para esperar (consumo indevido). Próxima consulta às ${horaSP(cursor.proximaConsulta)}.`
        : `Em dia. Pela regra da SEFAZ, a próxima consulta é às ${horaSP(cursor.proximaConsulta)}.`;
    return { tipo, status: cursor.status ?? "137", mensagem: motivo, novos: 0, paginas: 0, pendente: cursor.pendente, proximaConsulta: cursor.proximaConsulta, aguardando: true };
  }
  let nsu = cursor.ultimoNsu;
  let paginas = 0;
  let novos = 0;
  let completados = 0;
  let temMais = true;
  let status = "";
  let mensagem = "";
  let proxima: Date | null = null;
  while (temMais && paginas < MAX_PAGINAS && Date.now() < prazo) {
    let pagina;
    try {
      pagina = await motor.consultar(tipo, nsu);
    } catch (e) {
      status = "ERR";
      mensagem = mensagemDeErro(e);
      break;
    }
    paginas += 1;
    status = pagina.status;
    mensagem = pagina.mensagem;
    if (!classificarStatus(pagina.status).ok) {
      if (pagina.status === "656") proxima = new Date(Date.now() + ESPERA_SEFAZ_MS);
      break;
    }
    const g = await gravarDocumentos(empresaId, motor.motor, pagina.documentos);
    novos += g.novos;
    completados += g.completados;
    if (g.falhas.length) {
      status = "ERR";
      mensagem = `${g.falhas.length} documento(s) não gravado(s); o ponto de parada foi mantido para tentar de novo. ${g.falhas.slice(0, 3).join("; ")}`;
      break;
    }
    const avancou = pagina.ultimoNsu !== nsu;
    nsu = pagina.ultimoNsu;
    temMais = pagina.temMais && avancou;
    await prisma.cursorCaptura.update({
      where: { id: cursor.id },
      data: { ultimoNsu: nsu, maxNsu: pagina.maxNsu ?? null, consultadoEm: new Date(), status, mensagem, pendente: temMais },
    });
    if (!temMais) {
      // nada novo ou fim do acervo (ultNSU = maxNSU): a SEFAZ pede 1 hora antes de consultar de novo
      const espera = motor.esperaSemNovidade(tipo);
      proxima = espera > 0 ? new Date(Date.now() + espera) : null;
    }
  }
  if (paginas === 0 && !status) {
    // sem tempo nesta execução: nada foi consultado, o cursor fica como estava
    return { tipo, status: cursor.status ?? "", mensagem: "Sem tempo nesta execução; continua na próxima busca.", novos: 0, paginas: 0, pendente: true, proximaConsulta: null };
  }
  const pendente = status !== "ERR" && classificarStatus(status).ok && temMais;
  await prisma.cursorCaptura.update({
    where: { id: cursor.id },
    data: { consultadoEm: new Date(), status: status || cursor.status, mensagem: mensagem || cursor.mensagem, proximaConsulta: proxima, pendente, documentosUltima: novos },
  });
  return { tipo, status, mensagem, novos, completados, paginas, pendente, proximaConsulta: proxima };
}

/** Manifesta e grava o resultado na nota. Erro de comunicação não marca a nota (a próxima execução tenta de novo). */
export async function manifestarDocumento(
  motor: MotorCaptacao,
  doc: { id: string; chave: string },
  tipo: TipoManifestacao,
  justificativa?: string,
): Promise<ResultadoManifestacao> {
  let r: ResultadoManifestacao;
  try {
    r = await motor.manifestar(doc.chave, tipo, justificativa);
  } catch (e) {
    r = { ok: false, status: "ERR", mensagem: mensagemDeErro(e) };
  }
  if (r.ok) {
    await prisma.documentoRecebido.update({
      where: { id: doc.id },
      data: { manifestacao: tipo, manifestadoEm: r.registradoEm ?? new Date(), manifestacaoProtocolo: r.protocolo ?? null, manifestacaoErro: null },
    });
  } else if (r.status !== "ERR") {
    await prisma.documentoRecebido.update({ where: { id: doc.id }, data: { manifestacaoErro: `${r.status}: ${r.mensagem}`.slice(0, 500) } });
  }
  return r;
}

export async function capturarEstabelecimento(empresaId: string, opcoes: { prazoMs?: number } = {}): Promise<ResumoCaptura> {
  const prazo = Date.now() + (opcoes.prazoMs ?? 60_000);
  const [empresa, config] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true, cnpj: true, uf: true, ativo: true } }),
    prisma.configuracaoFiscal.findUnique({ where: { empresaId } }),
  ]);
  const vazio = { empresaId, tipos: [], ciencias: 0, cienciasFalhas: 0 };
  if (!empresa?.ativo) return { ...vazio, ok: false, erro: "Estabelecimento inativo." };
  if (!config?.captacaoAtiva) return { ...vazio, ok: false, erro: "A busca de notas está desligada para este estabelecimento." };
  const tipos = (["NFE", "CTE", "NFSE"] as TipoDoc[]).filter((t) => (t === "NFE" ? config.captarNfe : t === "CTE" ? config.captarCte : config.captarNfse));
  if (!tipos.length) return { ...vazio, ok: false, erro: "Nenhum tipo de nota marcado para buscar." };

  const token = await travar(empresaId);
  if (!token) return { ...vazio, ok: false, erro: "Já existe uma busca em andamento para este CNPJ. Aguarde ela terminar." };
  let motor: MotorCaptacao | null = null;
  try {
    motor = await abrirMotor(empresa, config);
    const resumos: ResumoTipo[] = [];
    for (const tipo of tipos) resumos.push(await capturarTipo(empresaId, motor, tipo, prazo));

    // Ciência automática: libera o XML completo das NF-e novas (o resumo chega primeiro).
    let ciencias = 0;
    let cienciasFalhas = 0;
    if (config.cienciaAutomatica && config.captarNfe) {
      const pendentes = await prisma.documentoRecebido.findMany({
        where: { empresaId, tipo: "NFE", direcao: "ENTRADA", situacao: "AUTORIZADO", manifestacao: null, manifestacaoErro: null, completo: false },
        orderBy: { emitidoEm: "asc" },
        take: MAX_CIENCIAS,
        select: { id: true, chave: true },
      });
      for (const doc of pendentes) {
        if (Date.now() > prazo) break;
        const r = await manifestarDocumento(motor, doc, "CIENCIA");
        if (r.ok) ciencias += 1;
        else cienciasFalhas += 1;
      }
    }
    return { empresaId, ok: resumos.every((r) => classificarStatus(r.status).ok), tipos: resumos, ciencias, cienciasFalhas };
  } catch (e) {
    return { ...vazio, ok: false, erro: e instanceof Error ? e.message : String(e) };
  } finally {
    motor?.encerrar();
    await destravar(empresaId, token);
  }
}

/** Texto curto para toast e auditoria. */
export function descreverResumo(r: ResumoCaptura): string {
  if (r.erro) return r.erro;
  const partes = r.tipos.map((t) => {
    const rotulo = ROTULO_TIPO_DOC[t.tipo];
    if (t.aguardando) return `${rotulo}: ${t.mensagem}`;
    if (!classificarStatus(t.status).ok) return `${rotulo}: ${classificarStatus(t.status).rotulo}${t.mensagem ? ` — ${t.mensagem}` : ""}`;
    const partesTipo = [t.novos ? `${t.novos} novo(s)` : "", t.completados ? `${t.completados} com o XML completo agora` : ""].filter(Boolean);
    return `${rotulo}: ${partesTipo.length ? partesTipo.join(", ") : "nada novo"}${t.pendente ? " (ainda há mais; continua na próxima busca)" : ""}`;
  });
  if (r.ciencias) partes.push(`${r.ciencias} ciência(s) registrada(s)`);
  if (r.cienciasFalhas) partes.push(`${r.cienciasFalhas} ciência(s) recusada(s)`);
  return partes.join(" · ");
}

/** Cron: todos os estabelecimentos com a busca ligada, um de cada vez, dentro do tempo da função. */
export async function capturarTodos(prazoMs: number): Promise<ResumoCaptura[]> {
  const fim = Date.now() + prazoMs;
  const configs = await prisma.configuracaoFiscal.findMany({
    where: { captacaoAtiva: true, empresa: { ativo: true } },
    orderBy: { updatedAt: "asc" },
    select: { empresaId: true },
  });
  const saida: ResumoCaptura[] = [];
  for (const c of configs) {
    const resta = fim - Date.now();
    if (resta < 20_000) break;
    saida.push(await capturarEstabelecimento(c.empresaId, { prazoMs: resta - 10_000 }));
  }
  return saida;
}
