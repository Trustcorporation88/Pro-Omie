"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Copy, CreditCard, ExternalLink, LoaderCircle, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Selo } from "@/components/selos";
import { Campo, Segmentado } from "@/components/financeiro/campos";
import { fmtData, fmtDataHora, fmtMoeda } from "@/lib/format";
import { cancelarCobranca, conferirCobranca, gerarCobranca, reenviarCobrancaPorEmail } from "@/modules/cobranca/acoes";
import type { PainelCobranca } from "@/modules/cobranca/consultas";
import { ROTULO_STATUS_COBRANCA, ROTULO_TIPO_COBRANCA, TOM_STATUS_COBRANCA } from "@/modules/cobranca/tipos";

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Copiado.");
  } catch {
    toast.error("Não foi possível copiar; selecione o texto e copie.");
  }
}

export function CobrancaTitulo({ tituloId, painel, podeEditar, emailConfigurado }: { tituloId: string; painel: PainelCobranca; podeEditar: boolean; emailConfigurado: boolean }) {
  const [gerar, setGerar] = useState(false);
  const [reenviar, setReenviar] = useState<string | null>(null);
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="size-4 text-muted-foreground" aria-hidden /> Cobrança (boleto e Pix)
        </CardTitle>
        {painel.configurada && painel.ambiente === 2 && <Selo tom="alerta">Sandbox · sem valor</Selo>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {painel.cobrancas.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {painel.cobrancas.map((c) => (
              <li key={c.id} className="space-y-2 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {ROTULO_TIPO_COBRANCA[c.tipo] ?? c.tipo} · {fmtMoeda(c.valor)} · vence {fmtData(c.vencimento)}
                    <Selo tom={TOM_STATUS_COBRANCA(c.status)}>{ROTULO_STATUS_COBRANCA[c.status] ?? c.status}</Selo>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {c.urlFatura && (
                      <Button asChild size="sm" variant="outline">
                        <a href={c.urlFatura} target="_blank" rel="noopener noreferrer">
                          <ExternalLink /> Fatura
                        </a>
                      </Button>
                    )}
                    {c.urlBoleto && (
                      <Button asChild size="sm" variant="outline">
                        <a href={c.urlBoleto} target="_blank" rel="noopener noreferrer">
                          Boleto PDF
                        </a>
                      </Button>
                    )}
                    {podeEditar && (c.status === "PENDING" || c.status === "OVERDUE") && (
                      <>
                        <Button size="sm" variant="outline" disabled={pendente} onClick={() => rodar(() => conferirCobranca(c.id))}>
                          <RefreshCw /> Conferir
                        </Button>
                        {emailConfigurado && (
                          <Button size="sm" variant="outline" onClick={() => setReenviar(c.id)}>
                            <Mail /> E-mail
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={pendente} onClick={() => rodar(() => cancelarCobranca(c.id))}>
                          <Ban /> Cancelar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {c.linhaDigitavel && (
                  <p className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Linha digitável</span>
                    <code className="tabular rounded bg-muted px-1.5 py-0.5 break-all">{c.linhaDigitavel}</code>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copiar(c.linhaDigitavel!)}>
                      <Copy /> copiar
                    </Button>
                  </p>
                )}
                {c.pixPayload && (
                  <p className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Pix copia e cola</span>
                    <code className="max-w-full rounded bg-muted px-1.5 py-0.5 break-all">{c.pixPayload.length > 70 ? `${c.pixPayload.slice(0, 70)}…` : c.pixPayload}</code>
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copiar(c.pixPayload!)}>
                      <Copy /> copiar
                    </Button>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Asaas {c.asaasPaymentId} · gerada em {fmtDataHora(c.createdAt)}
                  {c.pagoEm ? ` · paga em ${fmtData(c.pagoEm)}${c.valorLiquido !== null ? ` (líquido ${fmtMoeda(c.valorLiquido)})` : ""}` : ""}
                  {c.baixaId ? " · título baixado automaticamente" : ""}
                  {c.erro ? ` · ${c.erro}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        {!painel.configurada ? (
          <p className="text-muted-foreground">A cobrança pelo Asaas ainda não está configurada para esta empresa (Configurações › Empresas e filiais › Cobrança).</p>
        ) : !painel.temDocumento ? (
          <p className="text-muted-foreground">O cliente precisa de CPF ou CNPJ no cadastro para receber boleto ou Pix.</p>
        ) : podeEditar && painel.podeGerar ? (
          <Button onClick={() => setGerar(true)} disabled={pendente}>
            <CreditCard /> Gerar boleto ou Pix
          </Button>
        ) : null}
      </CardContent>
      <Dialog open={gerar} onOpenChange={setGerar}>
        <DialogContent>
          <CorpoGerar tituloId={tituloId} painel={painel} emailConfigurado={emailConfigurado} fechar={() => setGerar(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={!!reenviar} onOpenChange={(v) => !v && setReenviar(null)}>
        <DialogContent>{reenviar && <CorpoReenviar id={reenviar} paraPadrao={painel.emailCliente} fechar={() => setReenviar(null)} />}</DialogContent>
      </Dialog>
    </Card>
  );
}

function CorpoGerar({ tituloId, painel, emailConfigurado, fechar }: { tituloId: string; painel: PainelCobranca; emailConfigurado: boolean; fechar: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"BOLETO" | "PIX" | "UNDEFINED">(painel.formaPadrao);
  const [email, setEmail] = useState(emailConfigurado && !!painel.emailCliente);
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Gerar cobrança no Asaas</DialogTitle>
        <DialogDescription>
          O valor é o saldo do título e o vencimento é o do título (hoje, se já venceu). Multa e juros vêm da configuração.{painel.ambiente === 2 ? " Ambiente sandbox: cobrança de teste." : ""}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Forma</p>
          <Segmentado<"BOLETO" | "PIX" | "UNDEFINED">
            rotulo="Forma"
            valor={tipo}
            onChange={setTipo}
            opcoes={[
              { valor: "UNDEFINED", rotulo: "Cliente escolhe" },
              { valor: "BOLETO", rotulo: "Boleto" },
              { valor: "PIX", rotulo: "Pix" },
            ]}
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="cob-enviar-email">Mandar por e-mail ao cliente</Label>
            <p className="text-xs text-muted-foreground">{painel.emailCliente ? `Para ${painel.emailCliente}` : emailConfigurado ? "O cliente não tem e-mail no cadastro." : "E-mail não configurado."}</p>
          </div>
          <Switch id="cob-enviar-email" checked={email} disabled={!emailConfigurado || !painel.emailCliente} onCheckedChange={setEmail} />
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
              const r = await gerarCobranca(tituloId, { tipo, enviarEmail: email });
              if (r.ok) {
                toast.success(r.mensagem ?? "Cobrança gerada.", { duration: 9000 });
                fechar();
                router.refresh();
              } else toast.error(r.erro, { duration: 12000 });
            })
          }
        >
          {pendente && <LoaderCircle className="animate-spin" />} Gerar
        </Button>
      </DialogFooter>
    </>
  );
}

function CorpoReenviar({ id, paraPadrao, fechar }: { id: string; paraPadrao: string | null; fechar: () => void }) {
  const [para, setPara] = useState(paraPadrao ?? "");
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Enviar cobrança por e-mail</DialogTitle>
        <DialogDescription>Manda o link da fatura, a linha digitável e o Pix copia e cola.</DialogDescription>
      </DialogHeader>
      <Campo id="cob-para" rotulo="Para" obrigatorio ajuda="Até 5 e-mails, separados por vírgula.">
        <Input id="cob-para" value={para} onChange={(e) => setPara(e.target.value)} />
      </Campo>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={pendente}>
          Voltar
        </Button>
        <Button
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await reenviarCobrancaPorEmail(id, para);
              if (r.ok) {
                toast.success(r.mensagem ?? "Enviado.");
                fechar();
              } else toast.error(r.erro);
            })
          }
        >
          {pendente ? <LoaderCircle className="animate-spin" /> : <Mail />} Enviar
        </Button>
      </DialogFooter>
    </>
  );
}
