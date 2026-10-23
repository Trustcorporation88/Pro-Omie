"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, LoaderCircle, Settings2, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Selo } from "@/components/selos";
import { Campo, Segmentado } from "@/components/financeiro/campos";
import { fmtData, fmtDocumento } from "@/lib/format";
import { inutilizarNumeracao, salvarConfiguracaoNfe } from "@/modules/fiscal/nfe/acoes";
import type { EstadoEmissao } from "@/modules/fiscal/nfe/consultas";
import { TEXTO_SIMPLES } from "@/modules/fiscal/nfe/tipos";

/** Bloco "Emissão de NF-e" no cartão da empresa. */
export function EmissaoEmpresa({ estados }: { estados: EstadoEmissao[] }) {
  return (
    <div className="mt-6 border-t pt-5">
      <div className="mb-3 space-y-0.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <FileText className="size-4 text-muted-foreground" aria-hidden /> Emissão de NF-e
        </h3>
        <p className="text-xs text-muted-foreground">
          NF-e dos pedidos faturados, direto na SEFAZ-SP com o certificado A1. Começa em homologação (notas de teste, sem valor fiscal); passe para produção depois de
          o contador conferir uma nota de teste.
        </p>
      </div>
      <ul className="divide-y rounded-lg border">
        {estados.map((e) => (
          <Linha key={e.empresaId} estado={e} />
        ))}
      </ul>
    </div>
  );
}

