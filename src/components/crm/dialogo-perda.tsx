"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Campo } from "@/components/financeiro/campos";
import { perderOportunidade } from "@/modules/crm/acoes";
import { MOTIVOS_PERDA } from "@/modules/crm/tipos";
import { cn } from "@/lib/utils";

/** Marcar oportunidade como perdida: o motivo é obrigatório (alimenta o relatório de perdas). */
export function DialogoPerda({ oportunidade, onFechar }: { oportunidade: { id: string; titulo: string } | null; onFechar: () => void }) {
  return (
    <Dialog open={!!oportunidade} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-lg">{oportunidade && <CorpoPerda oportunidade={oportunidade} onFechar={onFechar} />}</DialogContent>
    </Dialog>
  );
}

// montado a cada abertura: motivo e detalhe começam vazios
function CorpoPerda({ oportunidade, onFechar }: { oportunidade: { id: string; titulo: string }; onFechar: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function confirmar() {
    iniciar(async () => {
      const r = await perderOportunidade(oportunidade.id, { motivo, detalhe });
      if (!r.ok) {
        setErro(r.campos?.motivo ?? null);
        return void toast.error(r.erro);
      }
      toast.success(r.mensagem ?? "Marcada como perdida.");
      onFechar();
      router.refresh();
    });
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>Marcar como perdida</DialogTitle>
          <DialogDescription>{oportunidade.titulo}. O motivo ajuda a entender onde o funil está vazando.</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">
            Motivo <span className="text-destructive">*</span>
          </legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-invalid={!!erro}>
            {Object.entries(MOTIVOS_PERDA).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={motivo === valor}
                onClick={() => {
                  setMotivo(valor);
                  setErro(null);
                }}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                  motivo === valor && "border-primary bg-primary/5 font-medium text-primary",
                  erro && !motivo && "border-destructive/60",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </fieldset>
        <Campo id="perda-detalhe" rotulo="Detalhe" ajuda="Opcional. Ex.: concorrente cobrou 15% menos.">
          <Textarea id="perda-detalhe" rows={3} maxLength={500} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} />
        </Campo>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={enviando}>
            {enviando && <LoaderCircle className="animate-spin" />} Marcar como perdida
          </Button>
        </DialogFooter>
    </>
  );
}
