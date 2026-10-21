"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { CampoMoeda } from "@/components/campo-moeda";
import { baixarTituloAcao } from "@/modules/financeiro/acoes";
import { diffDias } from "@/lib/datas";
import { arred2, fmtData, fmtMoeda } from "@/lib/format";
import type { Opcao } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { Campo, CampoSelect, ItemResumo } from "./campos";
import { TEXTOS, type TituloLinha } from "./tipos";

type TituloBaixa = Pick<
  TituloLinha,
  "id" | "numero" | "tipo" | "pessoaNome" | "descricao" | "vencimento" | "valor" | "valorPago" | "contaBancariaId" | "formaPagamentoId"
>;

/** Diálogo de baixa (recebimento/pagamento) total ou parcial, com juros, multa e desconto. */
export function DialogoBaixa({
  titulo,
  contas,
  formas,
  hoje,
  aberto,
  onAbertoChange,
}: {
  titulo: TituloBaixa;
  contas: Opcao[];
  formas: Opcao[];
  hoje: string;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const tx = TEXTOS[titulo.tipo];
  const saldo = arred2(titulo.valor - titulo.valorPago);
  const [data, setData] = useState(hoje);
  const [conta, setConta] = useState(
    titulo.contaBancariaId && contas.some((c) => c.valor === titulo.contaBancariaId) ? titulo.contaBancariaId : (contas[0]?.valor ?? ""),
  );
  const [forma, setForma] = useState(titulo.formaPagamentoId && formas.some((f) => f.valor === titulo.formaPagamentoId) ? titulo.formaPagamentoId : "");
  const [valor, setValor] = useState(saldo);
  const [juros, setJuros] = useState(0);
  const [multa, setMulta] = useState(0);
  const [desconto, setDesconto] = useState(0);
  const [observacao, setObservacao] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, iniciar] = useTransition();

  const total = arred2(valor + juros + multa - desconto);
  const atraso = titulo.vencimento < hoje ? diffDias(titulo.vencimento, hoje) : 0;
  const restante = arred2(saldo - valor);

  function validar() {
    const e: Record<string, string> = {};
    if (!data) e.data = "Informe a data.";
    else if (data > hoje) e.data = "A data não pode ser futura.";
    if (!conta) e.contaBancariaId = "Selecione a conta.";
    if (!(valor > 0)) e.valor = "Informe um valor maior que zero.";
    else if (valor > saldo + 0.005) e.valor = `O valor não pode passar do saldo (${fmtMoeda(saldo)}).`;
    if (total < 0) e.desconto = "O desconto não pode ser maior que o valor pago.";
    return e;
  }

  function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validar();
    setErros(e);
    if (Object.keys(e).length) return void toast.error(Object.values(e)[0]);
    iniciar(async () => {
      const r = await baixarTituloAcao({
        tituloId: titulo.id,
        data,
        contaBancariaId: conta,
        formaPagamentoId: forma || null,
        valor,
        juros,
        multa,
        desconto,
        observacao,
      });
      if (r.ok) {
        toast.success(restante > 0.005 ? `Baixa parcial registrada. Restam ${fmtMoeda(restante)}.` : (r.mensagem ?? "Baixa registrada."));
        onAbertoChange(false);
        router.refresh();
      } else {
        setErros(r.campos ?? {});
        toast.error(r.erro);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !salvando && onAbertoChange(a)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={salvar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>
              {tx.baixa} do título #{titulo.numero}
            </DialogTitle>
            <DialogDescription className="truncate">
              {titulo.pessoaNome ? `${titulo.pessoaNome} · ` : ""}
              {titulo.descricao}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5 rounded-lg bg-muted/50 p-3">
            <ItemResumo rotulo="Vencimento">
              <span className={cn("tabular", atraso > 0 && "text-destructive")}>
                {fmtData(titulo.vencimento)}
                {atraso > 0 && ` · ${atraso} dia${atraso > 1 ? "s" : ""} em atraso`}
              </span>
            </ItemResumo>
            <ItemResumo rotulo="Valor do título">
              <span className="tabular">{fmtMoeda(titulo.valor)}</span>
            </ItemResumo>
            <ItemResumo rotulo={`Já ${tx.baixado.toLowerCase()}`}>
              <span className="tabular">{fmtMoeda(titulo.valorPago)}</span>
            </ItemResumo>
            <ItemResumo rotulo="Saldo em aberto">
              <span className="tabular">{fmtMoeda(saldo)}</span>
            </ItemResumo>
          </div>

          {contas.length === 0 ? (
            <p className="text-sm text-destructive">
              Nenhuma conta bancária ativa.{" "}
              <Link href="/cadastros/contas-bancarias" className="underline">
                Cadastre uma conta
              </Link>{" "}
              para registrar a baixa.
            </p>
          ) : (
            <div className="grid grid-cols-6 gap-3">
              <Campo className="col-span-6 sm:col-span-2" id="bx-data" rotulo="Data" obrigatorio erro={erros.data}>
                <Input id="bx-data" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} aria-invalid={!!erros.data} />
              </Campo>
              <Campo className="col-span-6 sm:col-span-4" id="bx-conta" rotulo="Conta" obrigatorio erro={erros.contaBancariaId}>
                <CampoSelect
                  id="bx-conta"
                  opcoes={contas}
                  valor={conta}
                  onChange={setConta}
                  vazio={conta ? undefined : "Selecione…"}
                  aria-invalid={!!erros.contaBancariaId}
                />
              </Campo>
              <Campo className="col-span-6 sm:col-span-3" id="bx-forma" rotulo="Forma de pagamento">
                <CampoSelect id="bx-forma" opcoes={formas} valor={forma} onChange={setForma} vazio="—" />
              </Campo>
              <Campo
                className="col-span-6 sm:col-span-3"
                id="bx-valor"
                rotulo={`Valor a ${tx.baixar.toLowerCase()}`}
                obrigatorio
                erro={erros.valor}
                ajuda={restante > 0.005 && valor > 0 ? `Baixa parcial: restarão ${fmtMoeda(restante)}.` : undefined}
              >
                <CampoMoeda id="bx-valor" valor={valor} onChange={setValor} aria-invalid={!!erros.valor} />
              </Campo>
              <Campo className="col-span-2" id="bx-juros" rotulo="Juros" erro={erros.juros}>
                <CampoMoeda id="bx-juros" valor={juros} onChange={setJuros} />
              </Campo>
              <Campo className="col-span-2" id="bx-multa" rotulo="Multa" erro={erros.multa}>
                <CampoMoeda id="bx-multa" valor={multa} onChange={setMulta} />
              </Campo>
              <Campo className="col-span-2" id="bx-desconto" rotulo="Desconto" erro={erros.desconto}>
                <CampoMoeda id="bx-desconto" valor={desconto} onChange={setDesconto} aria-invalid={!!erros.desconto} />
              </Campo>
              <Campo className="col-span-6" id="bx-observacao" rotulo="Observação">
                <Textarea id="bx-observacao" rows={2} maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
              </Campo>
            </div>
          )}

          <Separator />
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">
              Total {tipoTotal(titulo.tipo)} <span className="text-xs">(valor + juros + multa − desconto)</span>
            </span>
            <span className={cn("text-lg font-semibold tabular", titulo.tipo === "RECEBER" ? "text-success" : "text-destructive")}>
              {fmtMoeda(total)}
            </span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
              Voltar
            </Button>
            <Button type="submit" disabled={salvando || contas.length === 0}>
              {salvando && <LoaderCircle className="animate-spin" />}
              Confirmar {tx.baixa.toLowerCase()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function tipoTotal(tipo: TituloLinha["tipo"]) {
  return tipo === "RECEBER" ? "recebido" : "pago";
}
