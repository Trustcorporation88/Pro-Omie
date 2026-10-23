"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Globe, LoaderCircle, Mail, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Selo } from "@/components/selos";
import { Campo } from "@/components/financeiro/campos";
import { fmtDataHora } from "@/lib/format";
import { configurarDominioEmail, enviarEmailTeste, reenviarEmail, verificarDominioEmail } from "@/modules/email/acoes";
import type { LinhaEmail } from "@/modules/email/consultas";
import type { EstadoDominio } from "@/modules/email/provedor";

const ROTULO_TIPO: Record<string, string> = {
  proposta: "Proposta",
  pedido: "Pedido",
  nfe: "NF-e",
  nfse: "NFS-e",
  senha_provisoria: "Senha provisória",
  redefinir_senha: "Redefinição de senha",
  certificado_vencendo: "Certificado vencendo",
  cobranca: "Cobrança",
  teste: "Teste",
};
const TOM_STATUS = { PENDENTE: "info", ENVIADO: "sucesso", FALHOU: "perigo" } as const;
const ROTULO_STATUS = { PENDENTE: "Na fila", ENVIADO: "Enviado", FALHOU: "Falhou" } as const;

export function ConfiguracaoEmail({ estado, emails, pendentes, falhos, emailAdmin }: { estado: { configurado: boolean; remetente: string; dominio: string }; emails: LinhaEmail[]; pendentes: number; falhos: number; emailAdmin: string }) {
  const router = useRouter();
  const [dominio, setDominio] = useState<EstadoDominio | null>(null);
  const [para, setPara] = useState(emailAdmin);
  const [pendente, iniciar] = useTransition();
  const rodar = (fn: () => Promise<{ ok: boolean; erro?: string; mensagem?: string; data?: unknown }>, aoOk?: (d: unknown) => void) =>
    iniciar(async () => {
      const r = await fn();
      if (r.ok) {
        if (r.mensagem) toast.success(r.mensagem, { duration: 8000 });
        aoOk?.(r.data);
      } else toast.error(r.erro ?? "Falhou.", { duration: 10000 });
      router.refresh();
    });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4 text-muted-foreground" aria-hidden /> Provedor de envio
            {estado.configurado ? <Selo tom="sucesso">Configurado</Selo> : <Selo tom="alerta">Não configurado</Selo>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {estado.configurado ? (
            <p>
              Os e-mails saem pela Resend como <strong>{estado.remetente}</strong>. Para o cliente poder responder, cada mensagem leva o e-mail da empresa emissora em “responder para”.
            </p>
          ) : (
            <div className="space-y-2">
              <p>O envio de e-mails (propostas, pedidos, notas, senha provisória, “esqueci minha senha”, avisos) fica dormente até a chave da Resend existir.</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>
                  Crie uma conta em resend.com (3.000 e-mails por mês sem custo) e gere uma API key com permissão de envio e de domínios.
                </li>
                <li>
                  Na Vercel, projeto pro-omie, crie a variável <code className="rounded bg-muted px-1">RESEND_API_KEY</code> (Production, Sensitive) com essa chave. Opcional:{" "}
                  <code className="rounded bg-muted px-1">EMAIL_REMETENTE</code> (padrão: {estado.remetente}).
                </li>
                <li>Faça um novo deploy (ou aguarde o próximo) e volte aqui para cadastrar o domínio e criar os registros DNS na Cloudflare.</li>
              </ol>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="size-4 text-muted-foreground" aria-hidden /> Domínio {estado.dominio}
            {dominio && <Selo tom={dominio.status === "verified" ? "sucesso" : "alerta"}>{dominio.status === "verified" ? "Verificado" : dominio.status}</Selo>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Para os e-mails não caírem em spam, o domínio do remetente precisa dos registros SPF e DKIM. O botão cadastra o domínio na Resend e mostra os registros a criar na Cloudflare (DNS only).</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!estado.configurado || pendente} onClick={() => rodar(() => configurarDominioEmail(), (d) => setDominio(d as EstadoDominio))}>
              {pendente ? <LoaderCircle className="animate-spin" /> : <Globe />} Mostrar registros DNS
            </Button>
            {dominio && (
              <Button variant="outline" disabled={pendente} onClick={() => rodar(() => verificarDominioEmail(dominio.id), (d) => setDominio(d as EstadoDominio))}>
                <RefreshCw /> Verificar
              </Button>
            )}
          </div>
          {dominio && (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Tipo</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dominio.registros.map((r, k) => (
                  <TableRow key={k} className="align-top">
                    <TableCell className="font-medium">{r.tipo}</TableCell>
                    <TableCell className="font-mono text-xs break-all whitespace-normal">{r.nome}</TableCell>
                    <TableCell className="max-w-96 font-mono text-xs break-all whitespace-normal">
                      {r.valor}
                      {r.prioridade != null ? ` (prioridade ${r.prioridade})` : ""}
                    </TableCell>
                    <TableCell>
                      <Selo tom={r.status === "verified" ? "sucesso" : "alerta"}>{r.status === "verified" ? "ok" : r.status}</Selo>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="size-4 text-muted-foreground" aria-hidden /> E-mail de teste
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <Campo id="teste-para" rotulo="Para" className="min-w-64 flex-1">
            <Input id="teste-para" type="email" value={para} onChange={(e) => setPara(e.target.value)} />
          </Campo>
          <Button disabled={!estado.configurado || pendente} onClick={() => rodar(() => enviarEmailTeste(para))}>
            {pendente ? <LoaderCircle className="animate-spin" /> : <Send />} Enviar teste
          </Button>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="size-4 text-muted-foreground" aria-hidden /> Últimos e-mails
            {pendentes > 0 && <Selo tom="info">{pendentes} na fila</Selo>}
            {falhos > 0 && <Selo tom="perigo">{falhos} com falha</Selo>}
          </CardTitle>
        </CardHeader>
        {emails.length === 0 ? (
          <p className="px-6 pb-5 text-sm text-muted-foreground">Nenhum e-mail enviado ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-4">Quando</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Para</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.map((e) => (
                <TableRow key={e.id} className="align-top">
                  <TableCell className="tabular pl-4 text-xs whitespace-nowrap">{fmtDataHora(e.createdAt)}</TableCell>
                  <TableCell className="text-xs">{ROTULO_TIPO[e.tipo] ?? e.tipo}</TableCell>
                  <TableCell className="max-w-56 text-xs break-all whitespace-normal">{e.para}</TableCell>
                  <TableCell className="max-w-72 text-xs whitespace-normal">
                    {e.assunto}
                    {e.anexos.length > 0 && <span className="block break-all text-muted-foreground">{e.anexos.join(", ")}</span>}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <Selo tom={TOM_STATUS[e.status]}>{ROTULO_STATUS[e.status]}</Selo>
                    {e.erro && e.status !== "ENVIADO" && <span className="mt-1 block max-w-64 text-xs text-muted-foreground">{e.erro}</span>}
                  </TableCell>
                  <TableCell className="pr-4">
                    {e.status !== "ENVIADO" && (
                      <Button size="sm" variant="ghost" disabled={!estado.configurado || pendente} onClick={() => rodar(() => reenviarEmail(e.id))}>
                        <RefreshCw /> Reenviar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
