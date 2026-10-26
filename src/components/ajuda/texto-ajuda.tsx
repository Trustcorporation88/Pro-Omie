import Link from "next/link";
import { partesTexto } from "@/modules/ajuda/tipos";

/** Texto do manual: **negrito**, caminho do menu (com link para a tela) e links para outras partes do manual. */
export function TextoAjuda({ texto }: { texto: string }) {
  return (
    <>
      {partesTexto(texto).map((p, i) =>
        p.tipo === "negrito" ? (
          <strong key={i} className="font-semibold text-foreground">
            {p.valor}
          </strong>
        ) : p.tipo === "link" ? (
          p.menu ? (
            <Link key={i} href={p.href} className="inline-flex items-center rounded-md border bg-muted/60 px-1.5 py-px text-[0.9em] font-medium whitespace-nowrap text-foreground hover:bg-muted">
              {p.valor}
            </Link>
          ) : (
            <Link key={i} href={p.href} className="font-medium text-primary underline-offset-2 hover:underline">
              {p.valor}
            </Link>
          )
        ) : (
          <span key={i}>{p.valor}</span>
        ),
      )}
    </>
  );
}
