"use client";

import { useId, useState } from "react";
import { Check, Copy, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Selo } from "@/components/selos";
import { extrairDiferencas, rotuloAcao, rotuloCampo, rotuloEntidade, tomAcao } from "@/modules/configuracoes/auditoria-util";
import type { RegistroAuditoria } from "@/modules/configuracoes/tipos";

/** Valor de um campo na tabela de diferenças. */
function Valor({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (typeof v === "boolean") return <>{v ? "Sim" : "Não"}</>;
  if (typeof v === "object") return <code className="font-mono text-xs">{JSON.stringify(v)}</code>;
  return <>{String(v)}</>;
}

function Item({ rotulo, className, children }: { rotulo: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

function DetalheAuditoria({ registro: r, onFechar }: { registro: RegistroAuditoria; onFechar: () => void }) {
  const uid = useId();
  const [copiado, setCopiado] = useState(false);
  const diferencas = extrairDiferencas(r.dados);
  const json = r.dados === null || r.dados === undefined ? null : JSON.stringify(r.dados, null, 2);

  async function copiarJson() {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopiado(true);
      toast.success("JSON copiado.");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle>Detalhes do registro</DialogTitle>
          <DialogDescription>
            {rotuloAcao(r.acao)} · {rotuloEntidade(r.entidade)} · {r.dataHoraCompleta}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Item rotulo="Data e hora">{r.dataHoraCompleta}</Item>
          <Item rotulo="Usuário">
            {r.usuario ? (
              <>
                {r.usuario.nome} <span className="text-muted-foreground">({r.usuario.email})</span>
              </>
            ) : (
              <span className="text-muted-foreground">Sistema</span>
            )}
          </Item>
          <Item rotulo="Ação">
            <span className="inline-flex flex-wrap items-center gap-2">
              <Selo tom={tomAcao(r.acao)}>{rotuloAcao(r.acao)}</Selo>
              <code className="font-mono text-xs text-muted-foreground">{r.acao}</code>
            </span>
          </Item>
          <Item rotulo="Entidade">
            {rotuloEntidade(r.entidade)} <code className="font-mono text-xs text-muted-foreground">({r.entidade})</code>
          </Item>
          <Item rotulo="ID da entidade">
            {r.entidadeId ? <code className="font-mono text-xs break-all">{r.entidadeId}</code> : <span className="text-muted-foreground">—</span>}
          </Item>
          <Item rotulo="IP">{r.ip ? <code className="font-mono text-xs">{r.ip}</code> : <span className="text-muted-foreground">—</span>}</Item>
          <Item rotulo="Resumo" className="sm:col-span-2">
            {r.resumo || <span className="text-muted-foreground">—</span>}
          </Item>
        </dl>

        {diferencas && (
          <section aria-labelledby={`${uid}-dif`} className="space-y-2">
            <h3 id={`${uid}-dif`} className="text-sm font-semibold">
              Alterações
            </h3>
            {diferencas.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                Nenhum campo foi alterado neste registro.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-1/4">Campo</TableHead>
                      <TableHead className="w-[37.5%]">Antes</TableHead>
                      <TableHead className="w-[37.5%]">Depois</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diferencas.map((d) => (
                      <TableRow key={d.campo}>
                        <TableCell className="align-top font-medium whitespace-normal">
                          <span title={d.campo}>{rotuloCampo(d.campo)}</span>
                        </TableCell>
                        <TableCell className="align-top break-words whitespace-normal text-muted-foreground">
                          <Valor v={d.antes} />
                        </TableCell>
                        <TableCell className="align-top break-words whitespace-normal font-medium">
                          <Valor v={d.depois} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        )}

        <section aria-labelledby={`${uid}-json`} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 id={`${uid}-json`} className="text-sm font-semibold">
              Dados (JSON)
            </h3>
            {json && (
              <Button type="button" variant="outline" size="sm" onClick={copiarJson}>
                {copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar JSON"}
              </Button>
            )}
          </div>
          {json ? (
            <pre
              tabIndex={0}
              aria-label="Dados do registro em JSON"
              className="max-h-72 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap"
            >
              {json}
            </pre>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              Este registro não tem dados adicionais.
            </p>
          )}
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Botão por linha da auditoria: abre o diálogo com os detalhes, as alterações (antes/depois) e o JSON. */
export function BotaoDetalheAuditoria({ registro }: { registro: RegistroAuditoria }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => setAberto(true)}
        aria-label={`Ver detalhes: ${rotuloAcao(registro.acao)} em ${rotuloEntidade(registro.entidade)}, ${registro.dataHora}`}
        title="Ver detalhes"
      >
        <Eye />
      </Button>
      {aberto && <DetalheAuditoria registro={registro} onFechar={() => setAberto(false)} />}
    </>
  );
}
