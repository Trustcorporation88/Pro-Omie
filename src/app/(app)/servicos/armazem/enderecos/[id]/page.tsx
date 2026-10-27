import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Selo } from "@/components/selos";
import { BotaoEditarEndereco } from "@/components/armazem/enderecos";
import { ColocarNoEndereco } from "@/components/armazem/listas";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { estabelecimentosArmazem, obterEndereco } from "@/modules/armazem/consultas";
import { fmtQuantidade, rotuloTipoEndereco, situacaoVolume } from "@/modules/armazem/tipos";

export const metadata: Metadata = { title: "Endereço do armazém" };

type Props = { params: Promise<{ id: string }> };

export default async function Pagina({ params }: Props) {
  const u = await exigirUsuario("armazem:ver");
  const { id } = await params;
  const e = await obterEndereco(id);
  if (!e) notFound();
  const podeEditar = pode(u.papel, "armazem:editar");
  const estabs = podeEditar ? (await estabelecimentosArmazem()).map((x) => ({ id: x.id, nome: x.nome })) : [];
  const cheio = e.capacidade !== null && e.volumes.length >= e.capacidade;
  return (
    <>
      <Link href="/servicos/armazem/enderecos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Endereços do armazém
      </Link>
      <PageHeader
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            Endereço {e.codigo}
            {!e.ativo && <Selo>Inativo</Selo>}
            {e.volumes.length === 0 ? <Selo tom="sucesso">livre</Selo> : cheio ? <Selo tom="alerta">cheio</Selo> : null}
          </span>
        }
        descricao={[rotuloTipoEndereco(e.tipo), e.zona ? `rua ${e.zona}` : null, e.capacidade !== null ? `capacidade ${e.capacidade} ${e.capacidade === 1 ? "volume" : "volumes"}` : "sem limite de volumes", e.estabelecimento].filter(Boolean).join(" · ")}
      >
        <Button variant="outline" asChild>
          <a href={`/api/armazem/etiquetas?tipo=enderecos&ids=${e.id}`} target="_blank" rel="noopener">
            <Printer /> Etiqueta
          </a>
        </Button>
        {podeEditar && <BotaoEditarEndereco endereco={{ id: e.id, empresaId: e.empresaId, codigo: e.codigo, zona: e.zona, tipo: e.tipo, capacidade: e.capacidade, observacao: e.observacao, reservado: e.reservado }} estabelecimentos={estabs} />}
      </PageHeader>
      <div className="space-y-4">
        {(e.reservado || e.observacao) && (
          <p className="text-sm text-muted-foreground">
            {e.reservado ? `Reservado para ${e.reservado.nome}. ` : ""}
            {e.observacao}
          </p>
        )}
        {podeEditar && e.ativo && !cheio && (
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">Colocar volume aqui</CardTitle>
              <CardDescription>Digite ou leia o código da caixa ou do pallet.</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <ColocarNoEndereco enderecoId={e.id} codigo={e.codigo} />
            </CardContent>
          </Card>
        )}
        <h2 className="text-base font-semibold">
          Volumes aqui <span className="font-normal text-muted-foreground">({e.volumes.length})</span>
        </h2>
        {!e.volumes.length ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Posição vazia.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {e.volumes.map((v) => {
              const s = situacaoVolume(v.status, true);
              return (
                <Card key={v.id} className="gap-2 py-4">
                  <CardHeader className="px-4">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      <Link href={`/servicos/armazem/volumes/${v.id}`} className="hover:underline">
                        {v.codigo}
                      </Link>
                      <Selo tom={s.tom}>{s.rotulo}</Selo>
                    </CardTitle>
                    <CardDescription>{v.depositante}</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4">
                    <ul className="divide-y rounded-md border text-sm">
                      {v.conteudo.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                          <span className="min-w-0">
                            <span className="font-medium">{c.codigo}</span>
                            {c.lote ? <span className="text-muted-foreground"> · lote {c.lote}</span> : null}
                            <span className="block truncate text-xs text-muted-foreground">{c.descricao}</span>
                          </span>
                          <span className="shrink-0 tabular-nums">{fmtQuantidade(c.quantidade, c.unidade)}</span>
                        </li>
                      ))}
                      {!v.conteudo.length && <li className="px-3 py-2 text-muted-foreground">vazio</li>}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
