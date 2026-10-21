"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { baixarEmLoteAcao } from "@/modules/financeiro/acoes";
import { arred2, fmtMoeda } from "@/lib/format";
import type { Opcao } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { Campo, CampoSelect, ItemResumo } from "./campos";
import { TEXTOS, type TipoTitulo } from "./tipos";

/** Baixa em lote: quita o saldo de cada título selecionado numa única transação. */
export function DialogoBaixaLote({
  tipo,
  titulos,
  contas,
  formas,
  hoje,
  aberto,
  onAbertoChange,
  aoConcluir,
}: {
  tipo: TipoTitulo;
  titulos: { id: string; numero: number; saldo: number; vencimento: string }[];
  contas: Opcao[];
  formas: Opcao[];
  hoje: string;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  aoConcluir?: () => void;
}) {
  const router = useRouter();
  const tx = TEXTOS[tipo];
  const [data, setData] = useState(hoje);
  const [conta, setConta] = useState(contas[0]?.valor ?? "");
  const [forma, setForma] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, iniciar] = useTransition();
  const total = arred2(titulos.reduce((a, t) => a + t.saldo, 0));
  const vencidos = titulos.filter((t) => t.vencimento < hoje).length;

  function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!data) e.data = "Informe a data.";
    else if (data > hoje) e.data = "A data não pode ser futura.";
    if (!conta) e.contaBancariaId = "Selecione a conta.";
    setErros(e);
    if (Object.keys(e).length) return void toast.error(Object.values(e)[0]);
    iniciar(async () => {
      const r = await baixarEmLoteAcao({ tituloIds: titulos.map((t) => t.id), data, contaBancariaId: conta, formaPagamentoId: forma || null });
      if (r.ok) {
        toast.success(r.data ? `${r.data.quantidade} título(s) baixado(s) · ${fmtMoeda(r.data.total)}.` : (r.mensagem ?? "Baixa registrada."));
        onAbertoChange(false);
        aoConcluir?.();
        router.refresh();
      } else {
        setErros(r.campos ?? {});
        toast.error(r.erro);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !salvando && onAbertoChange(a)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={salvar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{tx.baixarSelecionados}</DialogTitle>
            <DialogDescription>O saldo em aberto de cada título será quitado na data e conta escolhidas.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 rounded-lg bg-muted/50 p-3">
            <ItemResumo rotulo="Títulos selecionados">
              <span className="tabular">{titulos.length}</span>
            </ItemResumo>
            {vencidos > 0 && (
              <ItemResumo rotulo="Vencidos">
                <span className="tabular text-destructive">{vencidos}</span>
              </ItemResumo>
            )}
            <ItemResumo rotulo={`Total a ${tx.baixar.toLowerCase()}`}>
              <span className={cn("text-base tabular", tipo === "RECEBER" ? "text-success" : "text-destructive")}>{fmtMoeda(total)}</span>
            </ItemResumo>
          </div>
          <div className="grid grid-cols-6 gap-3">
            <Campo className="col-span-6 sm:col-span-3" id="bl-data" rotulo="Data" obrigatorio erro={erros.data}>
              <Input id="bl-data" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} aria-invalid={!!erros.data} />
            </Campo>
            <Campo className="col-span-6 sm:col-span-3" id="bl-forma" rotulo="Forma de pagamento">
              <CampoSelect id="bl-forma" opcoes={formas} valor={forma} onChange={setForma} vazio="—" />
            </Campo>
            <Campo className="col-span-6" id="bl-conta" rotulo="Conta" obrigatorio erro={erros.contaBancariaId}>
              <CampoSelect
                id="bl-conta"
                opcoes={contas}
                valor={conta}
                onChange={setConta}
                vazio={conta ? undefined : "Selecione…"}
                aria-invalid={!!erros.contaBancariaId}
              />
            </Campo>
          </div>
          <p className="text-xs text-muted-foreground">
            Juros, multa, desconto ou baixas parciais devem ser lançados título a título. Se algum título falhar, nenhuma baixa é gravada.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
              Voltar
            </Button>
            <Button type="submit" disabled={salvando || contas.length === 0 || titulos.length === 0}>
              {salvando && <LoaderCircle className="animate-spin" />}
              {tx.baixar} {titulos.length} título(s)
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
