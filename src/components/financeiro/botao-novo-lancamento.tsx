"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormularioLancamento } from "./formulario-lancamento";
import { TEXTOS, type OpcoesFormulario, type TipoTitulo } from "./tipos";

/** Botão "Nova conta a receber/pagar" que abre o formulário de lançamento. */
export function BotaoNovoLancamento({
  tipo,
  opcoes,
  hoje,
  variant = "default",
}: {
  tipo: TipoTitulo;
  opcoes: OpcoesFormulario;
  hoje: string;
  variant?: "default" | "outline";
}) {
  const [aberto, setAberto] = useState(false);
  const [chave, setChave] = useState(0);
  return (
    <>
      <Button
        variant={variant}
        onClick={() => {
          setChave((k) => k + 1);
          setAberto(true);
        }}
      >
        <Plus /> {TEXTOS[tipo].novo}
      </Button>
      {aberto && <FormularioLancamento key={chave} tipo={tipo} opcoes={opcoes} hoje={hoje} aberto={aberto} onAbertoChange={setAberto} />}
    </>
  );
}
