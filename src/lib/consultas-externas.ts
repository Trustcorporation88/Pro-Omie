import { soDigitos } from "@/lib/format";

export type DadosCnpj = {
  razaoSocial: string;
  nomeFantasia: string;
  cnae: string;
  email: string;
  telefone: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  codigoMunicipio: string;
  situacao: string;
  regimeSugerido: "MEI" | "SIMPLES_NACIONAL" | null;
};

export type DadosCep = {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  codigoMunicipio: string;
};

const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** Consulta pública de CNPJ (BrasilAPI / Receita Federal). */
export async function buscarCnpj(cnpj: string): Promise<DadosCnpj | null> {
  const d = soDigitos(cnpj);
  if (d.length !== 14) return null;
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as Record<string, unknown>;
    return {
      razaoSocial: texto(j.razao_social),
      nomeFantasia: texto(j.nome_fantasia),
      cnae: texto(j.cnae_fiscal),
      email: texto(j.email).toLowerCase(),
      telefone: texto(j.ddd_telefone_1),
      cep: texto(j.cep),
      logradouro: texto(j.logradouro),
      numero: texto(j.numero),
      complemento: texto(j.complemento),
      bairro: texto(j.bairro),
      cidade: texto(j.municipio),
      uf: texto(j.uf),
      codigoMunicipio: texto(j.codigo_municipio_ibge),
      situacao: texto(j.descricao_situacao_cadastral),
      regimeSugerido: j.opcao_pelo_mei ? "MEI" : j.opcao_pelo_simples ? "SIMPLES_NACIONAL" : null,
    };
  } catch {
    return null;
  }
}

/** Consulta de CEP (ViaCEP). */
export async function buscarCep(cep: string): Promise<DadosCep | null> {
  const d = soDigitos(cep);
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as Record<string, unknown>;
    if (j.erro) return null;
    return {
      logradouro: texto(j.logradouro),
      bairro: texto(j.bairro),
      cidade: texto(j.localidade),
      uf: texto(j.uf),
      codigoMunicipio: texto(j.ibge),
    };
  } catch {
    return null;
  }
}
