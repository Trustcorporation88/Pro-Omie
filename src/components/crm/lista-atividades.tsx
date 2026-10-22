"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EllipsisVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { DialogoAtividade, atividadeVazia } from "@/components/crm/dialogo-atividade";
import { IconeAtividade, quando } from "@/components/crm/visual";
import { concluirAtividade, excluirAtividade } from "@/modules/crm/acoes";
import { ROTULO_ATIVIDADE, type AtividadeItem, type OpcoesCrm, type ValoresAtividade } from "@/modules/crm/tipos";
import { cn } from "@/lib/utils";

type Edicao = { id: string | null; valores: ValoresAtividade; oportunidadeTitulo: string | null };

/** Lista de atividades com conclusão em um clique. Concluir uma atividade de oportunidade oferece agendar a próxima. */
export function ListaAtividades({
  itens,
  hoje,
  opcoes,
  usuarioId,
  podeEditar,
  mostrarVinculo = true,
  mostrarResponsavel = false,
  vazio,
}: {
  itens: AtividadeItem[];
  hoje: string;
  opcoes: OpcoesCrm;
  usuarioId: string;
  podeEditar: boolean;
  mostrarVinculo?: boolean;
  mostrarResponsavel?: boolean;
  vazio?: string;
}) {
  const router = useRouter();
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [excluir, setExcluir] = useState<AtividadeItem | null>(null);
  const [trocando, setTrocando] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  function alternar(a: AtividadeItem) {
    const concluir = !a.concluidaEm;
    setTrocando(a.id);
    iniciar(async () => {
      const r = await concluirAtividade(a.id, concluir);
      setTrocando(null);
      if (!r.ok) return void toast.error(r.erro);
      router.refresh();
      if (concluir && a.oportunidade) {
        const op = a.oportunidade;
        toast.success("Atividade concluída. Qual o próximo passo?", {
          action: {
            label: "Agendar próxima",
            onClick: () => setEdicao({ id: null, valores: atividadeVazia(hoje, usuarioId, op.id), oportunidadeTitulo: op.titulo }),
          },
        });
      } else toast.success(r.mensagem ?? "Pronto.");
    });
  }

  if (!itens.length) return vazio ? <p className="px-1 py-3 text-sm text-muted-foreground">{vazio}</p> : null;

  return (
    <>
      <ul className="divide-y">
        {itens.map((a) => {
          const q = quando(a.data, a.hora, hoje);
          const feita = !!a.concluidaEm;
          return (
            <li key={a.id} className="flex items-start gap-3 py-2.5">
              <Checkbox
                className="mt-0.5"
                checked={feita}
                disabled={!podeEditar || trocando === a.id}
                onCheckedChange={() => alternar(a)}
                aria-label={feita ? `Reabrir: ${a.assunto}` : `Concluir: ${a.assunto}`}
              />
              <div className="min-w-0 flex-1">
                <p className={cn("flex items-center gap-1.5 text-sm font-medium", feita && "text-muted-foreground line-through")}>
                  <IconeAtividade tipo={a.tipo} className="text-muted-foreground" />
                  <span className="sr-only">{ROTULO_ATIVIDADE[a.tipo]}:</span>
                  <span className="truncate">{a.assunto}</span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span className={cn("tabular-nums", !feita && q.atrasada && "font-medium text-destructive", !feita && q.ehHoje && "font-medium text-foreground")}>
                    {q.texto}
                  </span>
                  {mostrarVinculo && a.oportunidade && (
                    <Link href={`/crm/oportunidades/${a.oportunidade.id}`} className="truncate hover:text-foreground hover:underline">
                      {a.oportunidade.titulo}
                    </Link>
                  )}
                  {mostrarVinculo && !a.oportunidade && a.pessoa && <span className="truncate">{a.pessoa.nome}</span>}
                  {mostrarResponsavel && a.responsavelNome && <span>· {a.responsavelNome}</span>}
                </p>
                {a.descricao && <p className="mt-1 line-clamp-2 text-xs whitespace-pre-wrap text-muted-foreground">{a.descricao}</p>}
              </div>
              {podeEditar && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7" aria-label={`Ações: ${a.assunto}`}>
                      <EllipsisVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() =>
                        setEdicao({
                          id: a.id,
                          oportunidadeTitulo: a.oportunidade?.titulo ?? null,
                          valores: {
                            tipo: a.tipo,
                            assunto: a.assunto,
                            descricao: a.descricao ?? "",
                            data: a.data,
                            hora: a.hora ?? "",
                            responsavelId: a.responsavelId ?? usuarioId,
                            oportunidadeId: a.oportunidade?.id ?? null,
                            pessoaId: a.pessoa?.id ?? null,
                            pessoaNome: a.pessoa?.nome ?? null,
                          },
                        })
                      }
                    >
                      <Pencil /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setExcluir(a)}>
                      <Trash2 /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>
      {edicao && (
        <DialogoAtividade
          aberto
          onAbertoChange={(x) => !x && setEdicao(null)}
          id={edicao.id}
          iniciais={edicao.valores}
          oportunidadeTitulo={edicao.oportunidadeTitulo}
          opcoes={opcoes}
          hoje={hoje}
        />
      )}
      {excluir && (
        <ConfirmarAcao
          aberto
          onAbertoChange={(x) => !x && setExcluir(null)}
          titulo="Excluir a atividade?"
          descricao={excluir.assunto}
          rotuloConfirmar="Excluir"
          destrutivo
          acao={() => excluirAtividade(excluir.id)}
          aoConcluir={() => setExcluir(null)}
        />
      )}
    </>
  );
}

/** Botão "Nova atividade" com o diálogo (opcionalmente já ligado a uma oportunidade). */
export function BotaoNovaAtividade({
  hoje,
  usuarioId,
  opcoes,
  oportunidade,
  variante = "default",
}: {
  hoje: string;
  usuarioId: string;
  opcoes: OpcoesCrm;
  oportunidade?: { id: string; titulo: string } | null;
  variante?: "default" | "outline";
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant={variante} size={variante === "outline" ? "sm" : "default"} onClick={() => setAberto(true)}>
        <Plus /> Nova atividade
      </Button>
      <DialogoAtividade
        aberto={aberto}
        onAbertoChange={setAberto}
        id={null}
        iniciais={atividadeVazia(hoje, usuarioId, oportunidade?.id ?? null)}
        oportunidadeTitulo={oportunidade?.titulo ?? null}
        opcoes={opcoes}
        hoje={hoje}
      />
    </>
  );
}
