import { fmtMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrigemMov } from "@/modules/conciliacao/tipos";

/** Valor com sinal: créditos em verde, débitos em vermelho. */
export function ValorExtrato({ valor, className }: { valor: number; className?: string }) {
  return (
    <span className={cn("tabular font-medium whitespace-nowrap", valor > 0 ? "text-success" : valor < 0 ? "text-destructive" : "text-muted-foreground", className)}>
      {valor > 0 ? "+" : ""}
      {fmtMoeda(valor)}
    </span>
  );
}

export const ROTULO_ORIGEM: Record<OrigemMov, string> = {
  BAIXA: "Baixa de título",
  TRANSFERENCIA: "Transferência",
  AJUSTE: "Ajuste",
};
