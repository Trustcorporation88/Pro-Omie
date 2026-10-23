import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { FormularioAjuste } from "@/components/estoque/formularios";
import { exigirUsuario } from "@/lib/auth/sessao";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { hojeISO } from "@/lib/datas";
import { carregarEstabelecimentos, carregarMateriais } from "@/modules/estoque/consultas";

export const metadata: Metadata = { title: "Ajustar estoque" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Pagina({ searchParams }: Props) {
  await exigirUsuario("estoque:editar");
  const sp = await searchParams;
  const escopo = await escopoEmpresa();
  const [materiais, estabelecimentos] = await Promise.all([carregarMateriais(escopo), carregarEstabelecimentos(escopo)]);
  const estabs = estabelecimentos.filter((e) => e.ativo);
  return (
    <>
      <Link href="/estoque" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Estoque
      </Link>
      <PageHeader titulo="Ajustar estoque" descricao="Inventário, perda de peso (umidade), quebra ou correção de lançamento." />
      {materiais.length === 0 ? (
        <EstadoVazio titulo="Nenhum material cadastrado" descricao="Cadastre os materiais antes de ajustar o estoque." />
      ) : (
        <FormularioAjuste
          materiais={materiais}
          estabelecimentos={estabs}
          padraoEstabelecimento={escopo.ativa.id}
          hoje={hojeISO()}
          materialInicial={typeof sp.material === "string" ? sp.material : null}
        />
      )}
    </>
  );
}
