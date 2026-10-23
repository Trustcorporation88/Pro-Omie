"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, LoaderCircle, Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fmtNumero, parseMoeda } from "@/lib/format";
import { atualizarPrecos, cadastrarMateriaisPadrao } from "@/modules/estoque/acoes";
import { GRUPOS_MATERIAL, MATERIAIS_PADRAO, ORDEM_GRUPOS, rotuloGrupo, type MaterialEstoque } from "@/modules/estoque/tipos";
import { cn } from "@/lib/utils";

const fmtNcm = (n: string | null) => (n ? `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6)}` : "sem NCM sugerido");

/** Lista dos materiais recicláveis mais comuns para marcar e cadastrar de uma vez. */
export function BotaoMateriaisPadrao({
  codigosExistentes,
  destaque = false,
  discreto = false,
  rotulo = "Escolher materiais",
}: {
  codigosExistentes: string[];
  destaque?: boolean;
  /** botão fantasma pequeno (rodapé de página) */
  discreto?: boolean;
  rotulo?: string;
}) {
  const router = useRouter();
  const existentes = new Set(codigosExistentes);
  const [aberto, setAberto] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [enviando, iniciar] = useTransition();
  const novos = [...marcados].filter((c) => !existentes.has(c));

  function abrir() {
    setMarcados(new Set(MATERIAIS_PADRAO.filter((m) => m.marcado && !existentes.has(m.codigo)).map((m) => m.codigo)));
    setAberto(true);
  }

  function alternar(codigo: string, marcar: boolean) {
    setMarcados((s) => {
      const n = new Set(s);
      if (marcar) n.add(codigo);
      else n.delete(codigo);
      return n;
    });
  }

  function confirmar() {
    iniciar(async () => {
      const r = await cadastrarMateriaisPadrao(novos);
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem ?? "Materiais cadastrados.");
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant={destaque ? "default" : discreto ? "ghost" : "outline"} size={discreto ? "sm" : "default"} onClick={abrir}>
        <ListChecks /> {rotulo}
      </Button>
      <Dialog open={aberto} onOpenChange={(v) => !enviando && setAberto(v)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Materiais recicláveis</DialogTitle>
            <DialogDescription>
              Marque o que a empresa vende. Cada material vira um produto vendido por kg, com estoque e NCM sugerido para resíduos e sucatas (confirme o NCM com o
              contador antes de emitir notas). Outros materiais podem ser cadastrados em Produtos e serviços.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {ORDEM_GRUPOS.filter((g) => MATERIAIS_PADRAO.some((m) => m.grupo === g)).map((g) => (
              <fieldset key={g} className="space-y-1.5">
                <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{GRUPOS_MATERIAL[g]}</legend>
                {MATERIAIS_PADRAO.filter((m) => m.grupo === g).map((m) => {
                  const ja = existentes.has(m.codigo);
                  const idCampo = `mp-${m.codigo}`;
                  return (
                    <label
                      key={m.codigo}
                      htmlFor={idCampo}
                      className={cn("flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50", ja && "cursor-default opacity-60")}
                    >
                      <Checkbox id={idCampo} className="mt-0.5" checked={ja || marcados.has(m.codigo)} disabled={ja} onCheckedChange={(v) => alternar(m.codigo, v === true)} />
                      <span className="min-w-0">
                        <span className="block font-medium">{m.descricao}</span>
                        <span className="block text-xs text-muted-foreground">{ja ? "já cadastrado" : `NCM ${fmtNcm(m.ncm)}`}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={enviando || !novos.length}>
              {enviando && <LoaderCircle className="animate-spin" />}
              {novos.length ? `Cadastrar ${novos.length === 1 ? "1 material" : `${novos.length} materiais`}` : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Atualização rápida do preço de venda (por kg) de todos os materiais: os preços de sucata mudam toda semana. */
export function BotaoAtualizarPrecos({ materiais }: { materiais: Pick<MaterialEstoque, "id" | "codigo" | "descricao" | "unidade" | "grupo" | "precoVenda">[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [precos, setPrecos] = useState<Record<string, string>>({});
  const [enviando, iniciar] = useTransition();

  function abrir() {
    setPrecos(Object.fromEntries(materiais.map((m) => [m.id, m.precoVenda ? fmtNumero(m.precoVenda) : ""])));
    setAberto(true);
  }

  function salvar() {
    iniciar(async () => {
      const r = await atualizarPrecos(materiais.map((m) => ({ produtoId: m.id, preco: precos[m.id] ?? "" })));
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem ?? "Preços salvos.");
      setAberto(false);
      router.refresh();
    });
  }

  const grupos = [...new Set(materiais.map((m) => m.grupo ?? ""))];

  return (
    <>
      <Button variant="outline" onClick={abrir} disabled={!materiais.length}>
        <Tags /> Atualizar preços
      </Button>
      <Dialog open={aberto} onOpenChange={(v) => !enviando && setAberto(v)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Preços de venda</DialogTitle>
            <DialogDescription>Preço atual de cada material. Ele entra sozinho nas propostas e pedidos e no valor estimado do estoque.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {grupos.map((g) => (
              <div key={g || "sem"} className="space-y-1.5">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{rotuloGrupo(g || null)}</p>
                {materiais
                  .filter((m) => (m.grupo ?? "") === g)
                  .map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3">
                      <label htmlFor={`preco-${m.id}`} className="min-w-0 truncate text-sm">
                        {m.descricao}
                      </label>
                      <div className="relative w-36 shrink-0">
                        <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                        <Input
                          id={`preco-${m.id}`}
                          inputMode="decimal"
                          className="pr-12 pl-8 text-right tabular-nums"
                          placeholder="0,00"
                          value={precos[m.id] ?? ""}
                          onChange={(e) => setPrecos((p) => ({ ...p, [m.id]: e.target.value }))}
                          onBlur={(e) => e.target.value && setPrecos((p) => ({ ...p, [m.id]: fmtNumero(parseMoeda(e.target.value)) }))}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">/{m.unidade.toLowerCase()}</span>
                      </div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={enviando}>
              {enviando && <LoaderCircle className="animate-spin" />} Salvar preços
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
