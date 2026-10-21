// Caixa de tooltip padrão dos gráficos (valores em R$). Sem hooks: usada dentro de componentes client.
import { fmtMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";

export type LinhaDica = { rotulo: string; valor: number; cor?: string; opacidade?: number; destaque?: boolean };

export function CaixaDica({ titulo, linhas, rodape }: { titulo: React.ReactNode; linhas: LinhaDica[]; rodape?: React.ReactNode }) {
  return (
    <div className="min-w-[230px] rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1.5 font-medium">{titulo}</div>
      <div className="space-y-1">
        {linhas.map((l) => (
          <div key={l.rotulo} className={cn("flex items-center justify-between gap-6", l.destaque && "mt-1 border-t pt-1.5 font-medium")}>
            <span className={cn("flex items-center gap-1.5", !l.destaque && "text-muted-foreground")}>
              {l.cor && <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: l.cor, opacity: l.opacidade ?? 1 }} />}
              {l.rotulo}
            </span>
            <span className={cn("tabular", l.valor < -0.004 && "text-destructive")}>{fmtMoeda(l.valor)}</span>
          </div>
        ))}
      </div>
      {rodape && <div className="mt-1.5 border-t pt-1.5 text-muted-foreground">{rodape}</div>}
    </div>
  );
}

export function ItemLegenda({ cor, opacidade = 1, linha, children }: { cor: string; opacidade?: number; linha?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {linha ? (
        <span className="h-0.5 w-3.5 rounded-full" style={{ background: cor }} />
      ) : (
        <span className="size-2.5 rounded-[3px]" style={{ background: cor, opacity: opacidade }} />
      )}
      {children}
    </span>
  );
}
