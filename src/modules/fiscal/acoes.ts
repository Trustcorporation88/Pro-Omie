"use server";

// Ações do módulo fiscal (notas recebidas).
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao } from "@/lib/auth/sessao";
import { exigirAdmin, exigirMatrizAdministrada, escopoEmpresa, exigirEmpresaNoEscopo } from "@/lib/auth/empresa";
import { pode } from "@/lib/auth/permissoes";
import { auditar } from "@/lib/auditoria";
import { dateParaISO, ehISOValido, hojeISO } from "@/lib/datas";
import { arred2, fmtDocumento, fmtMoeda } from "@/lib/format";
import { num } from "@/lib/serial";
import { criarLancamento } from "@/modules/financeiro/servicos";
import { certificadoParaEmissao } from "@/modules/configuracoes/certificado";
import { abrirMotor, capturarEstabelecimento, cifrarTokenFocus, descreverResumo, manifestarDocumento } from "./captacao";
import { ativarNaFocus } from "./focus/empresa";
import { ErroFocus, tokenMasterFocus } from "./focus/cliente";
import { textoSefaz } from "./xml";
import { ROTULO_MANIFESTACAO, ROTULO_TIPO_DOC, type TipoManifestacao } from "./tipos";

function revalidar(id?: string) {
  revalidatePath("/fiscal/recebidas");
  if (id) revalidatePath(`/fiscal/recebidas/${id}`);
}

const rotuloNota = (d: { tipo: string; numero: string | null; emitenteNome: string | null }) =>
  `${ROTULO_TIPO_DOC[d.tipo as "NFE"] ?? d.tipo}${d.numero ? ` nº ${d.numero}` : ""}${d.emitenteNome ? ` · ${d.emitenteNome}` : ""}`;

// ───────────────────────── buscar agora ─────────────────────────

/** Busca agora as notas dos estabelecimentos do escopo (ou de um só) com a captação ligada. */
export async function buscarNotasAgora(empresaId?: string): Promise<Resultado<{ novos: number }>> {
  let mensagem = "";
  const r = await executar(async () => {
    const u = await exigirPermissao("fiscal:editar");
    const escopo = await escopoEmpresa();
    const ids = empresaId ? [exigirEmpresaNoEscopo(escopo, empresaId)] : escopo.ids;
    const ligados = await prisma.configuracaoFiscal.findMany({ where: { empresaId: { in: ids }, captacaoAtiva: true }, select: { empresaId: true } });
    if (!ligados.length)
      throw new ErroAcao("A busca de notas ainda está desligada. Um administrador liga em Configurações › Empresas e filiais › Notas recebidas.");
    const fim = Date.now() + 50_000;
    const textos: string[] = [];
    let novos = 0;
    let algumOk = false;
    for (const { empresaId: id } of ligados) {
      const resta = fim - Date.now();
      if (resta < 5_000) break;
      const resumo = await capturarEstabelecimento(id, { prazoMs: resta });
      novos += resumo.tipos.reduce((a, t) => a + t.novos, 0);
      algumOk ||= resumo.ok || resumo.tipos.some((t) => t.aguardando);
      const nome = id === escopo.ativa.id ? escopo.ativa.nome : (escopo.filiais.find((f) => f.id === id)?.nome ?? "");
      textos.push(ligados.length > 1 ? `${nome}: ${descreverResumo(resumo)}` : descreverResumo(resumo));
      await auditar("buscar_notas", "fiscal", id, `Busca manual de notas recebidas: ${descreverResumo(resumo)}`.slice(0, 900), { tipos: resumo.tipos, ciencias: resumo.ciencias }, { usuarioId: u.id, empresaId: escopo.ativa.id });
    }
    revalidar();
    if (!algumOk) throw new ErroAcao(textos.join(" | "));
    mensagem = textos.join(" | ");
    return { novos };
  });
  return r.ok ? { ...r, mensagem } : r;
}

