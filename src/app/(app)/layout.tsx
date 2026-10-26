import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { BuscaGlobal } from "@/components/layout/busca-global";
import { MenuUsuario } from "@/components/layout/menu-usuario";
import { BotaoManual } from "@/components/layout/botao-manual";
import { exigirUsuario } from "@/lib/auth/sessao";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { pode } from "@/lib/auth/permissoes";
import { contarPendenciasHoje } from "@/modules/crm/consultas";
import { contarNotasPendentes } from "@/modules/fiscal/consultas";
import { sair } from "@/modules/auth/acoes";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
  let escopo;
  try {
    escopo = await escopoEmpresa();
  } catch {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-xl font-semibold">Nenhuma empresa liberada</h1>
          <p className="text-sm text-muted-foreground">
            Seu usuário ainda não tem acesso a nenhuma empresa. Peça a um administrador para liberar em Configurações › Usuários.
          </p>
          <form action={sair}>
            <button className="text-sm font-medium text-primary underline">Sair</button>
          </form>
        </div>
      </main>
    );
  }
  // selo no menu: atividades minhas atrasadas ou de hoje
  const pendentes = pode(u.papel, "crm:ver") ? await contarPendenciasHoje(u.id).catch(() => 0) : 0;
  // selo no menu: NF-e recebidas sem manifestação final
  const notas = pode(u.papel, "fiscal:ver") ? await contarNotasPendentes(escopo.ids).catch(() => 0) : 0;
  return (
    <SidebarProvider>
      <AppSidebar papel={u.papel} empresa={escopo.ativa} empresas={escopo.disponiveis} selos={{ "/crm/atividades": pendentes, "/fiscal/recebidas": notas }} />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5" />
          <BuscaGlobal papel={u.papel} />
          <div className="ml-auto flex items-center gap-1">
            <BotaoManual />
            <MenuUsuario nome={u.nome} email={u.email} papel={u.papel} />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