function Linha({ estado: e }: { estado: EstadoEmissao }) {
  const [dialogo, setDialogo] = useState<"config" | "inut" | null>(null);
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {e.nome}
          <span className="tabular text-xs font-normal text-muted-foreground">{fmtDocumento(e.cnpj)}</span>
          {e.ativa ? <Selo tom="sucesso">Ligada</Selo> : <Selo>Desligada</Selo>}
          {e.ativa && <Selo tom={e.ambiente === 1 ? "info" : "alerta"}>{e.ambiente === 1 ? "Produção" : "Homologação"}</Selo>}
          {e.ativa && e.motor === "FOCUS" && <Selo tom="roxo">Focus NFe</Selo>}
        </p>
        <p className="text-xs text-muted-foreground">
          Série {e.serie} · próximo número {e.proximoNumero} · {e.emitidas} nota(s) autorizada(s)
          {!e.temCertificado && e.motor === "SEFAZ" ? " · falta o certificado A1" : ""}
          {e.ultimaInutilizacao ? ` · última inutilização: série ${e.ultimaInutilizacao.serie}, ${e.ultimaInutilizacao.inicio} a ${e.ultimaInutilizacao.fim} em ${fmtData(e.ultimaInutilizacao.em)}${e.ultimaInutilizacao.ok ? "" : " (recusada)"}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {e.ativa && e.motor === "SEFAZ" && (
          <Button variant="ghost" size="sm" onClick={() => setDialogo("inut")}>
            <XCircle /> Inutilizar números
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setDialogo("config")}>
          <Settings2 /> Configurar
        </Button>
      </div>
      <Dialog open={dialogo === "config"} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent className="sm:max-w-lg">
          <CorpoConfig estado={e} fechar={() => setDialogo(null)} />
        </DialogContent>
      </Dialog>
      <Dialog open={dialogo === "inut"} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent>
          <CorpoInutilizar estado={e} fechar={() => setDialogo(null)} />
        </DialogContent>
      </Dialog>
    </li>
  );
}

function CorpoConfig({ estado: e, fechar }: { estado: EstadoEmissao; fechar: () => void }) {
  const router = useRouter();
  const [ativa, setAtiva] = useState(e.ativa);
  const [ambiente, setAmbiente] = useState<"1" | "2">(String(e.ambiente) as "1" | "2");
  const [motor, setMotor] = useState<"SEFAZ" | "FOCUS">(e.motor);
  const [serie, setSerie] = useState(String(e.serie));
  const [proximo, setProximo] = useState(String(e.proximoNumero));
  const [informacoes, setInformacoes] = useState(e.informacoes ?? TEXTO_SIMPLES);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const indoParaProducao = e.ambiente === 2 && ambiente === "1";
  return (
    <>
      <DialogHeader>
        <DialogTitle>Emissão de NF-e · {e.nome}</DialogTitle>
        <DialogDescription>CNPJ {fmtDocumento(e.cnpj)}.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor={`nfe-ativa-${e.empresaId}`}>Emitir NF-e por este estabelecimento</Label>
          <Switch id={`nfe-ativa-${e.empresaId}`} checked={ativa} onCheckedChange={setAtiva} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Ambiente</p>
            <Segmentado<"1" | "2">
              rotulo="Ambiente"
              valor={ambiente}
              onChange={setAmbiente}
              opcoes={[
                { valor: "2", rotulo: "Homologação" },
                { valor: "1", rotulo: "Produção" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Motor</p>
            <Segmentado<"SEFAZ" | "FOCUS">
              rotulo="Motor"
              valor={motor}
              onChange={(m) => (m === "FOCUS" && !e.focusAtivada ? toast.info("Ative o estabelecimento na Focus NFe primeiro (bloco Notas recebidas).") : setMotor(m))}
              opcoes={[
                { valor: "SEFAZ", rotulo: "SEFAZ direto" },
                { valor: "FOCUS", rotulo: "Focus NFe" },
              ]}
            />
          </div>
        </div>
        {indoParaProducao && (
          <p className="flex gap-1.5 rounded-lg bg-warning/15 p-3 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Em produção cada nota tem valor fiscal. Confirme antes com o contador os códigos fiscais dos produtos (CFOP e CSOSN) numa nota de homologação. A
            numeração de produção é separada da de homologação: ajuste o próximo número (1, ou a continuação do sistema anterior).
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="nfe-serie" rotulo="Série" erro={erros.nfeSerie} ajuda="De 1 a 889.">
            <Input id="nfe-serie" inputMode="numeric" value={serie} onChange={(x) => setSerie(x.target.value.replace(/\D/g, ""))} />
          </Campo>
          <Campo id="nfe-prox" rotulo="Próximo número" erro={erros.nfeProximoNumero} ajuda="Se já emitia NF-e em outro sistema, continue a numeração dele.">
            <Input id="nfe-prox" inputMode="numeric" value={proximo} onChange={(x) => setProximo(x.target.value.replace(/\D/g, ""))} />
          </Campo>
        </div>
        <Campo id="nfe-info" rotulo="Informações complementares padrão" ajuda="Vai em toda nota. O texto legal de cada produto (ex.: diferimento) é somado automaticamente.">
          <Textarea id="nfe-info" rows={3} maxLength={2000} value={informacoes} onChange={(x) => setInformacoes(x.target.value)} />
        </Campo>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={pendente}>
          Voltar
        </Button>
        <Button
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await salvarConfiguracaoNfe(e.empresaId, {
                nfeAtiva: ativa,
                nfeAmbiente: ambiente === "1" ? 1 : 2,
                nfeMotor: motor,
                nfeSerie: Number(serie) || 0,
                nfeProximoNumero: Number(proximo) || 0,
                nfeInformacoes: informacoes,
              });
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

function CorpoInutilizar({ estado: e, fechar }: { estado: EstadoEmissao; fechar: () => void }) {
  const router = useRouter();
  const [serie, setSerie] = useState(String(e.serie));
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [just, setJust] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Inutilizar números</DialogTitle>
        <DialogDescription>
          Avisa a SEFAZ que números pulados ({e.ambiente === 1 ? "produção" : "homologação"}) não serão usados, por exemplo depois de uma nota rejeitada que
          não vai ser reenviada. Não vale para número de nota autorizada.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="grid grid-cols-3 gap-3">
          <Campo id="inut-serie" rotulo="Série">
            <Input id="inut-serie" inputMode="numeric" value={serie} onChange={(x) => setSerie(x.target.value.replace(/\D/g, ""))} />
          </Campo>
          <Campo id="inut-ini" rotulo="Do número">
            <Input id="inut-ini" inputMode="numeric" value={inicio} onChange={(x) => setInicio(x.target.value.replace(/\D/g, ""))} />
          </Campo>
          <Campo id="inut-fim" rotulo="Até o número">
            <Input id="inut-fim" inputMode="numeric" value={fim} onChange={(x) => setFim(x.target.value.replace(/\D/g, ""))} />
          </Campo>
        </div>
        <Campo id="inut-just" rotulo="Justificativa" obrigatorio erro={erros.justificativa} ajuda="De 15 a 255 caracteres.">
          <Textarea id="inut-just" rows={2} maxLength={255} value={just} onChange={(x) => setJust(x.target.value)} />
        </Campo>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={pendente}>
          Voltar
        </Button>
        <Button
          variant="destructive"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await inutilizarNumeracao(e.empresaId, { serie: Number(serie) || 0, inicio: Number(inicio) || 0, fim: Number(fim || inicio) || 0, justificativa: just });
              if (r.ok) {
                toast.success(r.mensagem ?? "Inutilizado.");
                fechar();
                router.refresh();
              } else {
                setErros(r.campos ?? {});
                toast.error(r.erro, { duration: 10000 });
              }
            })
          }
        >
          {pendente && <LoaderCircle className="animate-spin" />} Inutilizar na SEFAZ
        </Button>
      </DialogFooter>
    </>
  );
}
