import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, CampoBusca, DataFiltro, Paginacao } from "@/components/filtros";
import { Selo } from "@/components/selos";
import { exigirUsuario } from "@/lib/auth/sessao";
import { fmtDataHora, fmtDocumento, fmtMoeda } from "@/lib/format";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { lerFiltrosNotas, listarNotas, POR_PAGINA_NOTAS } from "@/modules/fiscal/nfe/consultas";
import { ROTULO_STATUS_NOTA, TOM_STATUS_NOTA } from "@/modules/fiscal/nfe/tipos";

export const metadata: Metadata = { title: "Notas emitidas" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Pagina({ searchParams }: Props) {
  await exigirUsuario("fiscal:ver");
  const f = lerFiltrosNotas(await searchParams);
  const { total, linhas, contadores } = await listarNotas(f);
  return (
    <>
      <PageHeader titulo="Notas emitidas" descricao="NF-e emitidas a partir dos pedidos faturados. A emissão fica no pedido; aqui ficam o DANFE, o XML, o cancelamento e a carta de correção." />
      <div className="mb-4 flex flex-col items-start gap-3">
        <AbasFiltro
          parametro="status"
          padrao=""
          opcoes={[
            { valor: "", rotulo: "Todas", contador: contadores.todas },
            { valor: "autorizada", rotulo: "Autorizadas", contador: contadores.AUTORIZADA ?? 0 },
            { valor: "rejeitada", rotulo: "Rejeitadas", contador: contadores.REJEITADA ?? 0 },
            { valor: "processando", rotulo: "Processando", contador: contadores.PROCESSANDO ?? 0 },
            { valor: "cancelada", rotulo: "Canceladas", contador: contadores.CANCELADA ?? 0 },
          ]}
        />
        <div className="flex w-full flex-wrap items-center gap-2">
          <CampoBusca placeholder="Cliente, CNPJ, número ou chave" />
          <DataFiltro parametro="de" rotulo="De" />
          <DataFiltro parametro="ate" rotulo="Até" />
        </div>
      </div>
      {linhas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma NF-e" descricao="Emita a primeira nota pelo botão “Emitir NF-e” de um pedido faturado." />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableCaption className="sr-only">Notas emitidas</TableCaption>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-3">Número</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="pr-3">Pedido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((n) => (
                <TableRow key={n.id} className="align-top">
                  <TableCell className="tabular pl-3 whitespace-nowrap">
                    <Link href={`/fiscal/emitidas/${n.id}`} className="font-medium hover:underline">
                      {`${n.numero}/${n.serie}`}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular text-sm whitespace-nowrap">{fmtDataHora(n.emitidaEm)}</TableCell>
                  <TableCell className="max-w-80 min-w-56 whitespace-normal">
                    <span className="block truncate text-sm font-medium">{n.destinatarioNome}</span>
                    <span className="tabular text-xs text-muted-foreground">{fmtDocumento(n.destinatarioDocumento)}</span>
                  </TableCell>
                  <TableCell className="tabular text-right text-sm font-medium whitespace-nowrap">{fmtMoeda(n.valor)}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap gap-1">
                      <Selo tom={TOM_STATUS_NOTA[n.status]}>{ROTULO_STATUS_NOTA[n.status]}</Selo>
                      {n.ambiente === 2 && <Selo tom="alerta">Homologação</Selo>}
                      {n.tpEmis === 6 && <Selo tom="roxo">Contingência</Selo>}
                    </div>
                    {n.status === "REJEITADA" && n.xMotivo && <span className="mt-1 block max-w-72 text-xs text-muted-foreground">{`${n.cStat ?? ""} ${n.xMotivo}`}</span>}
                  </TableCell>
                  <TableCell className="pr-3 text-sm">
                    {n.pedido ? (
                      <Link href={`/vendas/pedidos/${n.pedido.id}`} className="hover:underline">
                        nº {fmtNumeroDoc(n.pedido.numero)}
                      </Link>
                    ) : (
                      <Selo>—</Selo>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Paginacao pagina={f.pagina} total={total} porPagina={POR_PAGINA_NOTAS} />
    </>
  );
}
