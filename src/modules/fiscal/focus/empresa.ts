// Ativação de um estabelecimento na Focus NFe com o Token Master da conta (API de empresas, só em produção).
// Envia os dados do cadastro e o certificado A1 que já está guardado no ERP, liga a busca de NF-e, CT-e e NFS-e
// recebidas e devolve os tokens da empresa (guardados cifrados pelo chamador). Nunca roda sem o clique do administrador:
// cada CNPJ cadastrado conta no plano da Focus.
import "server-only";
import { chamarFocus, ErroFocus, mensagemFocus } from "./cliente";

export type DadosEmpresaFocus = {
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  inscricaoEstadual: string | null;
  inscricaoMunicipal: string | null;
  regimeTributario: "MEI" | "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
};

const REGIME: Record<DadosEmpresaFocus["regimeTributario"], number> = { SIMPLES_NACIONAL: 1, MEI: 4, LUCRO_PRESUMIDO: 3, LUCRO_REAL: 3 };

type EmpresaFocus = { id?: number | string; cnpj?: string; token_producao?: string; token_homologacao?: string };

export async function ativarNaFocus(opcoes: {
  tokenMaster: string;
  empresa: DadosEmpresaFocus;
  pfx: Buffer;
  senha: string;
  tipos: { nfe: boolean; cte: boolean; nfse: boolean };
}): Promise<{ id: string; tokenProducao: string; tokenHomologacao: string | null }> {
  const e = opcoes.empresa;
  const cnpj = e.cnpj.replace(/\D/g, "");
  const corpo = {
    nome: e.razaoSocial,
    nome_fantasia: e.nomeFantasia ?? undefined,
    cnpj,
    inscricao_estadual: e.inscricaoEstadual ?? undefined,
    inscricao_municipal: e.inscricaoMunicipal ?? undefined,
    regime_tributario: REGIME[e.regimeTributario],
    email: e.email ?? undefined,
    telefone: e.telefone ?? undefined,
    cep: e.cep ? Number(e.cep.replace(/\D/g, "")) : undefined,
    logradouro: e.logradouro ?? undefined,
    numero: e.numero ?? undefined,
    complemento: e.complemento ?? undefined,
    bairro: e.bairro ?? undefined,
    municipio: e.cidade ?? undefined,
    uf: e.uf ?? undefined,
    arquivo_certificado_base64: opcoes.pfx.toString("base64"),
    senha_certificado: opcoes.senha,
    habilita_manifestacao: opcoes.tipos.nfe,
    habilita_manifestacao_cte: opcoes.tipos.cte,
    habilita_nfsen_recebidas_producao: opcoes.tipos.nfse,
    habilita_filtro_mde_destinatario_empresa: true,
  };
  const busca = await chamarFocus(opcoes.tokenMaster, 1, `/v2/empresas?cnpj=${cnpj}`);
  if (busca.status !== 200) throw new ErroFocus(mensagemFocus(busca), busca.status);
  const existentes = JSON.parse(busca.texto) as EmpresaFocus[];
  const atual = existentes.find((x) => (x.cnpj ?? "").replace(/\D/g, "") === cnpj);
  const r = atual?.id
    ? await chamarFocus(opcoes.tokenMaster, 1, `/v2/empresas/${atual.id}`, { metodo: "PUT", corpo })
    : await chamarFocus(opcoes.tokenMaster, 1, `/v2/empresas`, { metodo: "POST", corpo });
  if (r.status !== 200 && r.status !== 201) throw new ErroFocus(mensagemFocus(r), r.status);
  const salvo = JSON.parse(r.texto) as EmpresaFocus;
  const tokenProducao = salvo.token_producao || atual?.token_producao;
  if (!salvo.id || !tokenProducao) throw new ErroFocus("A Focus NFe não devolveu o id e o token da empresa.", r.status);
  return { id: String(salvo.id), tokenProducao, tokenHomologacao: salvo.token_homologacao || atual?.token_homologacao || null };
}
