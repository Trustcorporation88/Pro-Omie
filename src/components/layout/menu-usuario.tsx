"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { ChevronsUpDown, KeyRound, LogOut, Moon, Sun } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sair } from "@/modules/auth/acoes";
import { ROTULO_PAPEL, type PapelUsuario } from "@/lib/auth/permissoes";

export function MenuUsuario({ nome, email, papel }: { nome: string; email: string; papel: PapelUsuario }) {
  const { resolvedTheme, setTheme } = useTheme();
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{iniciais}</AvatarFallback>
        </Avatar>
        <div className="hidden leading-tight sm:block">
          <div className="max-w-40 truncate font-medium">{nome}</div>
          <div className="text-xs text-muted-foreground">{ROTULO_PAPEL[papel]}</div>
        </div>
        <ChevronsUpDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">{nome}</div>
          <div className="truncate text-xs text-muted-foreground">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/trocar-senha">
            <KeyRound /> Trocar senha
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          {resolvedTheme === "dark" ? <Sun /> : <Moon />} Tema {resolvedTheme === "dark" ? "claro" : "escuro"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void sair()}>
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
