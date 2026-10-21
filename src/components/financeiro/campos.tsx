"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtNumero, parseMoeda } from "@/lib/format";
import type { Opcao } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

/** Rótulo + controle + mensagem de erro/ajuda. */
export function Campo({
  id,
  rotulo,
  obrigatorio,
  erro,
  ajuda,
  className,
  children,
}: {
  id?: string;
  rotulo: React.ReactNode;
  obrigatorio?: boolean;
  erro?: string;
  ajuda?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {rotulo}
        {obrigatorio && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {erro ? (
        <p className="text-xs text-destructive" role="alert">
          {erro}
        </p>
      ) : ajuda ? (
        <p className="text-xs text-muted-foreground">{ajuda}</p>
      ) : null}
    </div>
  );
}

/** Select nativo no visual do shadcn (aceita valor vazio, ao contrário do Radix Select). */
export function CampoSelect({
  opcoes,
  valor,
  onChange,
  vazio,
  className,
  ...props
}: {
  opcoes: Opcao[];
  valor: string;
  onChange: (v: string) => void;
  /** rótulo da opção vazia; omita para não oferecer opção vazia */
  vazio?: string;
} & Omit<React.ComponentProps<"select">, "value" | "onChange">) {
  // valor gravado que não está mais entre as opções ativas (ex.: categoria inativada)
  const ausente = !!valor && !opcoes.some((o) => o.valor === valor);
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30",
        className,
      )}
      {...props}
    >
      {vazio !== undefined && <option value="">{vazio}</option>}
      {ausente && <option value={valor}>(registro inativo)</option>}
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  );
}

/** Controle segmentado (grupo de botões exclusivos). */
export function Segmentado<T extends string>({
  valor,
  onChange,
  opcoes,
  rotulo,
  className,
}: {
  valor: T;
  onChange: (v: T) => void;
  opcoes: { valor: T; rotulo: React.ReactNode }[];
  rotulo: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className={cn("inline-flex flex-wrap rounded-lg bg-muted p-1", className)}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition [&_svg]:size-4",
            valor === o.valor && "bg-background text-foreground shadow-sm",
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Campo de percentual: aceita "33,33" e formata ao sair (texto livre só enquanto focado). */
export function CampoPercentual({
  valor,
  onChange,
  className,
  ...props
}: { valor: number; onChange: (v: number) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  // null = fora de foco: exibe o valor formatado vindo do pai
  const [texto, setTexto] = useState<string | null>(null);
  const formatado = valor ? fmtNumero(valor) : "";
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        value={texto ?? formatado}
        onFocus={() => setTexto(formatado)}
        onChange={(e) => {
          setTexto(e.target.value);
          onChange(parseMoeda(e.target.value));
        }}
        onBlur={() => {
          const n = parseMoeda(texto ?? formatado);
          setTexto(null);
          onChange(n);
        }}
        className={cn("pr-7 text-right tabular", className)}
        {...props}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
    </div>
  );
}

/** Linha "rótulo: valor" usada em resumos de diálogos. */
export function ItemResumo({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-sm", className)}>
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
