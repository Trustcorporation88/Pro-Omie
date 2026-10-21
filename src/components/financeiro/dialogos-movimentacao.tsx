"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, LoaderCircle, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CampoMoeda } from "@/components/campo-moeda";
import { criarAjusteAcao, transferirAcao } from "@/modules/financeiro/acoes";
import type { Resultado } from "@/lib/acoes";
import type { Opcao } from "@/lib/rotulos";
import { Campo, CampoSelect, Segmentado } from "./campos";

type PropsDialogo = { contas: Opcao[]; contaAtualId: string | null; hoje: string; aberto: boolean; onAbertoChange: (v: boolean) => void };

function useEnvio(onAbertoChange: (v: boolean) => void) {
  const router = useRouter();
  const [salvando, iniciar] = useTransition();
  const [erros, setErros] = useState<Record<string, string>>({});
  const enviar = (validar: () => Record<string, string>, acao: () => Promise<Resultado>) => {
    const e = validar();
    setErros(e);
    if (Object.keys(e).length) return void toast.error(Object.values(e)[0]);
    iniciar(async () => {
      const r = await acao();
      if (r.ok) {
        toast.success(r.mensagem ?? "Feito.");
        onAbertoChange(false);
        router.refresh();
      } else {
        setErros(r.campos ?? {});
        toast.error(r.erro);
      }
    });
  };
  return { salvando, erros, enviar };
}

