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
  }
}

function validarEntidade(entidade: string): EntidadeCadastro {
  if (!ENTIDADES.includes(entidade as EntidadeCadastro)) throw new ErroAcao("Cadastro desconhecido.");
  return entidade as EntidadeCadastro;
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
    // Conta bancária pertence a uma empresa: só da empresa ativa (matriz ou filiais).
    if (ent === "contas-bancarias") {
      const escopo = await escopoEmpresa();
      exigirEmpresaNoEscopo(escopo, (dados as { empresaId?: string }).empresaId, "Empresa fora do escopo atual. Troque de empresa no menu.");
      if (id) await exigirContaNoEscopo(escopo, id, "id");
    }
    if (id) {
      const antes = await delegado.findUnique({ where: { id } });
      if (!antes) throw new ErroAcao("Registro não encontrado.");
      const r = await delegado.update({ where: { id }, data: dados });
      await auditar("atualizar", nome, id, rotulo(r), { antes, depois: dados });
      revalidatePath(`/cadastros/${ent}`);
      return { id: r.id };
    }
    const r = await delegado.create({ data: dados });
    await auditar("criar", nome, r.id, rotulo(r), dados);
    revalidatePath(`/cadastros/${ent}`);
    return { id: r.id };
  }, id ? "Alterações salvas." : "Cadastro criado.");
}

export async function alternarAtivoCadastro(entidade: string, id: string): Promise<Resultado> {
  return executar(async () => {
    if (validarEntidade(entidade) === "contas-bancarias") await exigirContaNoEscopo(await escopoEmpresa(), id, "id");
    await exigirPermissao("cadastros:editar");
    const ent = validarEntidade(entidade);
    const { delegado, nome, rotulo } = configuracao(ent);
    const atual = await delegado.findUnique({ where: { id } });
    if (!atual) throw new ErroAcao("Registro não encontrado.");
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
    const r = await delegado.delete({ where: { id } });
    await auditar("excluir", nome, id, rotulo(r), r);
    revalidatePath(`/cadastros/${ent}`);
    return undefined;
  }, "Registro excluído.");
}
