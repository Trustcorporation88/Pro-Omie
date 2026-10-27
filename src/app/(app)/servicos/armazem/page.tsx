import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, ClipboardCheck, Download, MapPin, MapPinOff, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, CampoBusca, Paginacao, SelectFiltro } from "@/components/filtros";
import { CartaoKpi } from "@/components/relatorios/cartao-kpi";
import { NovoRecebimento } from "@/components/armazem/recebimento";
import { Localizar } from "@/components/armazem/listas";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { fmtDocumento, fmtMoeda } from "@/lib/format";
import { POR_PAGINA_ARMAZEM, carregarItensArmazenados, depositantesArmazem, estabelecimentosArmazem, lerFiltrosItens, resumoArmazem } from "@/modules/armazem/consultas";
import { fmtQuantidade, numeroRecebimento } from "@/modules/armazem/tipos";

export const metadata: Metadata = { title: "Itens armazenados" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("armazem:ver");
  const f = lerFiltrosItens(await searchParams);
  const escopo = await escopoEmpresa();
  const [dados, resumo, depositantes, estabelecimentos] = await Promise.all([carregarItensArmazenados(f), resumoArmazem({ estab: f.estab }), depositantesArmazem(escopo), estabelecimentosArmazem(escopo)]);
  const podeEditar = pode(u.papel, "armazem:editar");
  const csv = new URLSearchParams(Object.entries({ q: f.q, depositante: f.depositante, estab: f.estab }).filter(([, v]) => v));
  const vazio = resumo.caixas + resumo.pallets === 0 && resumo.emConferencia === 0;

  return (
    <>
      <PageHeader titulo="Itens armazenados" descricao="Armazém geral: mercadorias dos depositantes, por código e lote, com a caixa ou o pallet e o endereço de cada uma.">
        <Button variant="outline" asChild>
          <Link href="/servicos/armazem/recebimentos">
            <ClipboardCheck /> Recebimentos
          </Link>
        </Button>
        {podeEditar && <NovoRecebimento estabelecimentos={estabelecimentos} />}
      </PageHeader>

      <Localizar className="mb-5" />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoKpi titulo="Caixas e pallets" valor={String(resumo.caixas + resumo.pallets)} icone={Boxes} tom="info" href="/servicos/armazem/volumes">
          {resumo.caixas} {resumo.caixas === 1 ? "caixa" : "caixas"} · {resumo.pallets} {resumo.pallets === 1 ? "pallet" : "pallets"}
        </CartaoKpi>
        <CartaoKpi titulo="Sem endereço" valor={String(resumo.semEndereco)} icone={MapPinOff} tom={resumo.semEndereco ? "alerta" : "sucesso"} href="/servicos/armazem/volumes?situacao=sem-endereco">
          conferidos, aguardando posição
        </CartaoKpi>
        <CartaoKpi titulo="Em conferência" valor={String(resumo.emConferencia)} icone={ClipboardCheck} tom={resumo.emConferencia ? "roxo" : "neutro"} href="/servicos/armazem/recebimentos?status=CONFERENCIA">
          {resumo.emConferencia === 1 ? "recebimento aberto" : "recebimentos abertos"}
        </CartaoKpi>
        <CartaoKpi titulo="Endereços ocupados" valor={`${resumo.enderecosOcupados} de ${resumo.enderecos}`} icone={MapPin} tom="neutro" href="/servicos/armazem/enderecos">
          {resumo.enderecos ? `${Math.round((resumo.enderecosOcupados / resumo.enderecos) * 100)}% das posições` : "cadastre as posições"}
        </CartaoKpi>
      </div>

      {vazio ? (
        <EstadoVazio
          titulo="Nada armazenado ainda"
          descricao="1. Cadastre as posições em Endereços do armazém (dá para gerar todas de uma vez). 2. Crie um recebimento com o XML da NF-e ou do CT-e. 3. Na conferência, monte as caixas e os pallets com código, lote e quantidade. 4. Endereçe cada volume."
        >
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/servicos/armazem/enderecos">
                <MapPin /> Endereços do armazém
              </Link>
            </Button>
            {podeEditar && <NovoRecebimento estabelecimentos={estabelecimentos} />}
          </div>
        </EstadoVazio>
      ) : (
        <>
          {resumo.depositantes.length > 0 && (
            <Card className="mb-5 gap-0 overflow-hidden py-0">
              <CardHeader className="py-4">
                <CardTitle className="text-base">Por depositante</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Depositante</TableHead>
                    <TableHead className="text-right">Caixas</TableHead>
                    <TableHead className="text-right">Pallets</TableHead>
                    <TableHead className="text-right">Linhas</TableHead>
                    <TableHead className="pr-4 text-right">Valor declarado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resumo.depositantes.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="max-w-72 pl-4 whitespace-normal">
                        <Link href={`/servicos/armazem?depositante=${d.id}`} className="text-sm font-medium hover:underline">
                          {d.nome}
                        </Link>
                        {d.documento && <span className="block text-xs text-muted-foreground">{fmtDocumento(d.documento)}</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{d.caixas}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.pallets}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.linhas}</TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">{d.valor ? fmtMoeda(d.valor) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <AbasFiltro
                parametro="agrupar"
                padrao="volume"
                opcoes={[
                  { valor: "volume", rotulo: "Por volume" },
                  { valor: "item", rotulo: "Por código e lote" },
                ]}
              />
              {depositantes.length > 1 && <SelectFiltro parametro="depositante" rotuloTodos="Todos os depositantes" opcoes={depositantes.map((d) => ({ valor: d.id, rotulo: d.nome }))} />}
              {estabelecimentos.length > 1 && <SelectFiltro parametro="estab" rotuloTodos="Todos os estabelecimentos" opcoes={estabelecimentos.map((e) => ({ valor: e.id, rotulo: e.nome }))} />}
            </div>
            <div className="flex gap-2">
              <CampoBusca placeholder="Código, descrição, lote, caixa ou endereço…" className="lg:w-80" />
              <Button variant="outline" asChild>
                <a href={`/api/armazem/itens?${csv.toString()}`}>
                  <Download /> CSV
                </a>
              </Button>
            </div>
          </div>

          {dados.total === 0 ? (
            <EstadoVazio titulo="Nenhum item neste filtro" descricao="Mude a busca ou o depositante. Itens de volumes que já saíram do armazém não aparecem aqui." />
          ) : dados.agrupado ? (
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-3">Código</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="pr-3">Onde está</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.grupos.map((g) => (
                    <TableRow key={`${g.produtoId}-${g.lote}`}>
                      <TableCell className="max-w-80 pl-3 whitespace-normal">
                        <span className="block text-sm font-medium">{g.codigo}</span>
                        <span className="block text-xs text-muted-foreground">
                          {g.descricao} · {g.depositante}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{g.lote || <span className="text-muted-foreground">sem lote</span>}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtQuantidade(g.quantidade, g.unidade)}</TableCell>
                      <TableCell className="max-w-96 pr-3 whitespace-normal">
                        <span className="flex flex-wrap gap-1.5">
                          {g.volumes.map((v) => (
                            <Link key={v.id} href={`/servicos/armazem/volumes/${v.id}`} className="rounded-md border px-1.5 py-0.5 text-xs hover:bg-muted">
                              {v.codigo}
                              <span className="text-muted-foreground"> · {v.endereco ?? "sem endereço"}</span>
                            </Link>
                          ))}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-3">Código</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Volume</TableHead>
                    <TableHead>Endereço</TableHead>
                    <TableHead className="pr-3">Recebimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.linhas.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="max-w-80 pl-3 whitespace-normal">
                        <span className="block text-sm font-medium">{l.codigo}</span>
                        <span className="block text-xs text-muted-foreground">
                          {l.descricao} · {l.depositante}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{l.lote || <span className="text-muted-foreground">sem lote</span>}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtQuantidade(l.quantidade, l.unidade)}</TableCell>
                      <TableCell className="text-sm">
                        <Link href={`/servicos/armazem/volumes/${l.volume.id}`} className="font-medium hover:underline">
                          {l.volume.codigo}
                        </Link>
                        {l.volume.status === "ABERTO" && <span className="block text-xs text-muted-foreground">em conferência</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {l.endereco ? (
                          <Link href={`/servicos/armazem/enderecos/${l.endereco.id}`} className="hover:underline">
                            {l.endereco.codigo}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-3 text-sm">
                        <Link href={`/servicos/armazem/recebimentos/${l.recebimento.id}`} className="hover:underline">
                          {numeroRecebimento(l.recebimento.numero)}
                        </Link>
                        {l.recebimento.notas && <span className="block text-xs text-muted-foreground">NF-e {l.recebimento.notas}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          <Paginacao pagina={f.pagina} total={dados.total} porPagina={POR_PAGINA_ARMAZEM} />
          <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
            <PackageSearch className="size-3.5" aria-hidden /> O QR da etiqueta de cada caixa, pallet ou endereço abre a tela dele no celular.
          </p>
        </>
      )}
    </>
  );
}
