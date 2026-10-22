"use client";

import { startTransition, useOptimistic, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarX2, EllipsisVertical, ExternalLink, Plus, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DialogoOportunidade, oportunidadeVazia } from "@/components/crm/dialogo-oportunidade";
import { DialogoPerda } from "@/components/crm/dialogo-perda";
import { IconeAtividade, iniciais, quando } from "@/components/crm/visual";
import { fmtData, fmtMoeda } from "@/lib/format";
import { ganharOportunidade, moverOportunidade, reabrirOportunidade } from "@/modules/crm/acoes";
import {
  ETAPAS_ABERTAS,
  PROBABILIDADE,
  ROTULO_ETAPA,
  type CartaoOportunidade,
  type Etapa,
  type EtapaAberta,
  type Funil as FunilT,
  type OpcoesCrm,
} from "@/modules/crm/tipos";
import { cn } from "@/lib/utils";

type Colunas = FunilT["colunas"];
type Movimento = { id: string; para: Etapa };

function moverLocal(colunas: Colunas, m: Movimento): Colunas {
  let cartao: CartaoOportunidade | undefined;
  const novo = Object.fromEntries(
    Object.entries(colunas).map(([e, cs]) => [
      e,
      cs.filter((c) => {
        if (c.id !== m.id) return true;
        cartao = c;
        return false;
      }),
    ]),
  ) as Colunas;
  if (cartao) novo[m.para] = [{ ...cartao, etapa: m.para, diasNaEtapa: 0 }, ...novo[m.para]];
  return novo;
}

const COR_ETAPA: Record<EtapaAberta, string> = {
  DESCOBERTA: "bg-slate-400",
  PROPOSTA: "bg-sky-500",
  NEGOCIACAO: "bg-amber-500",
};

