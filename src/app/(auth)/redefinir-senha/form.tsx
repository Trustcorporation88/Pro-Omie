"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { redefinirSenha } from "@/modules/email/acoes";

export function FormRedefinirSenha({ token }: { token: string }) {
  const [estado, acao, pendente] = useActionState(redefinirSenha, null);
  const erro = (k: string) => (estado && !estado.ok ? estado.campos?.[k] : undefined);
  const campo = (k: string, rotulo: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{rotulo}</Label>
      <Input id={k} name={k} type="password" autoComplete="new-password" required aria-invalid={!!erro(k)} />
      {erro(k) && <p className="text-xs text-destructive">{erro(k)}</p>}
    </div>
  );
  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {campo("senha", "Nova senha")}
      {campo("confirmar", "Confirmar nova senha")}
      <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres, com letras e números.</p>
      {estado && !estado.ok && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {estado.erro}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pendente}>
        {pendente && <Loader2 className="animate-spin" />} Salvar nova senha
      </Button>
    </form>
  );
}
