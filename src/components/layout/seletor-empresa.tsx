"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { MarcaIcone, NomeMarca } from "@/components/marca";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fmtDocumento } from "@/lib/format";
import { trocarEmpresa } from "@/modules/auth/acoes";
import type { EmpresaResumo } from "@/lib/auth/empresa";

/**
 * Cabeçalho do menu: marca e empresa ativa. Com mais de uma empresa liberada, vira um seletor.
 * Trocar de empresa grava a preferência e volta ao painel.
 */
export function SeletorEmpresa({ ativa, disponiveis }: { ativa: EmpresaResumo; disponiveis: EmpresaResumo[] }) {
  const [trocando, startTransition] = useTransition();
  const varias = disponiveis.length > 1;

  const cabecalho = (
    <>
      <MarcaIcone className="size-8 rounded-md" />
      <div className="grid flex-1 text-left leading-tight">
        <NomeMarca tom="escuro" className="text-white" />
        <span className="truncate text-xs opacity-70">{ativa.nome}</span>
      </div>
      {varias && <ChevronsUpDown className="ml-auto size-4 opacity-70" aria-hidden />}
    </>
  );

  if (!varias) {
    return (
      <SidebarMenuButton size="lg" asChild>
        <Link href="/">{cabecalho}</Link>
      </SidebarMenuButton>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          aria-label={`Empresa ativa: ${ativa.nome}. Trocar de empresa`}
          disabled={trocando}
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          {cabecalho}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={6} className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Empresa ativa</DropdownMenuLabel>
        {disponiveis.map((e) => {
          const atual = e.id === ativa.id;
          return (
            <DropdownMenuItem
              key={e.id}
              disabled={atual || trocando}
              onSelect={() =>
                startTransition(async () => {
                  const r = await trocarEmpresa(e.id);
                  if (r && !r.ok) toast.error(r.erro);
                })
              }
              className="gap-3"
            >
              <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{e.nome}</div>
                <div className="truncate text-xs text-muted-foreground">{fmtDocumento(e.cnpj)}</div>
              </div>
              {atual && <Check className="size-4 shrink-0" aria-label="atual" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-xs text-muted-foreground">Lançamentos, contas e relatórios mostram só a empresa ativa.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
