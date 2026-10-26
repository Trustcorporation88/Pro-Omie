import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { BlocoAjuda } from "@/components/ajuda/blocos-ajuda";
import { IconeSecao } from "@/components/ajuda/icones";
import { NAVEGACAO } from "@/components/layout/navegacao";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { MANUAL } from "@/modules/ajuda/conteudo";
import { destinoDaTela, podeVerSecao } from "@/modules/ajuda/tipos";

type Props = { params: Promise<{ secao: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { secao } = await params;
  const s = MANUAL.find((x) => x.id === secao);
  return { title: s ? `${s.titulo} · Manual` : "Manual do usuário" };
}

export default async function Pagina({ params }: Props) {
  const u = await exigirUsuario();
  const { secao } = await params;
  const s = MANUAL.find((x) => x.id === secao);
  if (!s) notFound();
  if (!podeVerSecao(s, u.papel)) redirect("/sem-permissao");
  const visiveis = MANUAL.filter((x) => podeVerSecao(x, u.papel));
  const pos = visiveis.findIndex((x) => x.id === s.id);
  const anterior = visiveis[pos - 1];
  const proxima = visiveis[pos + 1];
  // telas do menu que esta seção explica (as que o perfil abre)
  const telas = NAVEGACAO.flatMap((g) => g.itens).filter((i) => !i.emBreve && i.href !== "/ajuda" && (!i.permissao || pode(u.papel, i.permissao)) && destinoDaTela(MANUAL, i.href)?.secao.id === s.id);
  const sumario = (
    <ul className="space-y-1 text-sm">
      {s.topicos.map((t) => (
        <li key={t.id}>
          <a href={`#${t.id}`} className="block rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            {t.titulo}
          </a>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <Link href="/ajuda" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Manual do usuário
      </Link>
      <PageHeader
        titulo={
          <span className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <IconeSecao nome={s.icone} className="size-5" />
            </span>
            {s.titulo}
          </span>
        }
        descricao={s.resumo}
      />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <article className="min-w-0 max-w-3xl space-y-10">
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">Quem usa:</span> <span className="text-muted-foreground">{s.quem}</span>
            </p>
            {telas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {telas.map((t) => (
                  <Button key={t.href} variant="outline" size="sm" asChild>
                    <Link href={t.href}>
                      {t.titulo} <ExternalLink className="text-muted-foreground" aria-hidden />
                    </Link>
                  </Button>
                ))}
              </div>
            )}
            <details className="rounded-lg border p-3 lg:hidden">
              <summary className="cursor-pointer text-sm font-medium">Nesta página ({s.topicos.length})</summary>
              <div className="mt-2">{sumario}</div>
            </details>
          </div>
          {s.topicos.map((t) => (
            <section key={t.id} id={t.id} className="scroll-mt-20 space-y-4">
              <h2 className="text-lg font-semibold tracking-tight">
                <a href={`#${t.id}`} className="hover:underline">
                  {t.titulo}
                </a>
              </h2>
              {t.blocos.map((b, i) => (
                <BlocoAjuda key={i} b={b} />
              ))}
            </section>
          ))}
          <nav className="grid grid-cols-1 gap-3 border-t pt-6 sm:grid-cols-2" aria-label="Outras partes do manual">
            {anterior ? (
              <Link href={`/ajuda/${anterior.id}`} className="rounded-lg border p-4 hover:bg-muted/50">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowLeft className="size-3.5" aria-hidden /> Anterior
                </span>
                <span className="mt-1 block font-medium">{anterior.titulo}</span>
              </Link>
            ) : (
              <span />
            )}
            {proxima && (
              <Link href={`/ajuda/${proxima.id}`} className="rounded-lg border p-4 text-right hover:bg-muted/50">
                <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                  Próxima <ArrowRight className="size-3.5" aria-hidden />
                </span>
                <span className="mt-1 block font-medium">{proxima.titulo}</span>
              </Link>
            )}
          </nav>
        </article>
        <aside className="hidden lg:block" aria-label="Nesta página">
          <div className="sticky top-20 space-y-2">
            <p className="px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Nesta página</p>
            {sumario}
          </div>
        </aside>
      </div>
    </>
  );
}
