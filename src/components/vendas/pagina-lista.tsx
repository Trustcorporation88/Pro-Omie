import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, CampoBusca, Paginacao } from "@/components/filtros";
import { Selo } from "@/components/selos";
import { fmtData, fmtMoeda } from "@/lib/format";
import { hojeISO } from "@/lib/datas";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { POR_PAGINA_VENDAS, lerFiltrosVendas, listarDocumentos } from "@/modules/vendas/consultas";
import { ROTULO_STATUS, TOM_STATUS, type TipoDocumentoVenda } from "@/modules/vendas/tipos";

type Busca = Record<string, string | string[] | undefined>;

const CONFIG = {
  proposta: {
    titulo: "Propostas",
    descricao: "Orçamentos enviados aos clientes. A proposta aprovada vira pedido de venda.",
    base: "/vendas/propostas",
    novo: "Nova proposta",
    padrao: "abertas",
    abas: [
      { valor: "abertas", rotulo: "Abertas" },
      { valor: "aprovadas", rotulo: "Aprovadas" },
      { valor: "recusadas", rotulo: "Recusadas" },
      { valor: "canceladas", rotulo: "Canceladas" },
      { valor: "todas", rotulo: "Todas" },
    ],
  },
  pedido: {
    titulo: "Pedidos de venda",
    descricao: "Vendas confirmadas. Faturar o pedido gera as contas a receber.",
    base: "/vendas/pedidos",
    novo: "Novo pedido",
    padrao: "abertos",
    abas: [
      { valor: "abertos", rotulo: "Abertos" },
      { valor: "faturados", rotulo: "Faturados" },
      { valor: "cancelados", rotulo: "Cancelados" },
      { valor: "todos", rotulo: "Todos" },
    ],
  },
} as const;

export async function PaginaListaVendas({ tipo, searchParams, podeEditar }: { tipo: TipoDocumentoVenda; searchParams: Busca; podeEditar: boolean }) {
  const c = CONFIG[tipo];
  const f = lerFiltrosVendas(searchParams, c.padrao);
  const { linhas, total, contadores } = await listarDocumentos(tipo, f);
  const hoje = hojeISO();
  const cont = contadores as Record<string, number>;

  return (
    <>
      <PageHeader titulo={c.titulo} descricao={c.descricao}>
        {podeEditar && (
          <Button asChild>
            <Link href={`${c.base}/${tipo === "proposta" ? "nova" : "novo"}`}>
              <Plus /> {c.novo}
            </Link>
          </Button>
        )}
      </PageHeader>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <AbasFiltro parametro="aba" padrao={c.padrao} opcoes={c.abas.map((a) => ({ ...a, contador: cont[a.valor] }))} />
        <CampoBusca placeholder="Cliente ou número…" className="md:w-72" />
      </div>
      {linhas.length === 0 ? (
        <EstadoVazio
          titulo={f.q ? "Nada encontrado" : tipo === "proposta" ? "Nenhuma proposta aqui" : "Nenhum pedido aqui"}
          descricao={f.q ? "Tente outro termo de busca." : tipo === "proposta" ? "Crie a primeira proposta para um cliente." : "Gere um pedido a partir de uma proposta aprovada ou crie um direto."}
        >
          {podeEditar && !f.q && (
            <Button asChild>
              <Link href={`${c.base}/${tipo === "proposta" ? "nova" : "novo"}`}>
                <Plus /> {c.novo}
              </Link>
            </Button>
          )}
        </EstadoVazio>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableCaption className="sr-only">{c.titulo}</TableCaption>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-20 pl-3">Nº</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Emissão</TableHead>
                {tipo === "proposta" && <TableHead>Validade</TableHead>}
                <TableHead>Responsável</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="pr-3 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => {
                const vencida = tipo === "proposta" && l.validade && l.validade < hoje && (l.status === "RASCUNHO" || l.status === "ENVIADA");
                return (
                  <TableRow key={l.id} className="relative">
                    <TableCell className="tabular pl-3 font-medium">
                      <Link href={`${c.base}/${l.id}`} className="after:absolute after:inset-0 hover:underline">
                        {fmtNumeroDoc(l.numero)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">{l.pessoaNome}</TableCell>
                    <TableCell className="tabular text-sm">{fmtData(l.emissao)}</TableCell>
                    {tipo === "proposta" && (
                      <TableCell className="tabular text-sm">
                        {fmtData(l.validade)} {vencida && <Selo tom="alerta">vencida</Selo>}
                      </TableCell>
                    )}
                    <TableCell className="text-sm text-muted-foreground">{l.vendedorNome ?? "—"}</TableCell>
                    <TableCell>
                      <Selo tom={TOM_STATUS[l.status]}>{ROTULO_STATUS[l.status]}</Selo>
                    </TableCell>
                    <TableCell className="tabular pr-3 text-right font-medium">{fmtMoeda(l.total)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <div className="mt-4">
        <Paginacao pagina={f.pagina} total={total} porPagina={POR_PAGINA_VENDAS} />
      </div>
    </>
  );
}
