"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, LoaderCircle, PlugZap, Settings2, TriangleAlert, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Selo } from "@/components/selos";
import { Campo, Segmentado } from "@/components/financeiro/campos";
import { fmtData, fmtDocumento } from "@/lib/format";
import { registrarWebhookCobranca, salvarConfiguracaoCobranca, testarCobranca } from "@/modules/cobranca/acoes";
import type { EstadoCobranca } from "@/modules/cobranca/consultas";

export type ContaOpcao = { id: string; nome: string; empresaId: string };

export function CobrancaEmpresa({ estados, contas }: { estados: EstadoCobranca[]; contas: ContaOpcao[] }) {
  return (
    <div className="mt-6 border-t pt-5">
      <div className="mb-3 space-y-0.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <CreditCard className="size-4 text-muted-foreground" aria-hidden /> Cobrança (boleto e Pix pelo Asaas)
        </h3>
        <p className="text-xs text-muted-foreground">
          Gera boleto ou Pix de qualquer título a receber, manda ao cliente por e-mail e dá baixa sozinho quando o pagamento cai (webhook). Uma conta Asaas por
          CNPJ; a chave da API fica cifrada. Comece no sandbox.
        </p>
      </div>
      <ul className="divide-y rounded-lg border">
        {estados.map((e) => (
          <Linha key={e.empresaId} estado={e} contas={contas.filter((c) => c.empresaId === e.empresaId || true)} />
        ))}
      </ul>
    </div>
  );
}

