"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao } from "@/lib/auth/sessao";
import { escopoEmpresa, exigirEmpresaNoEscopo } from "@/lib/auth/empresa";
import { pode } from "@/lib/auth/permissoes";
import { auditar } from "@/lib/auditoria";
import { ehISOValido, isoParaDate } from "@/lib/datas";
import { ErroPlanilha, lerPlanilha } from "@/lib/planilha";
import { aplicarImportacao, interpretarPlanilha, paraPrevia, planejarImportacao, type PreviaImportacao, type ResultadoImportacao } from "./planilha";

const TAMANHO_MAXIMO = 2 * 1024 * 1024;
const numeroDoc = (n: number) => String(n).padStart(4, "0");

/** Lê o arquivo do formulário e monta o plano (nada é gravado aqui). */
async function preparar(formData: FormData) {
  const u = await exigirPermissao("estoque:editar");
  const escopo = await escopoEmpresa();
  const estabelecimentoId = String(formData.get("estabelecimentoId") ?? "").trim() || escopo.ativa.id;
  exigirEmpresaNoEscopo(escopo, estabelecimentoId, "Estabelecimento fora da empresa atual. Troque de empresa no menu.");
  const est = await prisma.empresa.findUnique({ where: { id: estabelecimentoId }, select: { id: true, ativo: true, nomeFantasia: true, razaoSocial: true } });
  if (!est) throw new ErroAcao("Estabelecimento não encontrado.");
  if (!est.ativo) throw new ErroAcao("Estabelecimento inativo. Reative em Configurações › Empresas e filiais.");
  const modo = String(formData.get("modo") ?? "") === "INVENTARIO" ? "INVENTARIO" : "ENTRADA";
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroAcao("Escolha a planilha (.xlsx ou .csv).");
  if (arquivo.size > TAMANHO_MAXIMO) throw new ErroAcao("A planilha passa de 2 MB. Divida em arquivos menores (até 1.000 linhas cada).");
  const nome = (arquivo.name || "planilha.xlsx").replace(/[\r\n\t]/g, " ").trim().slice(0, 120);
  let planilha;
  try {
    planilha = lerPlanilha(new Uint8Array(await arquivo.arrayBuffer()));
  } catch (e) {
    if (e instanceof ErroPlanilha) throw new ErroAcao(e.message);
    throw e;
  }
  const lida = interpretarPlanilha(planilha);
  const plano = await planejarImportacao({
    matrizId: escopo.ativa.id,
    estabelecimento: { id: est.id, nome: est.nomeFantasia || est.razaoSocial },
    modo,
    lida,
    podeCadastrar: pode(u.papel, "cadastros:editar"),
    arquivo: nome,
  });
  return { u, escopo, plano };
}

/** Prévia da importação: o que cada linha vai fazer, com os erros a corrigir. Não grava nada. */
export async function conferirPlanilhaEstoque(formData: FormData): Promise<Resultado<PreviaImportacao>> {
  return executar(async () => paraPrevia((await preparar(formData)).plano));
}

/** Importa a planilha conferida (a assinatura da prévia precisa bater: nada mudou desde a conferência). */
export async function importarPlanilhaEstoque(formData: FormData): Promise<Resultado<ResultadoImportacao>> {
  let mensagem = "";
  const r = await executar(async () => {
    const { u, escopo, plano } = await preparar(formData);
    const data = String(formData.get("data") ?? "").trim();
    if (!ehISOValido(data) || Number(data.slice(0, 4)) < 2000 || Number(data.slice(0, 4)) > 2200) throw new ErroAcao("Informe a data do lançamento.", { data: "Informe a data." });
    const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 500) || null;
    if (String(formData.get("assinatura") ?? "") !== plano.assinatura)
      throw new ErroAcao("A planilha, o cadastro ou o estoque mudaram desde a conferência. Confira de novo antes de importar.");
    const res = await aplicarImportacao(plano, { matrizId: escopo.ativa.id, usuarioId: u.id, data: isoParaDate(data), observacao });
    const partes = [
      res.novos ? `${res.novos === 1 ? "1 material novo" : `${res.novos} materiais novos`}` : "",
      res.atualizados ? `${res.atualizados === 1 ? "1 material atualizado" : `${res.atualizados} materiais atualizados`}` : "",
      res.lancamento ? `${res.lancamento.tipo === "ENTRADA" ? "entrada" : "ajuste de inventário"} nº ${numeroDoc(res.lancamento.numero)} com ${res.lancamento.itens === 1 ? "1 item" : `${res.lancamento.itens} itens`}` : "",
      res.custosAtualizados ? `${res.custosAtualizados === 1 ? "1 custo médio atualizado" : `${res.custosAtualizados} custos médios atualizados`}` : "",
    ].filter(Boolean);
    mensagem = `Planilha importada: ${partes.join(", ")}.`;
    await auditar(
      "importar_planilha",
      "estoque",
      res.lancamento?.id ?? null,
      `Planilha ${plano.arquivo} (${plano.modo === "ENTRADA" ? "entrada" : "inventário"}, ${plano.estabelecimento.nome}): ${partes.join(", ")}`.slice(0, 500),
      {
        arquivo: plano.arquivo,
        modo: plano.modo,
        estabelecimentoId: plano.estabelecimento.id,
        novos: plano.linhas.filter((l) => l.acao === "NOVO").map((l) => l.codigo),
        atualizados: plano.linhas.filter((l) => l.acao === "ATUALIZA").map((l) => ({ codigo: l.codigo, mudancas: l.mudancas })),
        lancamento: res.lancamento,
      },
      { usuarioId: u.id, empresaId: escopo.ativa.id },
    );
    for (const caminho of ["/estoque", "/estoque/movimentacoes", "/estoque/vendas", "/estoque/importar", "/cadastros/produtos"]) revalidatePath(caminho);
    return res;
  });
  return r.ok ? { ...r, mensagem } : r;
}
