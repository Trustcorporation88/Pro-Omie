"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CaixaDica, ItemLegenda } from "./dica-grafico";
import { fmtMoedaCompacta } from "./formatos";

export type PontoFluxo = {
  chave: string;
  rotulo: string;
  rotuloCurto: string;
  entradasRealizadas: number;
  entradasPrevistas: number;
  saidasRealizadas: number;
  saidasPrevistas: number;
  resultado: number;
  saldo: number;
  contemHoje: boolean;
};

const COR = { entrada: "var(--chart-1)", saida: "var(--chart-2)", saldo: "var(--chart-3)", hoje: "var(--chart-4)" };
const OPACIDADE_PREVISTO = 0.4;
const EIXO = { fontSize: 11, fill: "var(--muted-foreground)" };

type PropsDica = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> };

function Dica({ active, payload }: PropsDica) {
  const p = payload?.[0]?.payload as PontoFluxo | undefined;
  if (!active || !p) return null;
  return (
    <CaixaDica
      titulo={
        <>
          {p.rotulo}
          {p.contemHoje && <span className="ml-1.5 font-normal text-muted-foreground">· inclui hoje</span>}
        </>
      }
      linhas={[
        { rotulo: "Entradas realizadas", valor: p.entradasRealizadas, cor: COR.entrada },
        { rotulo: "Entradas previstas", valor: p.entradasPrevistas, cor: COR.entrada, opacidade: OPACIDADE_PREVISTO },
        { rotulo: "Saídas realizadas", valor: p.saidasRealizadas, cor: COR.saida },
        { rotulo: "Saídas previstas", valor: p.saidasPrevistas, cor: COR.saida, opacidade: OPACIDADE_PREVISTO },
        { rotulo: "Resultado do período", valor: p.resultado, destaque: true },
        { rotulo: "Saldo acumulado", valor: p.saldo, cor: COR.saldo },
      ]}
    />
  );
}

/** Barras de entradas (verde) e saídas (vermelho) por período — sólidas = realizado, claras = previsto — e linha do saldo acumulado. */
export function GraficoFluxo({ pontos }: { pontos: PontoFluxo[] }) {
  const curto = new Map(pontos.map((p) => [p.chave, p.rotuloCurto]));
  const chaveHoje = pontos.find((p) => p.contemHoje)?.chave;
  const saldoNegativo = pontos.some((p) => p.saldo < 0);
  const barra = Math.max(6, Math.min(26, Math.floor(560 / Math.max(pontos.length, 1))));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <ItemLegenda cor={COR.entrada}>Entradas realizadas</ItemLegenda>
        <ItemLegenda cor={COR.entrada} opacidade={OPACIDADE_PREVISTO}>Entradas previstas</ItemLegenda>
        <ItemLegenda cor={COR.saida}>Saídas realizadas</ItemLegenda>
        <ItemLegenda cor={COR.saida} opacidade={OPACIDADE_PREVISTO}>Saídas previstas</ItemLegenda>
        <ItemLegenda cor={COR.saldo} linha>
          Saldo acumulado (eixo direito)
        </ItemLegenda>
        {chaveHoje && (
          <ItemLegenda cor={COR.hoje} linha>
            Hoje
          </ItemLegenda>
        )}
      </div>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={pontos} margin={{ top: 18, right: 4, bottom: 0, left: 4 }} barGap={2} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="chave"
              tickFormatter={(c: string) => curto.get(c) ?? c}
              tick={EIXO}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={14}
            />
            <YAxis yAxisId="fluxo" tickFormatter={fmtMoedaCompacta} tick={EIXO} tickLine={false} axisLine={false} width={76} />
            <YAxis
              yAxisId="saldo"
              orientation="right"
              tickFormatter={fmtMoedaCompacta}
              tick={{ ...EIXO, fill: COR.saldo }}
              tickLine={false}
              axisLine={false}
              width={76}
            />
            <Tooltip content={(p) => <Dica active={p.active} payload={p.payload} />} cursor={{ fill: "var(--muted)", fillOpacity: 0.6 }} />
            {chaveHoje && (
              <ReferenceLine
                yAxisId="fluxo"
                x={chaveHoje}
                stroke={COR.hoje}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: "hoje", position: "top", fill: COR.hoje, fontSize: 11, fontWeight: 600 }}
              />
            )}
            {saldoNegativo && <ReferenceLine yAxisId="saldo" y={0} stroke="var(--destructive)" strokeOpacity={0.5} strokeDasharray="2 3" />}
            <Bar yAxisId="fluxo" dataKey="entradasRealizadas" name="Entradas realizadas" stackId="entradas" fill={COR.entrada} maxBarSize={barra} />
            <Bar
              yAxisId="fluxo"
              dataKey="entradasPrevistas"
              name="Entradas previstas"
              stackId="entradas"
              fill={COR.entrada}
              fillOpacity={OPACIDADE_PREVISTO}
              maxBarSize={barra}
            />
            <Bar yAxisId="fluxo" dataKey="saidasRealizadas" name="Saídas realizadas" stackId="saidas" fill={COR.saida} maxBarSize={barra} />
            <Bar
              yAxisId="fluxo"
              dataKey="saidasPrevistas"
              name="Saídas previstas"
              stackId="saidas"
              fill={COR.saida}
              fillOpacity={OPACIDADE_PREVISTO}
              maxBarSize={barra}
            />
            <Line
              yAxisId="saldo"
              type="monotone"
              dataKey="saldo"
              name="Saldo acumulado"
              stroke={COR.saldo}
              strokeWidth={2}
              dot={pontos.length <= 45 ? { r: 2.5, fill: COR.saldo, strokeWidth: 0 } : false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
