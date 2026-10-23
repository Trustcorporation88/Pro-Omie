"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { excluirLancamentoEstoque } from "@/modules/estoque/acoes";

/** Excluir entrada ou ajuste (o saldo volta a ser o de antes). */
export function BotaoExcluirLancamento({ id, rotulo }: { id: string; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" className="size-8" aria-label={`Excluir ${rotulo}`} onClick={() => setAberto(true)}>
        <Trash2 />
      </Button>
      {aberto && (
        <ConfirmarAcao
          aberto
          onAbertoChange={(v) => !v && setAberto(false)}
          titulo={`Excluir ${rotulo}?`}
          descricao="O saldo dos materiais volta a ser o de antes deste lançamento. Se parte do material já foi vendida, a exclusão é recusada: faça um ajuste."
          rotuloConfirmar="Excluir"
          destrutivo
          acao={() => excluirLancamentoEstoque(id)}
          aoConcluir={() => setAberto(false)}
        />
      )}
    </>
  );
}
