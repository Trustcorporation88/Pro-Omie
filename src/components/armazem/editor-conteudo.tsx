"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { normalizarNumeroBR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { salvarConteudoVolume } from "@/modules/armazem/acoes";
import { arred3, fmtQuantidade, normalizarCodigoProduto, type StatusVolume } from "@/modules/armazem/tipos";

export type ProdutoOpcao = { codigo: string; descricao: string; unidade: string };
export type LinhaConteudoTela = { codigo: string; descricao: string; unidade: string; lote: string; quantidade: number; recebimentoId: string; recebimentoNumero: number };

type Linha = { chave: number; codigo: string; descricao: string; unidade: string; lote: string; quantidade: string; recebimentoId: string | null; recebimentoNumero: number | null };

export function lerQuantidade(texto: string): number {
  const s = normalizarNumeroBR(texto.trim());
  const n = Number(s);
  return s && Number.isFinite(n) ? arred3(n) : NaN;
}

// chave das linhas (só no navegador, ao abrir o diálogo)
let contadorLinhas = 0;
const novaChave = () => ++contadorLinhas;

const fmtEntrada = (q: number) => q.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });

/** Conteúdo da caixa ou pallet: uma linha por código e lote. Enter na quantidade abre a linha seguinte. */
export function EditorConteudo({
  aberto,
  onAbertoChange,
  volume,
  conteudo,
  produtos,
  lotesPorCodigo,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  volume: { id: string; codigo: string; status: StatusVolume; recebimentoNumero?: number | null };
  conteudo: LinhaConteudoTela[];
  produtos: ProdutoOpcao[];
  lotesPorCodigo?: Record<string, string[]>;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-3xl">
        {aberto && <Corpo volume={volume} conteudo={conteudo} produtos={produtos} lotesPorCodigo={lotesPorCodigo ?? {}} fechar={() => onAbertoChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Corpo({
  volume,
  conteudo,
  produtos,
  lotesPorCodigo,
  fechar,
}: {
  volume: { id: string; codigo: string; status: StatusVolume; recebimentoNumero?: number | null };
  conteudo: LinhaConteudoTela[];
  produtos: ProdutoOpcao[];
  lotesPorCodigo: Record<string, string[]>;
  fechar: () => void;
}) {
  const router = useRouter();
  const novaLinha = (): Linha => ({ chave: novaChave(), codigo: "", descricao: "", unidade: "", lote: "", quantidade: "", recebimentoId: null, recebimentoNumero: null });
  const [linhas, setLinhas] = useState<Linha[]>(() => [
    ...conteudo.map((c) => ({ chave: novaChave(), codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, lote: c.lote, quantidade: fmtEntrada(c.quantidade), recebimentoId: c.recebimentoId, recebimentoNumero: c.recebimentoNumero })),
    novaLinha(),
  ]);
  const [motivo, setMotivo] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, iniciar] = useTransition();
  const refs = useRef(new Map<number, HTMLInputElement>());
  const porCodigo = new Map(produtos.map((p) => [p.codigo, p]));
  const ajuste = volume.status === "FECHADO";
  const listaId = `dl-prod-${volume.id}`;
  const varias = new Set(conteudo.map((c) => c.recebimentoId)).size > 1;

  const alterar = (chave: number, campo: keyof Linha, valor: string) =>
    setLinhas((ls) =>
      ls.map((l) => {
        if (l.chave !== chave) return l;
        const n = { ...l, [campo]: valor };
        if (campo === "codigo") {
          const p = porCodigo.get(normalizarCodigoProduto(valor));
          if (p) Object.assign(n, { descricao: p.descricao, unidade: p.unidade });
          else if (porCodigo.get(normalizarCodigoProduto(l.codigo))) Object.assign(n, { descricao: "", unidade: "" });
        }
        return n;
      }),
    );

  function adicionarDepois(chave: number) {
    const n = novaLinha();
    setLinhas((ls) => {
      const i = ls.findIndex((l) => l.chave === chave);
      return [...ls.slice(0, i + 1), n, ...ls.slice(i + 1)];
    });
    setTimeout(() => refs.current.get(n.chave)?.focus(), 30);
  }

  const preenchidas = linhas.filter((l) => l.codigo.trim() || l.quantidade.trim());
  const total = arred3(preenchidas.reduce((a, l) => a + (lerQuantidade(l.quantidade) || 0), 0));
  const unidades = [...new Set(preenchidas.map((l) => l.unidade).filter(Boolean))];

  function salvar() {
    const e: Record<string, string> = {};
    preenchidas.forEach((l) => {
      const i = linhas.indexOf(l);
      if (!l.codigo.trim()) e[`${i}.codigo`] = "Informe o código.";
      const q = lerQuantidade(l.quantidade);
      if (!(q > 0)) e[`${i}.quantidade`] = "Quantidade maior que zero.";
      if (l.codigo.trim() && !porCodigo.has(normalizarCodigoProduto(l.codigo)) && !l.descricao.trim()) e[`${i}.descricao`] = "Código novo: informe a descrição.";
    });
    if (ajuste && !motivo.trim()) e.motivo = "Informe o motivo do ajuste.";
    setErros(e);
    if (Object.keys(e).length) return void toast.error("Revise as linhas destacadas.");
    iniciar(async () => {
      const r = await salvarConteudoVolume({
        volumeId: volume.id,
        motivo: motivo.trim() || null,
        linhas: preenchidas.map((l) => ({
          codigo: l.codigo,
          descricao: l.descricao || null,
          unidade: l.unidade || null,
          lote: l.lote || null,
          quantidade: lerQuantidade(l.quantidade),
          recebimentoId: l.recebimentoId,
        })),
      });
      if (!r.ok) {
        const campos: Record<string, string> = {};
        for (const [k, v] of Object.entries(r.campos ?? {})) {
          const m = k.match(/^linhas\.(\d+)\.(\w+)$/);
          if (m) campos[`${linhas.indexOf(preenchidas[Number(m[1])])}.${m[2]}`] = v;
          else campos[k] = v;
        }
        setErros(campos);
        return void toast.error(r.erro);
      }
      toast.success(r.mensagem ?? "Conteúdo salvo.");
      fechar();
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Conteúdo de {volume.codigo}</DialogTitle>
        <DialogDescription>
          Uma linha por código e lote. Itens iguais (mesmo código e lote) são somados ao salvar. Código que não está no cadastro do depositante pede a descrição e
          vira produto dele.
        </DialogDescription>
      </DialogHeader>

      <datalist id={listaId}>
        {produtos.map((p) => (
          <option key={p.codigo} value={p.codigo}>
            {p.descricao}
          </option>
        ))}
      </datalist>

      <div className="space-y-2">
        <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_2.25rem] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
          <span>Código</span>
          <span>Descrição</span>
          <span>Lote</span>
          <span className="text-right">Quantidade</span>
          <span />
        </div>
        {linhas.map((l, i) => {
          const conhecido = porCodigo.has(normalizarCodigoProduto(l.codigo));
          const lotes = lotesPorCodigo[normalizarCodigoProduto(l.codigo)] ?? [];
          const erro = (c: string) => erros[`${i}.${c}`];
          return (
            <div key={l.chave} className="grid grid-cols-2 gap-2 rounded-lg border p-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_2.25rem] sm:items-start sm:border-0 sm:p-0">
              <div className="min-w-0">
                <Label htmlFor={`cod-${l.chave}`} className="mb-1 text-xs text-muted-foreground sm:sr-only">
                  Código
                </Label>
                <Input
                  id={`cod-${l.chave}`}
                  ref={(el) => {
                    if (el) refs.current.set(l.chave, el);
                    else refs.current.delete(l.chave);
                  }}
                  list={listaId}
                  value={l.codigo}
                  onChange={(e) => alterar(l.chave, "codigo", e.target.value)}
                  placeholder="Código"
                  autoComplete="off"
                  aria-invalid={!!erro("codigo")}
                  className="uppercase placeholder:normal-case"
                />
              </div>
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <Label htmlFor={`desc-${l.chave}`} className="mb-1 text-xs text-muted-foreground sm:sr-only">
                  Descrição
                </Label>
                {conhecido || !l.codigo.trim() ? (
                  <p id={`desc-${l.chave}`} className="flex h-9 items-center truncate rounded-md bg-muted/40 px-3 text-sm text-muted-foreground" title={l.descricao}>
                    {l.descricao || "—"}
                    {l.unidade ? <span className="ml-1 shrink-0 text-xs">({l.unidade.toLowerCase()})</span> : null}
                  </p>
                ) : (
                  <div className="flex gap-1.5">
                    <Input id={`desc-${l.chave}`} value={l.descricao} onChange={(e) => alterar(l.chave, "descricao", e.target.value)} placeholder="Descrição (código novo)" aria-invalid={!!erro("descricao")} />
                    <Input aria-label="Unidade" value={l.unidade} onChange={(e) => alterar(l.chave, "unidade", e.target.value)} placeholder="UN" className="w-16 uppercase placeholder:normal-case" maxLength={6} />
                  </div>
                )}
                {erro("descricao") && <p className="mt-1 text-xs text-destructive">{erro("descricao")}</p>}
              </div>
              <div className="min-w-0">
                <Label htmlFor={`lote-${l.chave}`} className="mb-1 text-xs text-muted-foreground sm:sr-only">
                  Lote
                </Label>
                <Input id={`lote-${l.chave}`} list={lotes.length ? `dl-lote-${l.chave}` : undefined} value={l.lote} onChange={(e) => alterar(l.chave, "lote", e.target.value)} placeholder="Sem lote" autoComplete="off" className="uppercase placeholder:normal-case" />
                {lotes.length > 0 && (
                  <datalist id={`dl-lote-${l.chave}`}>
                    {lotes.map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                )}
              </div>
              <div className="min-w-0">
                <Label htmlFor={`qtd-${l.chave}`} className="mb-1 text-xs text-muted-foreground sm:sr-only">
                  Quantidade
                </Label>
                <Input
                  id={`qtd-${l.chave}`}
                  inputMode="decimal"
                  value={l.quantidade}
                  onChange={(e) => alterar(l.chave, "quantidade", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      adicionarDepois(l.chave);
                    }
                  }}
                  placeholder="0"
                  aria-invalid={!!erro("quantidade")}
                  className="text-right tabular-nums"
                />
                {erro("quantidade") && <p className="mt-1 text-xs text-destructive">{erro("quantidade")}</p>}
              </div>
              <div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:justify-end">
                {varias && l.recebimentoNumero ? <span className="text-xs text-muted-foreground sm:hidden">rec. {l.recebimentoNumero}</span> : <span className="sm:hidden" />}
                <Button type="button" variant="ghost" size="icon" aria-label="Tirar a linha" onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((x) => x.chave !== l.chave) : [novaLinha()]))}>
                  <Trash2 />
                </Button>
              </div>
              {erro("codigo") && <p className="col-span-2 -mt-1 text-xs text-destructive sm:col-span-5">{erro("codigo")}</p>}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={() => adicionarDepois(linhas[linhas.length - 1].chave)}>
            <Plus /> Linha
          </Button>
          <span className="text-sm text-muted-foreground">
            {preenchidas.length} {preenchidas.length === 1 ? "linha" : "linhas"}
            {unidades.length === 1 && total > 0 ? ` · ${fmtQuantidade(total, unidades[0])}` : ""}
          </span>
        </div>
      </div>

      {ajuste && (
        <div className="space-y-1.5">
          <Label htmlFor={`motivo-${volume.id}`}>
            Motivo do ajuste<span className="text-destructive">*</span>
          </Label>
          <Textarea id={`motivo-${volume.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: inventário, avaria, reembalagem, erro de conferência" rows={2} aria-invalid={!!erros.motivo} />
          <p className={cn("text-xs", erros.motivo ? "text-destructive" : "text-muted-foreground")}>{erros.motivo ?? "Volume armazenado: a mudança fica no histórico com o motivo."}</p>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={enviando}>
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={enviando}>
          {enviando && <LoaderCircle className="animate-spin" />} Salvar conteúdo
        </Button>
      </DialogFooter>
    </>
  );
}
