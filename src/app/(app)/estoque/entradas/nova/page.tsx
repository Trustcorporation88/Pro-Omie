import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { FormularioEntrada } from "@/components/estoque/formularios";
import { BotaoMateriaisPadrao } from "@/components/estoque/dialogos-materiais";
import { exigirUsuario } from "@/lib/auth/sessao";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { hojeISO } from "@/lib/datas";
import { carregarEstabelecimentos, carregarMateriais } from "@/modules/estoque/consultas";

export const metadata: Metadata = { title: "Nova entrada no estoque" };

export default async function Pagina() {
  await exigirUsuario("estoque:editar");
  const escopo = await escopoEmpresa();
  const [materiais, estabelecimentos] = await Promise.all([carregarMateriais(escopo), carregarEstabelecimentos(escopo)]);
  const ativos = materiais.filter((m) => m.ativo);
  const estabs = estabelecimentos.filter((e) => e.ativo);
  return (
    <>
      <Link href="/estoque" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Estoque
      </Link>
      <PageHeader titulo="Nova entrada" descricao="Material que saiu da produção ou da triagem e foi para o pátio." />
      {ativos.length === 0 ? (
        <EstadoVazio titulo="Nenhum material cadastrado" descricao="Escolha primeiro os materiais que a empresa vende.">
          <BotaoMateriaisPadrao codigosExistentes={[]} destaque />
        </EstadoVazio>
      ) : (
        <FormularioEntrada materiais={ativos} estabelecimentos={estabs} padraoEstabelecimento={escopo.ativa.id} hoje={hojeISO()} />
      )}
    </>
  );
}
