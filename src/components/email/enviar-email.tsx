"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { LoaderCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Campo } from "@/components/financeiro/campos";
import { enviarDocumentoPorEmail, enviarNotaPorEmail } from "@/modules/email/acoes";

export type AlvoEmail = { tipo: "proposta" | "pedido" | "nfe" | "nfse"; id: string; paraPadrao: string | null; configurado: boolean };

const ROTULO: Record<AlvoEmail["tipo"], string> = { proposta: "a proposta em PDF", pedido: "o pedido em PDF", nfe: "o DANFE em PDF e o XML da NF-e", nfse: "a DANFSe em PDF e o XML da NFS-e" };

/** Botão "Enviar por e-mail" com diálogo (destinatários e mensagem). */
export function EnviarEmail({ alvo, variant = "outline", size }: { alvo: AlvoEmail; variant?: "outline" | "ghost" | "default"; size?: "sm" | "default" }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => (alvo.configurado ? setAberto(true) : toast.info("O envio de e-mails ainda não está configurado. Um administrador configura em Configurações › E-mails."))}>
        <Mail /> Enviar por e-mail
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <Corpo alvo={alvo} fechar={() => setAberto(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Corpo({ alvo, fechar }: { alvo: AlvoEmail; fechar: () => void }) {
  const [para, setPara] = useState(alvo.paraPadrao ?? "");
  const [mensagem, setMensagem] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Enviar por e-mail</DialogTitle>
        <DialogDescription>Manda {ROTULO[alvo.tipo]} para o cliente, com o e-mail da empresa como “responder para”.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <Campo id="email-para" rotulo="Para" obrigatorio erro={erros.para} ajuda="Até 5 e-mails, separados por vírgula.">
          <Input id="email-para" type="text" inputMode="email" value={para} onChange={(e) => setPara(e.target.value)} placeholder="cliente@empresa.com.br" />
        </Campo>
        <Campo id="email-msg" rotulo="Mensagem (opcional)" erro={erros.mensagem}>
          <Textarea id="email-msg" rows={3} maxLength={1000} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Ex.: Conforme combinado por telefone, segue a proposta." />
        </Campo>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={pendente}>
          Voltar
        </Button>
        <Button
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = alvo.tipo === "nfe" || alvo.tipo === "nfse" ? await enviarNotaPorEmail(alvo.tipo, alvo.id, { para, mensagem }) : await enviarDocumentoPorEmail(alvo.tipo, alvo.id, { para, mensagem });
              if (r.ok) {
                toast.success(r.mensagem ?? "Enviado.", { duration: 8000 });
                fechar();
              } else {
                setErros(r.campos ?? {});
                toast.error(r.erro, { duration: 10000 });
              }
            })
          }
        >
          {pendente ? <LoaderCircle className="animate-spin" /> : <Mail />} Enviar
        </Button>
      </DialogFooter>
    </>
  );
}
