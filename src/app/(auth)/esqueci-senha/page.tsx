import type { Metadata } from "next";
import Link from "next/link";
import { FormEsqueciSenha } from "./form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function Pagina() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold tracking-tight">Esqueci minha senha</h2>
        <p className="text-sm text-muted-foreground">Informe o e-mail do seu acesso. Se ele existir, mandamos um link para definir uma senha nova (vale por 1 hora).</p>
      </div>
      <FormEsqueciSenha />
      <p className="text-sm text-muted-foreground">
        Lembrou?{" "}
        <Link href="/login" className="text-primary underline">
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
