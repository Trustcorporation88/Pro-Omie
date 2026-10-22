"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FilePlus2, LoaderCircle, Pencil, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { DialogoOportunidade } from "@/components/crm/dialogo-oportunidade";
import { DialogoPerda } from "@/components/crm/dialogo-perda";
import { excluirOportunidade, ganharOportunidade, moverOportunidade, reabrirOportunidade } from "@/modules/crm/acoes";
import { ETAPAS_ABERTAS, PROBABILIDADE, ROTULO_ETAPA, ehAberta, type EtapaAberta, type OpcoesCrm, type OportunidadeDetalhe } from "@/modules/crm/tipos";
import { cn } from "@/lib/utils";

/** Botões do cabeçalho do detalhe: editar, ganhar, perder, reabrir, nova proposta e excluir. */
export function AcoesOportunidade({
  o,
  opcoes,
  podeEditar,
  podeVender,
  podeCadastrar,
}: {
  o: OportunidadeDetalhe;
  opcoes: OpcoesCrm;
  podeEditar: boolean;
  podeVender: boolean;
  podeCadastrar: boolean;
}) {
  const router = useRouter();
  const [editar, setEditar] = useState(false);
  const [perda, setPerda] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [enviando, iniciar] = useTransition();
  const aberta = ehAberta(o.etapa);

  const executar = (fn: () => ReturnType<typeof ganharOportunidade>) =>
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem ?? "Pronto.");
      router.refresh();
    });

  return (
    <>
      {aberta && podeVender && (
        <Button variant="outline" asChild>
          <Link href={`/vendas/propostas/nova?oportunidade=${o.id}`}>
            <FilePlus2 /> Nova proposta
          </Link>
        </Button>
      )}
      {podeEditar && (
        <Button variant="outline" onClick={() => setEditar(true)}>
          <Pencil /> Editar
        </Button>
      )}
      {podeEditar && aberta && (
        <>
          <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={enviando} onClick={() => executar(() => ganharOportunidade(o.id))}>
            {enviando ? <LoaderCircle className="animate-spin" /> : <ThumbsUp />} Ganhou
          </Button>
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setPerda(true)}>
            <ThumbsDown /> Perdeu
          </Button>
        </>
      )}
      {podeEditar && !aberta && (
        <Button variant="outline" disabled={enviando} onClick={() => executar(() => reabrirOportunidade(o.id))}>
          {enviando ? <LoaderCircle className="animate-spin" /> : <RotateCcw />} Reabrir
        </Button>
      )}

      <DialogoOportunidade
        aberto={editar}
        onAbertoChange={setEditar}
        id={o.id}
        iniciais={{
          titulo: o.titulo,
          pessoaId: o.pessoaId,
          pessoaNome: o.pessoaNome,
          contato: o.contato ?? "",
          responsavelId: o.responsavelId ?? opcoes.responsaveis[0]?.valor ?? "",
          etapa: aberta ? (o.etapa as EtapaAberta) : "DESCOBERTA",
          valor: o.valor,
          previsaoFechamento: o.previsaoFechamento ?? "",
          origem: o.origem ?? "",
          observacoes: o.observacoes ?? "",
        }}
        opcoes={opcoes}
        podeCadastrar={podeCadastrar}
        onExcluir={o.propostas.length ? undefined : () => setExcluir(true)}
      />
      <DialogoPerda oportunidade={perda ? { id: o.id, titulo: o.titulo } : null} onFechar={() => setPerda(false)} />
      {excluir && (
        <ConfirmarAcao
          aberto
          onAbertoChange={(x) => !x && setExcluir(false)}
          titulo="Excluir a oportunidade?"
          descricao="As atividades dela também são excluídas. Para guardar o histórico, prefira marcar como perdida."
          rotuloConfirmar="Excluir"
          destrutivo
          acao={() => excluirOportunidade(o.id)}
          aoConcluir={() => {
            setExcluir(false);
            router.push("/crm/funil");
          }}
        />
      )}
    </>
  );
}

/** Etapas do funil como passos clicáveis (só com a oportunidade aberta). */
export function EtapasOportunidade({ o, podeEditar }: { o: OportunidadeDetalhe; podeEditar: boolean }) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const aberta = ehAberta(o.etapa);
  const atual = aberta ? ETAPAS_ABERTAS.indexOf(o.etapa as EtapaAberta) : ETAPAS_ABERTAS.indexOf((o.etapaAntesFechar ?? "NEGOCIACAO") as EtapaAberta);

  function mover(e: EtapaAberta) {
    iniciar(async () => {
      const r = await moverOportunidade(o.id, e);
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem ?? "Etapa atualizada.");
      router.refresh();
    });
  }

  return (
    <ol className="grid grid-cols-3 gap-1.5" aria-label="Etapas do funil">
      {ETAPAS_ABERTAS.map((e, i) => {
        const feita = i < atual || (!aberta && o.etapa === "GANHA");
        const corrente = aberta && i === atual;
        return (
          <li key={e}>
            <button
              type="button"
              disabled={!podeEditar || !aberta || corrente || enviando}
              onClick={() => mover(e)}
              aria-current={corrente ? "step" : undefined}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors sm:text-sm",
                corrente && "border-primary bg-primary text-primary-foreground",
                feita && !corrente && "border-primary/30 bg-primary/10 text-primary",
                !feita && !corrente && "bg-background text-muted-foreground",
                podeEditar && aberta && !corrente && "hover:border-primary/60 hover:text-foreground",
                (!aberta || !podeEditar) && "cursor-default",
              )}
              title={aberta && !corrente && podeEditar ? `Mover para ${ROTULO_ETAPA[e]}` : undefined}
            >
              {feita && !corrente && <Check className="size-3.5" aria-hidden />}
              {ROTULO_ETAPA[e]}
              <span className={cn("hidden font-normal sm:inline", corrente ? "text-primary-foreground/80" : "text-muted-foreground")}>{PROBABILIDADE[e]}%</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
