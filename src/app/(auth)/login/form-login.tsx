"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { entrar } from "@/modules/auth/acoes";

export function FormLogin({ voltar }: { voltar: string }) {
  const [estado, acao, pendente] = useActionState(entrar, null);
  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="voltar" value={voltar} />
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="senha">Senha</Label>
        <Input id="senha" name="senha" type="password" autoComplete="current-password" required />
      </div>
      {estado && !estado.ok && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {estado.erro}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pendente}>
        {pendente && <Loader2 className="animate-spin" />} Entrar
      </Button>
    </form>
  );
}
