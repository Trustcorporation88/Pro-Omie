import { cn } from "@/lib/utils";

type Tom = "neutro" | "sucesso" | "alerta" | "perigo" | "info" | "roxo";

const TONS: Record<Tom, string> = {
  neutro: "bg-muted text-muted-foreground",
  sucesso: "bg-success/12 text-success",
  alerta: "bg-warning/15 text-[oklch(0.5_0.13_65)] dark:text-warning",
  perigo: "bg-destructive/10 text-destructive",
  info: "bg-primary/10 text-primary",
  roxo: "bg-chart-5/12 text-chart-5",
};

export function Selo({ tom = "neutro", children, className }: { tom?: Tom; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONS[tom], className)}>
      {children}
    </span>
  );
}

export function SeloAtivo({ ativo }: { ativo: boolean }) {
  return <Selo tom={ativo ? "sucesso" : "neutro"}>{ativo ? "Ativo" : "Inativo"}</Selo>;
}
