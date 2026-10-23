"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, LoaderCircle, MapPinCheck, Settings2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Selo } from "@/components/selos";
import { Campo, Segmentado } from "@/components/financeiro/campos";
import { fmtData, fmtDocumento } from "@/lib/format";
import { conferirMunicipioNfse, salvarConfiguracaoNfse } from "@/modules/fiscal/nfse/acoes";
import type { EstadoEmissaoNfse } from "@/modules/fiscal/nfse/consultas";

/** Bloco "Emissão de NFS-e" no cartão da empresa. */
export function EmissaoServicosEmpresa({ estados }: { estados: EstadoEmissaoNfse[] }) {
  return (
    <div className="mt-6 border-t pt-5">
      <div className="mb-3 space-y-0.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <FileText className="size-4 text-muted-foreground" aria-hidden /> Emissão de NFS-e (emissor nacional)
        </h3>
        <p className="text-xs text-muted-foreground">
          Notas de serviço dos pedidos faturados, direto no emissor nacional da NFS-e com o certificado A1. Obrigatório para empresas do Simples a partir de
          01/11/2026. Começa na produção restrita (notas de teste); passe para produção depois de o contador conferir uma nota.
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

function Linha({ estado: e }: { estado: EstadoEmissaoNfse }) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {e.nome}
          <span className="tabular text-xs font-normal text-muted-foreground">{fmtDocumento(e.cnpj)}</span>
          {e.ativa ? <Selo tom="sucesso">Ligada</Selo> : <Selo>Desligada</Selo>}
          {e.ativa && <Selo tom={e.ambiente === 1 ? "info" : "alerta"}>{e.ambiente === 1 ? "Produção" : "Produção restrita"}</Selo>}
          {e.ativa && e.motor === "FOCUS" && <Selo tom="roxo">Focus NFe</Selo>}
          {e.municipioAderente === true && <Selo tom="sucesso">Município habilitado</Selo>}
          {e.municipioAderente === false && <Selo tom="perigo">Município não habilitado</Selo>}
        </p>
        <p className="text-xs text-muted-foreground">
          {e.cidade ?? "Município não cadastrado"} · série {e.serie} · próxima DPS nº {e.proximoNumero} · Simples {e.aliquotaSimples.toLocaleString("pt-BR")}% · {e.emitidas} nota(s)
          {!e.temCertificado && e.motor === "SEFAZ" ? " · falta o certificado A1" : ""}
          {e.municipioConferidoEm ? ` · adesão conferida em ${fmtData(e.municipioConferidoEm)}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {e.motor === "SEFAZ" && e.temCertificado && e.codigoMunicipio && (
          <Button
            variant="ghost"
            size="sm"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await conferirMunicipioNfse(e.empresaId);
                if (r.ok) toast[r.data?.aderente ? "success" : "warning"](r.mensagem ?? "Conferido.", { duration: 10000 });
                else toast.error(r.erro, { duration: 10000 });
                router.refresh();
              })
            }
          >
            {pendente ? <LoaderCircle className="animate-spin" /> : <MapPinCheck />} Conferir município
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
          <Settings2 /> Configurar
        </Button>
      </div>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <CorpoConfig estado={e} fechar={() => setAberto(false)} />
        </DialogContent>
      </Dialog>
    </li>
  );
}

function CorpoConfig({ estado: e, fechar }: { estado: EstadoEmissaoNfse; fechar: () => void }) {
  const router = useRouter();
  const [ativa, setAtiva] = useState(e.ativa);
  const [ambiente, setAmbiente] = useState<"1" | "2">(String(e.ambiente) as "1" | "2");
  const [motor, setMotor] = useState<"SEFAZ" | "FOCUS">(e.motor);
  const [serie, setSerie] = useState(String(e.serie));
  const [proximo, setProximo] = useState(String(e.proximoNumero));
  const [aliquota, setAliquota] = useState(e.aliquotaSimples.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
  const [enviarIM, setEnviarIM] = useState(e.enviarIM);
  const [informacoes, setInformacoes] = useState(e.informacoes ?? "");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const indoParaProducao = e.ambiente === 2 && ambiente === "1";
  return (
    <>
      <DialogHeader>
        <DialogTitle>Emissão de NFS-e · {e.nome}</DialogTitle>
        <DialogDescription>
          CNPJ {fmtDocumento(e.cnpj)} · {e.cidade ?? "município não cadastrado"}.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor={`nfse-ativa-${e.empresaId}`}>Emitir NFS-e por este estabelecimento</Label>
          <Switch id={`nfse-ativa-${e.empresaId}`} checked={ativa} onCheckedChange={setAtiva} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Ambiente</p>
            <Segmentado<"1" | "2">
              rotulo="Ambiente"
              valor={ambiente}
              onChange={setAmbiente}
              opcoes={[
                { valor: "2", rotulo: "Produção restrita" },
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
                { valor: "SEFAZ", rotulo: "Emissor nacional" },
                { valor: "FOCUS", rotulo: "Focus NFe" },
              ]}
            />
          </div>
        </div>
        {indoParaProducao && (
          <p className="flex gap-1.5 rounded-lg bg-warning/15 p-3 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Em produção cada nota tem valor fiscal e o ISS entra na apuração. Confirme antes com o contador o código de tributação dos serviços e a alíquota
            do Simples numa nota da produção restrita. A numeração da DPS de produção é separada: ajuste o próximo número.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="nfse-serie" rotulo="Série da DPS" erro={erros.nfseSerie} ajuda="De 1 a 49999.">
            <Input id="nfse-serie" inputMode="numeric" value={serie} onChange={(x) => setSerie(x.target.value.replace(/\D/g, ""))} />
          </Campo>
          <Campo id="nfse-prox" rotulo="Próxima DPS nº" erro={erros.nfseProximoNumero} ajuda="A NFS-e recebe outro número, dado pelo emissor nacional.">
            <Input id="nfse-prox" inputMode="numeric" value={proximo} onChange={(x) => setProximo(x.target.value.replace(/\D/g, ""))} />
          </Campo>
          <Campo id="nfse-aliq" rotulo="Alíquota do Simples (%)" erro={erros.nfseAliquotaSimples} ajuda="Alíquota efetiva do mês (pTotTribSN); o contador informa.">
            <Input id="nfse-aliq" inputMode="decimal" value={aliquota} onChange={(x) => setAliquota(x.target.value.replace(/[^\d,.]/g, ""))} />
          </Campo>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor={`nfse-im-${e.empresaId}`}>Enviar a inscrição municipal na DPS</Label>
            <p className="text-xs text-muted-foreground">Só quando a prefeitura cadastrou a empresa no Cadastro Nacional de Contribuintes; caso contrário o emissor recusa (E0120).</p>
          </div>
          <Switch id={`nfse-im-${e.empresaId}`} checked={enviarIM} onCheckedChange={setEnviarIM} />
        </div>
        <Campo id="nfse-info" rotulo="Informações complementares padrão" ajuda="Vai em toda NFS-e. Vazio = texto do Simples Nacional. O número do pedido é somado automaticamente.">
          <Textarea id="nfse-info" rows={2} maxLength={2000} value={informacoes} onChange={(x) => setInformacoes(x.target.value)} />
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
              const r = await salvarConfiguracaoNfse(e.empresaId, {
                nfseAtiva: ativa,
                nfseAmbiente: ambiente === "1" ? 1 : 2,
                nfseMotor: motor,
                nfseSerie: Number(serie) || 0,
                nfseProximoNumero: Number(proximo) || 0,
                nfseAliquotaSimples: Number(aliquota.replace(/\./g, "").replace(",", ".")) || 0,
                nfseEnviarIM: enviarIM,
                nfseInformacoes: informacoes,
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
