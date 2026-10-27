"use server";

// Ações da cobrança da armazenagem por palete: tarifas, fotografia, gerar e desfazer o faturamento do período.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao } from "@/lib/auth/sessao";
import { escopoEmpresa, exigirEmpresaNoEscopo } from "@/lib/auth/empresa";
import { auditar } from "@/lib/auditoria";
import { ehISOValido, isoParaDate } from "@/lib/datas";
import { fmtMoeda } from "@/lib/format";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { urlBase } from "@/modules/email/acoes";
import { emailsValidos, enfileirar } from "@/modules/email/fila";
import { modeloDemonstrativo } from "@/modules/email/modelos";
import { configuracaoEmail } from "@/modules/email/provedor";
import { carregarFaturamento, desfazerFaturamentoArmazem, fotografarOcupacao, gerarFaturamentoArmazem, primeiraEntradaDepositante } from "./faturamento";
import { dataBr, ehDataISO } from "./tipos";

function revalidar() {
  revalidatePath("/servicos/armazem", "layout");
  revalidatePath("/vendas/pedidos");
  revalidatePath("/financeiro/receber");
}

const idOpc = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const esquemaTarifa = z.object({
  id: idOpc,
  estabelecimentoId: z.string().min(1, "Escolha o estabelecimento."),
  depositanteId: z.string().min(1, "Escolha o depositante."),
  valorPosicao: z.number({ message: "Informe o valor por palete." }).positive("Informe o valor por palete.").max(1_000_000),
  metodo: z.enum(["FIM_PERIODO", "PRO_RATA", "PICO"]),
  minimoPosicoes: z.number().int("Número inteiro de paletes.").min(1, "Mínimo de 1 palete (ou deixe vazio).").max(100_000).optional().nullable(),
  cobrarReservadas: z.boolean(),
  periodo: z.enum(["DIAS30", "MES"]),
  inicio: z.string().refine((s) => ehISOValido(s), "Informe o início da cobrança."),
  produtoId: idOpc,
  descricao: z.string().trim().min(3, "Informe a descrição (sai no pedido e na nota).").max(120),
  prazoPagamento: z.number({ message: "Informe o prazo em dias." }).int("Número inteiro de dias.").min(0, "Prazo de 0 a 90 dias.").max(90, "Prazo de 0 a 90 dias."),
  categoriaId: idOpc,
  contaBancariaId: idOpc,
  formaPagamentoId: idOpc,
  gerarCobranca: z.boolean(),
  faturarAutomatico: z.boolean().default(true),
  observacoes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});
export type EntradaTarifa = z.input<typeof esquemaTarifa>;

