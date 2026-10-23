import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Selo } from "@/components/selos";
import { AcoesNfse } from "@/components/fiscal/acoes-nfse";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { fmtData, fmtDataHora, fmtDocumento, fmtMoeda } from "@/lib/format";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { obterNotaServico } from "@/modules/fiscal/nfse/consultas";
import { MOTIVOS_CANCELAMENTO_NFSE, urlConsultaPublicaNfse } from "@/modules/fiscal/nfse/tipos";
import { ROTULO_STATUS_NOTA, TOM_STATUS_NOTA } from "@/modules/fiscal/nfe/tipos";
import { ROTULO_MOTOR } from "@/modules/fiscal/tipos";

export const metadata: Metadata = { title: "NFS-e" };

type Props = { params: Promise<{ id: string }> };

function Dado({ rotulo, children, className }: { rotulo: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children || <span className="font-normal text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export default async function Pagina({ params }: Props) {
  const u = await exigirUsuario("fiscal:ver");
  const { id } = await params;
  const n = await obterNotaServico(id);
  if (!n) notFound();
  const titulo = n.numeroNfse ? `NFS-e nº ${n.numeroNfse}` : `DPS nº ${n.numero} · série ${n.serie}`;
  return (
    <>
      <Link href="/fiscal/servicos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Notas de serviço
      </Link>
      <PageHeader
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {titulo}
            <Selo tom={TOM_STATUS_NOTA[n.status]}>{n.status === "AUTORIZADA" ? "Gerada" : ROTULO_STATUS_NOTA[n.status]}</Selo>
            {n.ambiente === 2 && <Selo tom="alerta">Produção restrita · sem valor fiscal</Selo>}
          </span>
        }
        descricao={`${n.tomadorNome || "Sem tomador"}${n.tomadorDocumento ? ` · ${fmtDocumento(n.tomadorDocumento)}` : ""}`}
      >
        <AcoesNfse id={n.id} status={n.status} podeEditar={pode(u.papel, "fiscal:editar")} temDanfse={n.temDanfse} temXml={n.temXml} />
      </PageHeader>
      <div className="space-y-4">
        {(n.status === "REJEITADA" || n.status === "PROCESSANDO") && n.mensagem && (
          <div role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {n.codigo ? `${n.codigo}: ` : ""}
              {n.mensagem}
              {n.status === "REJEITADA" && n.pedido ? " Corrija no cadastro e use “Corrigir e reenviar” no pedido (o número da DPS é o mesmo)." : ""}
            </span>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da nota</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Dado rotulo="Prestador">
                {n.emitente.nome}
                <span className="tabular block text-xs font-normal text-muted-foreground">{fmtDocumento(n.emitente.cnpj)}</span>
              </Dado>
              <Dado rotulo="Tomador">
                {n.tomadorNome}
                <span className="tabular block text-xs font-normal text-muted-foreground">{fmtDocumento(n.tomadorDocumento)}</span>
              </Dado>
              <Dado rotulo="Emissão">
                {fmtDataHora(n.emitidaEm)}
                <span className="block text-xs font-normal text-muted-foreground">competência {fmtData(n.competencia)}</span>
              </Dado>
              <Dado rotulo="Valor do serviço">{fmtMoeda(n.valor)}</Dado>
              <Dado rotulo="Chave de acesso" className="sm:col-span-2">
                {n.chave ? (
                  <a href={urlConsultaPublicaNfse(n.chave)} target="_blank" rel="noopener noreferrer" className="tabular font-mono text-xs hover:underline">
                    {n.chave.replace(/(.{10})/g, "$1 ").trim()}
                  </a>
                ) : null}
              </Dado>
              <Dado rotulo="DPS">{`nº ${n.numero} · série ${n.serie}`}</Dado>
              <Dado rotulo="Código de tributação nacional">{n.codigoTributacaoNacional}</Dado>
              <Dado rotulo="Pedido">
                {n.pedido ? (
                  <Link href={`/vendas/pedidos/${n.pedido.id}`} className="hover:underline">
                    nº {fmtNumeroDoc(n.pedido.numero)}
                  </Link>
                ) : null}
              </Dado>
              <Dado rotulo="Envio">{n.motor === "SEFAZ" ? "Emissor nacional direto" : (ROTULO_MOTOR[n.motor as "SEFAZ" | "FOCUS"] ?? n.motor)}</Dado>
              {n.autorizadaEm && <Dado rotulo="Gerada em">{fmtDataHora(n.autorizadaEm)}</Dado>}
              {n.canceladaEm && (
                <Dado rotulo="Cancelamento" className="sm:col-span-2">
                  {fmtDataHora(n.canceladaEm)}
                  {n.cancelamentoCodigo ? ` · ${MOTIVOS_CANCELAMENTO_NFSE.find((m) => m.valor === n.cancelamentoCodigo)?.rotulo ?? n.cancelamentoCodigo}` : ""}
                  <span className="block text-xs font-normal text-muted-foreground">{n.cancelamentoMotivo}</span>
                  {n.temEvento && (
                    <a href={`/api/fiscal/nfse/${n.id}/xml?evento=1`} className="mt-1 inline-block text-xs font-medium underline">
                      XML do evento
                    </a>
                  )}
                </Dado>
              )}
              <Dado rotulo="Descrição do serviço" className="sm:col-span-2 lg:col-span-4">
                <span className="font-normal whitespace-pre-line">{n.descricao}</span>
              </Dado>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
