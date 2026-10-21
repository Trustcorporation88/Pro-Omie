import type { Metadata } from "next";
import { exigirUsuario } from "@/lib/auth/sessao";
import { FormTrocarSenha } from "./form-trocar-senha";

export const metadata: Metadata = { title: "Trocar senha" };

export default async function TrocarSenhaPage() {
  const u = await exigirUsuario(undefined, { permitirTrocaSenha: true });
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold tracking-tight">{u.trocarSenha ? "Defina sua senha" : "Trocar senha"}</h2>
        <p className="text-sm text-muted-foreground">
          {u.trocarSenha
            ? `Olá, ${u.nome.split(" ")[0]}. Por segurança, troque a senha provisória antes de continuar.`
            : "Ao trocar a senha, as outras sessões abertas são encerradas."}
        </p>
      </div>
      <FormTrocarSenha />
    </div>
  );
}
