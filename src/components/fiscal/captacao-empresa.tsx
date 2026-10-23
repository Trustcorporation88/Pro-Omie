"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CloudDownload, LoaderCircle, Settings2, TriangleAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Selo } from "@/components/selos";
import { Segmentado } from "@/components/financeiro/campos";
import { fmtDataHora, fmtDocumento } from "@/lib/format";
import { ativarNaFocusAcao, salvarConfiguracaoFiscal } from "@/modules/fiscal/acoes";
import {
  classificarStatus,
  DESCRICAO_TIPO_DOC,
  ROTULO_MOTOR,
  ROTULO_TIPO_DOC,
  TIPOS_DOC,
  type EstadoCaptacao,
  type Motor,
  type TipoDoc,
} from "@/modules/fiscal/tipos";

/** Bloco "Notas recebidas" no cartão da empresa: liga a busca por estabelecimento e mostra como ela está. */
export function CaptacaoEmpresa({ estados }: { estados: EstadoCaptacao[] }) {
  return (
    <div className="mt-6 border-t pt-5">
      <div className="mb-3 space-y-0.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <CloudDownload className="size-4 text-muted-foreground" aria-hidden /> Notas recebidas
        </h3>
        <p className="text-xs text-muted-foreground">
          Busca de hora em hora as NF-e, CT-e e NFS-e emitidas contra o CNPJ, direto na SEFAZ e no Ambiente Nacional, com o certificado A1. Começa desligada.
        </p>
      </div>
      <ul className="divide-y rounded-lg border">
        {estados.map((e) => (
          <LinhaCaptacao key={e.empresaId} estado={e} />
        ))}
      </ul>
    </div>
  );
}

const fmtCursor = (c: EstadoCaptacao["cursores"][number]) => {
  const st = classificarStatus(c.status);
  const partes = [c.consultadoEm ? `consultado em ${fmtDataHora(c.consultadoEm)}` : "ainda não consultado", c.status ? st.rotulo : null];
  if (c.proximaConsulta && new Date(c.proximaConsulta) > new Date()) partes.push(`próxima após ${fmtDataHora(c.proximaConsulta)}`);
  if (c.pendente) partes.push("ainda há documentos para trazer");
  return {
    texto: partes.filter(Boolean).join(" · "),
    ok: st.ok || !c.status,
    mensagem: !st.ok && c.mensagem ? c.mensagem : null,
  };
};

