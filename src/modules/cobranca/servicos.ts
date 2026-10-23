// Regras da cobrança (Asaas): chave cifrada, geração de boleto/Pix a partir do título, conferência, cancelamento, baixa
// automática pelo webhook e e-mail ao cliente. Só servidor.
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { num } from "@/lib/serial";
import { fmtData, fmtMoeda } from "@/lib/format";
import { cifrar, decifrar } from "@/modules/configuracoes/certificado";
import { baixarTitulo } from "@/modules/financeiro/servicos";
import { configuracaoEmail } from "@/modules/email/provedor";
import { enfileirar } from "@/modules/email/fila";
import { modeloCobranca } from "@/modules/email/modelos";
import { consultarPagamento, criarPagamento, ErroAsaas, excluirPagamento, garantirCliente, linhaDigitavel, pixQrCode, receberEmDinheiro, registrarWebhook, testarChave, type PagamentoAsaas } from "./asaas";

const contexto = (empresaId: string) => `pro-omie:cobranca:${empresaId}:chave`;
export const cifrarChave = (empresaId: string, chave: string) => new Uint8Array(cifrar(Buffer.from(chave, "utf8"), contexto(empresaId)));

/** Configuração ativa do estabelecimento (ou da matriz) com a chave decifrada. */
export async function configuracaoCobranca(empresaId: string) {
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true, matrizId: true } });
  if (!empresa) throw new ErroAcao("Empresa não encontrada.");
  const ids = [empresa.id, ...(empresa.matrizId ? [empresa.matrizId] : [])];
  const configs = await prisma.configuracaoCobranca.findMany({ where: { empresaId: { in: ids } } });
  const c = configs.find((x) => x.empresaId === empresa.id) ?? configs.find((x) => x.empresaId === empresa.matrizId);
  if (!c?.chaveCifrada) throw new ErroAcao("A cobrança pelo Asaas ainda não está configurada para este estabelecimento. Um administrador configura em Configurações › Empresas e filiais › Cobrança.");
  if (!c.ativa) throw new ErroAcao("A cobrança pelo Asaas está desligada para este estabelecimento.");
  let chave: string;
  try {
    chave = decifrar(Buffer.from(c.chaveCifrada), contexto(c.empresaId)).toString("utf8");
  } catch {
    throw new ErroAcao("Não foi possível abrir a chave do Asaas guardada (a chave do servidor mudou). Informe a chave de novo em Configurações.");
  }
  return { config: c, chave, ambiente: (c.ambiente === 1 ? 1 : 2) as 1 | 2 };
}

export async function testarConfiguracao(empresaId: string) {
  const { chave, ambiente } = await configuracaoCobranca(empresaId);
  await testarChave(chave, ambiente);
  await prisma.configuracaoCobranca.update({ where: { empresaId }, data: { testadaEm: new Date() } });
  return ambiente;
}

export async function registrarWebhookNoAsaas(empresaId: string, urlBase: string, email: string) {
  const { config, chave, ambiente } = await configuracaoCobranca(empresaId);
  const token = config.webhookToken ?? randomBytes(32).toString("hex");
  const id = await registrarWebhook(chave, ambiente, { url: `${urlBase}/api/webhooks/asaas`, email, authToken: token, webhookId: config.webhookId });
  await prisma.configuracaoCobranca.update({ where: { empresaId }, data: { webhookToken: token, webhookId: id, webhookRegistradoEm: new Date() } });
  return { id, url: `${urlBase}/api/webhooks/asaas` };
}

const isoDia = (d: Date) => d.toISOString().slice(0, 10);

