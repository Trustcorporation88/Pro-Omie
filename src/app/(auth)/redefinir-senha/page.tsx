import type { Metadata } from "next";
import Link from "next/link";
import { FormRedefinirSenha } from "./form";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function Pagina({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold tracking-tight">Definir nova senha</h2>
        <p className="text-sm text-muted-foreground">Escolha a nova senha do seu acesso. As outras sessões abertas são encerradas.</p>
      </div>
      {token ? (
        <FormRedefinirSenha token={token} />
      ) : (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Link incompleto. Peça um novo em{" "}
          <Link href="/esqueci-senha" className="underline">
            Esqueci minha senha
          </Link>
          .
        </p>
      )}
    </div>
  );
}
