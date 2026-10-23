// Motor SEFAZ direto (padrão, sem custo): DistDFe de NF-e e CT-e, ADN da NFS-e e manifestação no Ambiente Nacional.
import "server-only";
import type { MotorCaptacao } from "../motor";
import { ESPERA_SEFAZ_MS } from "../motor";
import type { TipoDoc } from "../tipos";
import { consultarAdn } from "./adn";
import { CODIGO_UF, criarAgente, materialDoPfx } from "./conexao";
import { consultarDistribuicao } from "./distribuicao";
import { enviarManifestacao } from "./manifestacao";

export function criarMotorSefaz(ctx: { cnpj: string; uf: string | null; ambiente: 1 | 2; pfx: Buffer; senha: string }): MotorCaptacao {
  const material = materialDoPfx(ctx.pfx, ctx.senha);
  const agente = criarAgente(material);
  const cUF = CODIGO_UF[(ctx.uf ?? "").toUpperCase()] ?? "";
  return {
    motor: "SEFAZ",
    // NF-e e CT-e (NT 2014.002) e NFS-e (manual do ADN): 1 hora depois de "nenhum documento" ou do fim do acervo
    esperaSemNovidade: (_tipo: TipoDoc) => ESPERA_SEFAZ_MS,
    consultar: (tipo, nsu) =>
      tipo === "NFSE"
        ? consultarAdn(agente, { cnpj: ctx.cnpj, ambiente: ctx.ambiente, ultNsu: nsu })
        : consultarDistribuicao(agente, tipo, { cnpj: ctx.cnpj, cUF, ambiente: ctx.ambiente, ultNsu: nsu }),
    manifestar: (chave, tipo, justificativa) => enviarManifestacao(agente, material, { chave, cnpj: ctx.cnpj, tipo, justificativa, ambiente: ctx.ambiente }),
    encerrar: () => agente.destroy(),
  };
}
