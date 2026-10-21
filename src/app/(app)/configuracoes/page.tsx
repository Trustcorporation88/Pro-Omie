import { redirect } from "next/navigation";

// /configuracoes não tem tela própria: leva para a primeira página da Administração.
export default function ConfiguracoesPage() {
  redirect("/configuracoes/empresa");
}
