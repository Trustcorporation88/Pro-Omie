"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ChevronsUpDown, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buscarProdutos, type ProdutoResumo } from "@/modules/busca/acoes";
import { fmtMoeda } from "@/lib/format";
import { fmtQtd } from "@/modules/estoque/tipos";
import { cn } from "@/lib/utils";

/** Seletor de produto ou serviço da empresa ativa (busca por código ou descrição). Vazio = item avulso. */
export function SeletorProduto({
  valor,
  rotuloInicial,
  onChange,
  className,
  id,
}: {
  valor: string | null;
  rotuloInicial?: string | null;
  onChange: (produto: ProdutoResumo | null) => void;
  className?: string;
  id?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<ProdutoResumo[]>([]);
  const [rotulo, setRotulo] = useState<string | null>(rotuloInicial ?? null);
  const [carregando, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => iniciar(async () => setItens(await buscarProdutos(termo))), 200);
    return () => clearTimeout(t);
  }, [termo, aberto]);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          className={cn("w-full justify-between font-normal", !valor && "text-muted-foreground", className)}
        >
          <span className="truncate">{valor ? (rotulo ?? "Selecionado") : "Item do cadastro (opcional)"}</span>
          <span className="flex items-center gap-1">
            {valor && (
              <X
                className="size-4 opacity-60 hover:opacity-100"
                aria-label="Desvincular do cadastro"
                onClick={(e) => {
                  e.stopPropagation();
                  setRotulo(null);
                  onChange(null);
                }}
              />
            )}
            <ChevronsUpDown className="size-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-96 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Código ou descrição…" value={termo} onValueChange={setTermo} />
          <CommandList>
            {carregando && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <LoaderCircle className="size-3 animate-spin" /> Buscando…
              </div>
            )}
            <CommandEmpty>Nenhum produto ou serviço encontrado.</CommandEmpty>
            <CommandGroup>
              {itens.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    setRotulo(`${p.codigo} · ${p.descricao}`);
                    onChange(p);
                    setAberto(false);
                  }}
                >
                  <Check className={cn("size-4", valor === p.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{p.descricao}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.codigo} · {p.tipo === "SERVICO" ? "Serviço" : "Produto"} · {fmtMoeda(p.precoVenda)}/{p.unidade}
                      {p.saldo !== null && (
                        <span className={cn("ml-1", p.saldo > 0 ? "text-success" : "text-destructive")}>· estoque {fmtQtd(p.saldo, p.unidade)}</span>
                      )}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
