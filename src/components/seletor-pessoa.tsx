"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ChevronsUpDown, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buscarPessoas, type PessoaResumo } from "@/modules/busca/acoes";
import { cn } from "@/lib/utils";

/**
 * Seletor de cliente/fornecedor com busca no servidor.
 * `valor` é o id da pessoa; `rotuloInicial` exibe o nome quando já há valor (ex.: edição).
 */
export function SeletorPessoa({
  valor,
  rotuloInicial,
  onChange,
  papel,
  placeholder = "Selecione cliente ou fornecedor…",
  className,
  invalido,
  id,
}: {
  valor: string | null;
  rotuloInicial?: string | null;
  onChange: (id: string | null, pessoa?: PessoaResumo) => void;
  papel?: "cliente" | "fornecedor";
  placeholder?: string;
  className?: string;
  invalido?: boolean;
  id?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<PessoaResumo[]>([]);
  const [rotulo, setRotulo] = useState<string | null>(rotuloInicial ?? null);
  const [carregando, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => iniciar(async () => setItens(await buscarPessoas(termo, papel))), 200);
    return () => clearTimeout(t);
  }, [termo, aberto, papel]);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          aria-invalid={invalido}
          className={cn("w-full justify-between font-normal", !valor && "text-muted-foreground", className)}
        >
          <span className="truncate">{valor ? (rotulo ?? "Selecionado") : placeholder}</span>
          <span className="flex items-center gap-1">
            {valor && (
              <X
                className="size-4 opacity-60 hover:opacity-100"
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
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Nome, fantasia ou CNPJ/CPF…" value={termo} onValueChange={setTermo} />
          <CommandList>
            {carregando && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <LoaderCircle className="size-3 animate-spin" /> Buscando…
              </div>
            )}
            <CommandEmpty>Nenhum cadastro encontrado.</CommandEmpty>
            <CommandGroup>
              {itens.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    setRotulo(p.nome);
                    onChange(p.id, p);
                    setAberto(false);
                  }}
                >
                  <Check className={cn("size-4", valor === p.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span>{p.nome}</span>
                    {p.detalhe && <span className="text-xs text-muted-foreground">{p.detalhe}</span>}
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
