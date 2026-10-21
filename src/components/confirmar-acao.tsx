"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Resultado } from "@/lib/acoes";

/** Diálogo de confirmação controlado que executa uma server action e mostra o resultado. */
export function ConfirmarAcao({
  aberto,
  onAbertoChange,
  titulo,
  descricao,
  rotuloConfirmar = "Confirmar",
  destrutivo,
  pedirMotivo,
  acao,
  aoConcluir,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  titulo: string;
  descricao?: React.ReactNode;
  rotuloConfirmar?: string;
  destrutivo?: boolean;
  pedirMotivo?: boolean;
  acao: (motivo?: string) => Promise<Resultado<unknown>>;
  aoConcluir?: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [motivo, setMotivo] = useState("");
  return (
    <AlertDialog open={aberto} onOpenChange={onAbertoChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          {descricao && <AlertDialogDescription asChild><div>{descricao}</div></AlertDialogDescription>}
        </AlertDialogHeader>
        {pedirMotivo && (
          <Textarea placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendente}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pendente}
            className={destrutivo ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            onClick={(e) => {
              e.preventDefault();
              iniciar(async () => {
                const r = await acao(motivo || undefined);
                if (r.ok) {
                  toast.success(r.mensagem ?? "Feito.");
                  onAbertoChange(false);
                  setMotivo("");
                  aoConcluir?.();
                  router.refresh();
                } else toast.error(r.erro);
              });
            }}
          >
            {pendente && <LoaderCircle className="animate-spin" />} {rotuloConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
