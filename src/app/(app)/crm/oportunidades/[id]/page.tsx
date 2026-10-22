import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Selo } from "@/components/selos";
import { AcoesOportunidade, EtapasOportunidade } from "@/components/crm/acoes-oportunidade";
import { BotaoNovaAtividade, ListaAtividades } from "@/components/crm/lista-atividades";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { FUSO, hojeISO } from "@/lib/datas";
import { fmtData, fmtMoeda } from "@/lib/format";
import { carregarOpcoesCrm, carregarOportunidade } from "@/modules/crm/consultas";
import { MOTIVOS_PERDA, ORIGENS, PROBABILIDADE, ROTULO_ETAPA, TOM_ETAPA, ehAberta, type MotivoPerda, type Origem } from "@/modules/crm/tipos";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { ROTULO_STATUS, TOM_STATUS, type StatusPropostaT } from "@/modules/vendas/tipos";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const o = await carregarOportunidade(id).catch(() => null);
  return { title: o ? o.titulo : "Oportunidade não encontrada" };
}

const ROTULO_ACAO: Record<string, string> = {
  criar: "Criada",
  atualizar: "Editada",
  mover: "Mudou de etapa",
  ganhar: "Ganha",
  perder: "Perdida",
  reabrir: "Reaberta",
};

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Dado({ rotulo, children }: { rotulo: string; children?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children || <span className="font-normal text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export default async function Pagina({ params }: Props) {
  const u = await exigirUsuario("crm:ver");
  const { id } = await params;
  const [o, opcoes] = await Promise.all([carregarOportunidade(id), carregarOpcoesCrm()]);
  if (!o) notFound();
  const hoje = hojeISO();
  const podeEditar = pode(u.papel, "crm:editar");
  const podeVender = pode(u.papel, "vendas:editar");
  const aberta = ehAberta(o.etapa);
  const pendentes = o.atividades.filter((a) => !a.concluidaEm);
  const feitas = o.atividades.filter((a) => a.concluidaEm).reverse();
  const previsaoVencida = aberta && !!o.previsaoFechamento && o.previsaoFechamento < hoje;

  return (
    <>
      <Link href="/crm/funil" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Funil de vendas
      </Link>
      <PageHeader
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {o.titulo}
            <Selo tom={TOM_ETAPA[o.etapa]}>{ROTULO_ETAPA[o.etapa]}</Selo>
          </span>
        }
        descricao={`${o.pessoaNome} · ${fmtMoeda(o.valor)}`}
      >
        <AcoesOportunidade o={o} opcoes={opcoes} podeEditar={podeEditar} podeVender={podeVender} podeCadastrar={pode(u.papel, "cadastros:editar")} />
      </PageHeader>

      {o.etapa === "GANHA" && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
          <span className="font-medium">Ganha em {fmtData(o.ganhaEm)}.</span> Para voltar ao funil, use Reabrir.
        </div>
      )}
      {o.etapa === "PERDIDA" && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span className="font-medium">Perdida em {fmtData(o.perdidaEm)}</span>
          {o.motivoPerda && ` · ${MOTIVOS_PERDA[o.motivoPerda as MotivoPerda] ?? o.motivoPerda}`}
          {o.detalhePerda && ` · ${o.detalhePerda}`}
        </div>
      )}

      <div className="mb-6">
        <EtapasOportunidade o={o} podeEditar={podeEditar} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card className="gap-2">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Atividades</CardTitle>
              {podeEditar && <BotaoNovaAtividade hoje={hoje} usuarioId={u.id} opcoes={opcoes} oportunidade={{ id: o.id, titulo: o.titulo }} variante="outline" />}
            </CardHeader>
            <CardContent>
              {aberta && !pendentes.length && (
                <p className="mb-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                  Nenhum próximo passo agendado. Toda oportunidade aberta deveria ter uma atividade marcada.
                </p>
              )}
              <ListaAtividades itens={pendentes} hoje={hoje} opcoes={opcoes} usuarioId={u.id} podeEditar={podeEditar} mostrarVinculo={false} mostrarResponsavel />
              {feitas.length > 0 && (
                <details className="mt-3 group">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Concluídas ({feitas.length})</summary>
                  <div className="mt-1">
                    <ListaAtividades itens={feitas} hoje={hoje} opcoes={opcoes} usuarioId={u.id} podeEditar={podeEditar} mostrarVinculo={false} mostrarResponsavel />
                  </div>
                </details>
              )}
              {!o.atividades.length && !aberta && <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>}
            </CardContent>
          </Card>

          <Card className="gap-2">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Propostas</CardTitle>
            </CardHeader>
            <CardContent>
              {o.propostas.length ? (
                <ul className="divide-y">
                  {o.propostas.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <Link href={`/vendas/propostas/${p.id}`} className="font-medium hover:underline">
                          {`Proposta nº ${fmtNumeroDoc(p.numero)}`}
                        </Link>
                        <p className="text-xs text-muted-foreground tabular-nums">{fmtData(p.emissao)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Selo tom={TOM_STATUS[p.status as StatusPropostaT]}>{ROTULO_STATUS[p.status as StatusPropostaT]}</Selo>
                        <span className="font-medium tabular-nums">{fmtMoeda(p.total)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {aberta && podeVender ? "Nenhuma proposta ainda. Use Nova proposta: o cliente já vem preenchido." : "Nenhuma proposta."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="gap-2">
            <CardHeader>
              <CardTitle className="text-base">Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 border-l pl-4">
                {o.historico.map((h) => (
                  <li key={h.id} className="relative text-sm">
                    <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary/60" aria-hidden />
                    <p>
                      <span className="font-medium">{ROTULO_ACAO[h.acao] ?? h.acao}</span>
                      {h.resumo && <span className="text-muted-foreground"> · {h.resumo}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dataHora(h.quando)}
                      {h.usuarioNome ? ` · ${h.usuarioNome}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardContent>
            <dl className="space-y-3">
              <Dado rotulo="Cliente">
                {o.pessoaNome}
                {o.pessoaDocumento && <div className="text-xs font-normal text-muted-foreground">{o.pessoaDocumento}</div>}
                {o.pessoaTelefone && <div className="text-xs font-normal text-muted-foreground">{o.pessoaTelefone}</div>}
                {o.pessoaEmail && <div className="truncate text-xs font-normal text-muted-foreground">{o.pessoaEmail}</div>}
              </Dado>
              <Dado rotulo="Contato no cliente">{o.contato}</Dado>
              <Dado rotulo="Responsável">{o.responsavelNome}</Dado>
              <Dado rotulo="Valor estimado">{fmtMoeda(o.valor)}</Dado>
              {aberta && (
                <Dado rotulo="Chance e previsão ponderada">
                  {`${PROBABILIDADE[o.etapa]}% · ${fmtMoeda((o.valor * PROBABILIDADE[o.etapa]) / 100)}`}
                </Dado>
              )}
              <Dado rotulo="Previsão de fechamento">
                {o.previsaoFechamento && <span className={previsaoVencida ? "text-destructive" : undefined}>{fmtData(o.previsaoFechamento)}</span>}
                {previsaoVencida && <span className="ml-1 text-xs font-normal text-destructive">(passou)</span>}
              </Dado>
              <Dado rotulo="Origem do contato">{o.origem ? (ORIGENS[o.origem as Origem] ?? o.origem) : null}</Dado>
              <Dado rotulo="Criada em">{fmtData(o.criadaEm)}</Dado>
              {aberta && <Dado rotulo="Na etapa atual">{o.diasNaEtapa === 0 ? "desde hoje" : o.diasNaEtapa === 1 ? "há 1 dia" : `há ${o.diasNaEtapa} dias`}</Dado>}
              {o.observacoes && (
                <Dado rotulo="Observações">
                  <span className="font-normal whitespace-pre-wrap">{o.observacoes}</span>
                </Dado>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
