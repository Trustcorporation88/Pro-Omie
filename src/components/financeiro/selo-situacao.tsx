import { Selo } from "@/components/selos";
import { ROTULO_SITUACAO, situacaoTitulo, type Situacao, type StatusTitulo } from "./tipos";

const TOM = {
  aberto: "info",
  vencido: "perigo",
  parcial: "alerta",
  quitado: "sucesso",
  cancelado: "neutro",
} as const satisfies Record<Situacao, "info" | "perigo" | "alerta" | "sucesso" | "neutro">;

/** Selo de status do título (Em aberto, Vencido, Parcial, Quitado, Cancelado). */
export function SeloSituacao({ status, vencimento, hoje, className }: { status: StatusTitulo; vencimento: string; hoje: string; className?: string }) {
  const s = situacaoTitulo(status, vencimento, hoje);
  return (
    <Selo tom={TOM[s]} className={className}>
      {ROTULO_SITUACAO[s]}
    </Selo>
  );
}
