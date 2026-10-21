import { Marca } from "@/components/marca";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <Marca className="relative text-white" />
        <div className="relative max-w-md space-y-5">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Financeiro, vendas, estoque e fiscal no mesmo lugar, sem digitar nada duas vezes.
          </h1>
          <ul className="space-y-2 text-sm">
            <li>• Contas a pagar e receber com baixa, rateio e conciliação OFX</li>
            <li>• Fluxo de caixa realizado e previsto, DRE gerencial</li>
            <li>• Auditoria completa de cada alteração</li>
          </ul>
        </div>
        <p className="relative text-xs opacity-60">Pro Omie · uso interno Trustcorp</p>
      </aside>
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <Marca className="mb-8 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
