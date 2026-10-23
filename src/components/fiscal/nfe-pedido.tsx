"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, FileDown, FileText, LoaderCircle, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Selo } from "@/components/selos";
import { Campo } from "@/components/financeiro/campos";
import { fmtData, fmtDataHora, fmtMoeda, fmtNumero } from "@/lib/format";
import { consultarNfe, emitirNfe } from "@/modules/fiscal/nfe/acoes";
import { ROTULO_STATUS_NOTA, TOM_STATUS_NOTA, type ProblemaEmissao, type StatusNota } from "@/modules/fiscal/nfe/tipos";

type Nota = { id: string; numero: number; serie: number; status: StatusNota; ambiente: number; tpEmis: number; emitidaEm: string; valor: number; cStat: string | null; xMotivo: string | null };

export type PainelNfe = {
  pedidoFaturado: boolean;
  notas: Nota[];
  podeEmitir: boolean;
  problemas: ProblemaEmissao[];
  proximo: { numero: number; serie: number; reenvio: boolean } | null;
  ambiente: 1 | 2;
  motor: string;
  temServicos: boolean;
  podeContingencia: boolean;
  pendenteSemRetorno: { numero: number; serie: number } | null;
  autorizadas: number;
  resumo: {
    destinatario: string;
    natureza: string;
    itens: { descricao: string; ncm: string; cfop: string; csosn: string; quantidade: number; unidade: string; total: number }[];
    totais: { vProd: number; vDesc: number; vNF: number };
    duplicatas: { numero: string; vencimento: string; valor: number }[];
    informacoes: string;
  };
};