/** Cria ou altera a tarifa de armazenagem de um depositante num estabelecimento. */
export async function salvarTarifaArmazem(entrada: EntradaTarifa): Promise<Resultado<{ id: string }>> {
  return executar(async () => {
    await exigirPermissao("financeiro:editar");
    const escopo = await escopoEmpresa();
    const d = esquemaTarifa.parse(entrada);
    exigirEmpresaNoEscopo(escopo, d.estabelecimentoId, "Estabelecimento fora da empresa atual.");
    const matriz = escopo.ativa.id;
    const [dep, produto, categoria, conta, forma] = await Promise.all([
      prisma.pessoa.findFirst({ where: { id: d.depositanteId, empresaId: matriz }, select: { id: true, nome: true } }),
      d.produtoId ? prisma.produto.findFirst({ where: { id: d.produtoId, empresaId: matriz, tipo: "SERVICO", ativo: true }, select: { id: true } }) : null,
      d.categoriaId ? prisma.categoria.findFirst({ where: { id: d.categoriaId, empresaId: matriz, tipo: "RECEITA", ativo: true }, select: { id: true } }) : null,
      d.contaBancariaId ? prisma.contaBancaria.findFirst({ where: { id: d.contaBancariaId, empresaId: { in: escopo.ids }, ativo: true }, select: { id: true } }) : null,
      d.formaPagamentoId ? prisma.formaPagamento.findFirst({ where: { id: d.formaPagamentoId, empresaId: matriz, ativo: true }, select: { id: true } }) : null,
    ]);
    if (!dep) throw new ErroAcao("Depositante não encontrado nesta empresa.", { depositanteId: "Depositante não encontrado." });
    if (d.produtoId && !produto) throw new ErroAcao("Escolha um serviço ativo do cadastro.", { produtoId: "Serviço inválido." });
    if (d.categoriaId && !categoria) throw new ErroAcao("Categoria de receita não encontrada.", { categoriaId: "Categoria inválida." });
    if (d.contaBancariaId && !conta) throw new ErroAcao("Conta não encontrada nesta empresa.", { contaBancariaId: "Conta inválida." });
    if (d.formaPagamentoId && !forma) throw new ErroAcao("Forma de pagamento não encontrada.", { formaPagamentoId: "Forma inválida." });
    const dados = {
      empresaId: d.estabelecimentoId,
      depositanteId: d.depositanteId,
      valorPosicao: d.valorPosicao,
      metodo: d.metodo,
      minimoPosicoes: d.minimoPosicoes ?? null,
      cobrarReservadas: d.cobrarReservadas,
      periodo: d.periodo,
      inicio: isoParaDate(d.inicio),
      produtoId: d.produtoId,
      descricao: d.descricao,
      prazoPagamento: d.prazoPagamento,
      categoriaId: d.categoriaId,
      contaBancariaId: d.contaBancariaId,
      formaPagamentoId: d.formaPagamentoId,
      gerarCobranca: d.gerarCobranca,
      faturarAutomatico: d.faturarAutomatico,
      observacoes: d.observacoes,
    };
    let id: string;
    try {
      if (d.id) {
        const atual = await prisma.tarifaArmazem.findFirst({ where: { id: d.id, empresaId: { in: escopo.ids } }, select: { id: true, empresaId: true, depositanteId: true, inicio: true, periodo: true } });
        if (!atual) throw new ErroAcao("Tarifa não encontrada nesta empresa.");
        // os períodos contam do início: mudar o início ou o tipo de período não pode deslocar períodos já faturados
        const ultimo = await prisma.faturamentoArmazem.findFirst({ where: { empresaId: atual.empresaId, depositanteId: atual.depositanteId }, orderBy: { periodoFim: "desc" }, select: { periodoFim: true } });
        const mudouPeriodos = atual.inicio.toISOString().slice(0, 10) !== d.inicio || atual.periodo !== d.periodo || atual.empresaId !== d.estabelecimentoId || atual.depositanteId !== d.depositanteId;
        if (ultimo && mudouPeriodos) {
          const fim = ultimo.periodoFim.toISOString().slice(0, 10);
          if (atual.empresaId !== d.estabelecimentoId || atual.depositanteId !== d.depositanteId) throw new ErroAcao("Esta tarifa já tem faturamentos: o depositante e o estabelecimento não mudam.");
          if (d.inicio <= fim) throw new ErroAcao(`Esta tarifa já foi faturada até ${dataBr(fim)}: o novo início precisa ser depois disso.`, { inicio: `Depois de ${dataBr(fim)}.` });
        }
        id = (await prisma.tarifaArmazem.update({ where: { id: atual.id }, data: dados, select: { id: true } })).id;
      } else {
        id = (await prisma.tarifaArmazem.create({ data: dados, select: { id: true } })).id;
      }
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") throw new ErroAcao(`${dep.nome} já tem tarifa neste estabelecimento: edite a que existe.`, { depositanteId: "Já tem tarifa." });
      throw e;
    }
    await auditar(
      d.id ? "editar_tarifa_armazem" : "criar_tarifa_armazem",
      "armazem",
      id,
      `Tarifa de armazenagem de ${dep.nome}: ${fmtMoeda(d.valorPosicao)} por palete ${d.periodo === "DIAS30" ? "a cada 30 dias" : "por mês"} desde ${dataBr(d.inicio)} (${d.metodo === "FIM_PERIODO" ? "apuração no fim do período" : d.metodo === "PICO" ? "maior quantidade" : "por dia"}${d.minimoPosicoes ? `, mínimo ${d.minimoPosicoes}` : ""}; vence ${d.prazoPagamento} dias após o período${d.faturarAutomatico ? "; fatura sozinho" : "; faturamento manual"})`,
    );
    revalidar();
    return { id };
  }, "Tarifa salva.");
}

