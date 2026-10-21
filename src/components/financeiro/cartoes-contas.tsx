import Link from "next/link";
import { Landmark } from "lucide-react";
import type { SaldoConta } from "@/modules/financeiro/servicos";
import { arred2, fmtMoeda } from "@/lib/format";
import { ROTULOS } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

/** Grade com o saldo atual de cada conta ativa; clicar seleciona a conta do extrato (preservando o período). */
export function CartoesContas({
  saldos,
  selecionada,
  periodo,
}: {
  saldos: SaldoConta[];
  selecionada: string | null;
  /** de/até informados na URL (só os explícitos são preservados) */
  periodo: { de?: string; ate?: string };
}) {
  const total = arred2(saldos.reduce((a, s) => a + s.saldo, 0));
  const href = (id: string) => {
    const p = new URLSearchParams({ conta: id });
    if (periodo.de) p.set("de", periodo.de);
    if (periodo.ate) p.set("ate", periodo.ate);
    return `/financeiro/movimentacoes?${p.toString()}`;
  };
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {saldos.map((s) => {
        const ativa = s.id === selecionada;
        return (
          <Link
            key={s.id}
            href={href(s.id)}
            scroll={false}
            aria-current={ativa ? "true" : undefined}
            className={cn(
              "group rounded-xl border bg-card p-4 shadow-sm outline-none transition hover:border-primary/40 hover:shadow focus-visible:ring-[3px] focus-visible:ring-ring/50",
              ativa && "border-primary/60 ring-1 ring-primary/25",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{s.nome}</span>
              <Landmark className={cn("size-4 shrink-0 text-muted-foreground opacity-60", ativa && "text-primary opacity-100")} />
            </div>
            <div className="text-xs text-muted-foreground">{ROTULOS.tipoConta[s.tipo as keyof typeof ROTULOS.tipoConta] ?? s.tipo}</div>
            <div className={cn("mt-2 truncate text-lg font-semibold tracking-tight tabular", s.saldo < 0 && "text-destructive")}>{fmtMoeda(s.saldo)}</div>
          </Link>
        );
      })}
      {saldos.length > 1 && (
        <div className="rounded-xl border border-dashed p-4">
          <div className="text-sm font-medium text-muted-foreground">Saldo total</div>
          <div className="text-xs text-muted-foreground">{saldos.length} contas ativas</div>
          <div className={cn("mt-2 truncate text-lg font-semibold tracking-tight tabular", total < 0 && "text-destructive")}>{fmtMoeda(total)}</div>
        </div>
      )}
    </div>
  );
}
