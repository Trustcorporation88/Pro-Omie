"use client";

import { useState } from "react";
import Link from "next/link";
import { Ellipsis, Eye, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { excluirAjusteAcao, excluirTransferenciaAcao } from "@/modules/financeiro/acoes";
import { fmtData, fmtMoeda } from "@/lib/format";
import type { ExtratoLinha } from "./tipos";

/** Menu da linha do extrato: ver título (baixas), excluir transferência ou ajuste. */
export function MenuMovimento({ linha, contaNome, podeEditar }: { linha: ExtratoLinha; contaNome: string; podeEditar: boolean }) {
  const [confirmar, setConfirmar] = useState(false);
  const verTitulo = linha.origem === "BAIXA" && !!linha.tituloId;
  const transferencia = podeEditar && linha.origem === "TRANSFERENCIA" && !!linha.transferenciaId;
  const ajuste = podeEditar && linha.origem === "AJUSTE";
  if (!verTitulo && !transferencia && !ajuste) return null;

  const resumo = `${fmtMoeda(linha.valor)} em ${fmtData(linha.data)} · ${linha.descricao}`;
  const origemDestino =
    linha.tipo === "DEBITO" ? `${contaNome} → ${linha.contraparte ?? "outra conta"}` : `${linha.contraparte ?? "outra conta"} → ${contaNome}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Ações do movimento">
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {verTitulo && (
            <DropdownMenuItem asChild>
              <Link href={`/financeiro/titulos/${linha.tituloId}`}>
                <Eye /> Ver título{linha.tituloNumero ? ` #${linha.tituloNumero}` : ""}
              </Link>
            </DropdownMenuItem>
          )}
          {transferencia && (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmar(true)}>
              <Trash /> Excluir transferência
            </DropdownMenuItem>
          )}
          {ajuste && (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmar(true)}>
              <Trash /> Excluir ajuste
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {(transferencia || ajuste) && (
        <ConfirmarAcao
          aberto={confirmar}
          onAbertoChange={setConfirmar}
          titulo={transferencia ? "Excluir transferência?" : "Excluir ajuste?"}
          descricao={
            <div className="space-y-2">
              <p>{resumo}</p>
              <p>
                {transferencia
                  ? `Os dois lançamentos da transferência (${origemDestino}) serão removidos.`
                  : "O lançamento será removido e o saldo da conta recalculado."}
              </p>
              {linha.conciliado && <p className="font-medium text-destructive">O movimento está conciliado: a conciliação com o extrato será desfeita.</p>}
            </div>
          }
          rotuloConfirmar="Excluir"
          destrutivo
          acao={() => (transferencia && linha.transferenciaId ? excluirTransferenciaAcao(linha.transferenciaId) : excluirAjusteAcao(linha.id))}
        />
      )}
    </>
  );
}
