"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, FileDown, FileCode2, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Campo, Segmentado } from "@/components/financeiro/campos";
import { cancelarNfse, consultarNfse } from "@/modules/fiscal/nfse/acoes";
import { MOTIVOS_CANCELAMENTO_NFSE, type StatusNota } from "@/modules/fiscal/nfse/tipos";

export function AcoesNfse({ id, status, podeEditar, temDanfse, temXml }: { id: string; status: StatusNota; podeEditar: boolean; temDanfse: boolean; temXml: boolean }) {
  const [cancelar, setCancelar] = useState(false);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {temDanfse && (
        <Button asChild>
          <a href={`/api/fiscal/nfse/${id}/danfse`} target="_blank" rel="noopener noreferrer">
            <FileDown /> DANFSe
          </a>
        </Button>
      )}
      {temXml && (
        <Button asChild variant="outline">
          <a href={`/api/fiscal/nfse/${id}/xml`}>
            <FileCode2 /> XML
          </a>
        </Button>
      )}
      {podeEditar && (status === "PROCESSANDO" || status === "REJEITADA" || status === "AUTORIZADA") && (
        <Button
          variant="outline"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await consultarNfse(id);
              if (r.ok) toast.success(r.mensagem ?? "Situação atualizada.");
              else toast.error(r.erro);
              router.refresh();
            })
          }
        >
          {pendente ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Consultar no emissor nacional
        </Button>
      )}
      {podeEditar && status === "AUTORIZADA" && (
        <Button variant="outline" className="text-destructive" onClick={() => setCancelar(true)}>
          <Ban /> Cancelar
        </Button>
      )}
      <Dialog open={cancelar} onOpenChange={setCancelar}>
        <DialogContent>
          <CorpoCancelar id={id} fechar={() => setCancelar(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CorpoCancelar({ id, fechar }: { id: string; fechar: () => void }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState<"1" | "2" | "9">("1");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Cancelar a NFS-e</DialogTitle>
        <DialogDescription>O cancelamento vai para o emissor nacional e não tem volta. O prazo é definido pelo município; fora dele, o contador orienta a substituição.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Motivo</p>
          <Segmentado<"1" | "2" | "9"> rotulo="Motivo" valor={motivo} onChange={setMotivo} opcoes={MOTIVOS_CANCELAMENTO_NFSE.map((m) => ({ valor: m.valor, rotulo: m.rotulo }))} />
        </div>
        <Campo id="xmotivo" rotulo="Justificativa" obrigatorio erro={erro} ajuda={`${texto.trim().length} de 15 a 255 caracteres.`}>
          <Textarea id="xmotivo" rows={3} maxLength={255} value={texto} placeholder="Ex.: serviço não foi prestado, cliente cancelou a visita" onChange={(e) => setTexto(e.target.value)} />
        </Campo>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={pendente}>
          Voltar
        </Button>
        <Button
          variant="destructive"
          disabled={pendente}
          onClick={() => {
            if (texto.trim().length < 15) return setErro("Escreva pelo menos 15 caracteres.");
            setErro("");
            iniciar(async () => {
              const r = await cancelarNfse(id, { cMotivo: motivo, xMotivo: texto });
              if (r.ok) {
                toast.success(r.mensagem ?? "NFS-e cancelada.", { duration: 9000 });
                fechar();
                router.refresh();
              } else toast.error(r.erro, { duration: 12000 });
            });
          }}
        >
          {pendente && <LoaderCircle className="animate-spin" />} Cancelar no emissor nacional
        </Button>
      </DialogFooter>
    </>
  );
}
