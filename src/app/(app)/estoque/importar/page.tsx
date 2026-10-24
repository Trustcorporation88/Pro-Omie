import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ImportarPlanilhaEstoque } from "@/components/estoque/importar-planilha";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { hojeISO } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { carregarEstabelecimentos } from "@/modules/estoque/consultas";

export const metadata: Metadata = { title: "Importar planilha · Estoque" };

export default async function Pagina() {
  const u = await exigirUsuario("estoque:editar");
  const escopo = await escopoEmpresa();
  const [estabelecimentos, totalMateriais] = await Promise.all([
    carregarEstabelecimentos(escopo),
    prisma.produto.count({ where: { empresaId: escopo.ativa.id, tipo: "PRODUTO", controlaEstoque: true, ativo: true } }),
  ]);
  return (
    <>
      <Link href="/estoque" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Estoque
      </Link>
      <PageHeader titulo="Importar planilha" descricao="Cadastre materiais e lance a entrada ou o inventário do estoque a partir de uma planilha do Excel." />
      <ImportarPlanilhaEstoque
        estabelecimentos={estabelecimentos.filter((e) => e.ativo).map((e) => ({ id: e.id, nome: e.nome, matriz: e.matriz }))}
        hoje={hojeISO()}
        totalMateriais={totalMateriais}
        podeCadastrar={pode(u.papel, "cadastros:editar")}
      />
    </>
  );
}
