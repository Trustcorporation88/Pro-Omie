import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { Selo } from "@/components/selos";
import { CartoesContas } from "@/components/financeiro/cartoes-contas";
import { AcoesMovimentacoes } from "@/components/financeiro/dialogos-movimentacao";
import { FiltroPeriodo } from "@/components/financeiro/filtro-periodo";
import { MenuMovimento } from "@/components/financeiro/menu-movimento";
import type { ExtratoLinha } from "@/components/financeiro/tipos";
import { extratoConta } from "@/modules/financeiro/consultas";
import { saldosContas } from "@/modules/financeiro/servicos";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { addDias, ehISOValido, fimMes, hojeISO, inicioMes } from "@/lib/datas";
import { fmtData, fmtMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Movimentações" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function SeloOrigem({ linha }: { linha: ExtratoLinha }) {
  switch (linha.origem) {
    case "BAIXA":
      return (
        <>
          <Selo tom="info">Baixa</Selo>
          {linha.tituloId && (
            <Link href={`/financeiro/titulos/${linha.tituloId}`} className="font-mono text-primary hover:underline">
              #{linha.tituloNumero}
            </Link>
          )}
        </>
      );
    case "TRANSFERENCIA":
      return (
        <>
          <Selo tom="roxo">Transferência</Selo>
          {linha.contraparte && (
            <span>
              {linha.tipo === "DEBITO" ? "para" : "de"} {linha.contraparte}
            </span>
          )}
        </>
      );
    case "AJUSTE":
      return <Selo tom="alerta">Ajuste</Selo>;
    case "INICIAL":
      return <Selo tom="neutro">Saldo inicial</Selo>;
  }
}

function Indicador({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: number; detalhe?: string; cor?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground">{rotulo}</div>
      <div className={cn("mt-1 truncate text-xl font-semibold tracking-tight tabular", cor)}>{fmtMoeda(valor)}</div>
      {detalhe && <div className="mt-0.5 text-xs text-muted-foreground">{detalhe}</div>}
    </div>
  );
}

