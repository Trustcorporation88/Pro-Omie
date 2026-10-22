import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro } from "@/components/filtros";
import { BotaoNovaAtividade, ListaAtividades } from "@/components/crm/lista-atividades";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { hojeISO } from "@/lib/datas";
import { carregarAgenda, carregarOpcoesCrm, lerFiltrosCrm } from "@/modules/crm/consultas";
import type { AtividadeItem, OpcoesCrm } from "@/modules/crm/tipos";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Atividades" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function Secao(props: {
  titulo: string;
  itens: AtividadeItem[];
  tom?: "perigo";
  hoje: string;
  opcoes: OpcoesCrm;
  usuarioId: string;
  podeEditar: boolean;
  todas: boolean;
  vazio: string;
}) {
  return (
    <Card className={cn("gap-1", props.tom === "perigo" && props.itens.length > 0 && "border-destructive/40")}>
      <CardHeader>
        <CardTitle className={cn("text-base", props.tom === "perigo" && props.itens.length > 0 && "text-destructive")}>
          {props.titulo} <span className="font-normal text-muted-foreground">{props.itens.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ListaAtividades
          itens={props.itens}
          hoje={props.hoje}
          opcoes={props.opcoes}
          usuarioId={props.usuarioId}
          podeEditar={props.podeEditar}
          mostrarResponsavel={props.todas}
          vazio={props.vazio}
        />
      </CardContent>
    </Card>
  );
}

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("crm:ver");
  const f = lerFiltrosCrm(await searchParams, "eu");
  const [agenda, opcoes] = await Promise.all([carregarAgenda(f, u.id), carregarOpcoesCrm()]);
  const hoje = hojeISO();
  const podeEditar = pode(u.papel, "crm:editar");
  const todas = f.de !== "eu";
  const comum = { hoje, opcoes, usuarioId: u.id, podeEditar, todas };
  const nada = !agenda.atrasadas.length && !agenda.hoje.length && !agenda.proximas.length && !agenda.concluidasHoje.length && !agenda.depois;

  return (
    <>
      <PageHeader titulo="Atividades" descricao="A agenda comercial: o que está atrasado, o que é para hoje e o que vem pela frente.">
        {podeEditar && <BotaoNovaAtividade hoje={hoje} usuarioId={u.id} opcoes={opcoes} />}
      </PageHeader>
      <div className="mb-4">
        <AbasFiltro
          parametro="de"
          padrao="eu"
          opcoes={[
            { valor: "eu", rotulo: "Minhas" },
            { valor: "todos", rotulo: "De todos" },
          ]}
        />
      </div>
      {nada ? (
        <EstadoVazio titulo="Agenda livre" descricao="Nenhuma atividade pendente. Abra o funil e marque o próximo passo de cada oportunidade.">
          <Button variant="outline" asChild>
            <Link href="/crm/funil">Abrir o funil</Link>
          </Button>
        </EstadoVazio>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            {agenda.atrasadas.length > 0 && <Secao titulo="Atrasadas" itens={agenda.atrasadas} tom="perigo" vazio="" {...comum} />}
            <Secao titulo="Hoje" itens={agenda.hoje} vazio="Nada para hoje." {...comum} />
          </div>
          <div className="min-w-0 space-y-4">
            <Secao titulo="Próximos 7 dias" itens={agenda.proximas} vazio="Nada agendado para a semana." {...comum} />
            {agenda.depois > 0 && (
              <p className="px-1 text-sm text-muted-foreground">
                {agenda.depois === 1 ? "Mais 1 atividade agendada" : `Mais ${agenda.depois} atividades agendadas`} para depois dos próximos 7 dias.
              </p>
            )}
            {agenda.concluidasHoje.length > 0 && <Secao titulo="Concluídas hoje" itens={agenda.concluidasHoje} vazio="" {...comum} />}
          </div>
        </div>
      )}
    </>
  );
}