export async function alternarTarifaArmazem(id: string): Promise<Resultado<{ ativo: boolean }>> {
  return executar(async () => {
    await exigirPermissao("financeiro:editar");
    const escopo = await escopoEmpresa();
    const t = await prisma.tarifaArmazem.findFirst({ where: { id: String(id), empresaId: { in: escopo.ids } }, include: { depositante: { select: { nome: true } } } });
    if (!t) throw new ErroAcao("Tarifa não encontrada nesta empresa.");
    await prisma.tarifaArmazem.update({ where: { id: t.id }, data: { ativo: !t.ativo } });
    await auditar("editar_tarifa_armazem", "armazem", t.id, `Tarifa de armazenagem de ${t.depositante.nome} ${t.ativo ? "suspensa" : "reativada"}`);
    revalidar();
    return { ativo: !t.ativo };
  }, "Tarifa atualizada.");
}

/** Fotografa agora as posições ocupadas (o cron faz de hora em hora; vale a última do dia). */
export async function atualizarFotografiaArmazem(): Promise<Resultado<{ depositantes: number; posicoes: number }>> {
  return executar(async () => {
    await exigirPermissao("armazem:editar");
    const escopo = await escopoEmpresa();
    const r = await fotografarOcupacao({ empresaIds: escopo.ids });
    revalidar();
    return { depositantes: r.depositantes, posicoes: r.posicoes };
  }, "Fotografia de hoje atualizada.");
}

/** Data sugerida para o início da tarifa: a primeira entrada do depositante no estabelecimento. */
export async function inicioSugeridoArmazem(empresaId: string, depositanteId: string): Promise<Resultado<{ inicio: string }>> {
  return executar(async () => {
    await exigirPermissao("armazem:ver");
    const escopo = await escopoEmpresa();
    exigirEmpresaNoEscopo(escopo, String(empresaId), "Estabelecimento fora da empresa atual.");
    return { inicio: await primeiraEntradaDepositante(String(empresaId), String(depositanteId)) };
  });
}

async function gerarUm(empresaId: string, depositanteId: string, periodoInicio: string, usuarioId: string, base: string, matrizId: string) {
  const r = await gerarFaturamentoArmazem({ empresaId, depositanteId, periodoInicio, usuarioId, urlBase: base });
  await auditar(
    "faturar_armazenagem",
    "armazem",
    r.faturamentoId,
    `Armazenagem de ${r.rotulo} · ${r.cliente} · ${r.calculo.apurado} paletes no fim, ${r.calculo.posicoesDia} paletes-dia, pico ${r.calculo.pico} · ${fmtMoeda(r.valor)} → pedido nº ${fmtNumeroDoc(r.numero)}${r.cobrancaId ? " · boleto/Pix gerado" : ""}`,
    { periodo: r.periodo, calculo: r.calculo },
    { usuarioId, empresaId: matrizId },
  );
  return r;
}

/** Fatura um período fechado de um depositante (a cobrança é vencida: depois que o período termina). */
export async function gerarFaturamentoArmazemAcao(empresaId: string, depositanteId: string, periodoInicio: string): Promise<Resultado<{ pedidoId: string; numero: number }>> {
  let mensagem = "";
  const r = await executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const escopo = await escopoEmpresa();
    exigirEmpresaNoEscopo(escopo, String(empresaId), "Estabelecimento fora da empresa atual.");
    if (!ehDataISO(periodoInicio)) throw new ErroAcao("Período inválido.");
    const res = await gerarUm(String(empresaId), String(depositanteId), periodoInicio, u.id, await urlBase(), escopo.ativa.id);
    revalidar();
    mensagem = `Pedido nº ${fmtNumeroDoc(res.numero)} faturado: ${fmtMoeda(res.valor)} (${res.rotulo}), vencimento ${dataBr(res.vencimento)}.${res.cobrancaId ? " Boleto/Pix gerado e enviado." : res.erroCobranca ? ` Atenção: a cobrança não foi gerada (${res.erroCobranca}).` : ""}`;
    return { pedidoId: res.pedidoId, numero: res.numero };
  });
  return r.ok ? { ...r, mensagem } : r;
}

