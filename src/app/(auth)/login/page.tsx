import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/sessao";
import { FormLogin } from "./form-login";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ voltar?: string; senha?: string }> }) {
  if (await usuarioAtual()) redirect("/");
  const { voltar, senha } = await searchParams;
  const semUsuarios = (await prisma.usuario.count()) === 0;
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold tracking-tight">Entrar</h2>
        <p className="text-sm text-muted-foreground">Use o e-mail e a senha cadastrados pelo administrador.</p>
      </div>
      {semUsuarios ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Nenhum usuário cadastrado ainda. Abra o <strong>link de configuração inicial</strong> recebido para criar a
          empresa e o administrador. <Link href="/setup" className="text-primary underline">Saiba mais</Link>
        </div>
      ) : (
        <>
          {senha === "redefinida" && (
            <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
              Senha redefinida. Entre com a nova senha.
            </p>
          )}
          <FormLogin voltar={voltar ?? ""} />
        </>
      )}
    </div>
  );
}
