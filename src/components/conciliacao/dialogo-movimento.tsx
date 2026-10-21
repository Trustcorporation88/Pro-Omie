"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, LoaderCircle, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Selo } from "@/components/selos";
import { addDias } from "@/lib/datas";
import { fmtData, fmtMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buscarMovimentosParaVincular, conciliarItem } from "@/modules/conciliacao/acoes";
import { normalizarTexto } from "@/modules/conciliacao/utils";
import type { LinhaPendente, MovimentoOpcao } from "@/modules/conciliacao/tipos";
import { ROTULO_ORIGEM, ValorExtrato } from "./valor";

/** "Outro movimento…": vincula manualmente a um movimento não conciliado da conta (mesmo sentido, ±30 dias). */
export function DialogoMovimento({
  item,
  aberto,
  onAbertoChange,
}: {
  item: LinhaPendente;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [lista, setLista] = useState<MovimentoOpcao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  useEffect(() => {
    let ativo = true;
    buscarMovimentosParaVincular(item.id).then((r) => {
      if (!ativo) return;
      if (r.ok) setLista(r.data ?? []);
      else setErro(r.erro);
    });
    return () => {
      ativo = false;
    };
  }, [item.id]);

  const visiveis = useMemo(() => {
    const t = normalizarTexto(filtro);
    if (!lista || !t) return lista ?? [];
    return lista.filter((m) => normalizarTexto(`${m.descricao} ${fmtMoeda(m.valor)} ${fmtData(m.data)}`).includes(t));
  }, [lista, filtro]);

  const escolhido = lista?.find((m) => m.id === selecionado) ?? null;
  const diferenca = escolhido ? Math.round((Math.abs(item.valor) - Math.abs(escolhido.valor)) * 100) / 100 : 0;

  function confirmar() {
    if (!selecionado) return;
    iniciar(async () => {
      const r = await conciliarItem(item.id, selecionado);
      if (r.ok) {
        toast.success(r.mensagem ?? "Lançamento conciliado.");
        onAbertoChange(false);
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !salvando && onAbertoChange(v)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular a outro movimento</DialogTitle>
          <DialogDescription>
            Movimentos ainda não conciliados desta conta, de {item.valor > 0 ? "entrada" : "saída"}, entre {fmtData(addDias(item.data, -30))} e{" "}
            {fmtData(addDias(item.data, 30))}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span className="min-w-0 truncate text-muted-foreground" title={item.descricao}>
            Extrato: {fmtData(item.data)} · {item.descricao}
          </span>
          <ValorExtrato valor={item.valor} />
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por descrição, valor ou data…" className="pl-8" />
        </div>

        <div className="max-h-80 overflow-y-auto rounded-lg border">
          {erro ? (
            <p className="p-4 text-sm text-destructive">{erro}</p>
          ) : lista === null ? (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Buscando movimentos…
            </p>
          ) : visiveis.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {lista.length === 0
                ? "Nenhum movimento em aberto nesse intervalo. Use “Criar lançamento” para registrar este valor."
                : "Nenhum movimento corresponde ao filtro."}
            </p>
          ) : (
            <ul className="divide-y">
              {visiveis.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelecionado(m.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-muted/50",
                      selecionado === m.id && "bg-primary/5 ring-1 ring-primary/40 ring-inset",
                    )}
                  >
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", selecionado === m.id && "border-primary bg-primary text-primary-foreground")}>
                      {selecionado === m.id && <Check className="size-3" />}
                    </span>
                    <span className="w-20 shrink-0 tabular text-muted-foreground">{fmtData(m.data)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1">{m.descricao}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {ROTULO_ORIGEM[m.origem]} · {m.distancia === 0 ? "mesma data" : `${m.distancia} dia(s)`}
                        {m.mesmoValor && <Selo tom="sucesso">mesmo valor</Selo>}
                      </span>
                    </span>
                    <ValorExtrato valor={m.valor} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {escolhido && Math.abs(diferenca) >= 0.01 && (
          <p className="flex items-start gap-2 text-sm text-[oklch(0.5_0.13_65)] dark:text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            O valor do movimento difere do extrato em {fmtMoeda(Math.abs(diferenca))}. O vínculo será feito mesmo assim.
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!selecionado || salvando}>
            {salvando ? <LoaderCircle className="animate-spin" /> : <Check />} Conciliar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