// ───────────────────────── manifestação ─────────────────────────

const esquemaManifestacao = z.object({
  tipo: z.enum(["CIENCIA", "CONFIRMACAO", "DESCONHECIMENTO", "NAO_REALIZADA"]),
  justificativa: z.string().max(400).optional(),
});

export async function manifestarNota(id: string, entrada: { tipo: TipoManifestacao; justificativa?: string }): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("fiscal:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaManifestacao.parse(entrada);
    const doc = await prisma.documentoRecebido.findFirst({
      where: { id, empresaId: { in: escopo.ids } },
      select: { id: true, chave: true, tipo: true, direcao: true, situacao: true, manifestacao: true, numero: true, emitenteNome: true, empresaId: true },
    });
    if (!doc) throw new ErroAcao("Nota não encontrada nesta empresa.");
    if (doc.tipo !== "NFE" || doc.direcao !== "ENTRADA") throw new ErroAcao("Só NF-e recebida (a empresa como destinatária) tem manifestação.");
    if (doc.situacao !== "AUTORIZADO") throw new ErroAcao("Esta nota está cancelada ou denegada: não cabe manifestação.");
    if (doc.manifestacao === d.tipo) throw new ErroAcao(`Esta nota já está com "${ROTULO_MANIFESTACAO[d.tipo]}".`);
    if (d.tipo === "CIENCIA" && doc.manifestacao) throw new ErroAcao("A nota já tem manifestação; a ciência não volta atrás.");
    let justificativa: string | undefined;
    if (d.tipo === "NAO_REALIZADA") {
      justificativa = textoSefaz(d.justificativa ?? "");
      if (justificativa.length < 15) throw new ErroAcao("Explique em pelo menos 15 caracteres por que a operação não aconteceu.", { justificativa: "Mínimo de 15 caracteres." });
    }
    const [empresa, config] = await Promise.all([
      prisma.empresa.findUniqueOrThrow({ where: { id: doc.empresaId }, select: { id: true, cnpj: true, uf: true } }),
      prisma.configuracaoFiscal.findUnique({ where: { empresaId: doc.empresaId } }),
    ]);
    let motor;
    try {
      motor = await abrirMotor(empresa, config ?? { motor: "SEFAZ", ambiente: 1, focusTokenProducao: null, focusTokenHomologacao: null });
    } catch (e) {
      throw new ErroAcao(e instanceof Error ? e.message : String(e));
    }
    try {
      const r = await manifestarDocumento(motor, doc, d.tipo, justificativa);
      await auditar(
        "manifestar_nota",
        "fiscal",
        doc.id,
        `${ROTULO_MANIFESTACAO[d.tipo]} em ${rotuloNota(doc)}: ${r.ok ? "registrada" : "recusada"} (${r.status} ${r.mensagem})`.slice(0, 900),
        { tipo: d.tipo, justificativa, status: r.status, protocolo: r.protocolo },
        { usuarioId: u.id, empresaId: escopo.ativa.id },
      );
      revalidar(doc.id);
      if (!r.ok) throw new ErroAcao(`A SEFAZ recusou: ${r.status} ${r.mensagem}`);
      return undefined;
    } finally {
      motor.encerrar();
    }
  }, "Manifestação registrada na SEFAZ.");
}

// ───────────────────────── lançar no contas a pagar ─────────────────────────

const esquemaLancamento = z.object({
  categoriaId: z.string().min(1, "Escolha a categoria."),
  centroCustoId: z.string().optional().nullable(),
  descricao: z.string().trim().min(1, "Informe a descrição.").max(200),
  parcelas: z
    .array(z.object({ vencimento: z.string().refine(ehISOValido, "Vencimento inválido."), valor: z.number().positive("Valor da parcela precisa ser maior que zero.") }))
    .min(1, "Informe ao menos uma parcela.")
    .max(60),
});

