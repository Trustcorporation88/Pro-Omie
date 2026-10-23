import { Selo } from "@/components/selos";
import { ROTULO_MANIFESTACAO, ROTULO_SITUACAO, ROTULO_TIPO_DOC, type Direcao, type Situacao, type TipoDoc, type TipoManifestacao } from "@/modules/fiscal/tipos";

const TOM_MANIF: Record<TipoManifestacao, "info" | "sucesso" | "perigo" | "alerta"> = {
  CIENCIA: "info",
  CONFIRMACAO: "sucesso",
  DESCONHECIMENTO: "perigo",
  NAO_REALIZADA: "alerta",
};

export function SeloTipoDoc({ tipo }: { tipo: TipoDoc }) {
  return <Selo tom={tipo === "NFE" ? "info" : tipo === "CTE" ? "roxo" : "neutro"}>{ROTULO_TIPO_DOC[tipo]}</Selo>;
}

/** Situação da nota para quem recebe: cancelada pesa mais que a manifestação. */
export function SeloSituacaoNota({
  tipo,
  situacao,
  manifestacao,
  direcao,
}: {
  tipo: TipoDoc;
  situacao: Situacao;
  manifestacao: TipoManifestacao | null;
  direcao: Direcao;
}) {
  if (situacao !== "AUTORIZADO") return <Selo tom="perigo">{ROTULO_SITUACAO[situacao]}</Selo>;
  if (tipo !== "NFE" || direcao !== "ENTRADA") return <Selo tom="sucesso">{ROTULO_SITUACAO[situacao]}</Selo>;
  if (!manifestacao) return <Selo tom="alerta">Sem manifestação</Selo>;
  return <Selo tom={TOM_MANIF[manifestacao]}>{ROTULO_MANIFESTACAO[manifestacao]}</Selo>;
}
