"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { executar, type Resultado } from "@/lib/acoes";
import { ErroAcao, exigirPermissao } from "@/lib/auth/sessao";
import { escopoEmpresa, exigirContaNoEscopo, exigirEmpresaNoEscopo } from "@/lib/auth/empresa";
import { auditar } from "@/lib/auditoria";
import { ENTIDADES, type EntidadeCadastro } from "./campos";
import * as E from "./esquemas";

type Registro = { id: string; ativo?: boolean } & Record<string, unknown>;
type Delegado = {
  create(a: { data: Record<string, unknown> }): Promise<Registro>;
  update(a: { where: { id: string }; data: Record<string, unknown> }): Promise<Registro>;
  delete(a: { where: { id: string } }): Promise<Registro>;
  findUnique(a: { where: { id: string } }): Promise<Registro | null>;
  findFirst(a: { where: Record<string, unknown> }): Promise<Registro | null>;
};
type Esquema = { parse(v: unknown): Record<string, unknown> };

function configuracao(entidade: EntidadeCadastro): { delegado: Delegado; esquema: Esquema; nome: string; rotulo: (r: Registro) => string } {
  const d = (x: unknown) => x as Delegado;
  switch (entidade) {
    case "pessoas":
      return { delegado: d(prisma.pessoa), esquema: E.esquemaPessoa, nome: "pessoa", rotulo: (r) => String(r.nome) };
    case "produtos":
      return { delegado: d(prisma.produto), esquema: E.esquemaProduto, nome: "produto", rotulo: (r) => `${r.codigo} ${r.descricao}` };
    case "categorias":
      return { delegado: d(prisma.categoria), esquema: E.esquemaCategoria, nome: "categoria", rotulo: (r) => String(r.nome) };
    case "centros-de-custo":
      return { delegado: d(prisma.centroCusto), esquema: E.esquemaCentroCusto, nome: "centro_custo", rotulo: (r) => String(r.nome) };
    case "contas-bancarias":
      return { delegado: d(prisma.contaBancaria), esquema: E.esquemaContaBancaria, nome: "conta_bancaria", rotulo: (r) => String(r.nome) };
    case "formas-de-pagamento":
      return { delegado: d(prisma.formaPagamento), esquema: E.esquemaFormaPagamento, nome: "forma_pagamento", rotulo: (r) => String(r.nome) };
    case "condicoes-de-pagamento":
      return { delegado: d(prisma.condicaoPagamento), esquema: E.esquemaCondicaoPagamento, nome: "condicao_pagamento", rotulo: (r) => String(r.nome) };
    case "contratos":
      return { delegado: d(prisma.contrato), esquema: E.esquemaContrato, nome: "contrato", rotulo: (r) => `Contrato ${r.numero}: ${r.descricao}` };
    case "ordens":
      return { delegado: d(prisma.ordemServico), esquema: E.esquemaOrdem, nome: "ordem_servico", rotulo: (r) => `OS ${r.numero}: ${r.descricao}` };
  }
}

function validarEntidade(entidade: string): EntidadeCadastro {
  if (!ENTIDADES.includes(entidade as EntidadeCadastro)) throw new ErroAcao("Cadastro desconhecido.");
  return entidade as EntidadeCadastro;
}

/**
 * Confere que o registro pertence à empresa ativa e devolve o registro.
 * Contas bancárias pertencem à matriz ou a uma filial; os demais cadastros, à matriz.
 */
async function registroDaEmpresa(ent: EntidadeCadastro, id: string, delegado: Delegado): Promise<Registro> {
  const escopo = await escopoEmpresa();
  if (ent === "contas-bancarias") await exigirContaNoEscopo(escopo, id, "id");
  const atual = await delegado.findFirst({
    where: ent === "contas-bancarias" ? { id, empresaId: { in: escopo.ids } } : { id, empresaId: escopo.ativa.id },
  });
  if (!atual) throw new ErroAcao("Registro não encontrado nesta empresa.");
  return atual;
}

export async function salvarCadastro(
  entidade: string,
  id: string | null,
  valores: Record<string, unknown>,
): Promise<Resultado<{ id: string }>> {
  return executar(async () => {
    await exigirPermissao("cadastros:editar");
    const ent = validarEntidade(entidade);
    const { delegado, esquema, nome, rotulo } = configuracao(ent);
    const dados = esquema.parse(valores);
    const escopo = await escopoEmpresa();
    if (ent === "contas-bancarias") {
      // conta da matriz ou de uma filial dela, escolhida no formulário
      exigirEmpresaNoEscopo(escopo, (dados as { empresaId?: string }).empresaId, "Empresa fora do escopo atual. Troque de empresa no menu.");
    } else {
      // demais cadastros pertencem à empresa (matriz) ativa; o formulário não escolhe
      dados.empresaId = escopo.ativa.id;
    }
    if (id) {
      const antes = await registroDaEmpresa(ent, id, delegado);
      const r = await delegado.update({ where: { id }, data: dados });
      await auditar("atualizar", nome, id, rotulo(r), { antes, depois: dados });
      revalidatePath(`/cadastros/${ent}`);
      return { id: r.id };
    }
    if (ent === "contratos" || ent === "ordens") {
      // numeração por empresa e competência inicial do contrato
      const seq = await prisma.sequenciaDocumento.upsert({ where: { empresaId_tipo: { empresaId: escopo.ativa.id, tipo: ent === "contratos" ? "contrato" : "os" } }, create: { empresaId: escopo.ativa.id, tipo: ent === "contratos" ? "contrato" : "os", ultimo: 1 }, update: { ultimo: { increment: 1 } } });
      dados.numero = seq.ultimo;
      dados.criadoPorId = (await exigirPermissao("cadastros:editar")).id;
      if (ent === "contratos") {
        const inicio = dados.inicio as Date;
        dados.proximaCompetencia = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
      }
    }
    const r = await delegado.create({ data: dados });
    await auditar("criar", nome, r.id, rotulo(r), dados);
    revalidatePath(`/cadastros/${ent}`);
    return { id: r.id };
  }, id ? "Alterações salvas." : "Cadastro criado.");
}

export async function alternarAtivoCadastro(entidade: string, id: string): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("cadastros:editar");
    const ent = validarEntidade(entidade);
    const { delegado, nome, rotulo } = configuracao(ent);
    const atual = await registroDaEmpresa(ent, id, delegado);
    const r = await delegado.update({ where: { id }, data: { ativo: !atual.ativo } });
    await auditar(r.ativo ? "ativar" : "inativar", nome, id, rotulo(r));
    revalidatePath(`/cadastros/${ent}`);
    return undefined;
  }, "Situação atualizada.");
}

export async function excluirCadastro(entidade: string, id: string): Promise<Resultado> {
  return executar(async () => {
    await exigirPermissao("cadastros:editar");
    const ent = validarEntidade(entidade);
    const { delegado, nome, rotulo } = configuracao(ent);
    await registroDaEmpresa(ent, id, delegado);
    const r = await delegado.delete({ where: { id } });
    await auditar("excluir", nome, id, rotulo(r), r);
    revalidatePath(`/cadastros/${ent}`);
    return undefined;
  }, "Registro excluído.");
}
