"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, LoaderCircle, Undo2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { fmtData } from "@/lib/format";
import { cn } from "@/lib/utils";
import { desfazerConciliacao, restaurarItem } from "@/modules/conciliacao/acoes";
import type { ItemExtrato, LinhaConciliada } from "@/modules/conciliacao/tipos";
import { ROTULO_ORIGEM, ValorExtrato } from "./valor";

function LinhaConciliadaRow({ linha, podeEditar }: { linha: LinhaConciliada; podeEditar: boolean }) {
  const [confirmar, setConfirmar] = useState(false);
  const m = linha.movimento;
  return (
    <TableRow>
      <TableCell className="align-top tabular text-muted-foreground">{fmtData(linha.data)}</TableCell>
      <TableCell className="max-w-[24rem] min-w-56 align-top whitespace-normal">
        <p className="line-clamp-2 leading-snug font-medium">{linha.descricao}</p>
        {linha.documento && <p className="mt-0.5 text-xs text-muted-foreground">Doc. {linha.documento}</p>}
      </TableCell>
      <TableCell className="text-right align-top">
        <ValorExtrato valor={linha.valor} />
      </TableCell>
      <TableCell className="max-w-[26rem] min-w-56 align-top whitespace-normal">
        {m ? (
          <div className="flex min-w-0 items-start gap-2">
            <Link2 className="mt-0.5 size-4 shrink-0 text-success" />
            <div className="min-w-0 space-y-0.5">
              <p className="line-clamp-2 text-sm leading-snug">{m.descricao}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>
                  {ROTULO_ORIGEM[m.origem]} · {fmtData(m.data)}
                </span>
                {Math.abs(Math.abs(m.valor) - Math.abs(linha.valor)) >= 0.01 && (
                  <span className="text-[oklch(0.5_0.13_65)] dark:text-warning">
                    movimento de <ValorExtrato valor={m.valor} className="font-normal" />
                  </span>
                )}
                {m.titulo && (
                  <Link href={`/financeiro/titulos/${m.titulo.id}`} className="font-medium text-primary hover:underline">
                    {m.titulo.tipo === "RECEBER" ? "A receber" : "A pagar"} #{m.titulo.numero}
                  </Link>
                )}
              </p>
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Movimento removido do sistema. Desfaça para conciliar de novo.</span>
        )}
      </TableCell>
      {podeEditar && (
        <TableCell className="text-right align-top">
          <Button size="sm" variant="outline" onClick={() => setConfirmar(true)}>
            <Unlink /> Desfazer
          </Button>
          <ConfirmarAcao
            aberto={confirmar}
            onAbertoChange={setConfirmar}
            titulo="Desfazer esta conciliação?"
            descricao={
              <p>
                O lançamento do extrato volta para Pendentes e o movimento deixa de constar como conciliado.
                {m?.origem === "BAIXA" && " A baixa do título continua registrada; para removê-la, estorne-a no título."}
              </p>
            }
            rotuloConfirmar="Desfazer"
            acao={() => desfazerConciliacao(linha.id)}
          />
        </TableCell>
      )}
    </TableRow>
  );
}

export function TabelaConciliados({ linhas, podeEditar }: { linhas: LinhaConciliada[]; podeEditar: boolean }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-28">Data</TableHead>
            <TableHead>Descrição no extrato</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Movimento vinculado</TableHead>
            {podeEditar && <TableHead className="w-0 text-right">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <LinhaConciliadaRow key={l.id} linha={l} podeEditar={podeEditar} />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function LinhaIgnoradaRow({ linha, podeEditar }: { linha: ItemExtrato; podeEditar: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <TableRow className={cn(pendente && "opacity-60")}>
      <TableCell className="tabular text-muted-foreground">{fmtData(linha.data)}</TableCell>
      <TableCell className="max-w-[32rem] min-w-56 whitespace-normal">
        <p className="line-clamp-2 leading-snug text-muted-foreground">{linha.descricao}</p>
        {linha.documento && <p className="mt-0.5 text-xs text-muted-foreground">Doc. {linha.documento}</p>}
      </TableCell>
      <TableCell className="text-right">
        <ValorExtrato valor={linha.valor} />
      </TableCell>
      {podeEditar && (
        <TableCell className="text-right">
          <Button
            size="sm"
            variant="outline"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await restaurarItem(linha.id);
                if (r.ok) {
                  toast.success(r.mensagem ?? "Restaurado.");
                  router.refresh();
                } else toast.error(r.erro);
              })
            }
          >
            {pendente ? <LoaderCircle className="animate-spin" /> : <Undo2 />} Restaurar
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}

export function TabelaIgnorados({ linhas, podeEditar }: { linhas: ItemExtrato[]; podeEditar: boolean }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-28">Data</TableHead>
            <TableHead>Descrição no extrato</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            {podeEditar && <TableHead className="w-0 text-right">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <LinhaIgnoradaRow key={l.id} linha={l} podeEditar={podeEditar} />
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
