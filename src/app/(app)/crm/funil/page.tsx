import type { Metadata } from "next";
import Link from "next/link";
import { CircleDollarSign, Percent, Target, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { AbasFiltro, CampoBusca } from "@/components/filtros";
import { Funil } from "@/components/crm/funil";
import { BotaoNovaOportunidade } from "@/components/crm/dialogo-oportunidade";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { hojeISO } from "@/lib/datas";
import { fmtData, fmtMoeda } from "@/lib/format";
import { carregarFunil, carregarOpcoesCrm, lerFiltrosCrm } from "@/modules/crm/consultas";
import type { CartaoOportunidade } from "@/modules/crm/tipos";

export const metadata: Metadata = { title: "Funil de vendas" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

function Indicador({ icone: Icone, titulo, valor, detalhe }: { icone: typeof Target; titulo: string; valor: string; detalhe: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icone className="size-3.5" aria-hidden /> {titulo}
        </p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>
      </CardContent>
    </Card>
  );
}

function ListaFechadas({ titulo, itens, vazio, perdidas }: { titulo: string; itens: CartaoOportunidade[]; vazio: string; perdidas?: boolean }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-sm">
          {titulo} <span className="font-normal text-muted-foreground">{itens.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {itens.length ? (
          <ul className="divide-y">
            {itens.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <Link href={`/crm/oportunidades/${c.id}`} className="block truncate font-medium hover:underline">
                    {c.titulo}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.pessoaNome}
                    {perdidas && c.motivoPerda ? ` · ${c.motivoPerda}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-medium tabular-nums">{fmtMoeda(c.valor)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{fmtData(c.fechadaEm)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">{vazio}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("crm:ver");
  const f = lerFiltrosCrm(await searchParams, "todos");
  const [funil, opcoes] = await Promise.all([carregarFunil(f, u.id), carregarOpcoesCrm()]);
  const podeEditar = pode(u.papel, "crm:editar");
  const podeCadastrar = pode(u.papel, "cadastros:editar");
  const r = funil.resultado;
  const maxMotivo = Math.max(1, ...r.motivos.map((m) => m.quantidade));

  return (
    <>
      <PageHeader titulo="Funil de vendas" descricao="Oportunidades em andamento por etapa. Arraste o cartão para mudar de etapa ou solte em Ganhou / Perdeu.">
        {podeEditar && <BotaoNovaOportunidade usuarioId={u.id} opcoes={opcoes} podeCadastrar={podeCadastrar} />}
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador icone={Target} titulo="Em aberto" valor={fmtMoeda(funil.abertas.valor)} detalhe={plural(funil.abertas.quantidade, "oportunidade", "oportunidades")} />
        <Indicador icone={CircleDollarSign} titulo="Previsão ponderada" valor={fmtMoeda(funil.abertas.ponderado)} detalhe="valor × chance de cada etapa" />
        <Indicador
          icone={Trophy}
          titulo="Ganho em 90 dias"
          valor={fmtMoeda(r.valorGanho)}
          detalhe={r.ganhas ? `${plural(r.ganhas, "negócio", "negócios")} · ticket médio ${fmtMoeda(r.ticketMedio)}` : "nenhum negócio fechado"}
        />
        <Indicador
          icone={Percent}
          titulo="Conversão em 90 dias"
          valor={r.conversao === null ? "—" : `${r.conversao.toLocaleString("pt-BR")}%`}
          detalhe={r.ganhas + r.perdidas ? `${r.ganhas} ganhas de ${r.ganhas + r.perdidas} fechadas` : "sem oportunidades fechadas"}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <AbasFiltro
          parametro="de"
          padrao="todos"
          opcoes={[
            { valor: "todos", rotulo: "Todas" },
            { valor: "eu", rotulo: "Minhas" },
          ]}
        />
        <CampoBusca placeholder="Oportunidade ou cliente…" className="md:w-72" />
      </div>

      <Funil funil={funil} opcoes={opcoes} hoje={hojeISO()} usuarioId={u.id} podeEditar={podeEditar} podeCadastrar={podeCadastrar} />

      <h2 className="mt-8 mb-3 text-sm font-semibold text-muted-foreground">Fechadas nos últimos 30 dias</h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ListaFechadas titulo="Ganhas" itens={funil.colunas.GANHA} vazio="Nenhuma ainda." />
        <ListaFechadas titulo="Perdidas" itens={funil.colunas.PERDIDA} vazio="Nenhuma perdida." perdidas />
        <Card className="gap-0 py-0">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">Por que perdemos (90 dias)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {r.motivos.length ? (
              <ul className="space-y-2">
                {r.motivos.map((m) => (
                  <li key={m.motivo} className="text-sm">
                    <div className="flex justify-between gap-2">
                      <span>{m.motivo}</span>
                      <span className="text-muted-foreground tabular-nums">{m.quantidade}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full bg-destructive/70" style={{ width: `${(m.quantidade / maxMotivo) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">Sem perdas registradas.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
