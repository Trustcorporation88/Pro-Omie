"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { gerarContratosAgora } from "@/modules/servicos/acoes";

/** Botão da tela de contratos: gera as competências pendentes (o cron faz isso todo dia às 6h15). */
export function GerarContratos() {
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const r = await gerarContratosAgora();
          if (r.ok) toast[r.data && r.data.erros.length ? "warning" : "success"](r.mensagem ?? "Feito.", { duration: 12000 });
          else toast.error(r.erro, { duration: 10000 });
          router.refresh();
        })
      }
    >
      {pendente ? <LoaderCircle className="animate-spin" /> : <CalendarPlus />} Gerar competências pendentes
    </Button>
  );
}
