import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Selo } from "@/components/selos";
import { AcoesDocumento } from "@/components/vendas/acoes-documento";
import { fmtData, fmtMoeda } from "@/lib/format";
import { hojeISO } from "@/lib/datas";
import { fmtDecimal, fmtNumeroDoc, fmtPrecoUnitario } from "@/modules/vendas/calculos";
import { ROTULO_STATUS, TOM_STATUS, type DocumentoVenda, type OpcoesVenda } from "@/modules/vendas/tipos";

function Dado({ rotulo, children }: { rotulo: string; children?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children || <span className="font-normal text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const ROTULO_TITULO: Record<string, string> = { ABERTO: "Em aberto", PARCIAL: "Parcial", QUITADO: "Recebido", CANCELADO: "Cancelado" };

export function DetalheDocumento({
  doc,
  opcoes,
  podeEditar,
  podeFaturar,
  podeVerFinanceiro,
  podeVerCrm = false,
  painelNfe,
}: {
  doc: DocumentoVenda;
  opcoes: OpcoesVenda;
  podeEditar: boolean;
  podeFaturar: boolean;
  podeVerFinanceiro: boolean;
  podeVerCrm?: boolean;
  /** painel da NF-e do pedido (montado no servidor pela página) */
  painelNfe?: React.ReactNode;
}) {
  const proposta = doc.tipo === "proposta";
  const base = proposta ? "/vendas/propostas" : "/vendas/pedidos";
  const hoje = hojeISO();
  const vencida = proposta && doc.validade && doc.validade < hoje && (doc.status === "RASCUNHO" || doc.status === "ENVIADA");

  return (
    <>
      <Link href={base} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {proposta ? "Propostas" : "Pedidos de venda"}
      </Link>
      <PageHeader
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {proposta ? "Proposta" : "Pedido"} nº {fmtNumeroDoc(doc.numero)}
            <Selo tom={TOM_STATUS[doc.status]}>{ROTULO_STATUS[doc.status]}</Selo>
            {vencida && <Selo tom="alerta">validade vencida</Selo>}
          </span>
        }
        descricao={`${doc.pessoaNome} · ${fmtMoeda(doc.total)}`}
      >
        <AcoesDocumento doc={doc} podeEditar={podeEditar} podeFaturar={podeFaturar} opcoes={opcoes} hoje={hoje} />
      </PageHeader>

      {doc.motivo && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span className="font-medium">{proposta ? "Motivo da recusa" : "Motivo do cancelamento"}:</span> {doc.motivo}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card className="gap-0 overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-8 pl-3">#</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead>Un.</TableHead>
                  <TableHead className="text-right">Preço unit.</TableHead>
                  <TableHead className="text-right">Desc.</TableHead>
                  <TableHead className="pr-3 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doc.itens.map((i, n) => (
                  <TableRow key={n}>
                    <TableCell className="pl-3 text-muted-foreground">{n + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{i.descricao}</div>
                      <div className="text-xs text-muted-foreground">
                        {`${i.tipo === "SERVICO" ? "Serviço" : "Produto"} · ${i.produtoCodigo ?? "avulso"}`}
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-right">{fmtDecimal(i.quantidade, 0, 3)}</TableCell>
                    <TableCell>{i.unidade}</TableCell>
                    <TableCell className="tabular text-right">{fmtPrecoUnitario(i.precoUnitario)}</TableCell>
                    <TableCell className="tabular text-right">{i.descontoPercentual ? `${fmtDecimal(i.descontoPercentual, 0, 2)}%` : "—"}</TableCell>
                    <TableCell className="tabular pr-3 text-right font-medium">{fmtMoeda(i.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6} className="text-right text-muted-foreground">
                    Subtotal
                  </TableCell>
                  <TableCell className="tabular pr-3 text-right">{fmtMoeda(doc.subtotal)}</TableCell>
                </TableRow>
                {doc.desconto > 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-right text-muted-foreground">
                      Descontos
                    </TableCell>
                    <TableCell className="tabular pr-3 text-right">− {fmtMoeda(doc.desconto)}</TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell colSpan={6} className="text-right font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="tabular pr-3 text-right text-base font-semibold">{fmtMoeda(doc.total)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>

          {(doc.observacoes || doc.observacoesInternas) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Observações</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Para o cliente (sai no PDF)</p>
                  <p className="whitespace-pre-wrap">{doc.observacoes || "—"}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Internas</p>
                  <p className="whitespace-pre-wrap">{doc.observacoesInternas || "—"}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {!proposta && doc.titulos.length > 0 && (
            <Card className="gap-0 overflow-hidden py-0">
              <div className="px-6 py-4">
                <h2 className="text-base font-semibold">Contas a receber geradas</h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-3">Título</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="pr-3 text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doc.titulos.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="tabular pl-3">
                        {podeVerFinanceiro ? (
                          <Link href={`/financeiro/titulos/${t.id}`} className="font-medium hover:underline">
                            {`#${t.numero}`}
                          </Link>
                        ) : (
                          `#${t.numero}`
                        )}
                      </TableCell>
                      <TableCell className="tabular">{fmtData(t.vencimento)}</TableCell>
                      <TableCell>{ROTULO_TITULO[t.status] ?? t.status}</TableCell>
                      <TableCell className="tabular pr-3 text-right">{fmtMoeda(t.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {!proposta && painelNfe}
        </div>

        <Card className="h-fit">
          <CardContent>
            <dl className="space-y-3">
              <Dado rotulo="Cliente">
                {doc.pessoaNome}
                {doc.pessoaDocumento && <div className="text-xs font-normal text-muted-foreground">{doc.pessoaDocumento}</div>}
              </Dado>
              <Dado rotulo="Emissão">{fmtData(doc.emissao)}</Dado>
              {proposta && <Dado rotulo="Válida até">{fmtData(doc.validade)}</Dado>}
              <Dado rotulo="Responsável">{doc.vendedorNome}</Dado>
              <Dado rotulo="Condição de pagamento">{doc.condicaoNome ?? "A combinar"}</Dado>
              <Dado rotulo="Forma de pagamento">{doc.formaNome}</Dado>
              <Dado rotulo="Empresa emissora">{doc.empresaNome}</Dado>
              {doc.baixaEstoque && (
                <Dado rotulo="Baixa no estoque">
                  {`Nº ${fmtNumeroDoc(doc.baixaEstoque.numero)}`}
                  <div className="text-xs font-normal text-muted-foreground">{doc.baixaEstoque.resumo}</div>
                </Dado>
              )}
              {doc.oportunidade && (
                <Dado rotulo="Oportunidade">
                  {podeVerCrm ? (
                    <Link href={`/crm/oportunidades/${doc.oportunidade.id}`} className="text-primary hover:underline">
                      {doc.oportunidade.titulo}
                    </Link>
                  ) : (
                    doc.oportunidade.titulo
                  )}
                </Dado>
              )}
              {doc.vinculo && (
                <Dado rotulo={proposta ? "Pedido gerado" : "Proposta de origem"}>
                  <Link href={`${proposta ? "/vendas/pedidos" : "/vendas/propostas"}/${doc.vinculo.id}`} className="text-primary hover:underline">
                    {proposta ? "Pedido" : "Proposta"} nº {fmtNumeroDoc(doc.vinculo.numero)}
                  </Link>
                </Dado>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