/** Transferência entre contas (débito na origem e crédito no destino). */
export function DialogoTransferencia({ contas, contaAtualId, hoje, aberto, onAbertoChange }: PropsDialogo) {
  const inicialOrigem = contaAtualId && contas.some((c) => c.valor === contaAtualId) ? contaAtualId : (contas[0]?.valor ?? "");
  const [origem, setOrigem] = useState(inicialOrigem);
  const [destino, setDestino] = useState(contas.find((c) => c.valor !== inicialOrigem)?.valor ?? "");
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState(0);
  const [descricao, setDescricao] = useState("");
  const { salvando, erros, enviar } = useEnvio(onAbertoChange);

  function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    enviar(
      () => {
        const e: Record<string, string> = {};
        if (!origem) e.contaOrigemId = "Selecione a conta de origem.";
        if (!destino) e.contaDestinoId = "Selecione a conta de destino.";
        else if (destino === origem) e.contaDestinoId = "Escolha contas diferentes.";
        if (!data) e.data = "Informe a data.";
        else if (data > hoje) e.data = "A data não pode ser futura.";
        if (!(valor > 0)) e.valor = "Informe um valor maior que zero.";
        return e;
      },
      () => transferirAcao({ contaOrigemId: origem, contaDestinoId: destino, data, valor, descricao }),
    );
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !salvando && onAbertoChange(a)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={salvar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="size-4" /> Transferência entre contas
            </DialogTitle>
            <DialogDescription>Gera uma saída na conta de origem e uma entrada na de destino, na mesma data.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-3">
            <Campo className="col-span-6" id="tr-origem" rotulo="Conta de origem" obrigatorio erro={erros.contaOrigemId}>
              <CampoSelect id="tr-origem" opcoes={contas} valor={origem} onChange={setOrigem} vazio={origem ? undefined : "Selecione…"} />
            </Campo>
            <Campo className="col-span-6" id="tr-destino" rotulo="Conta de destino" obrigatorio erro={erros.contaDestinoId}>
              <CampoSelect
                id="tr-destino"
                opcoes={contas.filter((c) => c.valor !== origem)}
                valor={destino === origem ? "" : destino}
                onChange={setDestino}
                vazio="Selecione…"
                aria-invalid={!!erros.contaDestinoId}
              />
            </Campo>
            <Campo className="col-span-6 sm:col-span-3" id="tr-data" rotulo="Data" obrigatorio erro={erros.data}>
              <Input id="tr-data" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} aria-invalid={!!erros.data} />
            </Campo>
            <Campo className="col-span-6 sm:col-span-3" id="tr-valor" rotulo="Valor" obrigatorio erro={erros.valor}>
              <CampoMoeda id="tr-valor" valor={valor} onChange={setValor} aria-invalid={!!erros.valor} />
            </Campo>
            <Campo className="col-span-6" id="tr-descricao" rotulo="Descrição" ajuda="Opcional. Padrão: “Transferência origem → destino”.">
              <Input id="tr-descricao" value={descricao} maxLength={200} onChange={(e) => setDescricao(e.target.value)} />
            </Campo>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
              Voltar
            </Button>
            <Button type="submit" disabled={salvando || contas.length < 2}>
              {salvando && <LoaderCircle className="animate-spin" />} Transferir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Ajuste de saldo avulso (crédito ou débito) numa conta. */
export function DialogoAjuste({ contas, contaAtualId, hoje, aberto, onAbertoChange }: PropsDialogo) {
  const [conta, setConta] = useState(contaAtualId && contas.some((c) => c.valor === contaAtualId) ? contaAtualId : (contas[0]?.valor ?? ""));
  const [tipo, setTipo] = useState<"CREDITO" | "DEBITO">("CREDITO");
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState(0);
  const [descricao, setDescricao] = useState("");
  const { salvando, erros, enviar } = useEnvio(onAbertoChange);

  function salvar(ev: React.FormEvent) {
    ev.preventDefault();
    enviar(
      () => {
        const e: Record<string, string> = {};
        if (!conta) e.contaBancariaId = "Selecione a conta.";
        if (!data) e.data = "Informe a data.";
        else if (data > hoje) e.data = "A data não pode ser futura.";
        if (!(valor > 0)) e.valor = "Informe um valor maior que zero.";
        if (!descricao.trim()) e.descricao = "Informe a descrição do ajuste.";
        return e;
      },
      () => criarAjusteAcao({ contaBancariaId: conta, data, tipo, valor, descricao }),
    );
  }

  return (
    <Dialog open={aberto} onOpenChange={(a) => !salvando && onAbertoChange(a)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={salvar} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="size-4" /> Ajuste de saldo
            </DialogTitle>
            <DialogDescription>Use para tarifas, rendimentos ou correções que não vêm de um título.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-3">
            <Campo className="col-span-6" id="aj-conta" rotulo="Conta" obrigatorio erro={erros.contaBancariaId}>
              <CampoSelect id="aj-conta" opcoes={contas} valor={conta} onChange={setConta} vazio={conta ? undefined : "Selecione…"} />
            </Campo>
            <div className="col-span-6 space-y-1.5">
              <span className="text-sm font-medium">Tipo</span>
              <div>
                <Segmentado<"CREDITO" | "DEBITO">
                  rotulo="Tipo do ajuste"
                  valor={tipo}
                  onChange={setTipo}
                  opcoes={[
                    {
                      valor: "CREDITO",
                      rotulo: (
                        <>
                          <ArrowDownLeft className="text-success" /> Crédito (entrada)
                        </>
                      ),
                    },
                    {
                      valor: "DEBITO",
                      rotulo: (
                        <>
                          <ArrowUpRight className="text-destructive" /> Débito (saída)
                        </>
                      ),
                    },
                  ]}
                />
              </div>
            </div>
            <Campo className="col-span-6 sm:col-span-3" id="aj-data" rotulo="Data" obrigatorio erro={erros.data}>
              <Input id="aj-data" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} aria-invalid={!!erros.data} />
            </Campo>
            <Campo className="col-span-6 sm:col-span-3" id="aj-valor" rotulo="Valor" obrigatorio erro={erros.valor}>
              <CampoMoeda id="aj-valor" valor={valor} onChange={setValor} aria-invalid={!!erros.valor} />
            </Campo>
            <Campo className="col-span-6" id="aj-descricao" rotulo="Descrição" obrigatorio erro={erros.descricao}>
              <Input
                id="aj-descricao"
                value={descricao}
                maxLength={200}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Tarifa bancária de manutenção"
                aria-invalid={!!erros.descricao}
              />
            </Campo>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
              Voltar
            </Button>
            <Button type="submit" disabled={salvando || contas.length === 0}>
              {salvando && <LoaderCircle className="animate-spin" />} Lançar ajuste
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Botões do cabeçalho de Movimentações (transferência e ajuste). */
export function AcoesMovimentacoes({ contas, contaAtualId, hoje }: { contas: Opcao[]; contaAtualId: string | null; hoje: string }) {
  const [dialogo, setDialogo] = useState<null | "transferencia" | "ajuste">(null);
  const [chave, setChave] = useState(0);
  const abrir = (d: "transferencia" | "ajuste") => {
    setChave((k) => k + 1);
    setDialogo(d);
  };
  const fechar = (v: boolean) => {
    if (!v) setDialogo(null);
  };
  return (
    <>
      <Button variant="outline" onClick={() => abrir("ajuste")} disabled={contas.length === 0}>
        <Scale /> Ajuste de saldo
      </Button>
      <span title={contas.length < 2 ? "Cadastre ao menos duas contas ativas." : undefined}>
        <Button onClick={() => abrir("transferencia")} disabled={contas.length < 2}>
          <ArrowLeftRight /> Transferência entre contas
        </Button>
      </span>
      {dialogo === "transferencia" && (
        <DialogoTransferencia key={chave} contas={contas} contaAtualId={contaAtualId} hoje={hoje} aberto onAbertoChange={fechar} />
      )}
      {dialogo === "ajuste" && <DialogoAjuste key={chave} contas={contas} contaAtualId={contaAtualId} hoje={hoje} aberto onAbertoChange={fechar} />}
    </>
  );
}
