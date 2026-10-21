"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { estornarBaixaAcao } from "@/modules/financeiro/acoes";

/** Botão "Estornar" de uma baixa ativa (com confirmação). */
export function BotaoEstornarBaixa({ baixaId, resumo, conciliada }: { baixaId: string; resumo: string; conciliada: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="ghost" size="xs" onClick={() => setAberto(true)} aria-label={`Estornar baixa: ${resumo}`}>
        <Undo2 /> Estornar
      </Button>
      <ConfirmarAcao
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo="Estornar esta baixa?"
        descricao={
          <div className="space-y-2">
            <p>{resumo}</p>
            <p>O movimento na conta bancária é removido e o saldo do título volta a ficar em aberto. A baixa continua no histórico como estornada.</p>
            {conciliada && <p className="font-medium text-destructive">Este movimento está conciliado: a conciliação com o extrato será desfeita.</p>}
          </div>
        }
        rotuloConfirmar="Estornar"
        destrutivo
        acao={() => estornarBaixaAcao(baixaId)}
      />
    </>
  );
}
