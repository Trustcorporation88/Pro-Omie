import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, CampoBusca, DataFiltro, Paginacao, SelectFiltro } from "@/components/filtros";
import { listarCondicoesPagamento, listarTitulos, lerFiltrosTitulos, resumoTitulos } from "@/modules/financeiro/consultas";
import { carregarOpcoesFinanceiras } from "@/modules/financeiro/opcoes";
import { pode } from "@/lib/auth/permissoes";
import type { UsuarioSessao } from "@/lib/auth/sessao";
import { hojeISO } from "@/lib/datas";
import { BotaoNovoLancamento } from "./botao-novo-lancamento";
import { CartoesResumo } from "./cartoes-resumo";
import { TabelaTitulos } from "./tabela-titulos";
import { TEXTOS, type OpcoesFormulario, type TipoTitulo } from "./tipos";

/**
 * Página de Contas a receber / Contas a pagar (componente de servidor compartilhado).
 * searchParams: status (abertos|vencidos|quitados|cancelados|todos), de, ate, q, categoria, conta, pagina.
 */
export async function PaginaTitulos({
  tipo,
  usuario,
  searchParams,
}: {
  tipo: TipoTitulo;
  usuario: UsuarioSessao;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const tx = TEXTOS[tipo];
  const filtros = lerFiltrosTitulos(searchParams);
  const podeEditar = pode(usuario.papel, "financeiro:editar");
  const hoje = hojeISO();

  const [listagem, resumo, opcoesFinanceiras, condicoes] = await Promise.all([
    listarTitulos(tipo, filtros),
    resumoTitulos(tipo),
    carregarOpcoesFinanceiras(),
    podeEditar ? listarCondicoesPagamento() : Promise.resolve([]),
  ]);
  const opcoes: OpcoesFormulario = { ...opcoesFinanceiras, condicoes };
  const categorias = tipo === "RECEBER" ? opcoes.categoriasReceita : opcoes.categoriasDespesa;
  const temFiltro = !!(filtros.q || filtros.de || filtros.ate || filtros.categoria || filtros.conta);
  const nenhumTitulo = !temFiltro && listagem.contadores.todos === 0;
  const c = listagem.contadores;

  return (
    <>
      <PageHeader titulo={tx.plural} descricao={tx.descricao}>
        {podeEditar && <BotaoNovoLancamento tipo={tipo} opcoes={opcoes} hoje={hoje} />}
      </PageHeader>

      <CartoesResumo tipo={tipo} resumo={resumo} filtros={filtros} hoje={hoje} />

      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <AbasFiltro
            parametro="status"
            padrao="abertos"
            opcoes={[
              { valor: "abertos", rotulo: "Em aberto", contador: c.abertos },
              { valor: "vencidos", rotulo: "Vencidos", contador: c.vencidos },
              { valor: "quitados", rotulo: "Quitados", contador: c.quitados },
              { valor: "cancelados", rotulo: "Cancelados", contador: c.cancelados },
              { valor: "todos", rotulo: "Todos", contador: c.todos },
            ]}
          />
          <CampoBusca placeholder="Descrição, documento, nome ou nº…" className="sm:w-80" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SelectFiltro parametro="categoria" rotuloTodos="Todas as categorias" opcoes={categorias} className="max-w-64" />
          <SelectFiltro parametro="conta" rotuloTodos="Todas as contas" opcoes={opcoes.contas} className="max-w-64" />
          <DataFiltro parametro="de" rotulo="Vencimento de" />
          <DataFiltro parametro="ate" rotulo="até" />
          {temFiltro && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={filtros.status === "abertos" ? tx.rota : `${tx.rota}?status=${filtros.status}`} scroll={false}>
                <X /> Limpar filtros
              </Link>
            </Button>
          )}
        </div>
      </div>

      {listagem.linhas.length === 0 ? (
        nenhumTitulo ? (
          <EstadoVazio
            titulo={`Nenhuma ${tx.singular} lançada ainda`}
            descricao={`Lance a primeira ${tx.singular} para acompanhar vencimentos, baixas e saldos.`}
          >
            {podeEditar && <BotaoNovoLancamento tipo={tipo} opcoes={opcoes} hoje={hoje} variant="outline" />}
          </EstadoVazio>
        ) : (
          <EstadoVazio
            titulo={filtros.status === "vencidos" && !temFiltro ? "Nenhum título vencido" : "Nenhum título encontrado"}
            descricao={
              temFiltro
                ? "Ajuste a busca, o período ou os filtros."
                : filtros.status === "vencidos"
                  ? "Tudo em dia por aqui."
                  : "Não há títulos nesta situação."
            }
          />
        )
      ) : (
        <TabelaTitulos
          key={JSON.stringify(filtros)}
          tipo={tipo}
          linhas={listagem.linhas}
          hoje={hoje}
          podeEditar={podeEditar}
          opcoes={opcoes}
        />
      )}
      <Paginacao pagina={filtros.pagina} total={listagem.total} porPagina={filtros.porPagina} />
    </>
  );
}
