"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Ellipsis, EyeOff, FileText, HandCoins, Link2, LoaderCircle, Plus, Wand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Selo } from "@/components/selos";
import { fmtData, fmtMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Resultado } from "@/lib/acoes";
import { baixarEConciliar, conciliarItem, ignorarItem } from "@/modules/conciliacao/acoes";
import { rotuloDistancia } from "@/modules/conciliacao/utils";
import type { LinhaPendente, OpcoesConciliacao, SugestoesItem } from "@/modules/conciliacao/tipos";
import { ValorExtrato, ROTULO_ORIGEM } from "./valor";
import { DialogoLancamento } from "./dialogo-lancamento";
import { DialogoMovimento } from "./dialogo-movimento";

function SeloDistancia({ dias }: { dias: number }) {
  return <Selo tom={dias === 0 ? "sucesso" : dias <= 3 ? "info" : "alerta"}>{rotuloDistancia(dias)}</Selo>;
}

export function CelulaSugestao({ s }: { s: SugestoesItem }) {
  if (s.movimento) {
    const m = s.movimento;
    return (
      <div className="flex min-w-0 items-start gap-2">
        <Link2 className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 space-y-0.5">
          <p className="line-clamp-2 text-sm leading-snug">{m.descricao}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>
              {ROTULO_ORIGEM[m.origem]} · {fmtData(m.data)}
            </span>
            <SeloDistancia dias={m.distancia} />
          </p>
        </div>
      </div>
    );
  }
  if (s.titulo) {
    const t = s.titulo;
    return (
      <div className="flex min-w-0 items-start gap-2">
        <FileText className="mt-0.5 size-4 shrink-0 text-chart-5" />
        <div className="min-w-0 space-y-0.5">
          <p className="line-clamp-2 text-sm leading-snug">
            <span className="font-medium">
              {t.tipo === "RECEBER" ? "A receber" : "A pagar"} #{t.numero}
            </span>{" "}
            · {t.pessoa ?? t.descricao}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>
              Vence {fmtData(t.vencimento)} · saldo {fmtMoeda(t.saldo)}
            </span>
            <SeloDistancia dias={t.distancia} />
            {t.outraConta && <span title="Conta prevista no título">previsto em {t.outraConta}</span>}
          </p>
        </div>
      </div>
    );
  }
  if (s.regra) {
    const r = s.regra;
    return (
      <div className="flex min-w-0 items-start gap-2">
        <Wand className="mt-0.5 size-4 shrink-0 text-chart-3" />
        <div className="min-w-0 space-y-0.5">
          <p className="line-clamp-2 text-sm leading-snug">
            Regra <span className="font-medium">“{r.termo}”</span> → {r.categoria}
          </p>
          {(r.pessoa || r.centroCusto) && (
            <p className="text-xs text-muted-foreground">{[r.pessoa, r.centroCusto].filter(Boolean).join(" · ")}</p>
          )}
        </div>
      </div>
    );
  }
  return <span className="text-xs text-muted-foreground">Sem sugestão — crie o lançamento ou vincule um movimento.</span>;
}

function LinhaPendenteRow({
  linha,
  podeEditar,
  onCriar,
  onVincular,
}: {
  linha: LinhaPendente;
  podeEditar: boolean;
  onCriar: () => void;
  onVincular: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const s = linha.sugestoes;

  const rodar = (fn: () => Promise<Resultado<unknown>>) =>
    iniciar(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.mensagem ?? "Feito.");
        router.refresh();
      } else toast.error(r.erro);
    });

  const icone = (I: typeof Check) => (pendente ? <LoaderCircle className="animate-spin" /> : <I />);

  return (
    <TableRow className={cn(pendente && "opacity-60")}>
      <TableCell className="align-top tabular text-muted-foreground">{fmtData(linha.data)}</TableCell>
      <TableCell className="max-w-[26rem] min-w-56 align-top whitespace-normal">
        <p className="line-clamp-2 leading-snug font-medium">{linha.descricao}</p>
        {linha.documento && <p className="mt-0.5 text-xs text-muted-foreground">Doc. {linha.documento}</p>}
      </TableCell>
      <TableCell className="text-right align-top">
        <ValorExtrato valor={linha.valor} />
      </TableCell>
      <TableCell className="max-w-[24rem] min-w-56 align-top whitespace-normal">
        <CelulaSugestao s={s} />
      </TableCell>
      {podeEditar && (
        <TableCell className="align-top">
          <div className="flex justify-end gap-1">
            {s.movimento ? (
              <Button size="sm" disabled={pendente} onClick={() => rodar(() => conciliarItem(linha.id, s.movimento!.movimentoId))}>
                {icone(Check)} Conciliar
              </Button>
            ) : s.titulo ? (
              <Button size="sm" disabled={pendente} onClick={() => rodar(() => baixarEConciliar(linha.id, s.titulo!.tituloId))}>
                {icone(HandCoins)} Baixar e conciliar
              </Button>
            ) : (
              <Button size="sm" variant={s.regra ? "default" : "outline"} disabled={pendente} onClick={onCriar}>
                {icone(Plus)} Criar lançamento
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Mais ações" disabled={pendente}>
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(s.movimento || s.titulo) && (
                  <DropdownMenuItem onSelect={onCriar}>
                    <Plus /> Criar lançamento
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={onVincular}>
                  <Link2 /> Outro movimento…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => rodar(() => ignorarItem(linha.id))}>
                  <EyeOff /> Ignorar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

type Selecao = { item: LinhaPendente; aberto: boolean } | null;

export function TabelaPendentes({
  linhas,
  opcoes,
  podeEditar,
}: {
  linhas: LinhaPendente[];
  opcoes: OpcoesConciliacao;
  podeEditar: boolean;
}) {
  const [lancamento, setLancamento] = useState<Selecao>(null);
  const [vinculo, setVinculo] = useState<Selecao>(null);
  return (
    <>
      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-28">Data</TableHead>
              <TableHead>Descrição no extrato</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Sugestão</TableHead>
              {podeEditar && <TableHead className="w-0 text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <LinhaPendenteRow
                key={l.id}
                linha={l}
                podeEditar={podeEditar}
                onCriar={() => setLancamento({ item: l, aberto: true })}
                onVincular={() => setVinculo({ item: l, aberto: true })}
              />
            ))}
          </TableBody>
        </Table>
      </Card>
      {lancamento && (
        <DialogoLancamento
          key={lancamento.item.id}
          item={lancamento.item}
          opcoes={opcoes}
          aberto={lancamento.aberto}
          onAbertoChange={(v) => setLancamento((s) => (s ? { ...s, aberto: v } : s))}
        />
      )}
      {vinculo && (
        <DialogoMovimento
          key={vinculo.item.id}
          item={vinculo.item}
          aberto={vinculo.aberto}
          onAbertoChange={(v) => setVinculo((s) => (s ? { ...s, aberto: v } : s))}
        />
      )}
    </>
  );
}
