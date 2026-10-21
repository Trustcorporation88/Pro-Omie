"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { fmtNumero, parseMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Campo de valor em reais: aceita "1.234,56" e formata ao sair do campo. */
export function CampoMoeda({
  valor,
  onChange,
  className,
  ...props
}: { valor: number | null | undefined; onChange: (v: number) => void } & Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange"
>) {
  // Enquanto o campo está em edição, mostra o texto digitado; fora dele, o valor formatado das props.
  const [rascunho, setRascunho] = useState<string | null>(null);
  const exibido = rascunho ?? (valor ? fmtNumero(valor) : "");
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
      <Input
        inputMode="decimal"
        value={exibido}
        onFocus={() => setRascunho(valor ? fmtNumero(valor) : "")}
        onChange={(e) => {
          setRascunho(e.target.value);
          onChange(parseMoeda(e.target.value));
        }}
        onBlur={() => {
          if (rascunho !== null) onChange(parseMoeda(rascunho));
          setRascunho(null);
        }}
        className={cn("pl-8 text-right tabular", className)}
        {...props}
      />
    </div>
  );
}
