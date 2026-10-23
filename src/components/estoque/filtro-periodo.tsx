"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Período do relatório: atalhos (este mês, mês passado…) ou datas livres (de / até). */
export function FiltroPeriodo({ periodo, de, ate, opcoes }: { periodo: string; de: string; ate: string; opcoes: readonly { valor: string; rotulo: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();

  const ir = (mudancas: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    iniciar(() => router.replace(p.toString() ? `${pathname}?${p}` : pathname, { scroll: false }));
  };

  const data = (campo: "de" | "ate", valor: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number(valor.slice(0, 4)) < 2000) return;
    ir({ periodo: "personalizado", de: campo === "de" ? valor : de, ate: campo === "ate" ? valor : ate });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Período" className="inline-flex flex-wrap rounded-lg bg-muted p-1">
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={periodo === o.valor}
            onClick={() => ir({ periodo: o.valor === "mes" ? null : o.valor, de: null, ate: null })}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
              periodo === o.valor ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
            )}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <Input key={`de-${de}`} type="date" defaultValue={de} aria-label="De" className="h-9 w-[150px] bg-card" onChange={(e) => data("de", e.target.value)} />
        <span className="text-muted-foreground">até</span>
        <Input key={`ate-${ate}`} type="date" defaultValue={ate} aria-label="Até" className="h-9 w-[150px] bg-card" onChange={(e) => data("ate", e.target.value)} />
      </div>
      {pendente && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          <LoaderCircle className="size-3.5 animate-spin" /> Atualizando…
        </span>
      )}
    </div>
  );
}
