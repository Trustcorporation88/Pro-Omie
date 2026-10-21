"use client";

// Grade da DRE: 12 meses + total + % da receita bruta, grupos recolhíveis,
// cabeçalho e primeira coluna fixos ao rolar.
import { Fragment, useState } from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LinhaDre, LinhaDetalhe } from "@/modules/relatorios/dre-calculo";
import { fmtNumero } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fmtPct } from "./formatos";

type Props = {
  linhas: LinhaDre[];
  /** rótulos dos 12 meses (ex.: "jan/26") */
  meses: string[];
  /** meses ainda por vir (esmaecidos) */
  futuros: boolean[];
  mostrarPct?: boolean;
  /** título da primeira coluna */
  rotuloConta?: string;
  /** botões "expandir/recolher tudo" */
  controles?: boolean;
  className?: string;
};

const CEL = "border-b border-border/70 px-3 py-1.5 text-right tabular whitespace-nowrap";
const PRIMEIRA = "sticky left-0 z-10 border-b border-r border-border/70 px-3 py-1.5 text-left";

function Numero({ v, futuro, pct }: { v: number | null; futuro?: boolean; pct?: boolean }) {
  if (v === null || Math.abs(v) < 0.005) return <span className="text-muted-foreground/40">—</span>;
  return <span className={cn(v < 0 && "text-destructive", futuro && "opacity-50")}>{pct ? fmtPct(v) : fmtNumero(v)}</span>;
}

export function TabelaDre({ linhas, meses, futuros, mostrarPct = true, rotuloConta = "Descrição", controles = true, className }: Props) {
  const expansiveis = linhas.flatMap((l) => (l.tipo === "grupo" && l.filhos.length ? [l.id] : []));
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => new Set());
  const tudoAberto = expansiveis.length > 0 && expansiveis.every((id) => abertos.has(id));
  const alternar = (id: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const celulasValores = (valores: (number | null)[], total: number | null, pct: number | null, opts: { pct?: boolean; fundo?: string } = {}) => (
    <>
      {valores.map((v, i) => (
        <td key={i} className={cn(CEL, opts.fundo)}>
          <Numero v={v} futuro={futuros[i]} pct={opts.pct} />
        </td>
      ))}
      <td className={cn(CEL, "border-l font-medium", opts.fundo)}>
        <Numero v={total} pct={opts.pct} />
      </td>
      {mostrarPct && (
        <td className={cn(CEL, "text-xs text-muted-foreground", opts.fundo)}>
          {opts.pct || pct === null || total === null || Math.abs(total) < 0.005 ? (
            ""
          ) : (
            <span className={cn(pct < 0 && "text-destructive")}>{fmtPct(pct)}</span>
          )}
        </td>
      )}
    </>
  );

  const linhaDetalhe = (l: LinhaDetalhe, filho: boolean) => (
    <tr key={l.id} className={cn(filho && "text-[13px]")}>
      <td className={cn(PRIMEIRA, "bg-card", filho && "pl-10 text-muted-foreground")}>
        <span className="flex items-center gap-1.5">
          {l.codigo && <span className="tabular text-xs text-muted-foreground/70">{l.codigo}</span>}
          <span className={cn("truncate", l.sintetica && "italic")} title={l.rotulo}>
            {l.rotulo}
          </span>
          {l.dica && (
            <span title={l.dica} className="text-muted-foreground/70">
              <Info className="size-3.5" />
            </span>
          )}
        </span>
      </td>
      {celulasValores(l.valores, l.total, l.pct)}
    </tr>
  );

  return (
    <div className={cn("space-y-2", className)}>
      {controles && expansiveis.length > 0 && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setAbertos(tudoAberto ? new Set() : new Set(expansiveis))}
          >
            {tudoAberto ? <ChevronsDownUp /> : <ChevronsUpDown />}
            {tudoAberto ? "Recolher categorias" : "Expandir categorias"}
          </Button>
        </div>
      )}
      <div className="relative max-h-[72vh] overflow-auto rounded-lg border bg-card">
        <table className="w-full min-w-[1480px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[290px] border-b border-r bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                {rotuloConta}
              </th>
              {meses.map((m, i) => (
                <th
                  key={m}
                  className={cn(
                    "sticky top-0 z-20 min-w-[96px] border-b bg-card px-3 py-2 text-right text-xs font-medium",
                    futuros[i] ? "text-muted-foreground/60" : "text-muted-foreground",
                  )}
                >
                  {m}
                </th>
              ))}
              <th className="sticky top-0 z-20 min-w-[116px] border-b border-l bg-card px-3 py-2 text-right text-xs font-semibold">Total</th>
              {mostrarPct && (
                <th
                  className="sticky top-0 z-20 min-w-[72px] border-b bg-card px-3 py-2 text-right text-xs font-medium text-muted-foreground"
                  title="Percentual do total sobre a receita bruta do ano"
                >
                  % RB
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              if (l.tipo === "linha") return linhaDetalhe(l, false);
              if (l.tipo === "margem") {
                return (
                  <tr key={l.id} className="text-xs italic text-muted-foreground">
                    <td className={cn(PRIMEIRA, "bg-card pl-6")} title={l.dica}>
                      {l.rotulo}
                    </td>
                    {celulasValores(l.valores, l.total, null, { pct: true })}
                  </tr>
                );
              }
              if (l.tipo === "subtotal") {
                const fundo = l.final ? "bg-accent" : "bg-muted";
                return (
                  <tr key={l.id} className="font-semibold">
                    <td className={cn(PRIMEIRA, fundo)}>{l.rotulo}</td>
                    {celulasValores(l.valores, l.total, l.pct, { fundo })}
                  </tr>
                );
              }
              const aberto = abertos.has(l.id);
              const temFilhos = l.filhos.length > 0;
              return (
                <Fragment key={l.id}>
                  <tr className="font-medium">
                    <td className={cn(PRIMEIRA, "bg-card p-0")}>
                      {temFilhos ? (
                        <button
                          type="button"
                          onClick={() => alternar(l.id)}
                          aria-expanded={aberto}
                          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:text-primary"
                        >
                          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-90")} />
                          {l.rotulo}
                          <span className="ml-auto pl-2 text-xs font-normal text-muted-foreground">{l.filhos.length}</span>
                        </button>
                      ) : (
                        <span className="flex items-center gap-1.5 px-3 py-1.5">
                          <span className="size-4 shrink-0" />
                          {l.rotulo}
                        </span>
                      )}
                    </td>
                    {celulasValores(l.valores, l.total, l.pct)}
                  </tr>
                  {aberto && l.filhos.map((f) => linhaDetalhe(f, true))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
