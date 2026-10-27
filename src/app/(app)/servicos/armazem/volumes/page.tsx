import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, CampoBusca, Paginacao, SelectFiltro } from "@/components/filtros";
import { Localizar, TabelaVolumes } from "@/components/armazem/listas";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { POR_PAGINA_ARMAZEM, depositantesArmazem, estabelecimentosArmazem, lerFiltrosVolumes, listarVolumes } from "@/modules/armazem/consultas";

export const metadata: Metadata = { title: "Caixas e pallets" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("armazem:ver");
  const f = lerFiltrosVolumes(await searchParams);
  const escopo = await escopoEmpresa();
  const [dados, depositantes, estabelecimentos] = await Promise.all([listarVolumes(f), depositantesArmazem(escopo), estabelecimentosArmazem(escopo)]);
  const semFiltro = new URLSearchParams(Object.entries({ situacao: f.situacao === "ativos" ? "" : f.situacao, depositante: f.depositante, q: f.q, estab: f.estab }).filter(([, v]) => v));
  return (
    <>
      <Link href="/servicos/armazem" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Itens armazenados
      </Link>
      <PageHeader titulo="Caixas e pallets" descricao="Os volumes numerados do armazém: o que tem dentro, onde estão e de quem são. Marque vários para endereçar, imprimir etiquetas ou dar saída." />
      <Localizar className="mb-5" />
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AbasFiltro
            parametro="situacao"
            padrao="ativos"
            opcoes={[
              { valor: "ativos", rotulo: "No armazém", contador: dados.contagens.ativos },
              { valor: "conferencia", rotulo: "Em conferência", contador: dados.contagens.conferencia },
              { valor: "sem-endereco", rotulo: "Sem endereço", contador: dados.contagens["sem-endereco"] },
              { valor: "armazenados", rotulo: "Armazenados", contador: dados.contagens.armazenados },
              { valor: "expedidos", rotulo: "Expedidos", contador: dados.contagens.expedidos },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {depositantes.length > 1 && <SelectFiltro parametro="depositante" rotuloTodos="Todos os depositantes" opcoes={depositantes.map((d) => ({ valor: d.id, rotulo: d.nome }))} />}
          {estabelecimentos.length > 1 && <SelectFiltro parametro="estab" rotuloTodos="Todos os estabelecimentos" opcoes={estabelecimentos.map((e) => ({ valor: e.id, rotulo: e.nome }))} />}
          {dados.endereco && (
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/servicos/armazem/volumes?${semFiltro.toString()}`}>
                Endereço {dados.endereco.codigo} <X />
              </Link>
            </Button>
          )}
          <CampoBusca placeholder="CX-0012, código, lote, endereço…" className="w-full sm:ml-auto sm:w-72" />
        </div>
      </div>
      {dados.linhas.length === 0 ? (
        <EstadoVazio titulo="Nenhum volume neste filtro" descricao="Caixas e pallets nascem na conferência de um recebimento (Serviços › Recebimentos)." />
      ) : (
        <TabelaVolumes linhas={dados.linhas} podeEditar={pode(u.papel, "armazem:editar")} />
      )}
      <Paginacao pagina={f.pagina} total={dados.total} porPagina={POR_PAGINA_ARMAZEM} />
    </>
  );
}
