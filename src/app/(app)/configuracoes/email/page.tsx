import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ConfiguracaoEmail } from "@/components/email/configuracao-email";
import { exigirUsuario } from "@/lib/auth/sessao";
import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/auth/empresa";
import { estadoEmail, listarEmails } from "@/modules/email/consultas";

export const metadata: Metadata = { title: "E-mails" };

export default async function Pagina() {
  const u = await exigirUsuario("config:admin");
  const { ctx } = await exigirAdmin();
  if (!ctx.adminDoGrupo) redirect("/sem-permissao");
  const [estado, fila] = [estadoEmail(), await listarEmails()];
  return (
    <>
      <PageHeader titulo="E-mails" descricao="Envio de propostas, pedidos e notas ao cliente, senha provisória, “esqueci minha senha” e avisos automáticos. Tudo sai pela Resend com o domínio da empresa." />
      <ConfiguracaoEmail estado={estado} emails={fila.emails} pendentes={fila.pendentes} falhos={fila.falhos} emailAdmin={u.email} />
    </>
  );
}
