"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Hook para alterar parâmetros da URL preservando os demais. */
export function useParametros() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const definir = (mudancas: Record<string, string | null | undefined>, opts: { resetarPagina?: boolean } = { resetarPagina: true }) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null || v === undefined || v === "") p.delete(k);
      else p.set(k, v);
    }
    if (opts.resetarPagina) p.delete("pagina");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return { params, definir };
}

export function CampoBusca({ placeholder = "Buscar…", className }: { placeholder?: string; className?: string }) {
  const { params, definir } = useParametros();
  const [valor, setValor] = useState(params.get("q") ?? "");
  useEffect(() => {
    const atual = params.get("q") ?? "";
    if (valor === atual) return;
    const t = setTimeout(() => definir({ q: valor }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);
  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  );
}

/** Abas de filtro que gravam um parâmetro na URL. */
export function AbasFiltro({
  parametro,
  opcoes,
  padrao,
}: {
  parametro: string;
  opcoes: { valor: string; rotulo: string; contador?: number }[];
  padrao: string;
}) {
  const { params, definir } = useParametros();
  const atual = params.get(parametro) ?? padrao;
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-muted p-1">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => definir({ [parametro]: o.valor === padrao ? null : o.valor })}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition",
            atual === o.valor && "bg-background text-foreground shadow-sm",
          )}
        >
          {o.rotulo}
          {o.contador !== undefined && <span className="ml-1.5 text-xs opacity-60">{o.contador}</span>}
        </button>
      ))}
    </div>
  );
}

export function SelectFiltro({
  parametro,
  opcoes,
  rotuloTodos = "Todos",
  className,
}: {
  parametro: string;
  opcoes: { valor: string; rotulo: string }[];
  rotuloTodos?: string;
  className?: string;
}) {
  const { params, definir } = useParametros();
  return (
    <select
      value={params.get(parametro) ?? ""}
      onChange={(e) => definir({ [parametro]: e.target.value })}
      className={cn("h-9 rounded-md border border-input bg-card px-3 text-sm shadow-xs", className)}
    >
      <option value="">{rotuloTodos}</option>
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}

export function DataFiltro({ parametro, rotulo }: { parametro: string; rotulo: string }) {
  const { params, definir } = useParametros();
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {rotulo}
      <Input
        type="date"
        value={params.get(parametro) ?? ""}
        onChange={(e) => definir({ [parametro]: e.target.value })}
        className="h-9 w-[150px] bg-card"
      />
    </label>
  );
}

export function Paginacao({ pagina, total, porPagina }: { pagina: number; total: number; porPagina: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return <p className="mt-3 text-xs text-muted-foreground">{total} registro(s)</p>;
  const href = (p: number) => {
    const q = new URLSearchParams(params.toString());
    if (p <= 1) q.delete("pagina");
    else q.set("pagina", String(p));
    return `${pathname}?${q.toString()}`;
  };
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
      <span>
        {total} registro(s) · página {pagina} de {paginas}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" asChild disabled={pagina <= 1}>
          <Link href={href(pagina - 1)} aria-disabled={pagina <= 1} className={cn(pagina <= 1 && "pointer-events-none opacity-50")}>
            <ChevronLeft /> Anterior
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={href(pagina + 1)} className={cn(pagina >= paginas && "pointer-events-none opacity-50")}>
            Próxima <ChevronRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
