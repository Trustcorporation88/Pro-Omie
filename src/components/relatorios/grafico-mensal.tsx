"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CaixaDica, ItemLegenda } from "./dica-grafico";
import { fmtMoedaCompacta } from "./formatos";

export type PontoMensal = { mes: string; rotulo: string; entradas: number; saidas: number; resultado: number };

const COR = { entrada: "var(--chart-1)", saida: "var(--chart-2)" };
const EIXO = { fontSize: 11, fill: "var(--muted-foreground)" };

function Dica({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
  const p = payload?.[0]?.payload as PontoMensal | undefined;
  if (!active || !p) return null;
  return (
    <CaixaDica
      titulo={p.rotulo}
      linhas={[
        { rotulo: "Entradas", valor: p.entradas, cor: COR.entrada },
        { rotulo: "Saídas", valor: p.saidas, cor: COR.saida },
        { rotulo: "Resultado", valor: p.resultado, destaque: true },
      ]}
    />
  );
}

/** Entradas × saídas realizadas por mês (barras lado a lado). */
export function GraficoMensal({ pontos }: { pontos: PontoMensal[] }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <ItemLegenda cor={COR.entrada}>Entradas</ItemLegenda>
        <ItemLegenda cor={COR.saida}>Saídas</ItemLegenda>
      </div>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={pontos} margin={{ top: 6, right: 4, bottom: 0, left: 4 }} barGap={3} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
            <YAxis tickFormatter={fmtMoedaCompacta} tick={EIXO} tickLine={false} axisLine={false} width={72} />
            <Tooltip content={(p) => <Dica active={p.active} payload={p.payload} />} cursor={{ fill: "var(--muted)", fillOpacity: 0.6 }} />
            <Bar dataKey="entradas" name="Entradas" fill={COR.entrada} radius={[3, 3, 0, 0]} maxBarSize={30} />
            <Bar dataKey="saidas" name="Saídas" fill={COR.saida} radius={[3, 3, 0, 0]} maxBarSize={30} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
