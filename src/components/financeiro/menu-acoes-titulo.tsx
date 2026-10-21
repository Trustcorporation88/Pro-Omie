"use client";

import { useState } from "react";
import Link from "next/link";
import { Ban, Copy, Ellipsis, Eye, HandCoins, Pencil, Trash, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DialogosTitulo, type DialogoTitulo } from "./dialogos-titulo";
import { TEXTOS, estaAberto, type OpcoesFormulario, type TituloLinha } from "./tipos";

/** Menu de ações da linha do título na lista. */
export function MenuAcoesTitulo({
  titulo,
  opcoes,
  hoje,
  podeEditar,
}: {
  titulo: TituloLinha;
  opcoes: OpcoesFormulario;
  hoje: string;
  podeEditar: boolean;
}) {
  const [dialogo, setDialogo] = useState<DialogoTitulo>(null);
  const [chave, setChave] = useState(0);
  const abrir = (d: DialogoTitulo) => {
    setChave((k) => k + 1);
    setDialogo(d);
  };
  const tx = TEXTOS[titulo.tipo];
  const aberto = estaAberto(titulo.status);
  const cancelado = titulo.status === "CANCELADO";
  // cancelar só sem baixas ativas; excluir só sem nenhuma baixa (nem estornada)
  const cancelavel = titulo.status === "ABERTO";
  const excluivel = titulo.qtdBaixas === 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Ações do título #${titulo.numero}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {podeEditar && aberto && (
            <DropdownMenuItem onSelect={() => abrir("baixar")}>
              <HandCoins /> {tx.baixar}
            </DropdownMenuItem>
          )}
          {podeEditar && !cancelado && (
            <DropdownMenuItem onSelect={() => abrir("editar")}>
              <Pencil /> Editar
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href={`/financeiro/titulos/${titulo.id}`}>
              <Eye /> Ver detalhes
            </Link>
          </DropdownMenuItem>
          {podeEditar && (
            <DropdownMenuItem onSelect={() => abrir("duplicar")}>
              <Copy /> Duplicar
            </DropdownMenuItem>
          )}
          {podeEditar && (cancelado || cancelavel || excluivel) && <DropdownMenuSeparator />}
          {podeEditar && cancelado && (
            <DropdownMenuItem onSelect={() => abrir("reabrir")}>
              <Undo2 /> Reabrir
            </DropdownMenuItem>
          )}
          {podeEditar && cancelavel && (
            <DropdownMenuItem onSelect={() => abrir("cancelar")}>
              <Ban /> Cancelar
            </DropdownMenuItem>
          )}
          {podeEditar && excluivel && (
            <DropdownMenuItem variant="destructive" onSelect={() => abrir("excluir")}>
              <Trash /> Excluir
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {podeEditar && <DialogosTitulo titulo={titulo} dialogo={dialogo} chave={chave} onFechar={() => setDialogo(null)} opcoes={opcoes} hoje={hoje} />}
    </>
  );
}
