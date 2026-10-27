import Image from "next/image";
import { Lightbulb, TriangleAlert } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IMAGENS_MANUAL } from "@/modules/ajuda/imagens";
import type { Bloco } from "@/modules/ajuda/tipos";
import { TextoAjuda } from "./texto-ajuda";

/** Um bloco do manual (parágrafo, passos, lista, dica, atenção, tabela ou imagem da tela). */
export function BlocoAjuda({ b }: { b: Bloco }) {
  switch (b.tipo) {
    case "texto":
      return (
        <p className="leading-relaxed text-muted-foreground">
          <TextoAjuda texto={b.texto} />
        </p>
      );
    case "passos":
      return (
        <div>
          {b.titulo && <p className="mb-2 text-sm font-semibold">{b.titulo}</p>}
          <ol className="space-y-2.5">
            {b.itens.map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                <span className="leading-relaxed text-muted-foreground">
                  <TextoAjuda texto={item} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      );
    case "lista":
      return (
        <div>
          {b.titulo && <p className="mb-2 text-sm font-semibold">{b.titulo}</p>}
          <ul className="space-y-2">
            {b.itens.map((item, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
                <span className="leading-relaxed text-muted-foreground">
                  <TextoAjuda texto={item} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "dica":
      return (
        <p className="flex gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm leading-relaxed">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="sr-only">Dica: </span>
            <TextoAjuda texto={b.texto} />
          </span>
        </p>
      );
    case "atencao":
      return (
        <p className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm leading-relaxed">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[oklch(0.55_0.13_65)] dark:text-warning" aria-hidden />
          <span>
            <span className="sr-only">Atenção: </span>
            <TextoAjuda texto={b.texto} />
          </span>
        </p>
      );
    case "imagem": {
      const d = IMAGENS_MANUAL[b.imagem];
      const src = `/manual/${b.imagem}.png`;
      return (
        <figure className="space-y-3">
          {/* a imagem fica atrás do login, como o manual: vai direto ao navegador (unoptimized), com a sessão */}
          <a
            href={src}
            target="_blank"
            rel="noopener"
            title="Abrir a imagem em tamanho real"
            className="block w-fit max-w-full overflow-hidden rounded-lg border bg-muted/30 shadow-sm transition-shadow hover:shadow-md"
          >
            <Image src={src} alt={b.alt} width={d.largura} height={d.altura} unoptimized className="h-auto max-w-full" style={{ width: d.largura / 2 }} />
          </a>
          <figcaption className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              <TextoAjuda texto={b.legenda} />
            </p>
            {b.marcas?.length ? (
              <ol className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {b.marcas.map((m, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#ea580c] text-[11px] font-semibold text-white" aria-hidden>
                      {i + 1}
                    </span>
                    <span className="leading-relaxed text-muted-foreground">
                      <TextoAjuda texto={m} />
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </figcaption>
        </figure>
      );
    }
    case "tabela":
      return (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {b.colunas.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.linhas.map((l, i) => (
                <TableRow key={i} className="align-top">
                  {l.map((c, j) => (
                    <TableCell key={j} className={j === 0 ? "font-medium whitespace-normal" : "min-w-48 whitespace-normal text-muted-foreground"}>
                      <TextoAjuda texto={c} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
  }
}
