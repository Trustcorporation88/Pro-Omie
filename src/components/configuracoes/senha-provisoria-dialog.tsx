"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SegredoExibido } from "@/modules/configuracoes/tipos";

async function copiarTexto(texto: string, elemento: HTMLElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sem permissão ou fora de contexto seguro: seleciona o texto e tenta o comando clássico de cópia.
    if (!elemento) return false;
    const selecao = window.getSelection();
    if (!selecao) return false;
    const faixa = document.createRange();
    faixa.selectNodeContents(elemento);
    selecao.removeAllRanges();
    selecao.addRange(faixa);
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

/**
 * Mostra a senha provisória UMA única vez. A senha vive só no estado do componente pai e é descartada ao fechar;
 * clicar fora do diálogo não o fecha (evita perder a senha por acidente).
 */
export function SenhaProvisoriaDialog({
  segredo,
  onFechar,
  retornarFoco,
}: {
  segredo: SegredoExibido;
  onFechar: () => void;
  /** para onde levar o foco do teclado ao fechar (o botão que originou a ação) */
  retornarFoco?: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const campoSenha = useRef<HTMLElement>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  async function copiar() {
    const ok = await copiarTexto(segredo.senha, campoSenha.current);
    if (!ok) return void toast.error("Não foi possível copiar automaticamente. Selecione a senha e copie manualmente.");
    setCopiado(true);
    toast.success("Senha copiada.");
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          retornarFoco?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>{segredo.tipo === "criado" ? "Usuário criado" : "Senha redefinida"}</DialogTitle>
          <DialogDescription>
            Senha provisória de <strong className="font-medium text-foreground">{segredo.nome}</strong> ({segredo.email}).
            {segredo.emailEnviado ? " Ela também foi enviada por e-mail para a pessoa." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Senha provisória</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <code ref={campoSenha} className="font-mono text-xl font-semibold tracking-wider break-all select-all">
              {segredo.senha}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copiar} className="shrink-0">
              {copiado ? <Check /> : <Copy />} {copiado ? "Copiada" : "Copiar"}
            </Button>
          </div>
        </div>

        <div
          role="note"
          className="flex gap-2.5 rounded-md bg-warning/15 px-3 py-2.5 text-sm text-[oklch(0.45_0.12_65)] dark:text-warning"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Esta senha é exibida <strong>uma única vez</strong>. Copie e repasse ao usuário por um canal seguro (pessoalmente ou
            mensageiro corporativo), nunca por e-mail comum. No primeiro acesso, o sistema exigirá uma nova senha.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" onClick={onFechar}>
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
