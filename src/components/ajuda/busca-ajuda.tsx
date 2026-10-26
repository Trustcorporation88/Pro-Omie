"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export type ItemIndiceAjuda = { href: string; secao: string; titulo: string; texto: string };

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** Busca no manual (títulos e textos dos tópicos), sem sair da página. */
export function BuscaAjuda({ indice }: { indice: ItemIndiceAjuda[] }) {
  const [q, setQ] = useState("");
  const termos = normalizar(q).split(/\s+/).filter((t) => t.length >= 2);
  const base = useMemo(() => indice.map((i) => ({ ...i, alvo: normalizar(`${i.titulo} ${i.secao} ${i.texto}`), tituloN: normalizar(i.titulo) })), [indice]);
  const achados = termos.length
    ? base
        .filter((i) => termos.every((t) => i.alvo.includes(t)))
        .sort((a, b) => Number(termos.every((t) => b.tituloN.includes(t))) - Number(termos.every((t) => a.tituloN.includes(t))))
        .slice(0, 12)
    : [];
  const trecho = (texto: string) => {
    const n = normalizar(texto);
    const pos = Math.max(0, Math.min(...termos.map((t) => n.indexOf(t)).filter((p) => p >= 0)));
    const ini = Math.max(0, pos - 60);
    return `${ini > 0 ? "…" : ""}${texto.slice(ini, ini + 170)}${ini + 170 < texto.length ? "…" : ""}`;
  };
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no manual: faturar, boleto, certificado, inventário…" aria-label="Buscar no manual" className="h-11 pl-9 text-base sm:text-sm" />
      </div>
      {termos.length > 0 && (
        <div className="rounded-lg border bg-card" role="region" aria-label="Resultados da busca">
          {achados.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nada encontrado. Tente outra palavra.</p>
          ) : (
            <ul className="divide-y">
              {achados.map((a) => (
                <li key={a.href}>
                  <Link href={a.href} className="block px-4 py-3 hover:bg-muted/50">
                    <span className="block text-sm font-medium">
                      {a.titulo} <span className="font-normal text-muted-foreground">· {a.secao}</span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{trecho(a.texto)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
