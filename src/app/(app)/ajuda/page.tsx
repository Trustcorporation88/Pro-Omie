import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { BuscaAjuda, type ItemIndiceAjuda } from "@/components/ajuda/busca-ajuda";
import { IconeSecao } from "@/components/ajuda/icones";
import { exigirUsuario } from "@/lib/auth/sessao";
import { MANUAL } from "@/modules/ajuda/conteudo";
import { destinoDaTela, podeVerSecao, textoDoBloco } from "@/modules/ajuda/tipos";

export const metadata: Metadata = { title: "Manual do usuário" };

type Props = { searchParams: Promise<{ de?: string }> };

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario();
  const secoes = MANUAL.filter((s) => podeVerSecao(s, u.papel));
  // botão Manual do topo: /ajuda?de=/tela → a seção (e o tópico) da tela
  const { de } = await searchParams;
  if (de && de.startsWith("/") && !de.startsWith("/ajuda")) {
    const d = destinoDaTela(secoes, de.split(/[?#]/)[0]!);
    if (d) redirect(`/ajuda/${d.secao.id}${d.topico ? `#${d.topico}` : ""}`);
  }
  const indice: ItemIndiceAjuda[] = secoes.flatMap((s) => s.topicos.map((t) => ({ href: `/ajuda/${s.id}#${t.id}`, secao: s.titulo, titulo: t.titulo, texto: t.blocos.map(textoDoBloco).join(" ") })));
  return (
    <>
      <PageHeader titulo="Manual do usuário" descricao="Como usar cada parte do Pro Omie, passo a passo. Em qualquer tela, o botão Manual, no topo, abre a parte certa deste manual.">
        <Button variant="outline" asChild>
          <a href="/api/ajuda/pdf" download>
            <Download /> Baixar PDF
          </a>
        </Button>
      </PageHeader>
      <div className="mb-6 max-w-3xl">
        <BuscaAjuda indice={indice} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {secoes.map((s, n) => (
          <Card key={s.id} className="gap-3 p-5">
            <Link href={`/ajuda/${s.id}`} className="group flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <IconeSecao nome={s.icone} className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-semibold group-hover:underline">
                  {n === 0 && <span className="sr-only">Comece por aqui: </span>}
                  {s.titulo}
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </span>
                <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{s.resumo}</span>
              </span>
            </Link>
            <ul className="space-y-1 border-t pt-3 text-sm">
              {s.topicos.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <Link href={`/ajuda/${s.id}#${t.id}`} className="text-muted-foreground hover:text-foreground hover:underline">
                    {t.titulo}
                  </Link>
                </li>
              ))}
              {s.topicos.length > 5 && (
                <li>
                  <Link href={`/ajuda/${s.id}`} className="font-medium text-primary hover:underline">
                    e mais {s.topicos.length - 5}…
                  </Link>
                </li>
              )}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
