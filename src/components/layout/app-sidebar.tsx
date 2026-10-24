"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Boxes,
  Building,
  Calculator,
  CalendarClock,
  ChartColumn,
  ChartLine,
  CircleArrowDown,
  CircleArrowUp,
  CreditCard,
  FileArchive,
  FileBadge,
  FileChartColumn,
  FileInput,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  Landmark,
  LayoutDashboard,
  ListTodo,
  Mail,
  Package,
  Wrench,
  PackagePlus,
  Receipt,
  Repeat,
  ScrollText,
  ShoppingCart,
  SquareKanban,
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
import { SeletorEmpresa } from "@/components/layout/seletor-empresa";
import type { EmpresaResumo } from "@/lib/auth/empresa";
import { NAVEGACAO } from "./navegacao";
import { pode, type PapelUsuario } from "@/lib/auth/permissoes";

const ICONES: Record<string, LucideIcon> = {
  ArrowLeftRight,
  Boxes,
  Building,
  Calculator,
  CalendarClock,
  ChartColumn,
  ChartLine,
  CircleArrowDown,
  CircleArrowUp,
  CreditCard,
  FileArchive,
  FileBadge,
  FileChartColumn,
  FileInput,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  Landmark,
  LayoutDashboard,
  ListTodo,
  Mail,
  Package,
  Wrench,
  PackagePlus,
  Receipt,
  Repeat,
  ScrollText,
  ShoppingCart,
  SquareKanban,
  Tags,
  Target,
  UserCog,
  Users,
  Wallet,
};

export function AppSidebar({
  papel,
  empresa,
  empresas,
  selos = {},
}: {
  papel: PapelUsuario;
  empresa: EmpresaResumo;
  empresas: EmpresaResumo[];
  /** contadores por href (ex.: atividades pendentes de hoje) */
  selos?: Record<string, number>;
}) {
  const pathname = usePathname();
  // ativo = o item de caminho mais longo que casa com a página (em /estoque/movimentacoes só "Movimentações" acende, não "Saldos")
  const casa = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const maisLongo = NAVEGACAO.flatMap((g) => g.itens)
    .filter((i) => !i.emBreve && i.href && casa(i.href))
    .reduce((a, i) => (i.href.length > a.length ? i.href : a), "");
  const ativo = (href: string) => href === maisLongo;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SeletorEmpresa ativa={empresa} disponiveis={empresas} />
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
                        <SidebarMenuButton tooltip={`${item.titulo} (${item.emBreve})`} className="pr-12 opacity-50" aria-disabled>
                          <Icone />
                          <span title={item.titulo}>{item.titulo}</span>
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
                      {!!selos[item.href] && (
                        <SidebarMenuBadge className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground" aria-label={`${selos[item.href]} pendentes hoje`}>
                          {selos[item.href]! > 99 ? "99+" : selos[item.href]}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="px-4 py-3 text-[11px] opacity-50 group-data-[collapsible=icon]:hidden">
        Financeiro · vendas · estoque · fiscal · serviços
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