export async function lancarNotaNoContasAPagar(id: string, entrada: z.input<typeof esquemaLancamento>): Promise<Resultado<{ ids: string[] }>> {
  return executar(async () => {
    const u = await exigirPermissao("fiscal:editar");
    if (!pode(u.papel, "financeiro:editar")) throw new ErroAcao("Você não tem permissão para lançar no contas a pagar.");
    const escopo = await escopoEmpresa();
    const d = esquemaLancamento.parse(entrada);
    const doc = await prisma.documentoRecebido.findFirst({
      where: { id, empresaId: { in: escopo.ids } },
      include: { empresa: { select: { id: true, matrizId: true } } },
    });
    if (!doc) throw new ErroAcao("Nota não encontrada nesta empresa.");
    if (doc.direcao !== "ENTRADA") throw new ErroAcao("Só nota recebida (a empresa como destinatária ou tomadora) vai para o contas a pagar.");
    if (doc.situacao !== "AUTORIZADO") throw new ErroAcao("Nota cancelada ou denegada não pode ser lançada.");
    if (doc.lancadoEm) throw new ErroAcao("Esta nota já foi lançada no contas a pagar.");
    if (doc.manifestacao === "DESCONHECIMENTO" || doc.manifestacao === "NAO_REALIZADA") throw new ErroAcao("A empresa recusou esta nota (desconhecimento ou não realizada). Não lance no contas a pagar.");
    const matrizId = doc.empresa.matrizId ?? doc.empresa.id;
    const [categoria, centro] = await Promise.all([
      prisma.categoria.findFirst({ where: { id: d.categoriaId, empresaId: matrizId, tipo: "DESPESA", ativo: true }, select: { id: true } }),
      d.centroCustoId ? prisma.centroCusto.findFirst({ where: { id: d.centroCustoId, empresaId: matrizId, ativo: true }, select: { id: true } }) : Promise.resolve(true),
    ]);
    if (!categoria) throw new ErroAcao("Categoria de despesa não encontrada nesta empresa.", { categoriaId: "Categoria inválida." });
    if (!centro) throw new ErroAcao("Centro de custo não encontrado nesta empresa.", { centroCustoId: "Centro de custo inválido." });
    const emissao = doc.emitidoEm ? dateParaISO(doc.emitidoEm) : hojeISO();
    const parcelas = d.parcelas.map((p) => ({ vencimento: p.vencimento, valor: arred2(p.valor) })).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const total = arred2(parcelas.reduce((a, p) => a + p.valor, 0));

    const resultado = await prisma.$transaction(
      async (tx) => {
        // trava otimista: duas pessoas não lançam a mesma nota
        const marcada = await tx.documentoRecebido.updateMany({ where: { id: doc.id, lancadoEm: null }, data: { lancadoEm: new Date(), lancadoPorId: u.id } });
        if (marcada.count !== 1) throw new ErroAcao("Esta nota acabou de ser lançada por outra pessoa.");
        let pessoaId = doc.pessoaId;
        let fornecedorCriado = false;
        if (!pessoaId && doc.emitenteDocumento) {
          const existente = await tx.pessoa.findFirst({ where: { empresaId: matrizId, documento: doc.emitenteDocumento }, select: { id: true, fornecedor: true } });
          if (existente) {
            pessoaId = existente.id;
            if (!existente.fornecedor) await tx.pessoa.update({ where: { id: existente.id }, data: { fornecedor: true } });
          } else {
            const criado = await tx.pessoa.create({
              data: {
                empresaId: matrizId,
                tipoPessoa: doc.emitenteDocumento.length === 11 ? "FISICA" : "JURIDICA",
                documento: doc.emitenteDocumento,
                nome: (doc.emitenteNome ?? fmtDocumento(doc.emitenteDocumento)).slice(0, 200),
                cliente: false,
                fornecedor: true,
                indicadorIE: doc.emitenteIe ? "CONTRIBUINTE" : "NAO_CONTRIBUINTE",
                inscricaoEstadual: doc.emitenteIe,
                observacoes: `Cadastrado a partir da ${ROTULO_TIPO_DOC[doc.tipo]} ${doc.chave}`,
              },
              select: { id: true },
            });
            pessoaId = criado.id;
            fornecedorCriado = true;
          }
        }
        const ids = await criarLancamento(
          tx,
          {
            tipo: "PAGAR",
            empresaId: doc.empresaId,
            pessoaId,
            descricao: d.descricao,
            documento: `${ROTULO_TIPO_DOC[doc.tipo]} ${doc.numero ?? ""}`.trim().slice(0, 60),
            emissao,
            competencia: emissao,
            observacoes: `Chave de acesso ${doc.chave}`,
            rateios: [{ categoriaId: d.categoriaId, centroCustoId: d.centroCustoId || null, percentual: 100 }],
            parcelas,
            origem: "NOTA_FISCAL",
            origemId: doc.id,
          },
          u.id,
        );
        await tx.documentoRecebido.update({ where: { id: doc.id }, data: { pessoaId } });
        return { ids, fornecedorCriado };
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    await auditar(
      "lancar_nota",
      "fiscal",
      doc.id,
      `${rotuloNota(doc)} lançada no contas a pagar: ${parcelas.length} parcela(s), total ${fmtMoeda(total)}${resultado.fornecedorCriado ? " (fornecedor cadastrado)" : ""}`,
      { parcelas, total, valorNota: doc.valor === null ? null : num(doc.valor), titulos: resultado.ids },
      { usuarioId: u.id, empresaId: escopo.ativa.id },
    );
    revalidar(doc.id);
    revalidatePath("/financeiro/pagar");
    return { ids: resultado.ids };
  }, "Lançado no contas a pagar.");
}

// ───────────────────────── configuração (administrador) ─────────────────────────

async function estabelecimentoAdministrado(empresaId: string) {
  const { u, ctx } = await exigirAdmin();
  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: {
      id: true,
      matrizId: true,
      cnpj: true,
      razaoSocial: true,
      nomeFantasia: true,
      inscricaoEstadual: true,
      inscricaoMunicipal: true,
      regimeTributario: true,
      email: true,
      telefone: true,
      cep: true,
      logradouro: true,
      numero: true,
      complemento: true,
      bairro: true,
      cidade: true,
      uf: true,
    },
  });
  if (!empresa) throw new ErroAcao("Empresa não encontrada.");
  exigirMatrizAdministrada(ctx, empresa.matrizId ?? empresa.id);
  return { u, empresa };
}

