"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, FileDown, FileText, LoaderCircle, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Selo } from "@/components/selos";
import { fmtDataHora, fmtDocumento, fmtMoeda } from "@/lib/format";
import { consultarNfse, emitirNfse } from "@/modules/fiscal/nfse/acoes";
import type { PainelNfse } from "@/modules/fiscal/nfse/consultas";
import { ROTULO_STATUS_NOTA, TOM_STATUS_NOTA } from "@/modules/fiscal/nfe/tipos";

export function NfsePedido({ pedidoId, painel, podeEditar }: { pedidoId: string; painel: PainelNfse; podeEditar: boolean }) {
  const [confirmar, setConfirmar] = useState(false);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const pendentes = painel.grupos.filter((g) => g.pendente);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4 text-muted-foreground" aria-hidden /> Nota fiscal de serviço (NFS-e)
        </CardTitle>
        {painel.ambiente === 2 && <Selo tom="alerta">Produção restrita · sem valor fiscal</Selo>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {painel.notas.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {painel.notas.map((n) => (
              <li key={n.id} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <Link href={`/fiscal/servicos/${n.id}`} className="hover:underline">
                      {n.numeroNfse ? `NFS-e nº ${n.numeroNfse}` : `DPS nº ${n.numero} · série ${n.serie}`}
                    </Link>
                    <Selo tom={TOM_STATUS_NOTA[n.status]}>{ROTULO_STATUS_NOTA[n.status] === "Autorizada" ? "Gerada" : ROTULO_STATUS_NOTA[n.status]}</Selo>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDataHora(n.emitidaEm)} · {fmtMoeda(n.valor)} · tributação {n.codigoTributacaoNacional}
                    {n.status !== "AUTORIZADA" && n.mensagem ? ` · ${n.codigo ?? ""} ${n.mensagem}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {(n.status === "AUTORIZADA" || n.status === "CANCELADA") && (
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/fiscal/nfse/${n.id}/danfse`} target="_blank" rel="noopener noreferrer">
                        <FileDown /> DANFSe
                      </a>
                    </Button>
                  )}
                  {podeEditar && n.status === "PROCESSANDO" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pendente}
                      onClick={() =>
                        iniciar(async () => {
                          const r = await consultarNfse(n.id);
                          if (r.ok) toast.success(r.mensagem ?? "Situação atualizada.");
                          else toast.error(r.erro);
                          router.refresh();
                        })
                      }
                    >
                      {pendente ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Consultar situação
                    </Button>
                  )}
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/fiscal/servicos/${n.id}`} aria-label={`Abrir NFS-e ${n.numeroNfse ?? n.numero}`}>
                      <ExternalLink />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!painel.pedidoFaturado ? (
          <p className="text-muted-foreground">Fature o pedido para emitir a NFS-e.</p>
        ) : painel.problemas.length > 0 && pendentes.length > 0 ? (
          <div className="space-y-1.5 rounded-lg border border-[oklch(0.8_0.1_75)] bg-warning/10 p-3">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4" aria-hidden /> Antes de emitir
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              {painel.problemas.map((p, k) => (
                <li key={k}>
                  {p.mensagem}{" "}
                  {p.link && (
                    <Link href={p.link} className="font-medium underline">
                      Corrigir
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {painel.temProdutos && painel.pedidoFaturado && <p className="text-xs text-muted-foreground">Os produtos do pedido saem na NF-e; a NFS-e leva só os serviços.</p>}
        {pendentes.length > 1 && painel.podeEmitir && <p className="text-xs text-muted-foreground">Serviços com códigos de tributação diferentes saem em NFS-e separadas: serão {pendentes.length} notas.</p>}

        {podeEditar && painel.podeEmitir && (
          <Button onClick={() => setConfirmar(true)} disabled={pendente}>
            <Send /> {pendentes.some((g) => g.reenvio) ? "Corrigir e reenviar a NFS-e" : pendentes.length > 1 ? `Emitir ${pendentes.length} NFS-e` : "Emitir NFS-e"}
          </Button>
        )}
        {painel.processando && <p className="text-xs text-muted-foreground">Há uma NFS-e em processamento: consulte a situação antes de emitir de novo.</p>}
      </CardContent>
      {painel.podeEmitir && <DialogoEmitir aberto={confirmar} onAbertoChange={setConfirmar} pedidoId={pedidoId} painel={painel} />}
    </Card>
  );
}

function DialogoEmitir({ aberto, onAbertoChange, pedidoId, painel }: { aberto: boolean; onAbertoChange: (v: boolean) => void; pedidoId: string; painel: PainelNfse }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const grupos = painel.grupos.filter((g) => g.pendente);
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{grupos.length > 1 ? `Emitir ${grupos.length} NFS-e` : `Emitir NFS-e (DPS nº ${grupos[0]?.reenvio ? "da recusada" : painel.proximoNumero} · série ${painel.serie})`}</DialogTitle>
          <DialogDescription>
            {painel.ambiente === 2 ? "Ambiente de PRODUÇÃO RESTRITA: a nota é só de teste, sem valor fiscal." : "Ambiente de PRODUÇÃO: a nota tem valor fiscal."} Envio pelo{" "}
            {painel.motor === "SEFAZ" ? "emissor nacional direto" : "Focus NFe"}.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 text-sm">
          {grupos.map((g) => (
            <div key={g.codigoTributacaoNacional} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Tomador</p>
                  <p className="font-medium">{g.tomador ? `${g.tomador.nome} · ${fmtDocumento(g.tomador.documento)}` : "Não informado"}</p>
                  {g.tomador && !g.tomador.comEndereco && <p className="text-xs text-muted-foreground">Sem endereço completo no cadastro: a nota sai sem o endereço do tomador.</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Código de tributação nacional</p>
                  <p className="font-medium">{g.codigoTributacaoNacional}</p>
                </div>
              </div>
              <ul className="divide-y rounded-md border text-xs">
                {g.itens.map((i, k) => (
                  <li key={k} className="flex justify-between gap-2 px-2 py-1.5">
                    <span>{i.descricao}</span>
                    <span className="tabular shrink-0">
                      {i.quantidade !== 1 ? `${i.quantidade.toLocaleString("pt-BR")} ${i.unidade} · ` : ""}
                      {fmtMoeda(i.total)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-right text-sm">
                Valor do serviço <strong className="tabular">{fmtMoeda(g.valor)}</strong>
                {g.aliquotaSimples !== null && <span className="text-xs text-muted-foreground"> · Simples {g.aliquotaSimples.toLocaleString("pt-BR")}% (pTotTribSN)</span>}
              </p>
              <div className="rounded-md bg-muted/40 p-2 text-xs whitespace-pre-line">{g.informacoes}</div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">O código de tributação vem do cadastro de cada serviço (item da LC 116); confira com o contador antes da primeira nota em produção.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbertoChange(false)} disabled={pendente}>
            Voltar
          </Button>
          <Button
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const res = await emitirNfse(pedidoId);
                if (res.ok && res.data?.every((n) => n.status === "AUTORIZADA")) toast.success(res.mensagem ?? "NFS-e gerada.");
                else if (res.ok) toast.warning(res.mensagem ?? "Veja a situação da nota.", { duration: 12000 });
                else toast.error(res.erro, { duration: 12000 });
                onAbertoChange(false);
                router.refresh();
              })
            }
          >
            {pendente && <LoaderCircle className="animate-spin" />} Emitir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
