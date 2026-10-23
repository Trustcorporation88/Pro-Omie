"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buscarNotasAgora } from "@/modules/fiscal/acoes";

/** Dispara a busca na hora (respeitando a regra de 1 hora da SEFAZ, conferida no servidor). */
export function BotaoBuscarAgora({ empresaId, variante = "default" }: { empresaId?: string; variante?: "default" | "outline" }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <Button
      variant={variante}
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const id = toast.loading("Buscando notas na SEFAZ… pode levar até um minuto.");
          const r = await buscarNotasAgora(empresaId);
          toast.dismiss(id);
          if (r.ok) toast.success(r.mensagem ?? "Busca concluída.", { duration: 9000 });
          else toast.error(r.erro, { duration: 12000 });
          router.refresh();
        })
      }
    >
      {pendente ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Buscar agora
    </Button>
  );
}
