"use client";

import { useParametros } from "@/components/filtros";
import { rotuloConta } from "@/modules/conciliacao/utils";
import type { ContaConciliacao } from "@/modules/conciliacao/tipos";

/** Troca a conta conciliada (?conta=) preservando aba e período. */
export function SeletorConta({ contas, atual }: { contas: ContaConciliacao[]; atual: string }) {
  const { definir } = useParametros();
  return (
    <select
      aria-label="Conta bancária"
      value={atual}
      onChange={(e) => definir({ conta: e.target.value })}
      className="h-9 max-w-80 min-w-56 truncate rounded-md border border-input bg-card px-3 text-sm shadow-xs"
    >
      {contas.map((c) => (
        <option key={c.id} value={c.id}>
          {rotuloConta(c)}
        </option>
      ))}
    </select>
  );
}
