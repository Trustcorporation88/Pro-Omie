"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { cancelarTituloAcao, excluirTituloAcao, reabrirTituloAcao } from "@/modules/financeiro/acoes";
import { fmtData, fmtMoeda } from "@/lib/format";
import { DialogoBaixa } from "./dialogo-baixa";
import { FormularioLancamento } from "./formulario-lancamento";
import { TEXTOS, valoresDeTitulo, type OpcoesFormulario, type TituloLinha } from "./tipos";

export type DialogoTitulo = null | "baixar" | "editar" | "duplicar" | "cancelar" | "reabrir" | "excluir";

/** Diálogos das ações de um título (baixa, edição, duplicação, cancelamento, reabertura e exclusão). */
export function DialogosTitulo({
  titulo,
  dialogo,
  chave,
  onFechar,
  opcoes,
  hoje,
  redirecionarAoExcluir,
}: {
  titulo: TituloLinha;
  dialogo: DialogoTitulo;
  /** muda a cada abertura para remontar os formulários com valores limpos */
  chave: number;
  onFechar: () => void;
  opcoes: OpcoesFormulario;
  hoje: string;
  /** na página de detalhe: após excluir, volta para a lista */
  redirecionarAoExcluir?: boolean;
}) {
  const tx = TEXTOS[titulo.tipo];
  const fechar = (aberto: boolean) => {
    if (!aberto) onFechar();
  };
  const identificacao = `#${titulo.numero} · ${titulo.descricao} · ${fmtMoeda(titulo.valor)} · venc. ${fmtData(titulo.vencimento)}`;
  return (
    <>
      {dialogo === "baixar" && (
        <DialogoBaixa
          key={chave}
          titulo={titulo}
          contas={opcoes.contas}
          formas={opcoes.formas}
          hoje={hoje}
          aberto
          onAbertoChange={fechar}
        />
      )}
      {dialogo === "editar" && (
        <FormularioLancamento
          key={chave}
          tipo={titulo.tipo}
          opcoes={opcoes}
          hoje={hoje}
          aberto
          onAbertoChange={fechar}
          iniciais={valoresDeTitulo(titulo, "editar", hoje)}
          edicao={{ id: titulo.id, numero: titulo.numero, valorPago: titulo.valorPago }}
        />
      )}
      {dialogo === "duplicar" && (
        <FormularioLancamento
          key={chave}
          tipo={titulo.tipo}
          opcoes={opcoes}
          hoje={hoje}
          aberto
          onAbertoChange={fechar}
          iniciais={valoresDeTitulo(titulo, "duplicar", hoje)}
        />
      )}
      <ConfirmarAcao
        aberto={dialogo === "cancelar"}
        onAbertoChange={fechar}
        titulo={`Cancelar o título #${titulo.numero}?`}
        descricao={
          <div className="space-y-2">
            <p>{identificacao}</p>
            <p>O título sai dos saldos em aberto, mas continua no histórico. Você pode reabri-lo depois.</p>
          </div>
        }
        rotuloConfirmar="Cancelar título"
        destrutivo
        pedirMotivo
        acao={(motivo) => cancelarTituloAcao(titulo.id, motivo)}
      />
      <ConfirmarAcao
        aberto={dialogo === "reabrir"}
        onAbertoChange={fechar}
        titulo={`Reabrir o título #${titulo.numero}?`}
        descricao={<p>{identificacao}. O título volta para {tx.plural.toLowerCase()} em aberto.</p>}
        rotuloConfirmar="Reabrir"
        acao={() => reabrirTituloAcao(titulo.id)}
      />
      <ConfirmarExclusao
        aberto={dialogo === "excluir"}
        onAbertoChange={fechar}
        titulo={titulo}
        identificacao={identificacao}
        redirecionar={redirecionarAoExcluir ? tx.rota : undefined}
      />
    </>
  );
}

/** Confirmação de exclusão; na página de detalhe redireciona para a lista em vez de recarregar. */
function ConfirmarExclusao({
  aberto,
  onAbertoChange,
  titulo,
  identificacao,
  redirecionar,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  titulo: TituloLinha;
  identificacao: string;
  redirecionar?: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <AlertDialog open={aberto} onOpenChange={(a) => !pendente && onAbertoChange(a)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir o título #{titulo.numero}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>{identificacao}</p>
              <p>A exclusão é permanente e remove também rateio e anexos. Para manter o histórico, prefira cancelar.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendente}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            disabled={pendente}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              iniciar(async () => {
                const r = await excluirTituloAcao(titulo.id);
                if (!r.ok) return void toast.error(r.erro);
                toast.success(r.mensagem ?? "Título excluído.");
                onAbertoChange(false);
                if (redirecionar) router.replace(redirecionar);
                else router.refresh();
              });
            }}
          >
            {pendente && <LoaderCircle className="animate-spin" />} Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
