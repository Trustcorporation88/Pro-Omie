import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Selo } from "@/components/selos";
import { AcoesNfe } from "@/components/fiscal/acoes-nfe";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { fmtDataHora, fmtDocumento, fmtMoeda } from "@/lib/format";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { obterNota } from "@/modules/fiscal/nfe/consultas";
import { emailDoDocumentoCliente, estadoEmail } from "@/modules/email/consultas";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { ROTULO_STATUS_NOTA, TOM_STATUS_NOTA } from "@/modules/fiscal/nfe/tipos";
import { ROTULO_MOTOR } from "@/modules/fiscal/tipos";

export const metadata: Metadata = { title: "NF-e emitida" };

type Props = { params: Promise<{ id: string }> };

function Dado({ rotulo, children, className }: { rotulo: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children || <span className="font-normal text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const ROTULO_EVENTO: Record<string, string> = { "110111": "Cancelamento", "110110": "Carta de correção" };

export default async function Pagina({ params }: Props) {
  const u = await exigirUsuario("fiscal:ver");
  const { id } = await params;
  const n = await obterNota(id);
  if (!n) notFound();
  const email = { tipo: "nfe" as const, id: n.id, paraPadrao: await emailDoDocumentoCliente(n.destinatarioDocumento, (await escopoEmpresa()).ids), configurado: estadoEmail().configurado };
  return (
    <>
      <Link href="/fiscal/emitidas" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Notas emitidas
      </Link>
      <PageHeader
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            NF-e nº {n.numero} · série {n.serie}
            <Selo tom={TOM_STATUS_NOTA[n.status]}>{ROTULO_STATUS_NOTA[n.status]}</Selo>
            {n.ambiente === 2 && <Selo tom="alerta">Homologação · sem valor fiscal</Selo>}
            {n.tpEmis === 6 && <Selo tom="roxo">Contingência SVC-AN</Selo>}
          </span>
        }
        descricao={`${n.destinatarioNome}${n.destinatarioDocumento ? ` · ${fmtDocumento(n.destinatarioDocumento)}` : ""}`}
      >
        <AcoesNfe id={n.id} status={n.status} podeEditar={pode(u.papel, "fiscal:editar")} temDanfe={n.temDanfe} temXml={n.temXml} cancelavel={n.cancelavel} email={email} />
      </PageHeader>
      <div className="space-y-4">
        {(n.status === "REJEITADA" || n.status === "DENEGADA" || n.status === "PROCESSANDO") && n.xMotivo && (
          <div role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {n.cStat ? `${n.cStat}: ` : ""}
              {n.xMotivo}
              {n.status === "REJEITADA" && n.pedido ? " Corrija no cadastro e use “Corrigir e reenviar” no pedido (o número é o mesmo)." : ""}
            </span>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da nota</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Dado rotulo="Emitente">
                {n.emitente.nome}
                <span className="tabular block text-xs font-normal text-muted-foreground">{fmtDocumento(n.emitente.cnpj)}</span>
              </Dado>
              <Dado rotulo="Destinatário">
                {n.destinatarioNome}
                <span className="tabular block text-xs font-normal text-muted-foreground">{fmtDocumento(n.destinatarioDocumento)}</span>
              </Dado>
              <Dado rotulo="Emissão">{fmtDataHora(n.emitidaEm)}</Dado>
              <Dado rotulo="Valor">{fmtMoeda(n.valor)}</Dado>
              <Dado rotulo="Chave de acesso" className="sm:col-span-2">
                {n.chave ? <span className="tabular font-mono text-xs">{n.chave.replace(/(.{4})/g, "$1 ").trim()}</span> : null}
              </Dado>
              <Dado rotulo="Protocolo">
                {n.protocolo}
                {n.autorizadaEm && <span className="block text-xs font-normal text-muted-foreground">{fmtDataHora(n.autorizadaEm)}</span>}
              </Dado>
              <Dado rotulo="Natureza da operação">{n.naturezaOperacao}</Dado>
              <Dado rotulo="Pedido">
                {n.pedido ? (
                  <Link href={`/vendas/pedidos/${n.pedido.id}`} className="hover:underline">
                    nº {fmtNumeroDoc(n.pedido.numero)}
                  </Link>
                ) : null}
              </Dado>
              <Dado rotulo="Envio">{`${ROTULO_MOTOR[n.motor as "SEFAZ" | "FOCUS"] ?? n.motor}${n.tpEmis === 6 ? " · contingência SVC-AN" : ""}`}</Dado>
              {n.contingenciaMotivo && <Dado rotulo="Motivo da contingência">{n.contingenciaMotivo}</Dado>}
              {n.canceladaEm && (
                <Dado rotulo="Cancelamento">
                  {fmtDataHora(n.canceladaEm)} · protocolo {n.cancelamentoProtocolo ?? "—"}
                  <span className="block text-xs font-normal text-muted-foreground">{n.cancelamentoJustificativa}</span>
                </Dado>
              )}
            </dl>
          </CardContent>
        </Card>
        {n.eventos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Eventos</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {n.eventos.map((e) => (
                  <li key={e.id} className="border-l-2 pl-3">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {ROTULO_EVENTO[e.tipoEvento] ?? e.tipoEvento}
                      {e.tipoEvento === "110110" ? ` nº ${e.sequencia}` : ""}
                      <Selo tom={e.ok ? "sucesso" : "perigo"}>{e.ok ? "Registrado" : "Recusado"}</Selo>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDataHora(e.criadoEm)}
                      {e.protocolo ? ` · protocolo ${e.protocolo}` : ""}
                      {!e.ok && e.xMotivo ? ` · ${e.cStat} ${e.xMotivo}` : ""}
                    </p>
                    <p className="mt-1 text-xs whitespace-pre-line">{e.detalhe}</p>
                    {e.ok && (
                      <a href={`/api/fiscal/nfe/${n.id}/xml?evento=${e.id}`} className="mt-1 inline-block text-xs font-medium underline">
                        XML do evento
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