/** Fatura todos os períodos fechados e pendentes (com tarifa e valor a cobrar). */
export async function gerarTodosFaturamentosArmazem(estab?: string | null): Promise<Resultado<{ gerados: number; erros: { depositante: string; erro: string }[] }>> {
  let mensagem = "";
  const r = await executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const escopo = await escopoEmpresa();
    const dados = await carregarFaturamento({ aba: "pendentes", estab: estab ?? "", depositante: "" });
    const pendentes = dados.linhas.filter((l) => l.situacao === "PENDENTE" && l.periodo);
    if (!pendentes.length) throw new ErroAcao("Nenhum período pendente de faturamento.");
    const base = await urlBase();
    const gerados: number[] = [];
    const erros: { depositante: string; erro: string }[] = [];
    for (const l of pendentes) {
      try {
        gerados.push((await gerarUm(l.empresaId, l.depositanteId, l.periodo!.inicio, u.id, base, escopo.ativa.id)).numero);
      } catch (e) {
        erros.push({ depositante: l.depositante, erro: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
      }
    }
    revalidar();
    mensagem = `${gerados.length} faturamento(s) gerado(s)${gerados.length ? `: pedidos nº ${gerados.map(fmtNumeroDoc).join(", ")}` : ""}.`;
    if (erros.length) mensagem += ` ${erros.length} com erro: ${erros.map((e) => `${e.depositante}: ${e.erro}`).join("; ")}`;
    return { gerados: gerados.length, erros };
  });
  return r.ok ? { ...r, mensagem } : r;
}

/** Desfaz o faturamento (cancela a cobrança em aberto, exclui a conta a receber e cancela o pedido). */
export async function desfazerFaturamentoArmazemAcao(id: string): Promise<Resultado> {
  return executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const escopo = await escopoEmpresa();
    const r = await desfazerFaturamentoArmazem(String(id), escopo.ids);
    await auditar(
      "desfazer_faturamento_armazenagem",
      "armazem",
      String(id),
      `Armazenagem de ${r.rotulo} · ${r.depositante} · ${fmtMoeda(r.valor)} desfeita${r.numero ? ` (pedido nº ${fmtNumeroDoc(r.numero)} cancelado)` : ""}${r.cobrancasCanceladas ? " · cobrança cancelada no Asaas" : ""}`,
      undefined,
      { usuarioId: u.id, empresaId: escopo.ativa.id },
    );
    revalidar();
    return undefined;
  }, "Faturamento desfeito: o pedido foi cancelado e a conta a receber, excluída.");
}

const esquemaEnvioDemonstrativo = z.object({
  para: z.string().trim().min(3, "Informe o e-mail do cliente."),
  mensagem: z.string().trim().max(2000).optional().nullable(),
});

/** Manda o demonstrativo de um período faturado ao cliente, em PDF (útil para a tarifa sem boleto/Pix). */
export async function enviarDemonstrativoPorEmail(faturamentoId: string, entrada: z.input<typeof esquemaEnvioDemonstrativo>): Promise<Resultado> {
  let mensagem = "";
  const r = await executar(async () => {
    const u = await exigirPermissao("financeiro:editar");
    const escopo = await escopoEmpresa();
    if (!configuracaoEmail().configurado) throw new ErroAcao("O envio de e-mails ainda não está configurado. Um administrador configura em Configurações › E-mails.");
    const d = esquemaEnvioDemonstrativo.parse(entrada);
    const para = emailsValidos(d.para);
    if (!para.length) throw new ErroAcao("Informe um e-mail válido.", { para: "E-mail inválido." });
    const { anexoDemonstrativo } = await import("./demonstrativo");
    const { dados, anexo } = await anexoDemonstrativo(String(faturamentoId), escopo.ids);
    const modelo = modeloDemonstrativo({
      empresa: dados.empresaNome,
      cliente: dados.cliente.nome,
      periodo: dados.periodo.rotulo,
      resumo: dados.resumo,
      valor: fmtMoeda(dados.valor),
      vencimento: dataBr(dados.vencimento),
      mensagem: d.mensagem,
    });
    const e = await enfileirar({ empresaId: dados.matrizId, tipo: "demonstrativo_armazenagem", origemId: String(faturamentoId), para, responderPara: dados.emailEmpresa, anexos: [anexo], usuarioId: u.id, ...modelo });
    await auditar("enviar_demonstrativo_armazenagem", "armazem", String(faturamentoId), `Demonstrativo da armazenagem de ${dados.periodo.rotulo} · ${dados.cliente.nome} enviado para ${para.join(", ")}`, null, {
      usuarioId: u.id,
      empresaId: escopo.ativa.id,
    });
    mensagem = e.status === "ENVIADO" ? `Demonstrativo enviado para ${para.join(", ")}.` : `Demonstrativo na fila para ${para.join(", ")}; o envio será tentado de novo em instantes.`;
    return undefined;
  });
  return r.ok ? { ...r, mensagem } : r;
}
