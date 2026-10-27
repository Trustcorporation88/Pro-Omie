import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Selo } from "@/components/selos";
import { AcoesVolume } from "@/components/armazem/acoes-volume";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { fmtData, fmtDataHora, fmtDocumento } from "@/lib/format";
import { obterVolume } from "@/modules/armazem/consultas";
import { ROTULO_TIPO_VOLUME, fmtQuantidade, numeroRecebimento, situacaoVolume } from "@/modules/armazem/tipos";

export const metadata: Metadata = { title: "Caixa ou pallet" };

type Props = { params: Promise<{ id: string }> };

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children || <span className="font-normal text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const TOM_MOVIMENTO: Record<string, "info" | "sucesso" | "alerta" | "neutro" | "roxo"> = { CRIACAO: "neutro", CONFERENCIA: "info", AJUSTE: "alerta", ENDERECAMENTO: "sucesso", TRANSFERENCIA: "roxo", SAIDA: "neutro", SAIDA_DESFEITA: "alerta" };
const ROTULO_MOVIMENTO: Record<string, string> = { CRIACAO: "Criado", CONFERENCIA: "Conferência", AJUSTE: "Ajuste", ENDERECAMENTO: "Endereço", TRANSFERENCIA: "Transferência", SAIDA: "Saída", SAIDA_DESFEITA: "Saída desfeita" };

export default async function Pagina({ params }: Props) {
  const u = await exigirUsuario("armazem:ver");
  const { id } = await params;
  const v = await obterVolume(id);
  if (!v) notFound();
  const s = situacaoVolume(v.status, !!v.endereco);
  const total = v.conteudo.reduce((a, c) => a + c.quantidade, 0);
  const unidades = [...new Set(v.conteudo.map((c) => c.unidade))];
  return (
    <>
      <Link href="/servicos/armazem/volumes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Caixas e pallets
      </Link>
      <PageHeader
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {ROTULO_TIPO_VOLUME[v.tipo]} {v.codigo}
            <Selo tom={s.tom}>{s.rotulo}</Selo>
          </span>
        }
        descricao={`${v.depositante.nome}${v.depositante.documento ? ` · ${fmtDocumento(v.depositante.documento)}` : ""} · ${v.estabelecimento}`}
      >
        {pode(u.papel, "armazem:editar") && (
          <AcoesVolume
            volume={{ id: v.id, codigo: v.codigo, status: v.status, empresaId: v.empresaId, depositanteId: v.depositante.id, endereco: v.endereco ? { id: v.endereco.id, codigo: v.endereco.codigo } : null }}
            conteudo={v.conteudo}
            produtos={v.produtos}
            restantes={v.restantes}
            aposExcluir="/servicos/armazem/volumes"
          />
        )}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="py-4">
            <CardContent className="px-4">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Dado rotulo="Endereço">
                  {v.endereco ? (
                    <Link href={`/servicos/armazem/enderecos/${v.endereco.id}`} className="text-base hover:underline">
                      {v.endereco.codigo}
                    </Link>
                  ) : v.status === "EXPEDIDO" ? (
                    "saiu do armazém"
                  ) : (
                    <span className="text-[oklch(0.5_0.13_65)]">sem endereço</span>
                  )}
                </Dado>
                <Dado rotulo="Recebimento">
                  {v.recebimento ? (
                    <Link href={`/servicos/armazem/recebimentos/${v.recebimento.id}`} className="hover:underline">
                      {numeroRecebimento(v.recebimento.numero)}
                    </Link>
                  ) : (
                    "vários"
                  )}
                </Dado>
                <Dado rotulo="Ref. do depositante">{v.referenciaDepositante}</Dado>
                <Dado rotulo="Criado em">{fmtData(v.criadoEm)}</Dado>
                {v.status === "EXPEDIDO" && (
                  <>
                    <Dado rotulo="Saída">{v.expedidoEm ? fmtData(v.expedidoEm) : null}</Dado>
                    <Dado rotulo="Documento da saída">{v.documentoSaida}</Dado>
                  </>
                )}
                {v.observacao && <Dado rotulo="Observação">{v.observacao}</Dado>}
              </dl>
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="py-4">
              <CardTitle className="text-base">
                Conteúdo{" "}
                <span className="font-normal text-muted-foreground">
                  ({v.conteudo.length} {v.conteudo.length === 1 ? "linha" : "linhas"}
                  {unidades.length === 1 && v.conteudo.length ? ` · ${fmtQuantidade(total, unidades[0])}` : ""})
                </span>
              </CardTitle>
            </CardHeader>
            {v.conteudo.length ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Código</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="pr-4">Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {v.conteudo.map((c) => {
                    const origem = v.notasDeOrigem.find((n) => n.recebimentoId === c.recebimentoId);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="max-w-80 pl-4 whitespace-normal">
                          <span className="block text-sm font-medium">{c.codigo}</span>
                          <span className="block text-xs text-muted-foreground">{c.descricao}</span>
                        </TableCell>
                        <TableCell className="text-sm">{c.lote || <span className="text-muted-foreground">sem lote</span>}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmtQuantidade(c.quantidade, c.unidade)}</TableCell>
                        <TableCell className="pr-4 text-sm">
                          <Link href={`/servicos/armazem/recebimentos/${c.recebimentoId}`} className="hover:underline">
                            {numeroRecebimento(c.recebimentoNumero)}
                          </Link>
                          {origem?.notas.length ? <span className="block text-xs text-muted-foreground">NF-e {origem.notas.map((n) => n.numero).join(", ")}</span> : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <CardContent className="pb-4 text-sm text-muted-foreground">Volume vazio.</CardContent>
            )}
          </Card>
        </div>

        <Card className="gap-0 py-0">
          <CardHeader className="py-4">
            <CardTitle className="text-base">Histórico</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ol className="space-y-3">
              {v.movimentos.map((m) => (
                <li key={m.id} className="border-l-2 pl-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Selo tom={TOM_MOVIMENTO[m.tipo] ?? "neutro"}>{ROTULO_MOVIMENTO[m.tipo] ?? m.tipo}</Selo>
                    <span className="text-xs text-muted-foreground">
                      {fmtDataHora(m.em)}
                      {m.usuario ? ` · ${m.usuario}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-sm break-words">{m.resumo}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
