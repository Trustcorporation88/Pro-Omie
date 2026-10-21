"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Building,
  Calculator,
  CalendarClock,
  ChartLine,
  CircleArrowDown,
  CircleArrowUp,
  CreditCard,
  FileChartColumn,
  GitCompareArrows,
  Landmark,
  LayoutDashboard,
  Package,
  Receipt,
  Repeat,
  ScrollText,
  ShoppingCart,
  Tags,
  Target,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { MarcaIcone } from "@/components/marca";
import { NAVEGACAO } from "./navegacao";
import { pode, type PapelUsuario } from "@/lib/auth/permissoes";

const ICONES: Record<string, LucideIcon> = {
  Boxes,
  Building,
  Calculator,
  CalendarClock,
  ChartLine,
  CircleArrowDown,
  CircleArrowUp,
  CreditCard,
  FileChartColumn,
  GitCompareArrows,
  Landmark,
  LayoutDashboard,
  Package,
  Receipt,
  Repeat,
  ScrollText,
  ShoppingCart,
  Tags,
  Target,
  UserCog,
  Users,
  Wallet,
};

export function AppSidebar({ papel, empresa }: { papel: PapelUsuario; empresa: string }) {
  const pathname = usePathname();
  const ativo = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <MarcaIcone className="size-8" />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold text-white">Pro Omie</span>
                  <span className="truncate text-xs opacity-70">{empresa}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {NAVEGACAO.map((grupo) => {
          const itens = grupo.itens.filter((i) => !i.permissao || pode(papel, i.permissao));
          if (!itens.length) return null;
          return (
            <SidebarGroup key={grupo.titulo}>
              <SidebarGroupLabel>{grupo.titulo}</SidebarGroupLabel>
              <SidebarMenu>
                {itens.map((item) => {
                  const Icone = ICONES[item.icone] ?? LayoutDashboard;
                  if (item.emBreve) {
                    return (
                      <SidebarMenuItem key={item.titulo}>
                        <SidebarMenuButton tooltip={`${item.titulo} (${item.emBreve})`} className="opacity-50" aria-disabled>
                          <Icone />
                          <span>{item.titulo}</span>
                        </SidebarMenuButton>
                        <SidebarMenuBadge className="text-[10px] opacity-60">{item.emBreve}</SidebarMenuBadge>
                      </SidebarMenuItem>
                    );
                  }
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={ativo(item.href)} tooltip={item.titulo}>
                        <Link href={item.href}>
                          <Icone />
                          <span>{item.titulo}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="px-4 py-3 text-[11px] opacity-50 group-data-[collapsible=icon]:hidden">
        Fases 0 e 1 · Fundação e Financeiro
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
