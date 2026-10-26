"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { gerarCompetenciaContrato, gerarPedidoDaOs } from "@/modules/servicos/acoes";
import { Ellipsis, Pencil, Plus, Power, Trash, CalendarPlus, ShoppingCart } from "lucide-react";
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
import { META, rotuloNovo, type EntidadeCadastro } from "@/modules/cadastros/campos";
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
        <Plus /> {rotuloNovo(META[entidade])}
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
  const router = useRouter();
  const [, iniciar] = useTransition();
  const rodar = (fn: () => Promise<{ ok: boolean; erro?: string; mensagem?: string; data?: unknown }>, aoOk?: (d: unknown) => void) =>
    iniciar(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.mensagem ?? "Feito.", { duration: 9000 });
        aoOk?.(r.data);
      } else toast.error(r.erro ?? "Falhou.", { duration: 10000 });
      router.refresh();
    });
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
          {entidade === "contratos" && ativo && (
            <DropdownMenuItem onSelect={() => rodar(() => gerarCompetenciaContrato(id))}>
              <CalendarPlus /> Gerar próxima competência agora
            </DropdownMenuItem>
          )}
          {entidade === "ordens" && !valores.pedidoId && valores.status !== "CANCELADA" && (
            <DropdownMenuItem onSelect={() => rodar(() => gerarPedidoDaOs(id), (d) => router.push(`/vendas/pedidos/${(d as { pedidoId: string }).pedidoId}`))}>
              <ShoppingCart /> Gerar pedido da OS
            </DropdownMenuItem>
          )}
          {entidade === "ordens" && typeof valores.pedidoId === "string" && (
            <DropdownMenuItem onSelect={() => router.push(`/vendas/pedidos/${valores.pedidoId}`)}>
              <ShoppingCart /> Abrir pedido
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setInativar(true)}>
            <Power /> {ativo ? (entidade === "contratos" ? "Suspender" : "Inativar") : "Reativar"}
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