function Linha({ estado: e, contas }: { estado: EstadoCobranca; contas: ContaOpcao[] }) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const rodar = (fn: () => Promise<{ ok: boolean; erro?: string; mensagem?: string }>) =>
    iniciar(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.mensagem ?? "Feito.", { duration: 8000 });
      else toast.error(r.erro ?? "Falhou.", { duration: 10000 });
      router.refresh();
    });
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {e.nome}
          <span className="tabular text-xs font-normal text-muted-foreground">{fmtDocumento(e.cnpj)}</span>
          {e.ativa ? <Selo tom="sucesso">Ligada</Selo> : <Selo>Desligada</Selo>}
          {e.temChave && <Selo tom={e.ambiente === 1 ? "info" : "alerta"}>{e.ambiente === 1 ? "Produção" : "Sandbox"}</Selo>}
          {e.webhookRegistradoEm ? <Selo tom="sucesso">Webhook ok</Selo> : e.ativa ? <Selo tom="alerta">Sem webhook</Selo> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {e.temChave ? `Chave guardada (final ${e.chaveFinal})` : "Sem chave"} · {e.abertas} cobrança(s) em aberto · {e.recebidas} recebida(s)
          {e.testadaEm ? ` · conexão testada em ${fmtData(e.testadaEm)}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {e.temChave && (
          <>
            <Button variant="ghost" size="sm" disabled={pendente} onClick={() => rodar(() => testarCobranca(e.empresaId))}>
              {pendente ? <LoaderCircle className="animate-spin" /> : <PlugZap />} Testar
            </Button>
            <Button variant="ghost" size="sm" disabled={pendente || !e.ativa} onClick={() => rodar(() => registrarWebhookCobranca(e.empresaId))}>
              <Webhook /> {e.webhookRegistradoEm ? "Atualizar webhook" : "Registrar webhook"}
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
          <Settings2 /> Configurar
        </Button>
      </div>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <CorpoConfig estado={e} contas={contas} fechar={() => setAberto(false)} />
        </DialogContent>
      </Dialog>
    </li>
  );
}

function CorpoConfig({ estado: e, contas, fechar }: { estado: EstadoCobranca; contas: ContaOpcao[]; fechar: () => void }) {
  const router = useRouter();
  const [ativa, setAtiva] = useState(e.ativa);
  const [ambiente, setAmbiente] = useState<"1" | "2">(String(e.ambiente) as "1" | "2");
  const [chave, setChave] = useState("");
  const [conta, setConta] = useState(e.contaBancariaId ?? "");
  const [forma, setForma] = useState<"BOLETO" | "PIX" | "UNDEFINED">(e.formaPadrao);
  const [multa, setMulta] = useState(String(e.multaPercentual).replace(".", ","));
  const [juros, setJuros] = useState(String(e.jurosMensal).replace(".", ","));
  const [notificar, setNotificar] = useState(e.notificarPeloAsaas);
  const [emailAuto, setEmailAuto] = useState(e.enviarEmailAutomatico);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const numero = (s: string) => Number(s.replace(",", ".")) || 0;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Cobrança Asaas · {e.nome}</DialogTitle>
        <DialogDescription>A chave da API é gerada no painel do Asaas (Integrações › Chave de API) e fica cifrada no servidor; ninguém a vê depois de salva.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor={`cob-ativa-${e.empresaId}`}>Gerar cobranças por este estabelecimento</Label>
          <Switch id={`cob-ativa-${e.empresaId}`} checked={ativa} onCheckedChange={setAtiva} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Ambiente</p>
          <Segmentado<"1" | "2">
            rotulo="Ambiente"
            valor={ambiente}
            onChange={setAmbiente}
            opcoes={[
              { valor: "2", rotulo: "Sandbox (testes)" },
              { valor: "1", rotulo: "Produção" },
            ]}
          />
        </div>
        {e.ambiente === 2 && ambiente === "1" && (
          <p className="flex gap-1.5 rounded-lg bg-warning/15 p-3 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Em produção as cobranças são reais (R$ 1,99 por boleto ou Pix pago). Use a chave da conta de produção ($aact_prod_) e registre o webhook de novo.
          </p>
        )}
        <Campo id="cob-chave" rotulo={e.temChave ? "Nova chave da API (deixe em branco para manter)" : "Chave da API"} erro={erros.chave} ajuda={ambiente === "1" ? "Começa com $aact_prod_." : "Começa com $aact_hmlg_ (conta do sandbox: sandbox.asaas.com)."}>
          <Input id="cob-chave" type="password" autoComplete="off" value={chave} onChange={(x) => setChave(x.target.value)} placeholder={e.temChave ? `guardada (final ${e.chaveFinal})` : "$aact_..."} />
        </Campo>
        <Campo id="cob-conta" rotulo="Conta onde o dinheiro entra" erro={erros.contaBancariaId} ajuda="A baixa automática lança o recebimento nesta conta (o Asaas transfere o saldo para o banco depois).">
          <select id="cob-conta" value={conta} onChange={(x) => setConta(x.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs">
            <option value="">Selecione…</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Forma padrão</p>
          <Segmentado<"BOLETO" | "PIX" | "UNDEFINED">
            rotulo="Forma padrão"
            valor={forma}
            onChange={setForma}
            opcoes={[
              { valor: "UNDEFINED", rotulo: "Cliente escolhe" },
              { valor: "BOLETO", rotulo: "Boleto" },
              { valor: "PIX", rotulo: "Pix" },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="cob-multa" rotulo="Multa por atraso (%)" erro={erros.multaPercentual}>
            <Input id="cob-multa" inputMode="decimal" value={multa} onChange={(x) => setMulta(x.target.value.replace(/[^\d,.]/g, ""))} />
          </Campo>
          <Campo id="cob-juros" rotulo="Juros ao mês (%)" erro={erros.jurosMensal}>
            <Input id="cob-juros" inputMode="decimal" value={juros} onChange={(x) => setJuros(x.target.value.replace(/[^\d,.]/g, ""))} />
          </Campo>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor={`cob-email-${e.empresaId}`}>Mandar o e-mail da cobrança ao cliente automaticamente</Label>
            <p className="text-xs text-muted-foreground">Pelo e-mail do Pro Omie, com link, linha digitável e Pix copia e cola.</p>
          </div>
          <Switch id={`cob-email-${e.empresaId}`} checked={emailAuto} onCheckedChange={setEmailAuto} />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor={`cob-notif-${e.empresaId}`}>Deixar o Asaas notificar o cliente também</Label>
            <p className="text-xs text-muted-foreground">E-mail e SMS do Asaas custam R$ 0,99 por cobrança paga; desligado por padrão.</p>
          </div>
          <Switch id={`cob-notif-${e.empresaId}`} checked={notificar} onCheckedChange={setNotificar} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={pendente}>
          Voltar
        </Button>
        <Button
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await salvarConfiguracaoCobranca(e.empresaId, { ativa, ambiente: ambiente === "1" ? 1 : 2, chave: chave || null, contaBancariaId: conta || null, formaPadrao: forma, multaPercentual: numero(multa), jurosMensal: numero(juros), notificarPeloAsaas: notificar, enviarEmailAutomatico: emailAuto });
              if (r.ok) {
                toast.success(r.mensagem ?? "Salvo.");
                fechar();
                router.refresh();
              } else {
                setErros(r.campos ?? {});
                toast.error(r.erro);
              }
            })
          }
        >
          {pendente && <LoaderCircle className="animate-spin" />} Salvar
        </Button>
      </DialogFooter>
    </>
  );
}