function LinhaCaptacao({ estado: e }: { estado: EstadoCaptacao }) {
  const [aberto, setAberto] = useState(false);
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {e.nome}
            <span className="tabular text-xs font-normal text-muted-foreground">{fmtDocumento(e.cnpj)}</span>
            {e.ativa ? <Selo tom="sucesso">Ligada</Selo> : <Selo>Desligada</Selo>}
            {e.ativa && e.motor === "FOCUS" && <Selo tom="roxo">Focus NFe</Selo>}
            {e.ativa && e.ambiente === 2 && <Selo tom="alerta">Homologação</Selo>}
          </p>
          <p className="text-xs text-muted-foreground">
            {e.ativa
              ? `${e.tipos.map((t) => ROTULO_TIPO_DOC[t]).join(", ")} · ${ROTULO_MOTOR[e.motor]}${e.cienciaAutomatica && e.tipos.includes("NFE") ? " · ciência automática" : ""}`
              : e.temCertificado
                ? `Pronta para ligar${e.certificadoHerdado ? " (usa o certificado da matriz)" : ""}.`
                : "Envie o certificado A1 para poder ligar."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
          <Settings2 /> Configurar
        </Button>
      </div>
      {e.ativa && e.cursores.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {TIPOS_DOC.filter((t) => e.tipos.includes(t)).map((t) => {
            const c = e.cursores.find((x) => x.tipo === t);
            if (!c) return null;
            const f = fmtCursor(c);
            return (
              <li key={t} className={f.ok ? "text-muted-foreground" : "text-destructive"}>
                <span className="font-medium">{ROTULO_TIPO_DOC[t]}:</span> {f.texto}
                {f.mensagem && <span className="block pl-4 break-words">{f.mensagem}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <DialogoCaptacao estado={e} aberto={aberto} onAbertoChange={setAberto} />
    </li>
  );
}

function DialogoCaptacao({ estado, aberto, onAbertoChange }: { estado: EstadoCaptacao; aberto: boolean; onAbertoChange: (v: boolean) => void }) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-lg">
        {/* corpo montado a cada abertura: o formulário começa sempre do que está salvo */}
        <CorpoCaptacao estado={estado} fechar={() => onAbertoChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CorpoCaptacao({ estado: e, fechar }: { estado: EstadoCaptacao; fechar: () => void }) {
  const router = useRouter();
  const [ativa, setAtiva] = useState(e.ativa);
  const [tipos, setTipos] = useState<TipoDoc[]>(e.tipos.length ? e.tipos : TIPOS_DOC);
  const [ciencia, setCiencia] = useState(e.cienciaAutomatica);
  const [motor, setMotor] = useState<Motor>(e.motor);
  const [ambiente, setAmbiente] = useState<"1" | "2">(String(e.ambiente) as "1" | "2");
  const [salvando, iniciar] = useTransition();
  const [ativando, iniciarAtivacao] = useTransition();
  const alternar = (t: TipoDoc, marcado: boolean) => setTipos((ts) => (marcado ? [...new Set([...ts, t])] : ts.filter((x) => x !== t)));

  function salvar() {
    iniciar(async () => {
      const r = await salvarConfiguracaoFiscal(e.empresaId, {
        captacaoAtiva: ativa,
        motor,
        ambiente: ambiente === "2" ? 2 : 1,
        captarNfe: tipos.includes("NFE"),
        captarCte: tipos.includes("CTE"),
        captarNfse: tipos.includes("NFSE"),
        cienciaAutomatica: ciencia,
      });
      if (r.ok) {
        toast.success(r.mensagem ?? "Salvo.");
        fechar();
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Notas recebidas · {e.nome}</DialogTitle>
        <DialogDescription>
          CNPJ {fmtDocumento(e.cnpj)}. A busca roda de hora em hora e também pelo botão “Buscar agora” na tela Notas recebidas.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-5">
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-1">
            <Label htmlFor={`ativa-${e.empresaId}`}>Buscar notas contra este CNPJ</Label>
            <p className="flex gap-1.5 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[oklch(0.5_0.13_65)]" aria-hidden />
              Ligue só se nenhum outro sistema (por exemplo, o ProContador) consulta a SEFAZ para este CNPJ. Dois sistemas no mesmo CNPJ fazem a SEFAZ bloquear
              as consultas por uma hora (erro 656).
            </p>
          </div>
          <Switch id={`ativa-${e.empresaId}`} checked={ativa} onCheckedChange={setAtiva} />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">O que buscar</legend>
          {TIPOS_DOC.map((t) => (
            <label key={t} className="flex items-start gap-2 text-sm">
              <Checkbox checked={tipos.includes(t)} onCheckedChange={(v) => alternar(t, v === true)} className="mt-0.5" />
              <span>
                <span className="font-medium">{ROTULO_TIPO_DOC[t]}</span> <span className="text-muted-foreground">— {DESCRICAO_TIPO_DOC[t]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor={`ciencia-${e.empresaId}`}>Dar ciência automaticamente nas NF-e</Label>
            <p className="text-xs text-muted-foreground">
              A SEFAZ só libera o XML completo depois da ciência. A confirmação (ou recusa) continua sendo feita na tela.
            </p>
          </div>
          <Switch id={`ciencia-${e.empresaId}`} checked={ciencia} onCheckedChange={setCiencia} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Motor</p>
            <Segmentado<Motor>
              rotulo="Motor"
              valor={motor}
              onChange={(m) => (m === "FOCUS" && !e.focusAtivada ? toast.info("Ative o estabelecimento na Focus NFe primeiro.") : setMotor(m))}
              opcoes={[
                { valor: "SEFAZ", rotulo: "SEFAZ direto" },
                { valor: "FOCUS", rotulo: "Focus NFe" },
              ]}
            />
            <p className="text-xs text-muted-foreground">SEFAZ direto não tem custo. A Focus fica de reserva para quando o volume crescer.</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Ambiente</p>
            <Segmentado<"1" | "2">
              rotulo="Ambiente"
              valor={ambiente}
              onChange={setAmbiente}
              opcoes={[
                { valor: "1", rotulo: "Produção" },
                { valor: "2", rotulo: "Homologação" },
              ]}
            />
            <p className="text-xs text-muted-foreground">Homologação é só para testes (sem notas reais).</p>
          </div>
        </div>

        {e.focusDisponivel && (
          <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <span className="text-muted-foreground">
              {e.focusAtivada
                ? "Estabelecimento já ativado na Focus NFe (certificado e busca de notas ligados lá)."
                : "A Focus NFe está configurada no servidor, mas este estabelecimento ainda não foi ativado lá."}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={ativando}
              onClick={() =>
                iniciarAtivacao(async () => {
                  const r = await ativarNaFocusAcao(e.empresaId);
                  if (r.ok) {
                    toast.success(r.mensagem ?? "Ativado.");
                    router.refresh();
                  } else toast.error(r.erro);
                })
              }
            >
              {ativando ? <LoaderCircle className="animate-spin" /> : <Zap />} {e.focusAtivada ? "Atualizar na Focus" : "Ativar na Focus"}
            </Button>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={salvando}>
          Voltar
        </Button>
        <Button onClick={salvar} disabled={salvando}>
          {salvando && <LoaderCircle className="animate-spin" />} Salvar
        </Button>
      </DialogFooter>
    </>
  );
}
