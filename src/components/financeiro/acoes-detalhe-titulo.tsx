"use client";

import { useState } from "react";
import { Ban, Copy, HandCoins, Pencil, Trash, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogosTitulo, type DialogoTitulo } from "./dialogos-titulo";
import { TEXTOS, estaAberto, type OpcoesFormulario, type TituloLinha } from "./tipos";

/** Botões de ação do cabeçalho do detalhe do título. */
export function AcoesDetalheTitulo({ titulo, opcoes, hoje }: { titulo: TituloLinha; opcoes: OpcoesFormulario; hoje: string }) {
  const [dialogo, setDialogo] = useState<DialogoTitulo>(null);
  const [chave, setChave] = useState(0);
  const abrir = (d: DialogoTitulo) => {
    setChave((k) => k + 1);
    setDialogo(d);
  };
  const tx = TEXTOS[titulo.tipo];
  const cancelado = titulo.status === "CANCELADO";
  const temBaixaAtiva = titulo.valorPago > 0.005;
  const excluivel = titulo.qtdBaixas === 0;

  return (
    <>
      {estaAberto(titulo.status) && (
        <Button onClick={() => abrir("baixar")}>
          <HandCoins /> {tx.baixar}
        </Button>
      )}
      {!cancelado && (
        <Button variant="outline" onClick={() => abrir("editar")}>
          <Pencil /> Editar
        </Button>
      )}
      <Button variant="outline" onClick={() => abrir("duplicar")}>
        <Copy /> Duplicar
      </Button>
      {cancelado ? (
        <Button variant="outline" onClick={() => abrir("reabrir")}>
          <Undo2 /> Reabrir
        </Button>
      ) : (
        <span title={temBaixaAtiva ? "Estorne as baixas antes de cancelar." : undefined}>
          <Button variant="outline" onClick={() => abrir("cancelar")} disabled={temBaixaAtiva}>
            <Ban /> Cancelar
          </Button>
        </span>
      )}
      <span title={excluivel ? undefined : "Títulos com baixas (mesmo estornadas) não podem ser excluídos. Cancele-o."}>
        <Button
          variant="outline"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => abrir("excluir")}
          disabled={!excluivel}
        >
          <Trash /> Excluir
        </Button>
      </span>
      <DialogosTitulo
        titulo={titulo}
        dialogo={dialogo}
        chave={chave}
        onFechar={() => setDialogo(null)}
        opcoes={opcoes}
        hoje={hoje}
        redirecionarAoExcluir
      />
    </>
  );
}
