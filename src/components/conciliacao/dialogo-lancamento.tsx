"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Plus, Wand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeletorPessoa } from "@/components/seletor-pessoa";
import { fmtData } from "@/lib/format";
import { criarLancamentoConciliado } from "@/modules/conciliacao/acoes";
import { sugerirTermo } from "@/modules/conciliacao/utils";
import type { LinhaPendente, OpcoesConciliacao } from "@/modules/conciliacao/tipos";
import { ValorExtrato } from "./valor";

const CLASSE_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs aria-invalid:border-destructive disabled:opacity-50";

/** "Criar lançamento": título já baixado na data do extrato, com categoria/pessoa/centro (pré-preenchidos pela regra). */
export function DialogoLancamento({
  item,
  opcoes,
  aberto,
  onAbertoChange,
}: {
  item: LinhaPendente;
  opcoes: OpcoesConciliacao;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const credito = item.valor > 0;
  const regra = item.sugestoes.regra;
  const categorias = credito ? opcoes.categoriasReceita : opcoes.categoriasDespesa;
  const categoriaInicial = regra && categorias.some((c) => c.valor === regra.categoriaId) ? regra.categoriaId : "";

  const [descricao, setDescricao] = useState(item.descricao);
  const [categoriaId, setCategoriaId] = useState(categoriaInicial);
  const [pessoaId, setPessoaId] = useState<string | null>(regra?.pessoaId ?? null);
  const [centroCustoId, setCentroCustoId] = useState(regra?.centroCustoId ?? "");
  const [criarRegra, setCriarRegra] = useState(false);
  const [termo, setTermo] = useState(() => sugerirTermo(item.descricao));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, iniciar] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const novos: Record<string, string> = {};
    if (descricao.trim().length < 2) novos.descricao = "Informe a descrição.";
    if (!categoriaId) novos.categoriaId = "Escolha a categoria.";
    if (criarRegra && termo.trim().length < 3) novos["regra.termo"] = "Use ao menos 3 caracteres.";
    setErros(novos);
    if (Object.keys(novos).length) return;
    iniciar(async () => {
      const r = await criarLancamentoConciliado({
        itemId: item.id,
        descricao: descricao.trim(),
        categoriaId,
        pessoaId,
        centroCustoId: centroCustoId || null,
        regra: criarRegra ? { termo: termo.trim() } : null,
      });
      if (r.ok) {
        toast.success(r.mensagem ?? "Lançamento criado e conciliado.");
        onAbertoChange(false);
        router.refresh();
      } else {
        setErros(r.campos ?? {});
        toast.error(r.erro);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !salvando && onAbertoChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={salvar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Criar lançamento</DialogTitle>
            <DialogDescription>
              Cria {credito ? "um recebimento" : "um pagamento"} já baixado em {fmtData(item.data)} nesta conta e o concilia com o extrato.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-muted-foreground" title={item.descricao}>
              {fmtData(item.data)} · {item.descricao}
            </span>
            <ValorExtrato valor={item.valor} />
          </div>

          {regra && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wand className="size-3.5" /> Preenchido pela regra “{regra.termo}”.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="lanc-descricao">
              Descrição<span className="text-destructive">*</span>
            </Label>
            <Input id="lanc-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} aria-invalid={!!erros.descricao} maxLength={300} />
            {erros.descricao && <p className="text-xs text-destructive">{erros.descricao}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lanc-categoria">
              Categoria de {credito ? "receita" : "despesa"}
              <span className="text-destructive">*</span>
            </Label>
            <select
              id="lanc-categoria"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              aria-invalid={!!erros.categoriaId}
              className={CLASSE_SELECT}
            >
              <option value="">Selecione…</option>
              {categorias.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
            {erros.categoriaId ? (
              <p className="text-xs text-destructive">{erros.categoriaId}</p>
            ) : (
              !categorias.length && (
                <p className="text-xs text-muted-foreground">Nenhuma categoria ativa deste tipo. Cadastre em Cadastros › Categorias financeiras.</p>
              )
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{credito ? "Cliente" : "Fornecedor"} (opcional)</Label>
              <SeletorPessoa
                valor={pessoaId}
                rotuloInicial={regra?.pessoa ?? null}
                onChange={(id) => setPessoaId(id)}
                papel={credito ? "cliente" : "fornecedor"}
                placeholder="Selecione…"
                invalido={!!erros.pessoaId}
              />
              {erros.pessoaId && <p className="text-xs text-destructive">{erros.pessoaId}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lanc-centro">Centro de custo (opcional)</Label>
              <select
                id="lanc-centro"
                value={centroCustoId}
                onChange={(e) => setCentroCustoId(e.target.value)}
                aria-invalid={!!erros.centroCustoId}
                className={CLASSE_SELECT}
              >
                <option value="">—</option>
                {opcoes.centros.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
              {erros.centroCustoId && <p className="text-xs text-destructive">{erros.centroCustoId}</p>}
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Checkbox id="lanc-regra" checked={criarRegra} onCheckedChange={(v) => setCriarRegra(v === true)} />
              <Label htmlFor="lanc-regra" className="font-normal">
                Criar regra para descrições parecidas
              </Label>
            </div>
            {criarRegra && (
              <div className="space-y-1.5 pl-6">
                <Input
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  aria-label="Termo da regra"
                  aria-invalid={!!erros["regra.termo"]}
                  maxLength={100}
                />
                {erros["regra.termo"] ? (
                  <p className="text-xs text-destructive">{erros["regra.termo"]}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Quando a descrição do extrato contiver este termo (sem diferenciar maiúsculas e acentos), a categoria,{" "}
                    {credito ? "o cliente" : "o fornecedor"} e o centro de custo serão sugeridos.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? <LoaderCircle className="animate-spin" /> : <Plus />} Criar e conciliar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
