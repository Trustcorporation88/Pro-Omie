import type { Metadata } from "next";
import { GerarContratos } from "@/components/cadastro/gerar-contratos";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, CampoBusca, Paginacao, SelectFiltro } from "@/components/filtros";
import { AcoesLinhaCadastro, BotaoNovoCadastro } from "@/components/cadastro/controles-cadastro";
import { ENTIDADES, META, type EntidadeCadastro } from "@/modules/cadastros/campos";
import { listarCadastro, opcoesCadastro } from "@/modules/cadastros/registro";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { hojeISO } from "@/lib/datas";

type Props = { params: Promise<{ entidade: string }>; searchParams: Promise<Record<string, string | undefined>> };

const POR_PAGINA = 50;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { entidade } = await params;
  return { title: META[entidade as EntidadeCadastro]?.titulo ?? "Cadastros" };
}

export default async function CadastroPage({ params, searchParams }: Props) {
  const { entidade: slug } = await params;
  if (!ENTIDADES.includes(slug as EntidadeCadastro)) notFound();
  const entidade = slug as EntidadeCadastro;
  const u = await exigirUsuario("cadastros:ver");
  const sp = await searchParams;
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const meta = META[entidade];
  const editar = pode(u.papel, "cadastros:editar");

  const [listagem, opcoesDinamicas] = await Promise.all([
    listarCadastro(entidade, { q: (sp.q ?? "").trim(), status: sp.status ?? "ativos", pagina, porPagina: POR_PAGINA, extra: sp }),
    opcoesCadastro(entidade),
  ]);

  let iniciais: Record<string, string> | undefined;
  if (entidade === "contas-bancarias") {
    const escopo = await escopoEmpresa();
    iniciais = { empresaId: escopo.ativa.id, dataSaldoInicial: hojeISO() };
  }
  if (entidade === "ordens") iniciais = { abertura: hojeISO() };
  if (entidade === "contratos") iniciais = { inicio: hojeISO() };

  return (
    <>
      <PageHeader titulo={meta.titulo} descricao={meta.descricao}>
        {entidade === "contratos" && pode(u.papel, "financeiro:editar") && <GerarContratos />}
        {editar && <BotaoNovoCadastro entidade={entidade} opcoesDinamicas={opcoesDinamicas} iniciais={iniciais} />}
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CampoBusca />
        <AbasFiltro
          parametro="status"
          padrao="ativos"
          opcoes={[
            { valor: "ativos", rotulo: "Ativos" },
            { valor: "inativos", rotulo: "Inativos" },
            { valor: "todos", rotulo: "Todos" },
          ]}
        />
        {entidade === "pessoas" && (
          <SelectFiltro parametro="papel" rotuloTodos="Clientes e fornecedores" opcoes={[{ valor: "clientes", rotulo: "Só clientes" }, { valor: "fornecedores", rotulo: "Só fornecedores" }]} />
        )}
        {entidade === "produtos" && (
          <SelectFiltro parametro="tipo" rotuloTodos="Produtos e serviços" opcoes={[{ valor: "PRODUTO", rotulo: "Produtos" }, { valor: "SERVICO", rotulo: "Serviços" }]} />
        )}
        {entidade === "ordens" && (
          <SelectFiltro parametro="situacao" rotuloTodos="Todas as situações" opcoes={[{ valor: "abertas", rotulo: "Abertas e em andamento" }, { valor: "concluidas", rotulo: "Concluídas" }, { valor: "canceladas", rotulo: "Canceladas" }]} />
        )}
        {entidade === "categorias" && (
          <SelectFiltro parametro="tipo" rotuloTodos="Receitas e despesas" opcoes={[{ valor: "RECEITA", rotulo: "Receitas" }, { valor: "DESPESA", rotulo: "Despesas" }]} />
        )}
      </div>

      {listagem.linhas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum registro encontrado"
          descricao={sp.q ? "Ajuste a busca ou os filtros." : `Cadastre o primeiro ${meta.singular}.`}
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {listagem.colunas.map((c) => (
                  <TableHead key={c.titulo} className={c.classe}>
                    {c.titulo}
                  </TableHead>
                ))}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {listagem.linhas.map((l) => (
                <TableRow key={l.id} className={l.ativo ? undefined : "opacity-60"}>
                  {l.celulas.map((cel, i) => (
                    <TableCell key={i} className={listagem.colunas[i]?.classe}>
                      {cel}
                    </TableCell>
                  ))}
                  <TableCell>
                    <AcoesLinhaCadastro
                      entidade={entidade}
                      id={l.id}
                      ativo={l.ativo}
                      valores={l.valores}
                      rotulo={l.rotulo}
                      podeEditar={editar}
                      opcoesDinamicas={opcoesDinamicas}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Paginacao pagina={pagina} total={listagem.total} porPagina={POR_PAGINA} />
    </>
  );
}
