"use client";

import { useState } from "react";
import { Ellipsis, Pencil, Plus, Power, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { FormularioCadastro } from "./formulario-cadastro";
import { alternarAtivoCadastro, excluirCadastro } from "@/modules/cadastros/acoes";
import { META, type EntidadeCadastro } from "@/modules/cadastros/campos";
import type { Opcao } from "@/lib/rotulos";

type Valores = Record<string, string | number | boolean | null>;

export function BotaoNovoCadastro({
  entidade,
  opcoesDinamicas,
  iniciais,
}: {
  entidade: EntidadeCadastro;
  opcoesDinamicas?: Record<string, Opcao[]>;
  iniciais?: Valores;
}) {
  const [aberto, setAberto] = useState(false);
  const [chave, setChave] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setChave((k) => k + 1);
          setAberto(true);
        }}
      >
        <Plus /> Novo {META[entidade].singular}
      </Button>
      {aberto && (
        <FormularioCadastro
          key={chave}
          entidade={entidade}
          id={null}
          iniciais={iniciais}
          opcoesDinamicas={opcoesDinamicas}
          aberto={aberto}
          onAbertoChange={setAberto}
        />
      )}
    </>
  );
}

export function AcoesLinhaCadastro({
  entidade,
  id,
  ativo,
  valores,
  rotulo,
  podeEditar,
  opcoesDinamicas,
}: {
  entidade: EntidadeCadastro;
  id: string;
  ativo: boolean;
  valores: Valores;
  rotulo: string;
  podeEditar: boolean;
  opcoesDinamicas?: Record<string, Opcao[]>;
}) {
  const [editar, setEditar] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [inativar, setInativar] = useState(false);
  if (!podeEditar) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Ações">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditar(true)}>
            <Pencil /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setInativar(true)}>
            <Power /> {ativo ? "Inativar" : "Reativar"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setExcluir(true)}>
            <Trash /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editar && (
        <FormularioCadastro
          entidade={entidade}
          id={id}
          iniciais={valores}
          opcoesDinamicas={opcoesDinamicas}
          aberto={editar}
          onAbertoChange={setEditar}
        />
      )}
      <ConfirmarAcao
        aberto={inativar}
        onAbertoChange={setInativar}
        titulo={ativo ? `Inativar "${rotulo}"?` : `Reativar "${rotulo}"?`}
        descricao={ativo ? "O registro deixa de aparecer nas seleções, mas o histórico é mantido." : undefined}
        rotuloConfirmar={ativo ? "Inativar" : "Reativar"}
        acao={() => alternarAtivoCadastro(entidade, id)}
      />
      <ConfirmarAcao
        aberto={excluir}
        onAbertoChange={setExcluir}
        titulo={`Excluir "${rotulo}"?`}
        descricao="A exclusão é permanente. Se o registro já tiver lançamentos vinculados, inative-o em vez de excluir."
        rotuloConfirmar="Excluir"
        destrutivo
        acao={() => excluirCadastro(entidade, id)}
      />
    </>
  );
}
