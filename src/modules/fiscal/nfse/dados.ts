// Dados da NFS-e a partir do pedido faturado: uma DPS por código de tributação nacional (a DPS tem um serviço só),
// com a lista do que impede a emissão. Só servidor.
import "server-only";
import { prisma } from "@/lib/db";
import { num } from "@/lib/serial";
import { validarDocumento } from "@/lib/format";
import { validadeCertificadoEmissao } from "@/modules/configuracoes/certificado";
import type { DadosDps, EnderecoNfse, PessoaNfse } from "./montagem";
import { codigoTributacaoNacionalDe, TEXTO_SIMPLES_NFSE, type ProblemaNfse } from "./tipos";

const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export type DadosDpsSemNumero = Omit<DadosDps, "serie" | "numero" | "emissao">;

export type GrupoServico = {
  codigoTributacaoNacional: string;
  itens: { id: string; descricao: string; quantidade: number; unidade: string; precoUnitario: number; total: number }[];
  dados: DadosDpsSemNumero;
};

function enderecoDe(p: { logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; codigoMunicipio: string | null; cep: string | null }): EnderecoNfse | null {
  if (!p.logradouro?.trim() || !p.bairro?.trim() || dig(p.codigoMunicipio).length !== 7 || dig(p.cep).length !== 8) return null;
  return { logradouro: p.logradouro, numero: p.numero?.trim() || "S/N", complemento: p.complemento, bairro: p.bairro, codigoMunicipio: dig(p.codigoMunicipio), cep: dig(p.cep) };
}

