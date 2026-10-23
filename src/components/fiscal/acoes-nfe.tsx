"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, FileDown, FileCode2, LoaderCircle, PenLine, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Campo } from "@/components/financeiro/campos";
import type { Resultado } from "@/lib/acoes";
import { cancelarNfe, consultarNfe, corrigirNfe } from "@/modules/fiscal/nfe/acoes";
import type { StatusNota } from "@/modules/fiscal/nfe/tipos";

export function AcoesNfe({ id, status, podeEditar, temDanfe, temXml, cancelavel }: { id: string; status: StatusNota; podeEditar: boolean; temDanfe: boolean; temXml: boolean; cancelavel: boolean }) {
  const [dialogo, setDialogo] = useState<"cancelar" | "cce" | null>(null);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {temDanfe && (
        <Button asChild>
          <a href={`/api/fiscal/nfe/${id}/danfe`} target="_blank" rel="noopener noreferrer">
            <FileDown /> DANFE
          </a>
        </Button>
      )}
      {temXml && (
        <Button asChild variant="outline">
          <a href={`/api/fiscal/nfe/${id}/xml`}>
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
              const r = await consultarNfe(id);
              if (r.ok) toast.success(r.mensagem ?? "Situação atualizada.");
              else toast.error(r.erro);
              router.refresh();
            })
          }
        >
          {pendente ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Consultar na SEFAZ
        </Button>
      )}
      {podeEditar && status === "AUTORIZADA" && (
        <>
          <Button variant="outline" onClick={() => setDialogo("cce")}>
            <PenLine /> Carta de correção
          </Button>
          {cancelavel && (
            <Button variant="outline" className="text-destructive" onClick={() => setDialogo("cancelar")}>
              <Ban /> Cancelar
            </Button>
          )}
        </>
      )}
      <DialogoTexto
        aberto={dialogo === "cancelar"}
        onAbertoChange={(v) => !v && setDialogo(null)}
        titulo="Cancelar a NF-e"
        descricao="O cancelamento vai para a SEFAZ e não tem volta. Vale até 24 horas depois da autorização e só se a mercadoria não saiu."
        rotulo="Justificativa"
        minimo={15}
        maximo={255}
        exemplo="Ex.: venda cancelada pelo cliente antes da saída da mercadoria"
        confirmar="Cancelar na SEFAZ"
        destrutivo
        acao={(t) => cancelarNfe(id, t)}
      />
      <DialogoTexto
        aberto={dialogo === "cce"}
        onAbertoChange={(v) => !v && setDialogo(null)}
        titulo="Carta de correção"
        descricao="Corrige dados que não mudam o imposto nem as partes: endereço, transporte, descrição e outros. Não vale para valores, quantidades, CFOP do imposto, destinatário ou datas. Cada nova carta substitui a anterior."
        rotulo="Correção"
        minimo={15}
        maximo={1000}
        exemplo="Ex.: Onde se lê 'Rua A, 10', leia-se 'Rua B, 100'."
        confirmar="Registrar na SEFAZ"
        acao={(t) => corrigirNfe(id, t)}
      />
    </div>
  );
}

function DialogoTexto(p: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  titulo: string;
  descricao: string;
  rotulo: string;
  minimo: number;
  maximo: number;
  exemplo: string;
  confirmar: string;
  destrutivo?: boolean;
  acao: (texto: string) => Promise<Resultado>;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  return (
    <Dialog open={p.aberto} onOpenChange={p.onAbertoChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{p.titulo}</DialogTitle>
          <DialogDescription>{p.descricao}</DialogDescription>
        </DialogHeader>
        <Campo id="texto-evento" rotulo={p.rotulo} obrigatorio erro={erro} ajuda={`${texto.trim().length} de ${p.minimo} a ${p.maximo} caracteres.`}>
          <Textarea id="texto-evento" rows={3} maxLength={p.maximo} value={texto} placeholder={p.exemplo} onChange={(e) => setTexto(e.target.value)} />
        </Campo>
        <DialogFooter>
          <Button variant="outline" onClick={() => p.onAbertoChange(false)} disabled={pendente}>
            Voltar
          </Button>
          <Button
            variant={p.destrutivo ? "destructive" : "default"}
            disabled={pendente}
            onClick={() => {
              if (texto.trim().length < p.minimo) return setErro(`Escreva pelo menos ${p.minimo} caracteres.`);
              setErro("");
              iniciar(async () => {
                const r = await p.acao(texto);
                if (r.ok) {
                  toast.success(r.mensagem ?? "Feito.", { duration: 9000 });
                  setTexto("");
                  p.onAbertoChange(false);
                  router.refresh();
                } else toast.error(r.erro, { duration: 12000 });
              });
            }}
          >
            {pendente && <LoaderCircle className="animate-spin" />} {p.confirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
