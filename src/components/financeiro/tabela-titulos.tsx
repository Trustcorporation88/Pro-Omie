"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Selo } from "@/components/selos";
import { arred2, fmtData, fmtMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DialogoBaixaLote } from "./dialogo-baixa-lote";
import { MenuAcoesTitulo } from "./menu-acoes-titulo";
import { SeloSituacao } from "./selo-situacao";
import { TEXTOS, estaAberto, type OpcoesFormulario, type TipoTitulo, type TituloLinha } from "./tipos";

/** Tabela de títulos com seleção para baixa em lote, ações por linha e total da página. */
export function TabelaTitulos({
  tipo,
  linhas,
  hoje,
  podeEditar,
  opcoes,
}: {
  tipo: TipoTitulo;
  linhas: TituloLinha[];
  hoje: string;
  podeEditar: boolean;
  opcoes: OpcoesFormulario;
}) {
  const tx = TEXTOS[tipo];
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [loteAberto, setLoteAberto] = useState(false);
  const [chaveLote, setChaveLote] = useState(0);

  // a seleção só considera títulos em aberto presentes na página atual
  const abertos = linhas.filter((l) => estaAberto(l.status));
  const selecionadas = abertos.filter((l) => selecionados.has(l.id));
  const todas = abertos.length > 0 && selecionadas.length === abertos.length;
  const saldoSelecionado = arred2(selecionadas.reduce((a, l) => a + l.saldo, 0));

  const alternar = (id: string, marcado: boolean) =>
    setSelecionados((s) => {
      const n = new Set(s);
      if (marcado) n.add(id);
      else n.delete(id);
      return n;
    });
  const alternarTodas = (marcado: boolean) => setSelecionados(marcado ? new Set(abertos.map((l) => l.id)) : new Set());

  const totais = linhas.reduce(
    (a, l) => ({ valor: arred2(a.valor + l.valor), pago: arred2(a.pago + l.valorPago), saldo: arred2(a.saldo + l.saldo) }),
    { valor: 0, pago: 0, saldo: 0 },
  );
  const colunasAntesValor = podeEditar ? 5 : 4;

  return (
    <>
      {podeEditar && selecionadas.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span>
            <strong className="tabular">{selecionadas.length}</strong> título(s) selecionado(s) · saldo{" "}
            <strong className="tabular">{fmtMoeda(saldoSelecionado)}</strong>
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>
              <X /> Limpar seleção
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setChaveLote((k) => k + 1);
                setLoteAberto(true);
              }}
            >
              <CheckCheck /> {tx.baixarSelecionados}
            </Button>
          </div>
        </div>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {podeEditar && (
                <TableHead className="w-10 pl-3">
                  <Checkbox
                    checked={todas ? true : selecionadas.length > 0 ? "indeterminate" : false}
                    onCheckedChange={(x) => alternarTodas(x === true)}
                    disabled={abertos.length === 0}
                    aria-label="Selecionar todos os títulos em aberto da página"
                  />
                </TableHead>
              )}
              <TableHead className={cn("w-16", !podeEditar && "pl-3")}>Nº</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>{tx.pessoa}</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Pago / Saldo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => {
              const emAberto = estaAberto(l.status);
              const vencido = emAberto && l.vencimento < hoje;
              const venceHoje = emAberto && l.vencimento === hoje;
              const marcado = selecionados.has(l.id) && emAberto;
              const detalhes = [l.categoriaNome, l.totalParcelas > 1 && `parcela ${l.parcela}/${l.totalParcelas}`, l.documento && `doc. ${l.documento}`]
                .filter(Boolean)
                .join(" · ");
              return (
                <TableRow key={l.id} data-state={marcado ? "selected" : undefined} className={cn(l.status === "CANCELADO" && "opacity-60")}>
                  {podeEditar && (
                    <TableCell className="pl-3">
                      <Checkbox
                        checked={marcado}
                        disabled={!emAberto}
                        onCheckedChange={(x) => alternar(l.id, x === true)}
                        aria-label={`Selecionar título #${l.numero}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className={cn(!podeEditar && "pl-3")}>
                    <Link href={`/financeiro/titulos/${l.id}`} className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline">
                      #{l.numero}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className={cn("tabular", vencido && "font-medium text-destructive")}>{fmtData(l.vencimento)}</span>
                    {venceHoje && (
                      <Selo tom="alerta" className="ml-1.5">
                        hoje
                      </Selo>
                    )}
                  </TableCell>
                  <TableCell className="max-w-52 truncate" title={l.pessoaNome ?? undefined}>
                    {l.pessoaNome ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="max-w-96 min-w-56 whitespace-normal">
                    <Link href={`/financeiro/titulos/${l.id}`} className="line-clamp-1 font-medium hover:underline">
                      {l.descricao}
                    </Link>
                    {detalhes && <div className="line-clamp-1 text-xs text-muted-foreground">{detalhes}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular">{fmtMoeda(l.valor)}</TableCell>
                  <TableCell className="text-right">
                    <div className={cn("font-medium tabular", vencido && "text-destructive")}>{l.status === "CANCELADO" ? "—" : fmtMoeda(l.saldo)}</div>
                    {l.valorPago > 0 && <div className="text-xs text-muted-foreground tabular">pago {fmtMoeda(l.valorPago)}</div>}
                  </TableCell>
                  <TableCell>
                    <SeloSituacao status={l.status} vencimento={l.vencimento} hoje={hoje} />
                  </TableCell>
                  <TableCell className="pr-3">
                    <MenuAcoesTitulo titulo={l} opcoes={opcoes} hoje={hoje} podeEditar={podeEditar} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colunasAntesValor} className="pl-3 text-xs text-muted-foreground">
                Total da página · {linhas.length} título(s)
              </TableCell>
              <TableCell className="text-right tabular">{fmtMoeda(totais.valor)}</TableCell>
              <TableCell className="text-right">
                <div className="tabular">{fmtMoeda(totais.saldo)}</div>
                {totais.pago > 0 && <div className="text-xs font-normal text-muted-foreground tabular">pago {fmtMoeda(totais.pago)}</div>}
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      {loteAberto && (
        <DialogoBaixaLote
          key={chaveLote}
          tipo={tipo}
          titulos={selecionadas.map((l) => ({ id: l.id, numero: l.numero, saldo: l.saldo, vencimento: l.vencimento }))}
          contas={opcoes.contas}
          formas={opcoes.formas}
          hoje={hoje}
          aberto={loteAberto}
          onAbertoChange={setLoteAberto}
          aoConcluir={() => setSelecionados(new Set())}
        />
      )}
    </>
  );
}