export function NfePedido({ pedidoId, painel, podeEditar }: { pedidoId: string; painel: PainelNfe; podeEditar: boolean }) {
  const [confirmar, setConfirmar] = useState(false);
  const [contingencia, setContingencia] = useState(false);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const processando = painel.notas.find((n) => n.status === "PROCESSANDO");
  const rejeitada = painel.notas.find((n) => n.status === "REJEITADA");

  function consultar(id: string) {
    iniciar(async () => {
      const r = await consultarNfe(id);
      if (r.ok) toast.success(r.mensagem ?? "Situação atualizada.");
      else toast.error(r.erro);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4 text-muted-foreground" aria-hidden /> Nota fiscal (NF-e)
        </CardTitle>
        {painel.ambiente === 2 && <Selo tom="alerta">Homologação · sem valor fiscal</Selo>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {painel.notas.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {painel.notas.map((n) => (
              <li key={n.id} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <Link href={`/fiscal/emitidas/${n.id}`} className="hover:underline">
                      NF-e nº {n.numero} · série {n.serie}
                    </Link>
                    <Selo tom={TOM_STATUS_NOTA[n.status]}>{ROTULO_STATUS_NOTA[n.status]}</Selo>
                    {n.tpEmis === 6 && <Selo tom="roxo">Contingência</Selo>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDataHora(n.emitidaEm)} · {fmtMoeda(n.valor)}
                    {n.status !== "AUTORIZADA" && n.xMotivo ? ` · ${n.cStat ?? ""} ${n.xMotivo}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {(n.status === "AUTORIZADA" || n.status === "CANCELADA") && (
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/fiscal/nfe/${n.id}/danfe`} target="_blank" rel="noopener noreferrer">
                        <FileDown /> DANFE
                      </a>
                    </Button>
                  )}
                  {podeEditar && n.status === "PROCESSANDO" && (
                    <Button size="sm" variant="outline" disabled={pendente} onClick={() => consultar(n.id)}>
                      {pendente ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Consultar situação
                    </Button>
                  )}
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/fiscal/emitidas/${n.id}`} aria-label={`Abrir NF-e ${n.numero}`}>
                      <ExternalLink />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!painel.pedidoFaturado ? (
          <p className="text-muted-foreground">Fature o pedido para emitir a NF-e.</p>
        ) : painel.problemas.length > 0 && !painel.notas.some((n) => n.status === "AUTORIZADA") ? (
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

        {painel.temServicos && painel.pedidoFaturado && <p className="text-xs text-muted-foreground">Os serviços do pedido saem na NFS-e (próxima etapa); a NF-e leva só os produtos.</p>}

        {painel.autorizadas > 1 && (
          <p role="alert" className="flex gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />O pedido tem {painel.autorizadas} NF-e autorizadas (a que ficou sem retorno e a da contingência). Cancele a que
            não vale, dentro de 24 horas da autorização.
          </p>
        )}
        {podeEditar && painel.proximo && (painel.podeEmitir || painel.podeContingencia) && (
          <div className="flex flex-wrap gap-2">
            {painel.podeEmitir && (
              <Button onClick={() => setConfirmar(true)} disabled={pendente}>
                <Send /> {painel.proximo.reenvio ? `Corrigir e reenviar a nº ${painel.proximo.numero}` : "Emitir NF-e"}
              </Button>
            )}
            {painel.podeContingencia && (
              <Button variant="outline" onClick={() => setContingencia(true)} disabled={pendente}>
                <ShieldAlert /> Emitir em contingência
              </Button>
            )}
          </div>
        )}
        {processando && !painel.pendenteSemRetorno && <p className="text-xs text-muted-foreground">Há uma nota em processamento: consulte a situação antes de emitir de novo.</p>}
        {painel.pendenteSemRetorno && painel.podeContingencia && (
          <p className="text-xs text-muted-foreground">
            A nº {painel.pendenteSemRetorno.numero} ficou sem retorno. Tente “Consultar situação”; se a SEFAZ-SP seguir fora do ar, emita em contingência (sai com
            outro número).
          </p>
        )}
        {rejeitada && painel.podeEmitir && <p className="text-xs text-muted-foreground">O reenvio usa o mesmo número da nota rejeitada, com os dados corrigidos.</p>}
      </CardContent>
      {painel.proximo && painel.podeEmitir && <DialogoEmitir aberto={confirmar} onAbertoChange={setConfirmar} pedidoId={pedidoId} painel={painel} />}
      {painel.proximo && painel.podeContingencia && (
        <DialogoContingencia aberto={contingencia} onAbertoChange={setContingencia} pedidoId={pedidoId} numero={painel.proximo.numero} pendente={painel.pendenteSemRetorno} />
      )}
    </Card>
  );
}

function DialogoEmitir({ aberto, onAbertoChange, pedidoId, painel }: { aberto: boolean; onAbertoChange: (v: boolean) => void; pedidoId: string; painel: PainelNfe }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const r = painel.resumo;
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Emitir NF-e nº {painel.proximo?.numero} · série {painel.proximo?.serie}
          </DialogTitle>
          <DialogDescription>
            {painel.ambiente === 2 ? "Ambiente de HOMOLOGAÇÃO: a nota é só de teste, sem valor fiscal." : "Ambiente de PRODUÇÃO: a nota tem valor fiscal."} Envio pela{" "}
            {painel.motor === "SEFAZ" ? "SEFAZ-SP direto" : "Focus NFe"}.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 text-sm">
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-muted-foreground">Destinatário</dt>
              <dd className="font-medium">{r.destinatario}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Natureza da operação</dt>
              <dd className="font-medium">{r.natureza}</dd>
            </div>
          </dl>
          <ul className="divide-y rounded-lg border">
            {r.itens.map((i, k) => (
              <li key={k} className="flex justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{i.descricao}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {fmtNumero(i.quantidade, i.quantidade % 1 ? 3 : 0)} {i.unidade} · NCM {i.ncm} · CFOP {i.cfop} · CSOSN {i.csosn}
                  </span>
                </span>
                <span className="tabular shrink-0 font-medium">{fmtMoeda(i.total)}</span>
              </li>
            ))}
          </ul>
          <p className="text-right">
            {r.totais.vDesc > 0 && <span className="mr-3 text-xs text-muted-foreground">desconto {fmtMoeda(r.totais.vDesc)}</span>}
            Total da nota <span className="tabular font-semibold">{fmtMoeda(r.totais.vNF)}</span>
          </p>
          {r.duplicatas.length > 0 && (
            <p className="text-xs text-muted-foreground">Duplicatas: {r.duplicatas.map((d) => `${d.numero} · ${fmtData(d.vencimento)} · ${fmtMoeda(d.valor)}`).join("; ")}</p>
          )}
          <div className="rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-line">
            <p className="mb-1 font-medium">Informações complementares</p>
            {r.informacoes}
          </div>
          <p className="text-xs text-muted-foreground">Os códigos fiscais (CFOP e CSOSN) vêm do cadastro de cada produto; confira com o contador antes da primeira nota em produção.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbertoChange(false)} disabled={pendente}>
            Voltar
          </Button>
          <Button
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const res = await emitirNfe(pedidoId);
                if (res.ok && res.data?.status === "AUTORIZADA") toast.success(res.mensagem ?? "NF-e autorizada.");
                else if (res.ok) toast.warning(res.mensagem ?? "Veja a situação da nota.", { duration: 12000 });
                else toast.error(res.erro, { duration: 12000 });
                onAbertoChange(false);
                router.refresh();
              })
            }
          >
            {pendente ? <LoaderCircle className="animate-spin" /> : <Send />} {pendente ? "Enviando à SEFAZ…" : "Emitir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoContingencia({
  aberto,
  onAbertoChange,
  pedidoId,
  numero,
  pendente,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  pedidoId: string;
  numero: number;
  pendente: { numero: number; serie: number } | null;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("SEFAZ-SP indisponível para autorização das notas");
  const [enviando, iniciar] = useTransition();
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Emitir em contingência (SVC-AN)</DialogTitle>
          <DialogDescription>
            Use só com a SEFAZ-SP fora do ar. A nota nº {numero} vai para a SEFAZ Virtual do Ambiente Nacional, com outra chave de acesso, e vale normalmente.
            Cancelamento e carta de correção só depois que a SEFAZ-SP voltar e receber a nota.
          </DialogDescription>
        </DialogHeader>
        {pendente && (
          <p className="flex gap-1.5 rounded-lg bg-warning/15 p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            A nº {pendente.numero} ficou sem retorno e pode ter sido autorizada. Quando a SEFAZ-SP voltar, consulte-a: se tiver sido autorizada, cancele-a; se
            não, inutilize o número {pendente.numero}.
          </p>
        )}
        <Campo id="just-cont" rotulo="Motivo" obrigatorio ajuda="Entre 15 e 256 caracteres.">
          <Textarea id="just-cont" value={texto} maxLength={256} rows={2} onChange={(e) => setTexto(e.target.value)} />
        </Campo>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbertoChange(false)} disabled={enviando}>
            Voltar
          </Button>
          <Button
            disabled={enviando}
            onClick={() =>
              iniciar(async () => {
                const res = await emitirNfe(pedidoId, { contingencia: { justificativa: texto } });
                if (res.ok && res.data?.status === "AUTORIZADA") toast.success(res.mensagem ?? "NF-e autorizada em contingência.");
                else if (res.ok) toast.warning(res.mensagem ?? "Veja a situação da nota.", { duration: 12000 });
                else toast.error(res.erro, { duration: 12000 });
                onAbertoChange(false);
                router.refresh();
              })
            }
          >
            {enviando && <LoaderCircle className="animate-spin" />} Emitir em contingência
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
