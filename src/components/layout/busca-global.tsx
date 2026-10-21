"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { NAVEGACAO } from "./navegacao";
import { pode, type PapelUsuario } from "@/lib/auth/permissoes";
import { buscaGlobal, type ResultadoBusca } from "@/modules/busca/acoes";

export function BuscaGlobal({ papel }: { papel: PapelUsuario }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [, iniciar] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAberto((a) => !a);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (termo.trim().length < 2) return;
    const t = setTimeout(() => iniciar(async () => setResultados(await buscaGlobal(termo))), 250);
    return () => clearTimeout(t);
  }, [termo]);

  const ir = (href: string) => {
    setAberto(false);
    setTermo("");
    router.push(href);
  };

  const paginas = NAVEGACAO.flatMap((g) => g.itens).filter((i) => !i.emBreve && (!i.permissao || pode(papel, i.permissao)));
  const grupos = termo.trim().length >= 2 ? Object.groupBy(resultados, (r) => r.tipo) : {};

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground shadow-xs transition hover:bg-accent"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Buscar clientes, títulos, produtos…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </button>
      <CommandDialog open={aberto} onOpenChange={setAberto} title="Busca" description="Buscar no Pro Omie">
        <CommandInput placeholder="Digite um nome, CNPJ, nº do título ou página…" value={termo} onValueChange={setTermo} />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          {Object.entries(grupos).map(([tipo, itens]) => (
            <CommandGroup key={tipo} heading={tipo}>
              {(itens ?? []).map((r) => (
                <CommandItem key={r.href + r.titulo} value={`${r.titulo} ${r.detalhe} ${termo}`} onSelect={() => ir(r.href)}>
                  <div className="flex flex-col">
                    <span>{r.titulo}</span>
                    <span className="text-xs text-muted-foreground">{r.detalhe}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          {Object.keys(grupos).length > 0 && <CommandSeparator />}
          <CommandGroup heading="Ir para">
            {paginas.map((p) => (
              <CommandItem key={p.href} value={p.titulo} onSelect={() => ir(p.href)}>
                {p.titulo}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