const fmtQtd = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const fmtValor = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function prepararNfse(pedidoId: string, escopoIds: string[]) {
  const pedido = await prisma.pedido.findFirst({
    where: { id: pedidoId, empresaId: { in: escopoIds } },
    include: { empresa: true, pessoa: true, itens: { orderBy: { ordem: "asc" }, include: { produto: true } } },
  });
  if (!pedido) return null;
  const problemas: ProblemaNfse[] = [];
  const emp = pedido.empresa;
  const config = await prisma.configuracaoFiscal.findUnique({ where: { empresaId: emp.id } });
  const linkEmpresa = "/configuracoes/empresa";
  const linkCliente = `/cadastros/pessoas?q=${encodeURIComponent(pedido.pessoa.documento ?? pedido.pessoa.nome)}`;
  const ambiente = (config?.nfseAmbiente === 1 ? 1 : 2) as 1 | 2;
  const motor = config?.nfseMotor ?? "SEFAZ";

  if (pedido.status !== "FATURADO") problemas.push({ campo: "pedido", mensagem: "Fature o pedido antes de emitir a NFS-e." });
  if (!config?.nfseAtiva) problemas.push({ campo: "config", mensagem: "A emissão de NFS-e ainda não está ligada para este estabelecimento. Um administrador liga em Configurações › Empresas e filiais › Emissão de NFS-e.", link: linkEmpresa });
  if (dig(emp.codigoMunicipio).length !== 7) problemas.push({ campo: "emitente.municipio", mensagem: "Cadastre o município (código IBGE) da empresa: a NFS-e é emitida pelo município do prestador.", link: linkEmpresa });
  if (dig(emp.cnpj).length !== 14) problemas.push({ campo: "emitente.cnpj", mensagem: "CNPJ da empresa inválido.", link: linkEmpresa });
  const regime = emp.regimeTributario;
  if (regime === "LUCRO_PRESUMIDO" || regime === "LUCRO_REAL")
    problemas.push({ campo: "emitente.regime", mensagem: "Empresa do regime normal: a NFS-e exige a alíquota do ISS do município, que ainda não está nesta etapa.", link: linkEmpresa });
  if (config?.nfseMunicipioAderente === false)
    problemas.push({
      campo: "municipio",
      mensagem: `O município ${emp.cidade ?? dig(emp.codigoMunicipio)} ainda não habilitou o Emissor Nacional (conferido em ${config.nfseMunicipioConferidoEm?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? "—"}). A partir de 01/11/2026 toda empresa do Simples fica habilitada; confira de novo em Configurações.`,
      link: linkEmpresa,
    });
  if (motor === "SEFAZ") {
    const cert = await validadeCertificadoEmissao(emp.id);
    if (!cert) problemas.push({ campo: "certificado", mensagem: "Envie o certificado digital A1 em Configurações › Empresas e filiais.", link: linkEmpresa });
    else if (cert.validoAte < new Date()) problemas.push({ campo: "certificado", mensagem: "O certificado digital A1 venceu. Envie o renovado.", link: linkEmpresa });
  } else if (!(ambiente === 1 ? config?.focusTokenProducao : config?.focusTokenHomologacao)) {
    problemas.push({ campo: "focus", mensagem: "O estabelecimento ainda não foi ativado na Focus NFe para este ambiente.", link: linkEmpresa });
  }

  // tomador
  const p = pedido.pessoa;
  const doc = dig(p.documento);
  if (!doc || !validarDocumento(doc)) problemas.push({ campo: "tomador.documento", mensagem: "O cliente precisa de CPF ou CNPJ válido.", link: linkCliente });
  const tomador: PessoaNfse = { documento: doc, nome: p.nome, endereco: enderecoDe(p), telefone: p.telefone, email: p.email };

  // serviços agrupados pelo código de tributação nacional
  const servicos = pedido.itens.filter((i) => i.tipo === "SERVICO");
  const produtos = pedido.itens.filter((i) => i.tipo === "PRODUTO");
  if (!servicos.length) problemas.push({ campo: "itens", mensagem: "O pedido não tem serviços: os produtos saem na NF-e." });
  const porCodigo = new Map<string, GrupoServico["itens"]>();
  for (const i of servicos) {
    const prod = i.produto;
    const codigo = prod ? dig(prod.codigoTributacaoNacional) || codigoTributacaoNacionalDe(prod.codigoServico) : null;
    if (!prod) problemas.push({ campo: "item", mensagem: `O item "${i.descricao}" não está ligado a um serviço do cadastro.` });
    else if (!codigo || codigo.length !== 6)
      problemas.push({ campo: "item.codigo", mensagem: `Cadastre o item da LC 116 (ex.: 01.07) ou o código de tributação nacional (6 dígitos) do serviço "${prod.descricao}".`, link: `/cadastros/produtos?q=${encodeURIComponent(prod.codigo)}` });
    const chave = codigo && codigo.length === 6 ? codigo : "000000";
    const lista = porCodigo.get(chave) ?? [];
    lista.push({ id: i.id, descricao: i.descricao, quantidade: num(i.quantidade), unidade: i.unidade || prod?.unidade || "UN", precoUnitario: num(i.precoUnitario), total: num(i.total) });
    porCodigo.set(chave, lista);
  }
  const opSimpNac = regime === "MEI" ? 2 : regime === "SIMPLES_NACIONAL" ? 3 : 1;
  // xInfComp não aceita quebra de linha (TSString): tudo numa linha só
  const informacoes = [config?.nfseInformacoes?.trim() || (opSimpNac !== 1 ? TEXTO_SIMPLES_NFSE : ""), `Pedido nº ${pedido.numero}`].filter(Boolean).join(" | ");
  const competencia = pedido.dataFaturamento ?? pedido.emissao;
  const grupos: GrupoServico[] = [...porCodigo.entries()].map(([codigo, itens]) => {
    const vServ = Math.round(itens.reduce((a, i) => a + i.total, 0) * 100) / 100;
    const primeiroProduto = servicos.find((s) => s.id === itens[0].id)?.produto;
    const descricao = itens
      .map((i) => (i.quantidade !== 1 ? `${i.descricao} - ${fmtQtd(i.quantidade)} ${i.unidade} x R$ ${fmtValor(i.precoUnitario)} = R$ ${fmtValor(i.total)}` : `${i.descricao} - R$ ${fmtValor(i.total)}`))
      .join("\n");
    if (vServ <= 0) problemas.push({ campo: "itens", mensagem: "O total dos serviços ficou zerado." });
    return {
      codigoTributacaoNacional: codigo,
      itens,
      dados: {
        ambiente,
        competencia,
        cLocEmi: dig(emp.codigoMunicipio),
        prestador: {
          cnpj: dig(emp.cnpj),
          im: config?.nfseEnviarIM ? dig(emp.inscricaoMunicipal) || null : null,
          opSimpNac,
          regApTribSN: opSimpNac === 3 ? 1 : null,
          regEspTrib: 0,
        },
        tomador,
        servico: {
          cLocPrestacao: dig(emp.codigoMunicipio),
          cTribNac: codigo,
          cTribMun: dig(primeiroProduto?.codigoTributacaoMunicipal) || null,
          cNBS: dig(primeiroProduto?.codigoNbs) || null,
          descricao,
        },
        valores: { vServ, descontoIncondicionado: 0, tribISSQN: 1, tpRetISSQN: 1, pTotTribSN: opSimpNac === 3 ? num(config?.nfseAliquotaSimples ?? 0) : null },
        informacoesComplementares: informacoes,
        numeroPedido: String(pedido.numero),
      },
    };
  });
  if (opSimpNac === 3 && config && num(config.nfseAliquotaSimples) <= 0)
    problemas.push({ campo: "aliquota", mensagem: "Informe a alíquota efetiva do Simples Nacional (pTotTribSN) em Configurações › Emissão de NFS-e; o contador tem o valor do mês.", link: linkEmpresa });

  return { pedido, empresa: emp, config, motor, ambiente, grupos, problemas, temProdutos: produtos.length > 0 };
}
