// Dados da NF-e a partir do pedido faturado, com a lista do que impede a emissão (para a tela mostrar e o usuário corrigir).
import "server-only";
import { prisma } from "@/lib/db";
import { num } from "@/lib/serial";
import { validarDocumento } from "@/lib/format";
import { validadeCertificadoEmissao } from "@/modules/configuracoes/certificado";
import { CODIGO_UF } from "../sefaz/conexao";
import { AUTORIZADORA } from "./sefaz";
import type { DadosNfe, Endereco, ItemNfe } from "./montagem";
import { aliquotasIbsCbsDoAno, arred2, calcularIbsCbs, totais } from "./montagem";
import { naturezaPorCfop, PADRAO_FISCAL, TEXTO_SIMPLES, TPAG_POR_MEIO, type ProblemaEmissao } from "./tipos";

const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const CRT = { MEI: 4, SIMPLES_NACIONAL: 1, LUCRO_PRESUMIDO: 3, LUCRO_REAL: 3 } as const;

export type DadosSemNumero = Omit<DadosNfe, "serie" | "numero" | "cNF" | "chave" | "dv" | "emissao" | "tpEmis" | "contingencia">;

type EnderecoBruto = { logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; codigoMunicipio: string | null; cidade: string | null; uf: string | null; cep: string | null; telefone: string | null };

function conferirEndereco(e: EnderecoBruto, quem: string, link: string, problemas: ProblemaEmissao[]): Endereco {
  const faltam = [
    !e.logradouro?.trim() && "logradouro",
    !e.bairro?.trim() && "bairro",
    dig(e.codigoMunicipio).length !== 7 && "código IBGE do município",
    !e.cidade?.trim() && "cidade",
    !(e.uf && CODIGO_UF[e.uf.toUpperCase()]) && "UF",
    dig(e.cep).length !== 8 && "CEP",
  ].filter(Boolean);
  if (faltam.length) problemas.push({ campo: `${quem}.endereco`, mensagem: `Endereço ${quem === "emitente" ? "da empresa" : "do cliente"} incompleto: falta ${faltam.join(", ")}.`, link });
  return {
    logradouro: e.logradouro ?? "",
    numero: e.numero?.trim() || "S/N",
    complemento: e.complemento,
    bairro: e.bairro ?? "",
    codigoMunicipio: dig(e.codigoMunicipio),
    municipio: e.cidade ?? "",
    uf: (e.uf ?? "").toUpperCase(),
    cep: dig(e.cep),
    telefone: e.telefone,
  };
}

/** Regra fiscal do item: o que estiver no produto ou o padrão (reciclável da produção própria ou revenda). */
export function regraFiscal(p: { grupoMaterial: string | null; cfopInterno: string | null; cfopInterestadual: string | null; csosnInterno: string | null; csosnInterestadual: string | null; textoFiscal: string | null }, interna: boolean) {
  const padrao = p.grupoMaterial ? PADRAO_FISCAL.reciclavel : PADRAO_FISCAL.produto;
  const csosn = (interna ? p.csosnInterno : p.csosnInterestadual) || (interna ? padrao.csosnInterno : padrao.csosnInterestadual);
  return {
    cfop: (interna ? p.cfopInterno : p.cfopInterestadual) || (interna ? padrao.cfopInterno : padrao.cfopInterestadual),
    csosn,
    // o texto legal só vale nas vendas dentro do estado; o padrão (diferimento do art. 392) só acompanha o CSOSN padrão (400)
    texto: interna ? (p.textoFiscal ?? (csosn === padrao.csosnInterno ? padrao.textoFiscal : "")) : "",
  };
}

