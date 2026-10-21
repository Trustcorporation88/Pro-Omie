import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { BuscaGlobal } from "@/components/layout/busca-global";
import { MenuUsuario } from "@/components/layout/menu-usuario";
import { exigirUsuario } from "@/lib/auth/sessao";
import { prisma } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
  const matriz = await prisma.empresa.findFirst({ where: { matrizId: null }, select: { nomeFantasia: true, razaoSocial: true } });
  return (
    <SidebarProvider>
      <AppSidebar papel={u.papel} empresa={matriz?.nomeFantasia || matriz?.razaoSocial || "Trustcorp"} />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5" />
          <BuscaGlobal papel={u.papel} />
          <div className="ml-auto">
            <MenuUsuario nome={u.nome} email={u.email} papel={u.papel} />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