/** Funil em colunas: arraste o cartão para mudar de etapa, ou solte em Ganhou / Perdeu. No celular, use o menu do cartão. */
export function Funil({
  funil,
  opcoes,
  hoje,
  usuarioId,
  podeEditar,
  podeCadastrar,
}: {
  funil: FunilT;
  opcoes: OpcoesCrm;
  hoje: string;
  usuarioId: string;
  podeEditar: boolean;
  podeCadastrar: boolean;
}) {
  const router = useRouter();
  const [colunas, aplicar] = useOptimistic(funil.colunas, moverLocal);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<Etapa | null>(null);
  const [nova, setNova] = useState<EtapaAberta | null>(null);
  const [perda, setPerda] = useState<{ id: string; titulo: string } | null>(null);

  const acharCartao = (id: string) => ETAPAS_ABERTAS.flatMap((e) => colunas[e]).find((c) => c.id === id);

  function mover(id: string, para: Etapa) {
    const c = acharCartao(id);
    if (!c || c.etapa === para) return;
    if (para === "PERDIDA") return setPerda({ id, titulo: c.titulo });
    startTransition(async () => {
      aplicar({ id, para });
      if (para === "GANHA") {
        const r = await ganharOportunidade(id);
        if (!r.ok) return void toast.error(r.erro);
        toast.success(`${c.titulo}: ganha!`, {
          action: {
            label: "Desfazer",
            onClick: () =>
              startTransition(async () => {
                const d = await reabrirOportunidade(id);
                if (!d.ok) toast.error(d.erro);
                router.refresh();
              }),
          },
        });
      } else {
        const r = await moverOportunidade(id, para as EtapaAberta);
        if (!r.ok) toast.error(r.erro);
      }
      router.refresh();
    });
  }

  const alvo = (etapa: Etapa) =>
    podeEditar
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (!arrastando) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (sobre !== etapa) setSobre(etapa);
          },
          onDragLeave: (e: React.DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre((s) => (s === etapa ? null : s));
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain") || arrastando;
            setSobre(null);
            setArrastando(null);
            if (id) mover(id, etapa);
          },
        }
      : {};

  return (
    <>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {ETAPAS_ABERTAS.map((etapa) => {
          const cs = colunas[etapa];
          const t = funil.totais[etapa];
          return (
            <section
              key={etapa}
              aria-label={`${ROTULO_ETAPA[etapa]}: ${cs.length} oportunidades`}
              className={cn(
                "flex w-[85%] shrink-0 snap-start flex-col rounded-xl border bg-muted/40 transition-colors md:w-auto",
                sobre === etapa && "border-primary bg-primary/5",
              )}
              {...alvo(etapa)}
            >
              <header className="flex items-start justify-between gap-2 border-b px-3 py-2.5">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <span className={cn("size-2 rounded-full", COR_ETAPA[etapa])} aria-hidden />
                    {ROTULO_ETAPA[etapa]}
                    <span className="font-normal text-muted-foreground">{cs.length}</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {`${fmtMoeda(t.valor)} · ${PROBABILIDADE[etapa]}% de chance`}
                  </p>
                </div>
                {podeEditar && (
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Nova oportunidade em ${ROTULO_ETAPA[etapa]}`} onClick={() => setNova(etapa)}>
                    <Plus />
                  </Button>
                )}
              </header>
              <ol className="flex min-h-32 flex-1 flex-col gap-2 p-2">
                {cs.map((c) => (
                  <Cartao
                    key={c.id}
                    c={c}
                    hoje={hoje}
                    podeEditar={podeEditar}
                    arrastando={arrastando === c.id}
                    onArrastar={setArrastando}
                    onMover={mover}
                    onPerder={() => setPerda({ id: c.id, titulo: c.titulo })}
                  />
                ))}
                {!cs.length && (
                  <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    {podeEditar ? "Arraste uma oportunidade para cá ou use o +" : "Nenhuma oportunidade"}
                  </li>
                )}
              </ol>
            </section>
          );
        })}
      </div>

      {/* zonas de fechamento: aparecem enquanto um cartão é arrastado */}
      {arrastando && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className="pointer-events-auto grid w-full max-w-lg grid-cols-2 gap-3">
            {(["GANHA", "PERDIDA"] as const).map((e) => (
              <div
                key={e}
                {...alvo(e)}
                className={cn(
                  "flex h-16 items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-semibold shadow-lg backdrop-blur transition-colors",
                  e === "GANHA" ? "border-emerald-500 bg-emerald-50/95 text-emerald-700 dark:bg-emerald-950/90 dark:text-emerald-300" : "border-red-500 bg-red-50/95 text-red-700 dark:bg-red-950/90 dark:text-red-300",
                  sobre === e && (e === "GANHA" ? "bg-emerald-100 dark:bg-emerald-900" : "bg-red-100 dark:bg-red-900"),
                )}
              >
                {e === "GANHA" ? <ThumbsUp className="size-5" /> : <ThumbsDown className="size-5" />}
                {e === "GANHA" ? "Ganhou" : "Perdeu"}
              </div>
            ))}
          </div>
        </div>
      )}

      {nova && (
        <DialogoOportunidade
          aberto
          onAbertoChange={(x) => !x && setNova(null)}
          id={null}
          iniciais={oportunidadeVazia(usuarioId, nova)}
          opcoes={opcoes}
          podeCadastrar={podeCadastrar}
        />
      )}
      <DialogoPerda oportunidade={perda} onFechar={() => setPerda(null)} />
    </>
  );
}

function Cartao({
  c,
  hoje,
  podeEditar,
  arrastando,
  onArrastar,
  onMover,
  onPerder,
}: {
  c: CartaoOportunidade;
  hoje: string;
  podeEditar: boolean;
  arrastando: boolean;
  onArrastar: (id: string | null) => void;
  onMover: (id: string, para: Etapa) => void;
  onPerder: () => void;
}) {
  const prox = c.proxima ? quando(c.proxima.data, c.proxima.hora, hoje) : null;
  const previsaoVencida = !!c.previsaoFechamento && c.previsaoFechamento < hoje;
  return (
    <li
      draggable={podeEditar}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", c.id);
        e.dataTransfer.effectAllowed = "move";
        onArrastar(c.id);
      }}
      onDragEnd={() => onArrastar(null)}
      className={cn(
        "group relative rounded-lg border bg-card p-3 shadow-xs transition hover:border-primary/40 hover:shadow-sm",
        podeEditar && "cursor-grab active:cursor-grabbing",
        arrastando && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/crm/oportunidades/${c.id}`} className="min-w-0 text-sm leading-snug font-medium after:absolute after:inset-0 hover:underline" draggable={false}>
          {c.titulo}
        </Link>
        {podeEditar && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative z-10 -mt-1 -mr-1 size-7 shrink-0" aria-label={`Ações: ${c.titulo}`}>
                <EllipsisVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <Link href={`/crm/oportunidades/${c.id}`}>
                  <ExternalLink /> Abrir
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Mover para</DropdownMenuLabel>
              {ETAPAS_ABERTAS.filter((e) => e !== c.etapa).map((e) => (
                <DropdownMenuItem key={e} onSelect={() => onMover(c.id, e)}>
                  {ROTULO_ETAPA[e]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onMover(c.id, "GANHA")}>
                <ThumbsUp /> Ganhou
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={onPerder}>
                <ThumbsDown /> Perdeu
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.pessoaNome}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">{fmtMoeda(c.valor)}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {c.previsaoFechamento && (
            <span className={cn("tabular-nums", previsaoVencida && "font-medium text-destructive")} title="Previsão de fechamento">
              {previsaoVencida && <CalendarX2 className="mr-0.5 inline size-3.5 align-[-2px]" aria-hidden />}
              {fmtData(c.previsaoFechamento).slice(0, 5)}
            </span>
          )}
          <span
            className="grid size-6 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
            title={c.responsavelNome ? `Responsável: ${c.responsavelNome}` : "Sem responsável"}
          >
            {iniciais(c.responsavelNome)}
          </span>
        </span>
      </div>
      <div className="mt-2 border-t pt-2 text-xs">
        {c.proxima && prox ? (
          <p className={cn("flex items-center gap-1.5 truncate", prox.atrasada ? "font-medium text-destructive" : "text-muted-foreground")}>
            <IconeAtividade tipo={c.proxima.tipo} className="size-3.5" />
            <span className="tabular-nums">{prox.texto}</span>
            <span className="truncate">· {c.proxima.assunto}</span>
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
            <TriangleAlert className="size-3.5" aria-hidden /> Sem próxima atividade
          </p>
        )}
        {c.diasNaEtapa >= 1 && <p className="mt-1 text-muted-foreground">{c.diasNaEtapa === 1 ? "1 dia nesta etapa" : `${c.diasNaEtapa} dias nesta etapa`}</p>}
      </div>
    </li>
  );
}
