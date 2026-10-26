"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Botão Manual do topo: abre a parte do manual sobre a tela atual. */
export function BotaoManual() {
  const caminho = usePathname();
  const href = caminho.startsWith("/ajuda") ? "/ajuda" : `/ajuda?de=${encodeURIComponent(caminho)}`;
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link href={href} aria-label="Manual: ajuda desta tela" title="Manual: ajuda desta tela">
        <BookOpen />
        <span className="hidden sm:inline">Manual</span>
      </Link>
    </Button>
  );
}
