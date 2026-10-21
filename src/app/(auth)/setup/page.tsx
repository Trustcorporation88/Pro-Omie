import type { Metadata } from "next";
import Link from "next/link";
import { setupDisponivel } from "@/modules/auth/acoes";
import { FormSetup } from "./form-setup";

export const metadata: Metadata = { title: "Configuração inicial" };

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const status = await setupDisponivel(token);

  if (status === "concluido") {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Configuração concluída</h2>
        <p className="text-sm text-muted-foreground">A empresa e o administrador já foram criados.</p>
        <Link href="/login" className="text-sm font-medium text-primary underline">
          Ir para o login
        </Link>
      </div>
    );
  }
  if (status === "token") {
    return (
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Link de configuração necessário</h2>
        <p className="text-sm text-muted-foreground">
          Por segurança, a configuração inicial só abre pelo link com token gerado na implantação. Use o link
          completo que você recebeu.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold tracking-tight">Configuração inicial</h2>
        <p className="text-sm text-muted-foreground">
          Cadastre a empresa (matriz) e o primeiro administrador. Categorias, formas de pagamento e a conta Caixa
          são criadas automaticamente.
        </p>
      </div>
      <FormSetup token={token} />
    </div>
  );
}
