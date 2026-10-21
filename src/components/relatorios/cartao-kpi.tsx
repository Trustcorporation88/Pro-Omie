// Cartões de indicador e barras horizontais (HTML puro, sem estado: servem a server components).
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { fmtMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Tom = "neutro" | "sucesso" | "perigo" | "info" | "alerta" | "roxo";

const COR_VALOR: Record<Tom, string> = {
  neutro: "",
  sucesso: "text-success",
  perigo: "text-destructive",
  info: "text-primary",
  alerta: "text-[oklch(0.5_0.13_65)] dark:text-warning",
  roxo: "text-chart-5",
};

const COR_ICONE: Record<Tom, string> = {
  neutro: "bg-muted text-muted-foreground",
  sucesso: "bg-success/12 text-success",
  perigo: "bg-destructive/10 text-destructive",
  info: "bg-primary/10 text-primary",
  alerta: "bg-warning/15 text-[oklch(0.5_0.13_65)] dark:text-warning",
  roxo: "bg-chart-5/12 text-chart-5",
};

export function CartaoKpi({
  titulo,
  valor,
  icone: Icone,
  tom = "neutro",
  tomValor,
  href,
  children,
  className,
}: {
  titulo: React.ReactNode;
  valor: React.ReactNode;
  icone?: LucideIcon;
  /** cor do ícone */
  tom?: Tom;
  /** cor do valor (padrão: neutro) */
  tomValor?: Tom;
  href?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const conteudo = (
    <Card
      className={cn(
        "h-full gap-1 px-4 py-3.5 shadow-xs",
        href && "transition-colors group-hover:border-primary/40 group-hover:bg-accent/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{titulo}</span>
        {Icone && (
          <span className={cn("rounded-md p-1", COR_ICONE[tom])}>
            <Icone className="size-3.5" />
          </span>
        )}
      </div>
      <div className={cn("text-xl font-semibold tracking-tight tabular", COR_VALOR[tomValor ?? "neutro"])}>{valor}</div>
      {children && <div className="text-xs leading-relaxed text-muted-foreground">{children}</div>}
    </Card>
  );
  if (!href) return conteudo;
  return (
    <Link href={href} className="group block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      {conteudo}
    </Link>
  );
}

/** Barras horizontais com rótulo, valor e participação. */
export function BarrasHorizontais({ itens, cor = "var(--chart-2)" }: { itens: { nome: string; valor: number; apagado?: boolean }[]; cor?: string }) {
  const maior = Math.max(...itens.map((i) => i.valor), 0);
  const total = itens.reduce((a, i) => a + i.valor, 0);
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => (
        <li key={i.nome} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={cn("truncate", i.apagado && "text-muted-foreground")} title={i.nome}>
              {i.nome}
            </span>
            <span className="shrink-0 tabular">
              {fmtMoeda(i.valor)}
              <span className="ml-1.5 inline-block w-10 text-right text-xs text-muted-foreground">
                {total > 0 ? `${Math.round((i.valor / total) * 100)}%` : ""}
              </span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${maior > 0 ? Math.max(2, (i.valor / maior) * 100) : 0}%`, background: cor, opacity: i.apagado ? 0.45 : 1 }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
