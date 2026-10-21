"use client";

import { useRef, useState } from "react";
import { Building, Ellipsis, Pencil, Plus, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { FormularioEmpresa } from "./empresa-form";
import { definirAtivoFilial } from "@/modules/configuracoes/acoes";
import { VALORES_EMPRESA_VAZIOS, type TipoEmpresa, type ValoresEmpresa } from "@/modules/configuracoes/tipos";

/** Botão "Editar matriz" (abre o formulário em Sheet). */
export function BotaoEditarMatriz({ id, valores }: { id: string; valores: ValoresEmpresa }) {
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={botao} variant="outline" onClick={() => setAberto(true)}>
        <Pencil /> Editar matriz
      </Button>
      {aberto && (
        <FormularioEmpresa
          tipo="matriz"
          id={id}
          iniciais={valores}
          aberto={aberto}
          onAbertoChange={setAberto}
          retornarFoco={() => botao.current?.focus()}
        />
      )}
    </>
  );
}

/** "Nova filial" (ou "Cadastrar matriz", quando ainda não existe nenhuma empresa). */
export function BotaoNovaEmpresa({
  tipo,
  regimeInicial,
  variante = "default",
}: {
  tipo: TipoEmpresa;
  /** regime sugerido para a nova filial (o da matriz) */
  regimeInicial?: string;
  variante?: "default" | "outline";
}) {
  const [aberto, setAberto] = useState(false);
  const [chave, setChave] = useState(0);
  const botao = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={botao}
        variant={variante}
        onClick={() => {
          setChave((k) => k + 1); // formulário limpo a cada abertura
          setAberto(true);
        }}
      >
        {tipo === "filial" ? <Plus /> : <Building />} {tipo === "filial" ? "Nova filial" : "Cadastrar matriz"}
      </Button>
      {aberto && (
        <FormularioEmpresa
          key={chave}
          tipo={tipo}
          id={null}
          iniciais={{ ...VALORES_EMPRESA_VAZIOS, regimeTributario: regimeInicial ?? VALORES_EMPRESA_VAZIOS.regimeTributario }}
          aberto={aberto}
          onAbertoChange={setAberto}
          retornarFoco={() => botao.current?.focus()}
        />
      )}
    </>
  );
}

/** Menu de ações de uma filial: editar e ativar/inativar. */
export function AcoesFilial({ id, nome, ativo, valores }: { id: string; nome: string; ativo: boolean; valores: ValoresEmpresa }) {
  const [editar, setEditar] = useState(false);
  const [alternar, setAlternar] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={gatilho} variant="ghost" size="icon" className="size-8" aria-label={`Ações da filial ${nome}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditar(true)}>
            <Pencil /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAlternar(true)}>
            <Power /> {ativo ? "Inativar" : "Reativar"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editar && (
        <FormularioEmpresa
          tipo="filial"
          id={id}
          iniciais={valores}
          aberto={editar}
          onAbertoChange={setEditar}
          retornarFoco={() => gatilho.current?.focus()}
        />
      )}
      <ConfirmarAcao
        aberto={alternar}
        onAbertoChange={setAlternar}
        titulo={ativo ? `Inativar a filial "${nome}"?` : `Reativar a filial "${nome}"?`}
        descricao={
          ativo
            ? "A filial deixa de aparecer nas seleções, mas o histórico (contas, títulos e movimentações) é mantido."
            : "A filial volta a aparecer nas seleções."
        }
        rotuloConfirmar={ativo ? "Inativar" : "Reativar"}
        acao={() => definirAtivoFilial(id, !ativo)}
      />
    </>
  );
}
