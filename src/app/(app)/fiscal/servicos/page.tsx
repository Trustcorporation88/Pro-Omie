import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, CampoBusca, DataFiltro, Paginacao } from "@/components/filtros";
import { Selo } from "@/components/selos";
import { exigirUsuario } from "@/lib/auth/sessao";
import { fmtData, fmtDataHora, fmtDocumento, fmtMoeda } from "@/lib/format";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { lerFiltrosNfse, listarNotasServico, POR_PAGINA_NFSE } from "@/modules/fiscal/nfse/consultas";
import { resumoServico } from "@/modules/fiscal/nfse/tipos";
import { ROTULO_STATUS_NOTA, TOM_STATUS_NOTA } from "@/modules/fiscal/nfe/tipos";

export const metadata: Metadata = { title: "Notas de serviço" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Pagina({ searchParams }: Props) {
  await exigirUsuario("fiscal:ver");
  const f = lerFiltrosNfse(await searchParams);
  const { total, linhas, contadores } = await listarNotasServico(f);
  return (
    <>
      <PageHeader titulo="Notas de serviço (NFS-e)" descricao="NFS-e emitidas pelo emissor nacional a partir dos pedidos faturados. A emissão fica no pedido; aqui ficam a DANFSe, o XML e o cancelamento." />
      <div className="mb-4 flex flex-col items-start gap-3">
        <AbasFiltro
          parametro="status"
          padrao=""
          opcoes={[
            { valor: "", rotulo: "Todas", contador: contadores.todas },
            { valor: "autorizada", rotulo: "Geradas", contador: contadores.AUTORIZADA ?? 0 },
            { valor: "rejeitada", rotulo: "Recusadas", contador: contadores.REJEITADA ?? 0 },
            { valor: "processando", rotulo: "Processando", contador: contadores.PROCESSANDO ?? 0 },
            { valor: "cancelada", rotulo: "Canceladas", contador: contadores.CANCELADA ?? 0 },
          ]}
        />
        <div className="flex w-full flex-wrap items-center gap-2">
          <CampoBusca placeholder="Tomador, CNPJ, número, chave ou serviço" />
          <DataFiltro parametro="de" rotulo="De" />
          <DataFiltro parametro="ate" rotulo="Até" />
        </div>
      </div>
      {linhas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma NFS-e" descricao="Emita a primeira nota pelo botão “Emitir NFS-e” de um pedido faturado com serviços." />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableCaption className="sr-only">Notas de serviço</TableCaption>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-3">NFS-e</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Tomador</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="pr-3">Pedido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((n) => (
                <TableRow key={n.id} className="align-top">
                  <TableCell className="tabular pl-3 whitespace-nowrap">
                    <Link href={`/fiscal/servicos/${n.id}`} className="font-medium hover:underline">
                      {n.numeroNfse ?? `DPS ${n.numero}/${n.serie}`}
                    </Link>
                    {n.numeroNfse && <span className="block text-xs text-muted-foreground">{`DPS ${n.numero}/${n.serie}`}</span>}
                  </TableCell>
                  <TableCell className="tabular text-sm whitespace-nowrap">
                    {fmtDataHora(n.emitidaEm)}
                    <span className="block text-xs text-muted-foreground">compet. {fmtData(n.competencia)}</span>
                  </TableCell>
                  <TableCell className="max-w-72 min-w-48 whitespace-normal">
                    <span className="block truncate text-sm font-medium">{n.tomadorNome || "—"}</span>
                    <span className="tabular text-xs text-muted-foreground">{fmtDocumento(n.tomadorDocumento)}</span>
                  </TableCell>
                  <TableCell className="max-w-80 min-w-48 text-xs whitespace-normal">
                    <span className="tabular block text-muted-foreground">{n.codigoTributacaoNacional}</span>
                    {resumoServico(n.descricao)}
                  </TableCell>
                  <TableCell className="tabular text-right text-sm font-medium whitespace-nowrap">{fmtMoeda(n.valor)}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap gap-1">
                      <Selo tom={TOM_STATUS_NOTA[n.status]}>{n.status === "AUTORIZADA" ? "Gerada" : ROTULO_STATUS_NOTA[n.status]}</Selo>
                      {n.ambiente === 2 && <Selo tom="alerta">Produção restrita</Selo>}
                    </div>
                    {n.status === "REJEITADA" && n.mensagem && <span className="mt-1 block max-w-72 text-xs text-muted-foreground">{`${n.codigo ?? ""} ${n.mensagem}`}</span>}
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
      <Paginacao pagina={f.pagina} total={total} porPagina={POR_PAGINA_NFSE} />
    </>
  );
}