/** Gera a cobrança (boleto, Pix ou à escolha do cliente) de um título a receber em aberto. */
export async function gerarCobranca(tituloId: string, p: { tipo: "BOLETO" | "PIX" | "UNDEFINED" | null; enviarEmail: boolean; usuarioId: string; escopoIds: string[]; urlBase: string }) {
  const t = await prisma.titulo.findFirst({ where: { id: tituloId, empresaId: { in: p.escopoIds } }, include: { pessoa: true, empresa: { select: { id: true, matrizId: true, razaoSocial: true, nomeFantasia: true, email: true } } } });
  if (!t) throw new ErroAcao("Título não encontrado nesta empresa.");
  if (t.tipo !== "RECEBER") throw new ErroAcao("Só título a receber gera cobrança.");
  if (t.status === "QUITADO" || t.status === "CANCELADO") throw new ErroAcao("Título quitado ou cancelado não gera cobrança.");
  if (!t.pessoa) throw new ErroAcao("O título precisa de um cliente para gerar a cobrança.");
  const doc = (t.pessoa.documento ?? "").replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) throw new ErroAcao("O cliente precisa de CPF ou CNPJ para a cobrança.", undefined);
  const aberta = await prisma.cobranca.findFirst({ where: { tituloId, status: { in: ["PENDING", "OVERDUE", "CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"] } } });
  if (aberta) throw new ErroAcao(`Este título já tem uma cobrança ${aberta.status === "PENDING" || aberta.status === "OVERDUE" ? "em aberto" : "paga"} no Asaas. Cancele-a antes de gerar outra.`);
  const saldo = Math.round((num(t.valor) - num(t.valorPago)) * 100) / 100;
  if (saldo <= 0) throw new ErroAcao("O título não tem saldo a receber.");
  const { config, chave, ambiente } = await configuracaoCobranca(t.empresaId);
  if (!config.contaBancariaId) throw new ErroAcao("Escolha em Configurações a conta onde o dinheiro do Asaas entra.");
  const tipo = p.tipo ?? config.formaPadrao;
  const hoje = new Date(Date.now() - 3 * 3_600_000);
  const vencimento = t.vencimento < new Date(isoDia(hoje)) ? isoDia(hoje) : isoDia(t.vencimento);

  const mapa = await prisma.clienteAsaas.findUnique({ where: { empresaId_pessoaId: { empresaId: config.empresaId, pessoaId: t.pessoa.id } } });
  let customer = mapa?.customerId ?? null;
  if (!customer) {
    customer = await garantirCliente(chave, ambiente, {
      nome: t.pessoa.nome,
      documento: doc,
      email: t.pessoa.email,
      telefone: t.pessoa.telefone,
      cep: t.pessoa.cep,
      logradouro: t.pessoa.logradouro,
      numero: t.pessoa.numero,
      complemento: t.pessoa.complemento,
      bairro: t.pessoa.bairro,
      externalReference: t.pessoa.id,
      notificarPeloAsaas: config.notificarPeloAsaas,
    });
    await prisma.clienteAsaas.upsert({ where: { empresaId_pessoaId: { empresaId: config.empresaId, pessoaId: t.pessoa.id } }, create: { empresaId: config.empresaId, pessoaId: t.pessoa.id, customerId: customer }, update: { customerId: customer } });
  }
  const empresaNome = t.empresa.nomeFantasia || t.empresa.razaoSocial;
  const pagamento = await criarPagamento(chave, ambiente, {
    customer,
    billingType: tipo,
    value: saldo,
    dueDate: vencimento,
    description: `${t.descricao}${t.documento ? ` (${t.documento})` : ""} - ${empresaNome}`,
    externalReference: t.id,
    multaPercentual: num(config.multaPercentual),
    jurosMensal: num(config.jurosMensal),
  });
  const [linha, pix] = await Promise.all([
    tipo !== "PIX" ? linhaDigitavel(chave, ambiente, pagamento.id).catch(() => null) : null,
    tipo !== "BOLETO" ? pixQrCode(chave, ambiente, pagamento.id).catch(() => null) : null,
  ]);
  const cobranca = await prisma.cobranca.create({
    data: {
      empresaId: t.empresaId,
      tituloId: t.id,
      pessoaId: t.pessoa.id,
      asaasPaymentId: pagamento.id,
      asaasCustomerId: customer,
      tipo,
      status: pagamento.status ?? "PENDING",
      valor: saldo,
      valorLiquido: pagamento.netValue ?? null,
      vencimento: new Date(`${vencimento}T00:00:00Z`),
      urlFatura: pagamento.invoiceUrl ?? null,
      urlBoleto: pagamento.bankSlipUrl ?? null,
      linhaDigitavel: linha?.identificationField ?? null,
      codigoBarras: linha?.barCode ?? null,
      nossoNumero: pagamento.nossoNumero ?? linha?.nossoNumero ?? null,
      pixPayload: pix?.payload ?? null,
      pixExpiraEm: pix?.expirationDate ? new Date(pix.expirationDate.replace(" ", "T") + "-03:00") : null,
      criadaPorId: p.usuarioId,
    },
  });
  let emailEnviado = false;
  if (p.enviarEmail && t.pessoa.email && configuracaoEmail().configurado) emailEnviado = await enviarEmailCobranca(cobranca.id).catch(() => false);
  return { cobranca, emailEnviado, ambiente };
}

