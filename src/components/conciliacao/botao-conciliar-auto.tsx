"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { conciliarAutomaticamente } from "@/modules/conciliacao/acoes";

/** Aplica de uma vez as sugestões de movimento com até 3 dias de diferença. */
export function BotaoConciliarAuto({ contaId, elegiveis, className }: { contaId: string; elegiveis: number; className?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        className={className}
        disabled={!elegiveis}
        title={elegiveis ? undefined : "Nenhuma sugestão de movimento com até 3 dias de diferença."}
        onClick={() => setAberto(true)}
      >
        <Sparkles /> Conciliar automaticamente
        {elegiveis > 0 && <span className="rounded-full bg-background px-1.5 text-xs tabular">{elegiveis}</span>}
      </Button>
      <ConfirmarAcao
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo={`Conciliar ${elegiveis} lançamento(s) automaticamente?`}
        descricao={
          <p>
            Cada lançamento do extrato será vinculado ao movimento sugerido de mesmo valor e data com até 3 dias de diferença. Vale para
            todos os pendentes desta conta, independentemente do filtro. Você pode desfazer qualquer vínculo na aba Conciliados.
          </p>
        }
        rotuloConfirmar="Conciliar"
        acao={() => conciliarAutomaticamente(contaId)}
      />
    </>
  );
}
