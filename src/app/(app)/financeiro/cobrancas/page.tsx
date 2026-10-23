import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro } from "@/components/filtros";
import { Selo } from "@/components/selos";
import { exigirUsuario } from "@/lib/auth/sessao";
import { fmtData, fmtMoeda } from "@/lib/format";
import { listarCobrancas, ROTULO_STATUS_COBRANCA, ROTULO_TIPO_COBRANCA, TOM_STATUS_COBRANCA } from "@/modules/cobranca/consultas";

export const metadata: Metadata = { title: "Cobranças" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Pagina({ searchParams }: Props) {
  await exigirUsuario("financeiro:ver");
  const sp = await searchParams;
  const status = (Array.isArray(sp.status) ? sp.status[0] : sp.status) ?? "abertas";
  const { linhas, contadores } = await listarCobrancas(status);
  return (
    <>
      <PageHeader titulo="Cobranças" descricao="Boletos e Pix gerados no Asaas a partir das contas a receber. A cobrança é gerada no título; quando o cliente paga, a baixa é automática." />
      <div className="mb-4">
        <AbasFiltro
          parametro="status"
          padrao="abertas"
          opcoes={[
            { valor: "abertas", rotulo: "Em aberto", contador: contadores.abertas },
            { valor: "pagas", rotulo: "Pagas", contador: contadores.pagas },
            { valor: "outras", rotulo: "Canceladas e outras", contador: contadores.todas - contadores.abertas - contadores.pagas },
            { valor: "todas", rotulo: "Todas", contador: contadores.todas },
          ]}
        />
      </div>
      {linhas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma cobrança" descricao="Abra uma conta a receber e use “Gerar boleto ou Pix”." />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableCaption className="sr-only">Cobranças</TableCaption>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-3">Vencimento</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="pr-3">Pago em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((c) => (
                <TableRow key={c.id} className="align-top">
                  <TableCell className="tabular pl-3 whitespace-nowrap">{fmtData(c.vencimento)}</TableCell>
                  <TableCell className="max-w-72 min-w-48 whitespace-normal">{c.titulo.cliente}</TableCell>
                  <TableCell className="max-w-80 min-w-48 whitespace-normal">
                    <Link href={`/financeiro/titulos/${c.titulo.id}`} className="font-medium hover:underline">
                      {`#${c.titulo.numero}`}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{c.titulo.descricao}</span>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{ROTULO_TIPO_COBRANCA[c.tipo] ?? c.tipo}</TableCell>
                  <TableCell className="tabular text-right font-medium whitespace-nowrap">{fmtMoeda(c.valor)}</TableCell>
                  <TableCell>
                    <Selo tom={TOM_STATUS_COBRANCA(c.status)}>{ROTULO_STATUS_COBRANCA[c.status] ?? c.status}</Selo>
                  </TableCell>
                  <TableCell className="tabular pr-3 text-sm whitespace-nowrap">{c.pagoEm ? fmtData(c.pagoEm) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
