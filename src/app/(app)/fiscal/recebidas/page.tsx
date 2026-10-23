import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, CloudDownload, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, CampoBusca, DataFiltro, Paginacao, SelectFiltro } from "@/components/filtros";
import { Selo } from "@/components/selos";
import { BotaoBuscarAgora } from "@/components/fiscal/botao-buscar-agora";
import { SeloSituacaoNota, SeloTipoDoc } from "@/components/fiscal/selos-fiscais";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { fmtData, fmtDataHora, fmtDocumento, fmtMoeda } from "@/lib/format";
import { estabelecimentosDoEscopo, estadoCaptacao, lerFiltrosRecebidas, listarRecebidas, POR_PAGINA_RECEBIDAS } from "@/modules/fiscal/consultas";
import { classificarStatus, ROTULO_MOTOR, ROTULO_TIPO_DOC, TIPOS_DOC, type EstadoCaptacao } from "@/modules/fiscal/tipos";

export const metadata: Metadata = { title: "Notas recebidas" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function ResumoCaptacao({ estados, admin }: { estados: EstadoCaptacao[]; admin: boolean }) {
  const ligados = estados.filter((e) => e.ativa);
  if (!ligados.length) {
    return (
      <Card className="mb-5 flex-row items-start gap-3 border-dashed px-4 py-4 shadow-none">
        <CloudDownload className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-1 text-sm">
          <p className="font-medium">A busca automática de notas está desligada</p>
          <p className="text-muted-foreground">
            Com o certificado A1 enviado, o sistema busca de hora em hora as notas emitidas contra o CNPJ, direto na SEFAZ e no Ambiente Nacional, sem custo.
            {admin ? " Ligue em Configurações › Empresas e filiais › Notas recebidas." : " Peça a um administrador para ligar."}
          </p>
          {admin && (
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href="/configuracoes/empresa">
                <Settings2 /> Configurar
              </Link>
            </Button>
          )}
        </div>
      </Card>
    );
  }
  return (
    <Card className="mb-5 gap-2 px-4 py-3 shadow-none">
      {ligados.map((e) => (
        <div key={e.empresaId} className="space-y-1 text-xs">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {e.nome}
            <span className="tabular text-xs font-normal text-muted-foreground">{fmtDocumento(e.cnpj)}</span>
            <Selo tom="sucesso">Busca ligada · {ROTULO_MOTOR[e.motor]}</Selo>
            {e.ambiente === 2 && <Selo tom="alerta">Homologação</Selo>}
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-0.5 text-muted-foreground">
            {TIPOS_DOC.filter((t) => e.tipos.includes(t)).map((t) => {
              const c = e.cursores.find((x) => x.tipo === t);
              const st = classificarStatus(c?.status);
              const proxima = c?.proximaConsulta && new Date(c.proximaConsulta) > new Date() ? ` · próxima após ${fmtDataHora(c.proximaConsulta)}` : "";
              return (
                <li key={t} className={c?.status && !st.ok ? "text-destructive" : undefined} title={c?.mensagem ?? undefined}>
                  <span className="font-medium">{ROTULO_TIPO_DOC[t]}:</span>{" "}
                  {c?.consultadoEm ? `${fmtDataHora(c.consultadoEm)} · ${st.rotulo}${proxima}` : "aguardando a primeira busca"}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Card>
  );
}

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("fiscal:ver");
  const f = lerFiltrosRecebidas(await searchParams);
  const [{ total, contadores, linhas, estabelecimentos }, estados] = await Promise.all([listarRecebidas(f), estabelecimentosDoEscopo().then(estadoCaptacao)]);
  const podeBuscar = pode(u.papel, "fiscal:editar") && estados.some((e) => e.ativa);
  const variosEstabs = estabelecimentos.length > 1;
  const filtrando = !!(f.tipo || f.estab || f.de || f.ate || f.busca || f.lancadas || f.aba !== "todas" || f.direcao !== "ENTRADA");

  return (
    <>
      <PageHeader
        titulo="Notas recebidas"
        descricao="NF-e, CT-e e NFS-e emitidas contra o CNPJ, buscadas direto na SEFAZ. Dê ciência, confirme ou recuse e lance no contas a pagar."
      >
        {podeBuscar && <BotaoBuscarAgora />}
      </PageHeader>

      <ResumoCaptacao estados={estados} admin={pode(u.papel, "config:admin")} />

      <div className="mb-4 flex flex-col items-start gap-3">
        <AbasFiltro
          parametro="aba"
          padrao="todas"
          opcoes={[
            { valor: "todas", rotulo: "Todas", contador: contadores.todas },
            { valor: "pendentes", rotulo: "Sem manifestação", contador: contadores.pendentes },
            { valor: "ciencia", rotulo: "Com ciência", contador: contadores.ciencia },
            { valor: "confirmadas", rotulo: "Confirmadas", contador: contadores.confirmadas },
            { valor: "recusadas", rotulo: "Recusadas", contador: contadores.recusadas },
            { valor: "canceladas", rotulo: "Canceladas", contador: contadores.canceladas },
          ]}
        />
        <div className="flex w-full flex-wrap items-center gap-2">
          <CampoBusca placeholder="Fornecedor, CNPJ, número ou chave" />
          <SelectFiltro parametro="tipo" rotuloTodos="Todos os tipos" opcoes={TIPOS_DOC.map((t) => ({ valor: t.toLowerCase(), rotulo: ROTULO_TIPO_DOC[t] }))} />
          {variosEstabs && <SelectFiltro parametro="estab" rotuloTodos="Todos os estabelecimentos" opcoes={estabelecimentos.map((e) => ({ valor: e.id, rotulo: e.nome }))} />}
          <SelectFiltro
            parametro="lancadas"
            rotuloTodos="Lançadas ou não"
            opcoes={[
              { valor: "nao", rotulo: "Não lançadas no contas a pagar" },
              { valor: "sim", rotulo: "Lançadas no contas a pagar" },
            ]}
          />
          <SelectFiltro
            parametro="direcao"
            rotuloTodos="Recebidas"
            opcoes={[
              { valor: "saida", rotulo: "Emitidas pela empresa" },
              { valor: "terceiro", rotulo: "Como terceiro" },
              { valor: "todas", rotulo: "Todas as direções" },
            ]}
          />
          <DataFiltro parametro="de" rotulo="De" />
          <DataFiltro parametro="ate" rotulo="Até" />
        </div>
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio
          titulo={filtrando ? "Nenhuma nota com esses filtros" : "Nenhuma nota recebida ainda"}
          descricao={
            filtrando
              ? "Troque a aba ou os filtros para ver outras notas."
              : "Quando a busca estiver ligada, as notas emitidas contra o CNPJ nos últimos 90 dias aparecem aqui (é o prazo que a SEFAZ guarda para distribuir)."
          }
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableCaption className="sr-only">Notas recebidas</TableCaption>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-3">Emissão</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Emitente</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="pr-3">Contas a pagar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id} className="align-top">
                  <TableCell className="tabular pl-3 text-sm whitespace-nowrap">{fmtData(l.emitidoEm)}</TableCell>
                  <TableCell>
                    <SeloTipoDoc tipo={l.tipo} />
                  </TableCell>
                  <TableCell className="tabular text-sm whitespace-nowrap">
                    <Link href={`/fiscal/recebidas/${l.id}`} className="font-medium hover:underline">
                      {l.numero ? `${l.numero}${l.serie ? `/${l.serie}` : ""}` : "Ver nota"}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-80 min-w-56 whitespace-normal">
                    <Link href={`/fiscal/recebidas/${l.id}`} className="block truncate text-sm font-medium hover:underline">
                      {l.emitenteNome ?? "Emitente não informado"}
                    </Link>
                    <span className="tabular text-xs text-muted-foreground">
                      {fmtDocumento(l.emitenteDocumento)}
                      {variosEstabs ? ` · para ${l.estabelecimento}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="tabular text-right text-sm font-medium whitespace-nowrap">{l.valor === null ? "—" : fmtMoeda(l.valor)}</TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-col items-start gap-1">
                      <SeloSituacaoNota tipo={l.tipo} situacao={l.situacao} manifestacao={l.manifestacao} direcao={l.direcao} />
                      {l.manifestacaoErro && (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive" title={l.manifestacaoErro}>
                          <CircleAlert className="size-3.5" aria-hidden /> SEFAZ recusou a manifestação
                        </span>
                      )}
                      {l.tipo === "NFE" && !l.completo && l.situacao === "AUTORIZADO" && <span className="text-xs text-muted-foreground">só o resumo</span>}
                    </div>
                  </TableCell>
                  <TableCell className="pr-3 text-sm">{l.lancado ? <Selo tom="sucesso">Lançada</Selo> : <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Paginacao pagina={f.pagina} total={total} porPagina={POR_PAGINA_RECEBIDAS} />
    </>
  );
}