/** E-mail ao cliente com o link da fatura, a linha digitável e o Pix copia e cola. */
export async function enviarEmailCobranca(cobrancaId: string, para?: string[]): Promise<boolean> {
  const c = await prisma.cobranca.findUniqueOrThrow({ where: { id: cobrancaId }, include: { titulo: { include: { pessoa: { select: { nome: true, email: true } }, empresa: { select: { id: true, matrizId: true, razaoSocial: true, nomeFantasia: true, email: true } } } } } });
  const destinatarios = para ?? (c.titulo.pessoa?.email ? [c.titulo.pessoa.email] : []);
  if (!destinatarios.length) throw new ErroAcao("O cliente não tem e-mail cadastrado.");
  const empresa = c.titulo.empresa.nomeFantasia || c.titulo.empresa.razaoSocial;
  const modelo = modeloCobranca({
    empresa,
    cliente: c.titulo.pessoa?.nome ?? "",
    descricao: c.titulo.descricao,
    valor: fmtMoeda(num(c.valor)),
    vencimento: fmtData(c.vencimento.toISOString()),
    urlFatura: c.urlFatura,
    urlBoleto: c.urlBoleto,
    linhaDigitavel: c.linhaDigitavel,
    pixPayload: c.pixPayload,
    sandbox: false,
  });
  const e = await enfileirar({ empresaId: c.titulo.empresa.matrizId ?? c.titulo.empresa.id, tipo: "cobranca", origemId: c.id, para: destinatarios, responderPara: c.titulo.empresa.email, ...modelo });
  return e.status === "ENVIADO";
}

/** Aplica no ERP o estado de um pagamento do Asaas (webhook ou conferência): status, pagamento e baixa do título. */
export async function aplicarPagamento(pagamento: PagamentoAsaas, origem: string) {
  const c = await prisma.cobranca.findUnique({ where: { asaasPaymentId: pagamento.id }, include: { titulo: { select: { id: true, status: true, valor: true, valorPago: true, empresaId: true, numero: true } } } });
  if (!c) return { aplicado: false, motivo: "cobrança desconhecida" };
  const pago = pagamento.status === "RECEIVED" || pagamento.status === "CONFIRMED" || pagamento.status === "RECEIVED_IN_CASH";
  const dataPagamento = pagamento.paymentDate ?? pagamento.clientPaymentDate ?? pagamento.confirmedDate ?? null;
  await prisma.cobranca.update({
    where: { id: c.id },
    data: {
      status: pagamento.deleted ? "DELETED" : pagamento.status,
      valorLiquido: pagamento.netValue ?? c.valorLiquido,
      pagoEm: pago ? (dataPagamento ? new Date(`${dataPagamento}T12:00:00-03:00`) : (c.pagoEm ?? new Date())) : c.pagoEm,
      urlFatura: pagamento.invoiceUrl ?? c.urlFatura,
      urlBoleto: pagamento.bankSlipUrl ?? c.urlBoleto,
    },
  });
  // baixa automática: uma vez, quando pago e o título ainda está aberto
  if (pago && !c.baixaId && c.titulo.status !== "QUITADO" && c.titulo.status !== "CANCELADO") {
    const { config } = await configuracaoCobranca(c.titulo.empresaId);
    if (!config.contaBancariaId) return { aplicado: true, motivo: "pago; sem conta para a baixa" };
    const saldo = Math.round((num(c.titulo.valor) - num(c.titulo.valorPago)) * 100) / 100;
    const valor = Math.min(saldo, pagamento.value);
    const juros = Math.max(0, Math.round((pagamento.value - valor) * 100) / 100);
    const forma = await prisma.formaPagamento.findFirst({ where: { empresaId: { in: await matrizDe(c.titulo.empresaId) }, meio: pagamento.billingType === "PIX" ? "PIX" : "BOLETO", ativo: true }, select: { id: true } });
    const baixa = await prisma.$transaction((tx) =>
      baixarTitulo(
        tx,
        {
          tituloId: c.titulo.id,
          data: dataPagamento ?? isoDia(new Date(Date.now() - 3 * 3_600_000)),
          contaBancariaId: config.contaBancariaId!,
          formaPagamentoId: forma?.id ?? null,
          valor,
          juros,
          observacao: `Recebido pelo Asaas (${pagamento.billingType === "PIX" ? "Pix" : "boleto"} ${pagamento.id}${pagamento.netValue !== undefined ? `, líquido ${fmtMoeda(pagamento.netValue)}` : ""}) · ${origem}`,
        },
        null,
      ),
    );
    await prisma.cobranca.update({ where: { id: c.id }, data: { baixaId: baixa.id } });
    return { aplicado: true, motivo: `baixa do título #${c.titulo.numero}` };
  }
  return { aplicado: true, motivo: pagamento.status };
}

