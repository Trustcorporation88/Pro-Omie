import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, CampoBusca, Paginacao, SelectFiltro } from "@/components/filtros";
import { Selo } from "@/components/selos";
import { AcoesEndereco, BotaoGerarEnderecos, BotaoNovoEndereco } from "@/components/armazem/enderecos";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { POR_PAGINA_ENDERECOS, estabelecimentosArmazem, lerFiltrosEnderecos, listarEnderecos } from "@/modules/armazem/consultas";
import { rotuloTipoEndereco } from "@/modules/armazem/tipos";

export const metadata: Metadata = { title: "Endereços do armazém" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("armazem:ver");
  const f = lerFiltrosEnderecos(await searchParams);
  const escopo = await escopoEmpresa();
  const [dados, estabelecimentos] = await Promise.all([listarEnderecos(f), estabelecimentosArmazem(escopo)]);
  const podeEditar = pode(u.papel, "armazem:editar");
  const estabs = estabelecimentos.map((e) => ({ id: e.id, nome: e.nome }));
  const etiquetas = new URLSearchParams(Object.entries({ tipo: "enderecos", estab: f.estab, zona: f.zona }).filter(([, v]) => v));
  const nenhum = Object.values(dados.contagens).every((n) => n === 0) && !f.q && !f.zona;
  return (
    <>
      <Link href="/servicos/armazem" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Itens armazenados
      </Link>
      <PageHeader titulo="Endereços do armazém" descricao="As posições predeterminadas onde ficam as caixas e os pallets (rua, módulo, nível). Cada uma tem etiqueta com QR.">
        {!nenhum && (
          <Button variant="outline" asChild>
            <a href={`/api/armazem/etiquetas?${etiquetas.toString()}&formato=a4`} target="_blank" rel="noopener">
              <Printer /> Etiquetas {f.zona ? `da rua ${f.zona}` : ""}
            </a>
          </Button>
        )}
        {podeEditar && <BotaoNovoEndereco estabelecimentos={estabs} />}
        {podeEditar && <BotaoGerarEnderecos estabelecimentos={estabs} destaque={nenhum} />}
      </PageHeader>
      {nenhum ? (
        <EstadoVazio titulo="Nenhum endereço cadastrado" descricao="Gere de uma vez as posições do armazém: por exemplo, ruas A a C, módulos 1 a 10 e níveis 1 a 4 criam 120 endereços (A-01-01 a C-10-04).">
          {podeEditar && <BotaoGerarEnderecos estabelecimentos={estabs} destaque />}
        </EstadoVazio>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <AbasFiltro
                parametro="situacao"
                padrao="todos"
                opcoes={[
                  { valor: "todos", rotulo: "Ativos", contador: dados.contagens.todos },
                  { valor: "livres", rotulo: "Livres", contador: dados.contagens.livres },
                  { valor: "ocupados", rotulo: "Ocupados", contador: dados.contagens.ocupados },
                  { valor: "reservados", rotulo: "Reservados", contador: dados.contagens.reservados },
                  { valor: "inativos", rotulo: "Inativos", contador: dados.contagens.inativos },
                ]}
              />
              {dados.zonas.length > 1 && <SelectFiltro parametro="zona" rotuloTodos="Todas as ruas" opcoes={dados.zonas.map((z) => ({ valor: z, rotulo: `Rua ${z}` }))} />}
              {estabelecimentos.length > 1 && <SelectFiltro parametro="estab" rotuloTodos="Todos os estabelecimentos" opcoes={estabs.map((e) => ({ valor: e.id, rotulo: e.nome }))} />}
            </div>
            <CampoBusca placeholder="Código, depositante…" className="lg:w-64" />
          </div>
          {dados.linhas.length === 0 ? (
            <EstadoVazio titulo="Nenhum endereço neste filtro" />
          ) : (
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-3">Endereço</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Ocupação</TableHead>
                    <TableHead>Volumes</TableHead>
                    <TableHead>Reservado para</TableHead>
                    <TableHead className="pr-3">
                      <span className="sr-only">Ações</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.linhas.map((e) => (
                    <TableRow key={e.id} className={e.ativo ? undefined : "opacity-60"}>
                      <TableCell className="pl-3">
                        <Link href={`/servicos/armazem/enderecos/${e.id}`} className="font-medium hover:underline">
                          {e.codigo}
                        </Link>
                        {!e.ativo && <Selo className="ml-2">Inativo</Selo>}
                        {estabelecimentos.length > 1 && <span className="block text-xs text-muted-foreground">{e.estabelecimento}</span>}
                      </TableCell>
                      <TableCell className="text-sm">{rotuloTipoEndereco(e.tipo)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {e.volumes.length === 0 ? <Selo tom="sucesso">livre</Selo> : `${e.volumes.length}${e.capacidade !== null ? ` de ${e.capacidade}` : ""}`}
                      </TableCell>
                      <TableCell className="max-w-72 whitespace-normal text-sm">
                        {e.volumes.length ? (
                          <>
                            {e.volumes.slice(0, 4).join(", ")}
                            {e.volumes.length > 4 ? ` +${e.volumes.length - 4}` : ""}
                            <span className="block text-xs text-muted-foreground">{e.depositantes.join(", ")}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-sm">{e.reservado?.nome ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="pr-3 text-right">
                        {podeEditar && (
                          <AcoesEndereco
                            endereco={{ id: e.id, empresaId: e.empresaId, codigo: e.codigo, zona: e.zona, tipo: e.tipo, capacidade: e.capacidade, observacao: e.observacao, reservado: e.reservado }}
                            ativo={e.ativo}
                            ocupado={e.volumes.length > 0}
                            estabelecimentos={estabs}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          <Paginacao pagina={f.pagina} total={dados.total} porPagina={POR_PAGINA_ENDERECOS} />
        </>
      )}
    </>
  );
}