export async function prepararNfe(pedidoId: string, escopoIds: string[]) {
  const pedido = await prisma.pedido.findFirst({
    where: { id: pedidoId, empresaId: { in: escopoIds } },
    include: {
      empresa: true,
      pessoa: true,
      formaPagamento: { select: { meio: true } },
      itens: { orderBy: { ordem: "asc" }, include: { produto: true } },
    },
  });
  if (!pedido) return null;
  const problemas: ProblemaEmissao[] = [];
  const emp = pedido.empresa;
  const config = await prisma.configuracaoFiscal.findUnique({ where: { empresaId: emp.id } });
  const linkEmpresa = "/configuracoes/empresa";
  const linkCliente = `/cadastros/pessoas?q=${encodeURIComponent(pedido.pessoa.documento ?? pedido.pessoa.nome)}`;

  if (pedido.status !== "FATURADO") problemas.push({ campo: "pedido", mensagem: "Fature o pedido antes de emitir a NF-e (o faturamento gera as contas a receber e baixa o estoque)." });
  if (!config?.nfeAtiva) problemas.push({ campo: "config", mensagem: "A emissão de NF-e ainda não está ligada para este estabelecimento. Um administrador liga em Configurações › Empresas e filiais › Emissão de NF-e.", link: linkEmpresa });
  const crt = CRT[emp.regimeTributario];
  // grupo IBS/CBS (NT 2025.002): opcional por estabelecimento; Simples Nacional/MEI só em homologação até a NT específica sair
  const ambiente = config?.nfeAmbiente === 1 ? 1 : 2;
  const modoIbsCbs = config?.nfeIbsCbs ?? "NAO";
  const informarIbsCbs = modoIbsCbs === "SEMPRE" ? crt === 3 || ambiente === 2 : modoIbsCbs === "HOMOLOGACAO" ? ambiente === 2 : false;
  const ibsCbs = informarIbsCbs ? aliquotasIbsCbsDoAno(new Date().getFullYear()) : null;
  if (crt === 3 && !informarIbsCbs) problemas.push({ campo: "emitente.regime", mensagem: "Empresa do regime normal: a NF-e exige o grupo IBS/CBS. Ligue 'Informar IBS/CBS: sempre' na configuração de emissão.", link: linkEmpresa });
  if (informarIbsCbs && !ibsCbs) problemas.push({ campo: "config.ibscbs", mensagem: `As alíquotas de referência do IBS/CBS de ${new Date().getFullYear()} ainda não estão no sistema (dependem de resolução do Senado). Desligue o grupo IBS/CBS na configuração de emissão ou atualize o sistema.`, link: linkEmpresa });
  if (!dig(emp.inscricaoEstadual)) problemas.push({ campo: "emitente.ie", mensagem: "Cadastre a inscrição estadual da empresa.", link: linkEmpresa });
  const enderEmit = conferirEndereco(emp, "emitente", linkEmpresa, problemas);
  const motor = config?.nfeMotor ?? "SEFAZ";
  if (motor === "SEFAZ") {
    if (enderEmit.uf && !AUTORIZADORA[enderEmit.uf]) problemas.push({ campo: "emitente.uf", mensagem: `A emissão direta ainda não atende a UF ${enderEmit.uf}. Use o motor Focus NFe.`, link: linkEmpresa });
    const cert = await validadeCertificadoEmissao(emp.id);
    if (!cert) problemas.push({ campo: "certificado", mensagem: "Envie o certificado digital A1 em Configurações › Empresas e filiais.", link: linkEmpresa });
    else if (cert.validoAte < new Date()) problemas.push({ campo: "certificado", mensagem: "O certificado digital A1 venceu. Envie o renovado.", link: linkEmpresa });
  } else if (!(config?.nfeAmbiente === 1 ? config?.focusTokenProducao : config?.focusTokenHomologacao)) {
    problemas.push({ campo: "focus", mensagem: "O estabelecimento ainda não foi ativado na Focus NFe para este ambiente.", link: linkEmpresa });
  }

  // destinatário
  const p = pedido.pessoa;
  const docDest = dig(p.documento);
  if (!docDest || !validarDocumento(docDest)) problemas.push({ campo: "destinatario.documento", mensagem: "O cliente precisa de CPF ou CNPJ válido.", link: linkCliente });
  const enderDest = conferirEndereco(p, "destinatario", linkCliente, problemas);
  const indIEDest = p.indicadorIE === "CONTRIBUINTE" ? 1 : p.indicadorIE === "ISENTO" ? 2 : 9;
  if (indIEDest === 1 && !dig(p.inscricaoEstadual)) problemas.push({ campo: "destinatario.ie", mensagem: "Cliente contribuinte do ICMS sem inscrição estadual: cadastre a IE ou mude o indicador.", link: linkCliente });
  const interna = !!enderEmit.uf && enderEmit.uf === enderDest.uf;

  // itens (só produtos; serviços vão na NFS-e)
  const produtos = pedido.itens.filter((i) => i.tipo === "PRODUTO");
  const servicos = pedido.itens.filter((i) => i.tipo === "SERVICO");
  if (!produtos.length) problemas.push({ campo: "itens", mensagem: "O pedido não tem produtos: serviços saem na NFS-e." });
  // pedido.desconto é só a soma dos descontos dos itens (não há desconto no cabeçalho): o desconto da NF-e é o de cada item
  const textos = new Set<string>();
  const itens: ItemNfe[] = produtos.map((i) => {
    const prod = i.produto;
    const link = prod ? `/cadastros/produtos?q=${encodeURIComponent(prod.codigo)}` : undefined;
    const ncm = dig(prod?.ncm);
    if (!prod) problemas.push({ campo: "item", mensagem: `O item "${i.descricao}" não está ligado a um produto do cadastro.` });
    else if (ncm.length !== 8) problemas.push({ campo: "item.ncm", mensagem: `Cadastre o NCM (8 dígitos) do produto "${prod.descricao}".`, link });
    const regra = prod ? regraFiscal(prod, interna) : { cfop: interna ? "5102" : "6102", csosn: "102", texto: "" };
    if (regra.texto) textos.add(regra.texto);
    if (indIEDest === 2 && !["103", "300", "400"].includes(regra.csosn))
      problemas.push({ campo: "item.csosn", mensagem: `Cliente isento de IE: a SEFAZ-SP só aceita CSOSN 103, 300 ou 400 (produto "${i.descricao}").`, link });
    const quantidade = num(i.quantidade);
    const valorUnitario = num(i.precoUnitario);
    const bruto = arred2(quantidade * valorUnitario);
    const total = num(i.total);
    return {
      codigo: prod?.codigo ?? String(i.ordem),
      descricao: i.descricao,
      ncm,
      cest: prod?.cest ?? null,
      cfop: regra.cfop,
      unidade: i.unidade || prod?.unidade || "UN",
      quantidade,
      valorUnitario,
      desconto: Math.max(0, arred2(bruto - total)),
      origem: prod?.origem ?? 0,
      csosn: regra.csosn,
      cstIbsCbs: prod?.cstIbsCbs ?? null,
      cClassTrib: prod?.cClassTrib ?? null,
    };
  });
  if (ibsCbs)
    for (const it of itens) {
      try {
        calcularIbsCbs(0, ibsCbs, it);
      } catch (e) {
        problemas.push({ campo: `item.${it.codigo}.ibscbs`, mensagem: `${it.descricao}: ${e instanceof Error ? e.message : String(e)}`, link: `/cadastros/produtos?q=${encodeURIComponent(it.codigo)}` });
      }
    }
  // conferência de centavos: sem serviços, o total da nota fecha com o total do pedido
  if (!servicos.length && itens.length) {
    const diferenca = arred2(totais({ itens }).vNF - num(pedido.total));
    if (diferenca !== 0 && Math.abs(diferenca) <= 0.05) {
      const ultimo = itens[itens.length - 1];
      ultimo.desconto = Math.max(0, arred2(ultimo.desconto + diferenca));
    }
  }
  const tot = totais({ itens });
  if (itens.length && tot.vNF <= 0) problemas.push({ campo: "itens", mensagem: "O total dos produtos ficou zerado." });

  // pagamento e cobrança: as duplicatas são as contas a receber do faturamento (só quando o pedido é só de produtos)
  const meio = pedido.formaPagamento?.meio ?? "OUTRO";
  const tPag = TPAG_POR_MEIO[meio] ?? "99";
  const titulos = await prisma.titulo.findMany({
    where: { origem: "VENDA", origemId: pedido.id, status: { not: "CANCELADO" } },
    orderBy: { parcela: "asc" },
    select: { vencimento: true, valor: true },
  });
  const emissaoISO = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const somaTitulos = arred2(titulos.reduce((a, t) => a + num(t.valor), 0));
  const aVista = titulos.length <= 1 && (!titulos[0] || titulos[0].vencimento.toISOString().slice(0, 10) <= emissaoISO);
  const usarDuplicatas = !servicos.length && titulos.length > 0 && Math.abs(somaTitulos - tot.vNF) < 0.01 && !aVista && titulos.every((t) => t.vencimento.toISOString().slice(0, 10) >= emissaoISO);
  const cobranca = usarDuplicatas
    ? {
        numero: String(pedido.numero),
        valorOriginal: tot.vNF,
        desconto: 0,
        valorLiquido: tot.vNF,
        duplicatas: titulos.map((t, k) => ({ numero: String(k + 1).padStart(3, "0"), vencimento: t.vencimento.toISOString().slice(0, 10), valor: num(t.valor) })),
      }
    : null;
  const pagamentos = [{ indPag: (aVista ? 0 : 1) as 0 | 1, tPag, valor: tot.vNF }];

  const textoPadrao = (config?.nfeInformacoes ?? TEXTO_SIMPLES).trim();
  const informacoes = [textoPadrao, ...textos, pedido.observacoes?.trim() ? `Pedido nº ${pedido.numero}: ${pedido.observacoes.trim()}` : `Pedido nº ${pedido.numero}`]
    .filter(Boolean)
    .join("\n");

  const dados: DadosSemNumero = {
    ambiente: ambiente as 1 | 2,
    cUF: CODIGO_UF[enderEmit.uf] ?? "35",
    naturezaOperacao: naturezaPorCfop(itens.map((i) => i.cfop)),
    emitente: { cnpj: emp.cnpj, razaoSocial: emp.razaoSocial, nomeFantasia: emp.nomeFantasia, ie: dig(emp.inscricaoEstadual), crt: crt as 1 | 2 | 3 | 4, endereco: enderEmit },
    destinatario: { documento: docDest, nome: p.nome, indIEDest: indIEDest as 1 | 2 | 9, ie: dig(p.inscricaoEstadual) || null, email: p.email, endereco: enderDest },
    itens,
    modFrete: 9,
    pagamentos,
    cobranca,
    informacoesComplementares: informacoes,
    ibsCbs,
  };
  return { pedido, empresa: emp, config, motor, dados, problemas, totais: tot, temServicos: servicos.length > 0 };
}