async function matrizDe(empresaId: string) {
  const e = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true, matrizId: true } });
  return [e?.matrizId ?? empresaId, empresaId];
}

export async function conferirCobranca(cobrancaId: string, escopoIds: string[]) {
  const c = await prisma.cobranca.findFirst({ where: { id: cobrancaId, empresaId: { in: escopoIds } } });
  if (!c) throw new ErroAcao("Cobrança não encontrada nesta empresa.");
  const { chave, ambiente } = await configuracaoCobranca(c.empresaId);
  let pagamento: PagamentoAsaas;
  try {
    pagamento = await consultarPagamento(chave, ambiente, c.asaasPaymentId);
  } catch (e) {
    if (e instanceof ErroAsaas && e.status === 404) {
      await prisma.cobranca.update({ where: { id: c.id }, data: { status: "DELETED", canceladaEm: c.canceladaEm ?? new Date() } });
      return { status: "DELETED", motivo: "não existe mais no Asaas" };
    }
    throw e;
  }
  const r = await aplicarPagamento(pagamento, "conferência");
  return { status: pagamento.status, motivo: r.motivo };
}

export async function cancelarCobranca(cobrancaId: string, escopoIds: string[]) {
  const c = await prisma.cobranca.findFirst({ where: { id: cobrancaId, empresaId: { in: escopoIds } } });
  if (!c) throw new ErroAcao("Cobrança não encontrada nesta empresa.");
  if (!["PENDING", "OVERDUE"].includes(c.status)) throw new ErroAcao("Só cobrança em aberto pode ser cancelada no Asaas.");
  const { chave, ambiente } = await configuracaoCobranca(c.empresaId);
  await excluirPagamento(chave, ambiente, c.asaasPaymentId);
  await prisma.cobranca.update({ where: { id: c.id }, data: { status: "DELETED", canceladaEm: new Date() } });
  return c;
}

/** Título baixado por fora (dinheiro, transferência): avisa o Asaas para encerrar a cobrança em aberto. */
export async function encerrarCobrancaPorBaixaManual(tituloId: string, dataISO: string) {
  const abertas = await prisma.cobranca.findMany({ where: { tituloId, status: { in: ["PENDING", "OVERDUE"] } } });
  for (const c of abertas) {
    try {
      const { chave, ambiente } = await configuracaoCobranca(c.empresaId);
      await receberEmDinheiro(chave, ambiente, c.asaasPaymentId, { paymentDate: dataISO, value: num(c.valor) });
      await prisma.cobranca.update({ where: { id: c.id }, data: { status: "RECEIVED_IN_CASH", pagoEm: new Date(`${dataISO}T12:00:00-03:00`) } });
    } catch (e) {
      await prisma.cobranca.update({ where: { id: c.id }, data: { erro: `Baixa manual no ERP; não foi possível avisar o Asaas: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500) } });
    }
  }
  return abertas.length;
}

/** Conferência periódica (cron): cobranças em aberto sem atualização recente. */
export async function conferirPendentes(limite = 100) {
  const lista = await prisma.cobranca.findMany({ where: { status: { in: ["PENDING", "OVERDUE"] }, updatedAt: { lt: new Date(Date.now() - 6 * 3_600_000) } }, orderBy: { updatedAt: "asc" }, take: limite, select: { id: true, empresaId: true } });
  let conferidas = 0;
  let erros = 0;
  for (const c of lista) {
    try {
      await conferirCobranca(c.id, [c.empresaId]);
      conferidas++;
    } catch {
      erros++;
      await prisma.cobranca.update({ where: { id: c.id }, data: { updatedAt: new Date() } });
    }
  }
  return { conferidas, erros };
}