const esquemaConfig = z.object({
  captacaoAtiva: z.boolean(),
  motor: z.enum(["SEFAZ", "FOCUS"]),
  ambiente: z.union([z.literal(1), z.literal(2)]),
  captarNfe: z.boolean(),
  captarCte: z.boolean(),
  captarNfse: z.boolean(),
  cienciaAutomatica: z.boolean(),
});

export async function salvarConfiguracaoFiscal(empresaId: string, entrada: z.input<typeof esquemaConfig>): Promise<Resultado> {
  return executar(async () => {
    const { u, empresa } = await estabelecimentoAdministrado(empresaId);
    const d = esquemaConfig.parse(entrada);
    const atual = await prisma.configuracaoFiscal.findUnique({ where: { empresaId }, select: { focusTokenProducao: true, motor: true, captacaoAtiva: true, ambiente: true } });
    if (d.captacaoAtiva) {
      if (!d.captarNfe && !d.captarCte && !d.captarNfse) throw new ErroAcao("Marque ao menos um tipo de nota para buscar.");
      if (d.motor === "FOCUS" && !atual?.focusTokenProducao) throw new ErroAcao("Ative o estabelecimento na Focus NFe antes de escolher este motor.");
      if (d.motor === "SEFAZ" && !(await certificadoParaEmissao(empresaId)))
        throw new ErroAcao("Envie o certificado digital A1 (deste estabelecimento ou da matriz) antes de ligar a busca.");
    }
    const dados = { ...d, atualizadoPorId: u.id };
    await prisma.configuracaoFiscal.upsert({ where: { empresaId }, create: { empresaId, ...dados }, update: dados });
    // trocar de motor ou de ambiente não reaproveita a espera do outro
    if (atual && (atual.motor !== d.motor || atual.ambiente !== d.ambiente)) {
      await prisma.cursorCaptura.updateMany({ where: { empresaId, motor: d.motor }, data: { proximaConsulta: null } });
    }
    const nome = empresa.nomeFantasia || empresa.razaoSocial;
    const tipos = [d.captarNfe && "NF-e", d.captarCte && "CT-e", d.captarNfse && "NFS-e"].filter(Boolean).join(", ");
    await auditar(
      "configurar_captacao",
      "empresa",
      empresaId,
      `Busca de notas recebidas de ${nome}: ${d.captacaoAtiva ? `ligada (${tipos}, ${d.motor === "SEFAZ" ? "SEFAZ direto" : "Focus NFe"}${d.ambiente === 2 ? ", homologação" : ""}${d.cienciaAutomatica ? ", ciência automática" : ""})` : "desligada"}`,
      d,
      { usuarioId: u.id, empresaId: empresa.matrizId ?? empresa.id },
    );
    revalidatePath("/configuracoes/empresa");
    revalidar();
    return undefined;
  }, "Configuração salva.");
}

