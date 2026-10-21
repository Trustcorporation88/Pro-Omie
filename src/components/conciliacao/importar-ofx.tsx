"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck, FileText, LoaderCircle, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useParametros } from "@/components/filtros";
import { ErroOfx, lerOfx, type ExtratoOfx } from "@/lib/ofx";
import { fmtData, fmtMoeda } from "@/lib/format";
import { importarOfx } from "@/modules/conciliacao/acoes";
import { contaConfere, rotuloConta } from "@/modules/conciliacao/utils";
import type { ContaConciliacao, ResultadoImportacao } from "@/modules/conciliacao/tipos";

const TAMANHO_MAXIMO = 2 * 1024 * 1024;
const EVENTO_ABRIR = "conciliacao:importar-ofx";

/** Abre o diálogo de importação do cabeçalho (mantém uma única instância, que sobrevive ao refresh). */
export function BotaoAbrirImportacao({ rotulo = "Importar OFX" }: { rotulo?: string }) {
  return (
    <Button onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR))}>
      <Upload /> {rotulo}
    </Button>
  );
}

type Previa = { ofx: ExtratoOfx; contaAuto: boolean } | { erro: string };

function Avisos({ avisos }: { avisos: string[] }) {
  if (!avisos.length) return null;
  return (
    <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[oklch(0.5_0.13_65)] dark:text-warning" />
      <ul className="space-y-1">
        {avisos.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
    </div>
  );
}

/** Botão + diálogo "Importar OFX": prévia local do arquivo, envio e resumo do resultado. */
export function ImportarOfx({
  contas,
  contaAtual,
  rotulo = "Importar OFX",
  variante = "default",
}: {
  contas: ContaConciliacao[];
  contaAtual: string;
  rotulo?: string;
  variante?: "default" | "outline";
}) {
  const router = useRouter();
  const { definir } = useParametros();
  const [aberto, setAberto] = useState(false);
  const [contaId, setContaId] = useState(contaAtual);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [enviando, iniciar] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const conta = contas.find((c) => c.id === contaId);

  function reiniciar() {
    setArquivo(null);
    setPrevia(null);
    setResultado(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function abrir() {
    reiniciar();
    setContaId(contaAtual);
    setAberto(true);
  }

  useEffect(() => {
    const aoPedir = () => {
      setArquivo(null);
      setPrevia(null);
      setResultado(null);
      if (inputRef.current) inputRef.current.value = "";
      setContaId(contaAtual);
      setAberto(true);
    };
    window.addEventListener(EVENTO_ABRIR, aoPedir);
    return () => window.removeEventListener(EVENTO_ABRIR, aoPedir);
  }, [contaAtual]);

  async function escolher(f: File | null) {
    setResultado(null);
    setPrevia(null);
    setArquivo(f);
    if (!f) return;
    if (f.size > TAMANHO_MAXIMO) {
      setPrevia({ erro: "O arquivo passa de 2 MB. Exporte um período menor no internet banking." });
      return;
    }
    try {
      const ofx = lerOfx(new Uint8Array(await f.arrayBuffer()));
      let contaAuto = false;
      // Se o número do arquivo não confere com a conta escolhida mas confere com outra, sugere a outra.
      if (ofx.conta.numero && contaConfere(ofx.conta.numero, conta?.numero) !== true) {
        const candidata = contas.find((c) => contaConfere(ofx.conta.numero, c.numero) === true);
        if (candidata && candidata.id !== contaId) {
          setContaId(candidata.id);
          contaAuto = true;
        }
      }
      setPrevia({ ofx, contaAuto });
    } catch (e) {
      setPrevia({ erro: e instanceof ErroOfx ? e.message : "Não foi possível ler o arquivo. Confira se é um extrato OFX." });
    }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivo || !contaId) return;
    const fd = new FormData();
    fd.set("contaBancariaId", contaId);
    fd.set("arquivo", arquivo);
    iniciar(async () => {
      const r = await importarOfx(fd);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      setResultado(r.data ?? null);
      toast.success(r.mensagem ?? "Extrato importado.");
      if (contaId !== contaAtual) definir({ conta: contaId, status: null });
      else router.refresh();
    });
  }

  const ofx = previa && "ofx" in previa ? previa.ofx : null;
  const divergente = ofx && conta ? contaConfere(ofx.conta.numero, conta.numero) === false : false;

  return (
    <>
      <Button variant={variante} onClick={abrir}>
        <Upload /> {rotulo}
      </Button>
      <Dialog open={aberto} onOpenChange={(v) => !enviando && setAberto(v)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar extrato OFX</DialogTitle>
            <DialogDescription>
              No internet banking, exporte o extrato no formato OFX (Money/Quicken) e envie aqui. Lançamentos já importados são ignorados
              automaticamente.
            </DialogDescription>
          </DialogHeader>

          {resultado ? (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-success">
                  <CircleCheck className="size-4" /> Importação concluída
                </p>
                <p className="mt-2 text-3xl font-semibold tabular">
                  {resultado.novos}
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    novo(s) de {resultado.total} lançamento(s)
                  </span>
                </p>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Conta</dt>
                  <dd>{resultado.contaNome}</dd>
                  <dt className="text-muted-foreground">Período</dt>
                  <dd className="tabular">
                    {resultado.inicio ? `${fmtData(resultado.inicio)} a ${fmtData(resultado.fim)}` : "—"}
                  </dd>
                  {resultado.saldo !== null && (
                    <>
                      <dt className="text-muted-foreground">Saldo final</dt>
                      <dd className="tabular">{fmtMoeda(resultado.saldo)}</dd>
                    </>
                  )}
                  {resultado.duplicados > 0 && (
                    <>
                      <dt className="text-muted-foreground">Já importados</dt>
                      <dd className="tabular">{resultado.duplicados} (ignorados)</dd>
                    </>
                  )}
                </dl>
              </div>
              <Avisos avisos={resultado.avisos} />
              <DialogFooter>
                <Button variant="outline" onClick={reiniciar}>
                  Importar outro arquivo
                </Button>
                <Button onClick={() => setAberto(false)}>Concluir</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ofx-conta">Conta bancária</Label>
                <select
                  id="ofx-conta"
                  value={contaId}
                  onChange={(e) => setContaId(e.target.value)}
                  disabled={enviando}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                >
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {rotuloConta(c)}
                    </option>
                  ))}
                </select>
                {previa && "ofx" in previa && previa.contaAuto && (
                  <p className="text-xs text-muted-foreground">Conta escolhida automaticamente pelo número que consta no arquivo.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ofx-arquivo">Arquivo .ofx (até 2 MB)</Label>
                <Input
                  id="ofx-arquivo"
                  ref={inputRef}
                  type="file"
                  accept=".ofx,.qfx,.ofc,application/x-ofx"
                  disabled={enviando}
                  onChange={(e) => void escolher(e.target.files?.[0] ?? null)}
                  className="cursor-pointer file:mr-3 file:cursor-pointer"
                />
              </div>

              {previa && "erro" in previa && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{previa.erro}</p>
              )}
              {ofx && (
                <div className="space-y-3">
                  <div className="flex gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="font-medium">
                        {ofx.transacoes.length} lançamento(s)
                        {ofx.inicio && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {fmtData(ofx.inicio)} a {fmtData(ofx.fim)}
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground">
                        {[
                          ofx.conta.banco && `Banco ${ofx.conta.banco}`,
                          ofx.conta.agencia && `ag. ${ofx.conta.agencia}`,
                          ofx.conta.numero && `conta ${ofx.conta.numero}`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Conta não informada no arquivo"}
                      </p>
                      {ofx.saldo && <p className="text-muted-foreground">Saldo final informado: {fmtMoeda(ofx.saldo.valor)}</p>}
                    </div>
                  </div>
                  <Avisos
                    avisos={[
                      ...(divergente
                        ? [`A conta do arquivo (${ofx.conta.numero}) não parece ser "${conta?.nome}" (${conta?.numero}). Confira antes de importar.`]
                        : []),
                      ...ofx.avisos,
                    ]}
                  />
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={enviando}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={enviando || !arquivo || (previa !== null && "erro" in previa)}>
                  {enviando ? <LoaderCircle className="animate-spin" /> : <Upload />} Importar
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
