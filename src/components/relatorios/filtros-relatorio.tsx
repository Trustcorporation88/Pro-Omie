"use client";

// Barra de filtros dos relatórios: grava os filtros na URL dentro de uma transição (mostra "Atualizando…")
// e exibe o valor escolhido na hora (useOptimistic), mesmo antes de o servidor responder.
import { createContext, useContext, useOptimistic, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Mudancas = Record<string, string | null | undefined>;
type Contexto = { definir: (m: Mudancas, otimista?: () => void) => void; pendente: boolean };

const FiltrosCtx = createContext<Contexto | null>(null);

function useFiltros() {
  const ctx = useContext(FiltrosCtx);
  if (!ctx) throw new Error("Use os filtros dentro de <BarraFiltros>.");
  return ctx;
}

export function BarraFiltros({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();

  const navegar = (qs: string, otimista?: () => void) =>
    iniciar(() => {
      otimista?.();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });

  const definir = (m: Mudancas, otimista?: () => void) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(m)) {
      if (v === null || v === undefined || v === "") p.delete(k);
      else p.set(k, v);
    }
    navegar(p.toString(), otimista);
  };

  const temFiltros = params.toString() !== "";
  return (
    <FiltrosCtx.Provider value={{ definir, pendente }}>
      <div className={cn("mb-4 flex flex-wrap items-end gap-x-3 gap-y-2", className)}>
        {children}
        <div className="flex h-9 items-center gap-2">
          {temFiltros && (
            <Button type="button" variant="ghost" size="sm" onClick={() => navegar("")} className="text-muted-foreground">
              <RotateCcw /> Padrão
            </Button>
          )}
          {pendente && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <LoaderCircle className="size-3.5 animate-spin" /> Atualizando…
            </span>
          )}
        </div>
      </div>
    </FiltrosCtx.Provider>
  );
}

function Rotulo({ texto, children }: { texto?: string; children: React.ReactNode }) {
  if (!texto) return <>{children}</>;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{texto}</span>
      {children}
    </div>
  );
}

/** Abas exclusivas; o valor padrão some da URL. */
export function FiltroAbas({
  parametro,
  valor,
  padrao,
  opcoes,
  rotulo,
}: {
  parametro: string;
  valor: string;
  padrao: string;
  opcoes: { valor: string; rotulo: string }[];
  rotulo?: string;
}) {
  const { definir } = useFiltros();
  const [atual, setAtual] = useOptimistic(valor);
  return (
    <Rotulo texto={rotulo}>
      <div className="inline-flex h-9 items-center rounded-lg bg-muted p-1" role="radiogroup" aria-label={rotulo}>
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={atual === o.valor}
            onClick={() => o.valor !== atual && definir({ [parametro]: o.valor === padrao ? null : o.valor }, () => setAtual(o.valor))}
            className={cn(
              "h-7 rounded-md px-3 text-sm font-medium text-muted-foreground transition",
              atual === o.valor ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
            )}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
    </Rotulo>
  );
}

/** Select nativo. Com `rotuloTodos`, a opção vazia remove o parâmetro; com `padrao`, o padrão some da URL. */
export function FiltroSelect({
  parametro,
  valor,
  opcoes,
  rotulo,
  rotuloTodos,
  padrao,
  className,
}: {
  parametro: string;
  valor: string;
  opcoes: { valor: string; rotulo: string }[];
  rotulo?: string;
  rotuloTodos?: string;
  padrao?: string;
  className?: string;
}) {
  const { definir } = useFiltros();
  const [atual, setAtual] = useOptimistic(valor);
  return (
    <Rotulo texto={rotulo}>
      <select
        value={atual}
        aria-label={rotulo ?? rotuloTodos}
        onChange={(e) => {
          const v = e.target.value;
          definir({ [parametro]: v === padrao ? null : v }, () => setAtual(v));
        }}
        className={cn("h-9 max-w-64 rounded-md border border-input bg-card px-3 text-sm shadow-xs", className)}
      >
        {rotuloTodos !== undefined && <option value="">{rotuloTodos}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </Rotulo>
  );
}

/** Campo de data; só grava datas completas (ano ≥ 2000) e exibe o valor efetivo vindo do servidor. */
export function FiltroData({ parametro, valor, rotulo, padrao }: { parametro: string; valor: string; rotulo: string; padrao?: string }) {
  const { definir } = useFiltros();
  return (
    <Rotulo texto={rotulo}>
      <Input
        key={valor}
        type="date"
        defaultValue={valor}
        aria-label={rotulo}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return definir({ [parametro]: null });
          if (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 2000 && v !== valor) {
            definir({ [parametro]: v === padrao ? null : v });
          }
        }}
        className="h-9 w-[150px] bg-card"
      />
    </Rotulo>
  );
}