/** Cadastra (ou atualiza) o estabelecimento na Focus NFe com o Token Master e guarda os tokens dele cifrados. */
export async function ativarNaFocusAcao(empresaId: string): Promise<Resultado> {
  return executar(async () => {
    const { u, empresa } = await estabelecimentoAdministrado(empresaId);
    const master = tokenMasterFocus();
    if (!master) throw new ErroAcao("O Token Master da Focus NFe não está configurado no servidor (variável FOCUS_NFE_TOKEN_MASTER na Vercel).");
    const cert = await certificadoParaEmissao(empresaId);
    if (!cert) throw new ErroAcao("Envie o certificado digital A1 antes de ativar na Focus NFe.");
    const config = await prisma.configuracaoFiscal.findUnique({ where: { empresaId } });
    let r;
    try {
      r = await ativarNaFocus({
        tokenMaster: master,
        empresa: { ...empresa, regimeTributario: empresa.regimeTributario },
        pfx: cert.pfx,
        senha: cert.senha,
        tipos: { nfe: config?.captarNfe ?? true, cte: config?.captarCte ?? true, nfse: config?.captarNfse ?? true },
      });
    } catch (e) {
      throw new ErroAcao(e instanceof ErroFocus ? `Focus NFe: ${e.message}` : "Não foi possível falar com a Focus NFe agora. Tente de novo em instantes.");
    }
    const dados = {
      focusEmpresaId: r.id,
      focusTokenProducao: cifrarTokenFocus(empresaId, 1, r.tokenProducao),
      focusTokenHomologacao: r.tokenHomologacao ? cifrarTokenFocus(empresaId, 2, r.tokenHomologacao) : null,
      focusAtivadaEm: new Date(),
      atualizadoPorId: u.id,
    };
    await prisma.configuracaoFiscal.upsert({ where: { empresaId }, create: { empresaId, ...dados }, update: dados });
    await auditar(
      "ativar_focus",
      "empresa",
      empresaId,
      `Estabelecimento ${empresa.nomeFantasia || empresa.razaoSocial} ativado na Focus NFe (id ${r.id}). O motor só muda quando o administrador escolher.`,
      { focusEmpresaId: r.id },
      { usuarioId: u.id, empresaId: empresa.matrizId ?? empresa.id },
    );
    revalidatePath("/configuracoes/empresa");
    return undefined;
  }, "Estabelecimento ativado na Focus NFe. Para usar, escolha o motor Focus na configuração.");
}