export default async function MovimentacoesPage({ searchParams }: Props) {
  const u = await exigirUsuario("financeiro:ver");
  const sp = await searchParams;
  const podeEditar = pode(u.papel, "financeiro:editar");
  const hoje = hojeISO();
  const ler = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const deUrl = ehISOValido(ler("de")) ? ler("de") : undefined;
  const ateUrl = ehISOValido(ler("ate")) ? ler("ate") : undefined;
  let de = deUrl ?? inicioMes(hoje);
  let ate = ateUrl ?? fimMes(hoje);
  if (de > ate) [de, ate] = [ate, de];

  const saldos = await saldosContas();
  const pedida = ler("conta");
  let extrato = pedida ? await extratoConta(pedida, de, ate) : null;
  if (!extrato && saldos[0]) extrato = await extratoConta(saldos[0].id, de, ate);
  const contasOpcoes = saldos.map((s) => ({ valor: s.id, rotulo: s.nome }));

  return (
    <>
      <PageHeader titulo="Movimentações" descricao="Extrato das contas: baixas, transferências e ajustes, com saldo acumulado.">
        {podeEditar && saldos.length > 0 && <AcoesMovimentacoes contas={contasOpcoes} contaAtualId={extrato?.conta.id ?? null} hoje={hoje} />}
      </PageHeader>

      {saldos.length === 0 && !extrato ? (
        <EstadoVazio titulo="Nenhuma conta bancária ativa" descricao="Cadastre uma conta bancária ou caixa para acompanhar saldos e movimentos.">
          <Link href="/cadastros/contas-bancarias" className="text-sm font-medium text-primary underline">
            Ir para contas bancárias
          </Link>
        </EstadoVazio>
      ) : (
        <>
          <CartoesContas saldos={saldos} selecionada={extrato?.conta.id ?? null} periodo={{ de: deUrl, ate: ateUrl }} />

          {extrato && (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                    {extrato.conta.nome}
                    {!extrato.conta.ativo && <Selo tom="neutro">Inativa</Selo>}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {extrato.conta.banco ? `${extrato.conta.banco} · ` : ""}
                    {fmtData(de)} a {fmtData(ate)}
                  </p>
                </div>
                <FiltroPeriodo key={`${de}|${ate}`} de={de} ate={ate} hoje={hoje} />
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Indicador rotulo="Saldo anterior" valor={extrato.saldoAnterior} detalhe={`em ${fmtData(addDias(de, -1))}`} cor={extrato.saldoAnterior < 0 ? "text-destructive" : undefined} />
                <Indicador rotulo="Entradas" valor={extrato.entradas} cor="text-success" detalhe="créditos no período" />
                <Indicador rotulo="Saídas" valor={extrato.saidas} cor="text-destructive" detalhe="débitos no período" />
                <Indicador rotulo="Saldo final" valor={extrato.saldoFinal} detalhe={`em ${fmtData(ate)}`} cor={extrato.saldoFinal < 0 ? "text-destructive" : undefined} />
              </div>

              {(extrato.saldoInicialNoPeriodo || extrato.truncado) && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-1">
                    {extrato.saldoInicialNoPeriodo && (
                      <p>
                        O saldo inicial da conta ({fmtMoeda(extrato.saldoInicialNoPeriodo.valor)} em {fmtData(extrato.saldoInicialNoPeriodo.data)}) cai dentro
                        do período: aparece como linha do extrato e entra no saldo final, mas não nas entradas/saídas.
                      </p>
                    )}
                    {extrato.truncado && <p>O período tem muitos movimentos; mostrando os primeiros. Os totais consideram o período inteiro. Reduza o período para ver tudo.</p>}
                  </div>
                </div>
              )}

              <Card className="gap-0 overflow-hidden py-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-28 pl-4">Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Entrada</TableHead>
                      <TableHead className="text-right">Saída</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="w-10 pr-4" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell className="pl-4 tabular text-muted-foreground">{fmtData(addDias(de, -1))}</TableCell>
                      <TableCell className="text-muted-foreground" colSpan={3}>
                        Saldo anterior
                      </TableCell>
                      <TableCell className={cn("text-right font-medium tabular", extrato.saldoAnterior < 0 && "text-destructive")}>
                        {fmtMoeda(extrato.saldoAnterior)}
                      </TableCell>
                      <TableCell className="pr-4" />
                    </TableRow>
                    {extrato.linhas.length === 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                          Nenhum movimento nesta conta no período.
                        </TableCell>
                      </TableRow>
                    )}
                    {extrato.linhas.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="pl-4 align-top tabular">{fmtData(l.data)}</TableCell>
                        <TableCell className="max-w-[28rem] whitespace-normal">
                          <div className="line-clamp-2 font-medium">{l.descricao}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <SeloOrigem linha={l} />
                            {l.pessoaNome && <span className="truncate">{l.pessoaNome}</span>}
                            {l.conciliado && (
                              <Selo tom="sucesso">
                                <CircleCheck className="size-3" /> Conciliado
                              </Selo>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-top tabular text-success">{l.tipo === "CREDITO" ? fmtMoeda(l.valor) : ""}</TableCell>
                        <TableCell className="text-right align-top tabular text-destructive">{l.tipo === "DEBITO" ? fmtMoeda(l.valor) : ""}</TableCell>
                        <TableCell className={cn("text-right align-top font-medium tabular", l.saldo < 0 && "text-destructive")}>{fmtMoeda(l.saldo)}</TableCell>
                        <TableCell className="pr-4 align-top">
                          <MenuMovimento linha={l} contaNome={extrato.conta.nome} podeEditar={podeEditar} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="hover:bg-transparent">
                      <TableCell className="pl-4 tabular">{fmtData(ate)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        Totais do período · {extrato.linhas.filter((l) => l.origem !== "INICIAL").length} movimento(s)
                      </TableCell>
                      <TableCell className="text-right tabular text-success">{fmtMoeda(extrato.entradas)}</TableCell>
                      <TableCell className="text-right tabular text-destructive">{fmtMoeda(extrato.saidas)}</TableCell>
                      <TableCell className={cn("text-right tabular", extrato.saldoFinal < 0 && "text-destructive")}>{fmtMoeda(extrato.saldoFinal)}</TableCell>
                      <TableCell className="pr-4" />
                    </TableRow>
                  </TableFooter>
                </Table>
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
