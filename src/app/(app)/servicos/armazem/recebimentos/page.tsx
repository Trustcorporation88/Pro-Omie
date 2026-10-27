import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, CampoBusca, Paginacao, SelectFiltro } from "@/components/filtros";
import { Selo } from "@/components/selos";
import { BotaoReceberNota, NovoRecebimento } from "@/components/armazem/recebimento";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { fmtData, fmtDocumento, fmtMoeda } from "@/lib/format";
import { POR_PAGINA_ARMAZEM, depositantesArmazem, estabelecimentosArmazem, lerFiltrosRecebimentos, listarRecebimentos, notasAguardandoRecebimento } from "@/modules/armazem/consultas";
import { ROTULO_STATUS_RECEBIMENTO, fmtQuantidade, numeroRecebimento } from "@/modules/armazem/tipos";

export const metadata: Metadata = { title: "Recebimentos do armazém" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("armazem:ver");
  const f = lerFiltrosRecebimentos(await searchParams);
  const escopo = await escopoEmpresa();
  const [dados, aguardando, depositantes, estabelecimentos] = await Promise.all([listarRecebimentos(f), notasAguardandoRecebimento(escopo), depositantesArmazem(escopo), estabelecimentosArmazem(escopo)]);
  const podeEditar = pode(u.papel, "armazem:editar");
  return (
    <>
      <Link href="/servicos/armazem" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Itens armazenados
      </Link>
      <PageHeader titulo="Recebimentos" descricao="Cada entrada de mercadoria de um depositante: os documentos (NF-e e CT-e), o que eles dizem e o que foi conferido nas caixas e pallets.">
        {podeEditar && <NovoRecebimento estabelecimentos={estabelecimentos} />}
      </PageHeader>

      {aguardando.length > 0 && (
        <Card className="mb-5 gap-0 overflow-hidden border-primary/30 py-0">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileInput className="size-4 text-primary" aria-hidden /> Notas de remessa aguardando recebimento ({aguardando.length})
            </CardTitle>
            <CardDescription>NF-e de remessa para armazenagem (CFOP 5.905/6.905) que a busca de notas trouxe e ainda não deram entrada no armazém.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {aguardando.map((n) => (
              <div key={n.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{n.emitenteNome ?? "Depositante"}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · NF-e {n.numero ?? "—"}
                    {n.serie ? `/${n.serie}` : ""} · {n.emitidoEm ? fmtData(n.emitidoEm) : "—"}
                    {n.valor !== null ? ` · ${fmtMoeda(n.valor)}` : ""}
                  </span>
                  {n.emitenteDocumento && <span className="block text-xs text-muted-foreground">{fmtDocumento(n.emitenteDocumento)}</span>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/fiscal/recebidas/${n.id}`}>Ver nota</Link>
                  </Button>
                  {podeEditar && <BotaoReceberNota documentoId={n.id} rotulo="Receber" />}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <AbasFiltro
            parametro="status"
            padrao=""
            opcoes={[
              { valor: "", rotulo: "Todos" },
              { valor: "CONFERENCIA", rotulo: "Em conferência", contador: dados.contagem.CONFERENCIA },
              { valor: "CONCLUIDO", rotulo: "Conferidos", contador: dados.contagem.CONCLUIDO },
            ]}
          />
          {depositantes.length > 1 && <SelectFiltro parametro="depositante" rotuloTodos="Todos os depositantes" opcoes={depositantes.map((d) => ({ valor: d.id, rotulo: d.nome }))} />}
          {estabelecimentos.length > 1 && <SelectFiltro parametro="estab" rotuloTodos="Todos os estabelecimentos" opcoes={estabelecimentos.map((e) => ({ valor: e.id, rotulo: e.nome }))} />}
        </div>
        <CampoBusca placeholder="Depositante, nº, NF-e ou chave…" className="lg:w-72" />
      </div>

      {dados.linhas.length === 0 ? (
        <EstadoVazio
          titulo={f.status || f.q || f.depositante ? "Nenhum recebimento neste filtro" : "Nenhum recebimento ainda"}
          descricao="Crie o recebimento com o XML da NF-e de remessa (e do CT-e, se tiver). Sem documento, use para o inventário do que já está no armazém."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-3">Recebimento</TableHead>
                <TableHead>Depositante</TableHead>
                <TableHead>Documentos</TableHead>
                <TableHead className="text-right">Volumes</TableHead>
                <TableHead className="text-right">Esperado × conferido</TableHead>
                <TableHead className="pr-3">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.linhas.map((r) => {
                const confere = r.esperado > 0 && Math.abs(r.esperado - r.conferido) < 0.0005;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="pl-3">
                      <Link href={`/servicos/armazem/recebimentos/${r.id}`} className="font-medium hover:underline">
                        {numeroRecebimento(r.numero)}
                      </Link>
                      <span className="block text-xs text-muted-foreground">chegada {fmtData(r.chegadaEm)}</span>
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal text-sm">
                      {r.depositante}
                      {estabelecimentos.length > 1 && <span className="block text-xs text-muted-foreground">{r.estabelecimento}</span>}
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal text-sm">{r.documentos.length ? r.documentos.join(", ") : <span className="text-muted-foreground">sem documento</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.volumes}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {r.esperado > 0 ? `${fmtQuantidade(r.esperado)} × ${fmtQuantidade(r.conferido)}` : fmtQuantidade(r.conferido)}
                      {r.esperado > 0 && <span className={`block text-xs ${confere ? "text-success" : "text-muted-foreground"}`}>{confere ? "confere" : r.conferido < r.esperado ? "falta conferir" : "conferido a mais"}</span>}
                    </TableCell>
                    <TableCell className="pr-3">
                      <Selo tom={r.status === "CONFERENCIA" ? "roxo" : "sucesso"}>{ROTULO_STATUS_RECEBIMENTO[r.status]}</Selo>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <Paginacao pagina={f.pagina} total={dados.total} porPagina={POR_PAGINA_ARMAZEM} />
    </>
  );
}
