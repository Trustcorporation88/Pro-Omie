"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Campo, CampoSelect } from "@/components/financeiro/campos";
import { SeletorPessoa } from "@/components/seletor-pessoa";
import { atalhosData } from "@/components/crm/visual";
import { salvarAtividade } from "@/modules/crm/acoes";
import { ROTULO_ATIVIDADE, opcoesDe, type OpcoesCrm, type ValoresAtividade } from "@/modules/crm/tipos";
import { cn } from "@/lib/utils";

type PropsDialogo = {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  id: string | null;
  iniciais: ValoresAtividade;
  oportunidadeTitulo?: string | null;
  opcoes: OpcoesCrm;
  hoje: string;
};

/** Agendar ou editar uma atividade. Ligada a uma oportunidade, o cliente vem dela. */
export function DialogoAtividade(props: PropsDialogo) {
  return (
    <Dialog open={props.aberto} onOpenChange={props.onAbertoChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <CorpoAtividade {...props} />
      </DialogContent>
    </Dialog>
  );
}

// montado a cada abertura: o estado do formulário começa sempre dos valores iniciais
function CorpoAtividade({ onAbertoChange, id, iniciais, oportunidadeTitulo, opcoes, hoje }: PropsDialogo) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [v, setV] = useState(iniciais);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falhas, setFalhas] = useState(0);
  const [salvando, iniciar] = useTransition();

  useEffect(() => {
    if (falhas) formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [falhas]);

  const set = <K extends keyof ValoresAtividade>(k: K, valor: ValoresAtividade[K]) => {
    setV((a) => ({ ...a, [k]: valor }));
    setErros((e) => (e[k] ? Object.fromEntries(Object.entries(e).filter(([c]) => c !== k)) : e));
  };

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await salvarAtividade(id, {
        tipo: v.tipo,
        assunto: v.assunto,
        descricao: v.descricao,
        data: v.data,
        hora: v.hora || null,
        responsavelId: v.responsavelId || null,
        oportunidadeId: v.oportunidadeId,
        pessoaId: v.oportunidadeId ? null : v.pessoaId,
      });
      if (!r.ok) {
        setErros(r.campos ?? {});
        setFalhas((n) => n + 1);
        return void toast.error(r.erro);
      }
      toast.success(r.mensagem ?? "Salvo.");
      onAbertoChange(false);
      router.refresh();
    });
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>{id ? "Editar atividade" : "Nova atividade"}</DialogTitle>
          <DialogDescription>{oportunidadeTitulo ? `Oportunidade: ${oportunidadeTitulo}` : "Ligação, reunião, visita ou tarefa com data marcada."}</DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={salvar} noValidate className="grid grid-cols-6 gap-4">
          <Campo className="col-span-6 sm:col-span-2" id="at-tipo" rotulo="Tipo">
            <CampoSelect id="at-tipo" opcoes={opcoesDe(ROTULO_ATIVIDADE)} valor={v.tipo} onChange={(x) => set("tipo", x as ValoresAtividade["tipo"])} />
          </Campo>
          <Campo className="col-span-6 sm:col-span-4" id="at-assunto" rotulo="O que fazer" obrigatorio erro={erros.assunto}>
            <Input
              id="at-assunto"
              value={v.assunto}
              maxLength={200}
              onChange={(e) => set("assunto", e.target.value)}
              aria-invalid={!!erros.assunto}
              placeholder="Ex.: Ligar para confirmar a visita técnica"
              autoFocus
            />
          </Campo>
          <Campo className="col-span-4" id="at-data" rotulo="Data" obrigatorio erro={erros.data}>
            <Input id="at-data" type="date" value={v.data} onChange={(e) => set("data", e.target.value)} aria-invalid={!!erros.data} />
          </Campo>
          <Campo className="col-span-2" id="at-hora" rotulo="Hora" erro={erros.hora}>
            <Input id="at-hora" type="time" value={v.hora} onChange={(e) => set("hora", e.target.value)} aria-invalid={!!erros.hora} />
          </Campo>
          <div className="col-span-6 -mt-2 flex flex-wrap gap-1.5">
            {atalhosData(hoje).map((a) => (
              <Button
                key={a.rotulo}
                type="button"
                size="sm"
                variant="outline"
                className={cn("h-7 rounded-full px-3 text-xs", v.data === a.valor && "border-primary bg-primary/5 text-primary")}
                onClick={() => set("data", a.valor)}
              >
                {a.rotulo}
              </Button>
            ))}
          </div>
          <Campo className="col-span-6 sm:col-span-3" id="at-resp" rotulo="Responsável" erro={erros.responsavelId}>
            <CampoSelect id="at-resp" opcoes={opcoes.responsaveis} valor={v.responsavelId} onChange={(x) => set("responsavelId", x)} />
          </Campo>
          {!v.oportunidadeId && (
            <Campo className="col-span-6 sm:col-span-3" id="at-cliente" rotulo="Cliente" erro={erros.pessoaId}>
              <SeletorPessoa
                id="at-cliente"
                valor={v.pessoaId}
                rotuloInicial={v.pessoaNome}
                papel="cliente"
                placeholder="Opcional"
                invalido={!!erros.pessoaId}
                onChange={(pid, p) => {
                  set("pessoaId", pid);
                  set("pessoaNome", p?.nome ?? null);
                }}
              />
            </Campo>
          )}
          <Campo className="col-span-6" id="at-desc" rotulo="Anotações" erro={erros.descricao}>
            <Textarea id="at-desc" rows={3} maxLength={4000} value={v.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </Campo>
          <DialogFooter className="col-span-6">
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <LoaderCircle className="animate-spin" />} {id ? "Salvar" : "Agendar"}
            </Button>
          </DialogFooter>
        </form>
    </>
  );
}

/** Valores de uma atividade nova. */
export function atividadeVazia(hoje: string, responsavelId: string, oportunidadeId: string | null = null): ValoresAtividade {
  return { tipo: "LIGACAO", assunto: "", descricao: "", data: hoje, hora: "", responsavelId, oportunidadeId, pessoaId: null, pessoaNome: null };
}
