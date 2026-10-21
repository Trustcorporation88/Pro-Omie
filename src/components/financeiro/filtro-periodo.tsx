"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useParametros } from "@/components/filtros";
import { addDias, addMeses, ehISOValido, fimMes, inicioMes } from "@/lib/datas";
import { cn } from "@/lib/utils";

/**
 * Período (de/até) gravado na URL, com atalhos. Recebe o período efetivo (com padrão aplicado no servidor).
 * Remonte com key={`${de}|${ate}`} para sincronizar após a navegação.
 */
export function FiltroPeriodo({ de, ate, hoje }: { de: string; ate: string; hoje: string }) {
  const { definir } = useParametros();
  const [valorDe, setValorDe] = useState(de);
  const [valorAte, setValorAte] = useState(ate);
  const mesPassado = addMeses(inicioMes(hoje), -1);
  const atalhos = [
    { rotulo: "Este mês", de: inicioMes(hoje), ate: fimMes(hoje) },
    { rotulo: "Mês anterior", de: mesPassado, ate: fimMes(mesPassado) },
    { rotulo: "Últimos 30 dias", de: addDias(hoje, -29), ate: hoje },
  ];

  const aplicar = (novoDe: string, novoAte: string) => {
    if (!ehISOValido(novoDe) || !ehISOValido(novoAte)) return;
    const [a, b] = novoDe <= novoAte ? [novoDe, novoAte] : [novoAte, novoDe];
    setValorDe(a);
    setValorAte(b);
    definir({ de: a, ate: b });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        De
        <Input
          type="date"
          value={valorDe}
          onChange={(e) => {
            setValorDe(e.target.value);
            aplicar(e.target.value, valorAte);
          }}
          className="h-9 w-[150px] bg-card"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        até
        <Input
          type="date"
          value={valorAte}
          onChange={(e) => {
            setValorAte(e.target.value);
            aplicar(valorDe, e.target.value);
          }}
          className="h-9 w-[150px] bg-card"
        />
      </label>
      <div className="inline-flex flex-wrap rounded-lg bg-muted p-1">
        {atalhos.map((a) => (
          <button
            key={a.rotulo}
            type="button"
            onClick={() => aplicar(a.de, a.ate)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium text-muted-foreground transition",
              de === a.de && ate === a.ate && "bg-background text-foreground shadow-sm",
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}
