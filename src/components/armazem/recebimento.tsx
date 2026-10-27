"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, CheckCheck, FilePlus2, FileUp, LoaderCircle, Lock, MoreHorizontal, Package, PackagePlus, Printer, RotateCcw, Trash2, Warehouse, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Campo, CampoSelect, Segmentado } from "@/components/financeiro/campos";
import { SeletorPessoa } from "@/components/seletor-pessoa";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { hojeISO } from "@/lib/datas";
import { cn } from "@/lib/utils";
import {
  adicionarDocumentos,
  concluirConferencia,
  criarRecebimentoDeNota,
  criarRecebimentoManual,
  criarRecebimentoXml,
  criarVolumes,
  excluirRecebimento,
  reabrirConferencia,
  removerDocumento,
} from "@/modules/armazem/acoes";
import type { ResumoComparativo, TipoVolume } from "@/modules/armazem/tipos";

type Estabelecimento = { id: string; nome: string };

function avisar(avisos: string[] | undefined) {
  for (const a of avisos ?? []) toast.warning(a, { duration: 12_000 });
}

/** Seletor de arquivos XML com a lista do que foi escolhido. */
function ArquivosXml({ arquivos, onChange, id }: { arquivos: File[]; onChange: (f: File[]) => void; id: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors hover:bg-muted/40"
      >
        <FileUp className="size-5 text-muted-foreground" aria-hidden />
        <span className="font-medium">Escolher XML da NF-e e/ou do CT-e</span>
        <span className="text-xs text-muted-foreground">Pode escolher vários de uma vez (até 20)</span>
      </button>
      <input
        id={id}
        ref={ref}
        type="file"
        accept=".xml,text/xml,application/xml"
        multiple
        className="sr-only"
        onChange={(e) => {
          const novos = [...(e.target.files ?? [])];
          const nomes = new Set(arquivos.map((a) => a.name));
          onChange([...arquivos, ...novos.filter((n) => !nomes.has(n.name))].slice(0, 20));
          e.target.value = "";
        }}
      />
      {arquivos.length > 0 && (
        <ul className="space-y-1">
          {arquivos.map((a) => (
            <li key={a.name} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-sm">
              <span className="truncate">{a.name}</span>
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Tirar ${a.name}`} onClick={() => onChange(arquivos.filter((x) => x !== a))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────────────────── Novo recebimento ─────────────────────────

export function NovoRecebimento({ estabelecimentos, destaque = true }: { estabelecimentos: Estabelecimento[]; destaque?: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant={destaque ? "default" : "outline"} onClick={() => setAberto(true)}>
        <Warehouse /> Novo recebimento
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-lg">{aberto && <CorpoNovo estabelecimentos={estabelecimentos} fechar={() => setAberto(false)} />}</DialogContent>
      </Dialog>
    </>
  );
}

function CorpoNovo({ estabelecimentos, fechar }: { estabelecimentos: Estabelecimento[]; fechar: () => void }) {
  const router = useRouter();
  const [modo, setModo] = useState<"xml" | "manual">("xml");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [estab, setEstab] = useState(estabelecimentos.length === 1 ? estabelecimentos[0].id : "");
  const [depositante, setDepositante] = useState<string | null>(null);
  const [chegada, setChegada] = useState(hojeISO());
  const [observacao, setObservacao] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, iniciar] = useTransition();

  function criar() {
    iniciar(async () => {
      if (modo === "xml") {
        if (!arquivos.length) return void setErros({ arquivos: "Escolha ao menos um XML." });
        const fd = new FormData();
        for (const a of arquivos) fd.append("arquivos", a);
        fd.append("chegada", chegada);
        fd.append("observacao", observacao);
        if (estab && estabelecimentos.length > 1) fd.append("estabelecimentoId", estab);
        const r = await criarRecebimentoXml(fd);
        if (!r.ok) {
          setErros(r.campos ?? {});
          return void toast.error(r.erro, { duration: 10_000 });
        }
        toast.success(r.mensagem ?? "Recebimento criado.");
        avisar(r.data?.avisos);
        router.push(`/servicos/armazem/recebimentos/${r.data!.id}`);
        return;
      }
      const r = await criarRecebimentoManual({ estabelecimentoId: estab, depositanteId: depositante ?? "", chegada, observacao: observacao || null });
      if (!r.ok) {
        setErros(r.campos ?? {});
        return void toast.error(r.erro);
      }
      toast.success(r.mensagem ?? "Recebimento criado.");
      router.push(`/servicos/armazem/recebimentos/${r.data!.id}`);
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Novo recebimento</DialogTitle>
        <DialogDescription>
          Pelo XML, o depositante (emitente da NF-e ou remetente do CT-e) e os itens esperados entram sozinhos. Sem documento serve para o inventário do que já está
          no armazém.
        </DialogDescription>
      </DialogHeader>
      <Segmentado
        rotulo="Como"
        valor={modo}
        onChange={(v) => {
          setModo(v);
          setErros({});
        }}
        opcoes={[
          { valor: "xml", rotulo: "Pela NF-e ou CT-e (XML)" },
          { valor: "manual", rotulo: "Sem documento" },
        ]}
      />
      {modo === "xml" ? (
        <>
          <ArquivosXml id="rec-arquivos" arquivos={arquivos} onChange={setArquivos} />
          {erros.arquivos && <p className="text-xs text-destructive">{erros.arquivos}</p>}
        </>
      ) : (
        <Campo id="rec-depositante" rotulo="Depositante" obrigatorio erro={erros.depositanteId} ajuda="O cliente dono da mercadoria. Não está no cadastro? Cadastre em Cadastros › Clientes e fornecedores.">
          <SeletorPessoa id="rec-depositante" valor={depositante} onChange={(id) => setDepositante(id)} papel="cliente" placeholder="Escolha o depositante…" invalido={!!erros.depositanteId} />
        </Campo>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {estabelecimentos.length > 1 && (
          <Campo id="rec-estab" rotulo="Estabelecimento" obrigatorio={modo === "manual"} erro={erros.estabelecimentoId} ajuda={modo === "xml" ? "Vazio: o do CNPJ de destino da nota" : undefined}>
            <CampoSelect id="rec-estab" opcoes={estabelecimentos.map((e) => ({ valor: e.id, rotulo: e.nome }))} valor={estab} onChange={setEstab} vazio={modo === "xml" ? "Pelo CNPJ da nota" : "Escolha…"} />
          </Campo>
        )}
        <Campo id="rec-chegada" rotulo="Chegada" erro={erros.chegada}>
          <Input id="rec-chegada" type="date" value={chegada} max={hojeISO()} onChange={(e) => setChegada(e.target.value)} />
        </Campo>
      </div>
      <Campo id="rec-obs" rotulo="Observação">
        <Textarea id="rec-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} placeholder="Placa do veículo, motorista, avarias na chegada…" />
      </Campo>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={enviando}>
          Cancelar
        </Button>
        <Button onClick={criar} disabled={enviando}>
          {enviando && <LoaderCircle className="animate-spin" />} Criar recebimento
        </Button>
      </DialogFooter>
    </>
  );
}

/** Cria o recebimento a partir de uma nota que a busca de notas trouxe. */
export function BotaoReceberNota({ documentoId, rotulo = "Receber no armazém", variante = "default" }: { documentoId: string; rotulo?: string; variante?: "default" | "outline" }) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  return (
    <Button
      size="sm"
      variant={variante}
      disabled={enviando}
      onClick={() =>
        iniciar(async () => {
          const r = await criarRecebimentoDeNota(documentoId);
          if (!r.ok) return void toast.error(r.erro, { duration: 10_000 });
          toast.success(r.mensagem ?? "Recebimento criado.");
          avisar(r.data?.avisos);
          router.push(`/servicos/armazem/recebimentos/${r.data!.id}`);
        })
      }
    >
      {enviando ? <LoaderCircle className="animate-spin" /> : <Warehouse />} {rotulo}
    </Button>
  );
}

// ───────────────────────── Ações do recebimento ─────────────────────────

export function AcoesRecebimento({
  recebimento,
  resumo,
  temVolumes,
  temConteudo,
}: {
  recebimento: { id: string; numero: number; codigo: string; status: "CONFERENCIA" | "CONCLUIDO" };
  resumo: ResumoComparativo;
  temVolumes: boolean;
  temConteudo: boolean;
}) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<null | "volumes" | "concluir" | "reabrir" | "documento" | "excluir">(null);
  const [tipo, setTipo] = useState<TipoVolume>("CAIXA");
  const fechar = (v: boolean) => !v && setDialogo(null);
  const divergencias = resumo.falta + resumo.sobra + resumo.naoPrevisto;
  const aberto = recebimento.status === "CONFERENCIA";
  return (
    <>
      <Button
        variant={aberto && !temVolumes ? "default" : "outline"}
        onClick={() => {
          setTipo("CAIXA");
          setDialogo("volumes");
        }}
      >
        <PackagePlus /> Nova caixa
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          setTipo("PALLET");
          setDialogo("volumes");
        }}
      >
        <Boxes /> Novo pallet
      </Button>
      {aberto ? (
        <Button variant={temConteudo ? "default" : "outline"} onClick={() => setDialogo("concluir")} disabled={!temConteudo} title={temConteudo ? undefined : "Lance os itens nas caixas e pallets antes"}>
          <CheckCheck /> Concluir conferência
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" aria-label="Mais ações do recebimento">
            <MoreHorizontal /> Mais
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {temVolumes && (
            <>
              <DropdownMenuItem asChild>
                <a href={`/api/armazem/etiquetas?tipo=volumes&recebimento=${recebimento.id}`} target="_blank" rel="noopener">
                  <Printer /> Etiquetas dos volumes (10 × 15 cm)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/armazem/etiquetas?tipo=volumes&recebimento=${recebimento.id}&formato=a4`} target="_blank" rel="noopener">
                  <Printer /> Etiquetas em folha A4
                </a>
              </DropdownMenuItem>
            </>
          )}
          {aberto && (
            <DropdownMenuItem onSelect={() => setDialogo("documento")}>
              <FilePlus2 /> Juntar NF-e ou CT-e
            </DropdownMenuItem>
          )}
          {!aberto && (
            <DropdownMenuItem onSelect={() => setDialogo("reabrir")}>
              <RotateCcw /> Reabrir conferência
            </DropdownMenuItem>
          )}
          {!temConteudo && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialogo("excluir")}>
                <Trash2 /> Excluir recebimento
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogo === "volumes"} onOpenChange={fechar}>
        <DialogContent className="sm:max-w-md">{dialogo === "volumes" && <CorpoNovosVolumes recebimentoId={recebimento.id} tipoInicial={tipo} fechar={() => setDialogo(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={dialogo === "documento"} onOpenChange={fechar}>
        <DialogContent className="sm:max-w-lg">{dialogo === "documento" && <CorpoJuntarDocumento recebimentoId={recebimento.id} fechar={() => setDialogo(null)} />}</DialogContent>
      </Dialog>
      <ConfirmarAcao
        aberto={dialogo === "concluir"}
        onAbertoChange={fechar}
        titulo={`Concluir a conferência de ${recebimento.codigo}?`}
        descricao={
          divergencias ? (
            <div className="space-y-1.5">
              <p>A conferência tem divergências em relação aos documentos:</p>
              <ul className="list-inside list-disc text-sm">
                {resumo.falta > 0 && <li>{resumo.falta} com falta</li>}
                {resumo.sobra > 0 && <li>{resumo.sobra} com sobra</li>}
                {resumo.naoPrevisto > 0 && <li>{resumo.naoPrevisto} fora da nota</li>}
              </ul>
              <p>Se estiver certo assim, explique no campo abaixo (fica no histórico e na auditoria). Os volumes passam a armazenados.</p>
            </div>
          ) : (
            "Tudo confere com os documentos. Os volumes passam a armazenados: depois disso, mudar o conteúdo vira ajuste, com motivo."
          )
        }
        pedirMotivo={divergencias > 0}
        rotuloConfirmar="Concluir conferência"
        acao={async (motivo) => {
          const r = await concluirConferencia(recebimento.id, motivo ?? null);
          return r;
        }}
      />
      <ConfirmarAcao
        aberto={dialogo === "reabrir"}
        onAbertoChange={fechar}
        titulo={`Reabrir a conferência de ${recebimento.codigo}?`}
        descricao="Os volumes deste recebimento que não saíram voltam a em conferência (conteúdo muda sem motivo). Use para corrigir a conferência."
        rotuloConfirmar="Reabrir"
        acao={() => reabrirConferencia(recebimento.id)}
      />
      <ConfirmarAcao
        aberto={dialogo === "excluir"}
        onAbertoChange={fechar}
        titulo={`Excluir ${recebimento.codigo}?`}
        descricao="Nenhum item foi conferido. O recebimento, os documentos juntados e os volumes vazios dele são excluídos."
        rotuloConfirmar="Excluir"
        destrutivo
        acao={() => excluirRecebimento(recebimento.id)}
        aoConcluir={() => router.push("/servicos/armazem/recebimentos")}
      />
    </>
  );
}

function CorpoNovosVolumes({ recebimentoId, tipoInicial, fechar }: { recebimentoId: string; tipoInicial: TipoVolume; fechar: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoVolume>(tipoInicial);
  const [quantidade, setQuantidade] = useState("1");
  const [referencia, setReferencia] = useState("");
  const [enviando, iniciar] = useTransition();
  const n = Number(quantidade);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{tipo === "CAIXA" ? "Nova caixa" : "Novo pallet"}</DialogTitle>
        <DialogDescription>Cada volume ganha um número (CX-0001, PL-0001) para a etiqueta. Depois, lance o que vai dentro de cada um.</DialogDescription>
      </DialogHeader>
      <Segmentado
        rotulo="Tipo"
        valor={tipo}
        onChange={setTipo}
        opcoes={[
          { valor: "CAIXA", rotulo: (<><Package /> Caixa</>) },
          { valor: "PALLET", rotulo: (<><Boxes /> Pallet</>) },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <Campo id="vol-qtd" rotulo="Quantos" ajuda="Até 50 de uma vez">
          <Input id="vol-qtd" type="number" min={1} max={50} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
        </Campo>
        <Campo id="vol-ref" rotulo="Referência do depositante" ajuda="Opcional: o número que o cliente usa">
          <Input id="vol-ref" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ex.: caixa 01" />
        </Campo>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={enviando}>
          Cancelar
        </Button>
        <Button
          disabled={enviando || !(n >= 1 && n <= 50)}
          onClick={() =>
            iniciar(async () => {
              const r = await criarVolumes({ recebimentoId, tipo, quantidade: Math.trunc(n), referenciaDepositante: referencia || null });
              if (!r.ok) return void toast.error(r.erro);
              const cods = r.data?.volumes.map((v) => v.codigo) ?? [];
              toast.success(cods.length === 1 ? `${cods[0]} criado.` : `${cods.length} volumes criados: ${cods[0]} a ${cods[cods.length - 1]}.`);
              fechar();
              router.refresh();
            })
          }
        >
          {enviando && <LoaderCircle className="animate-spin" />} Criar {n > 1 ? `${Math.trunc(n)} ${tipo === "CAIXA" ? "caixas" : "pallets"}` : tipo === "CAIXA" ? "caixa" : "pallet"}
        </Button>
      </DialogFooter>
    </>
  );
}

function CorpoJuntarDocumento({ recebimentoId, fechar }: { recebimentoId: string; fechar: () => void }) {
  const router = useRouter();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, iniciar] = useTransition();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Juntar NF-e ou CT-e</DialogTitle>
        <DialogDescription>Outra NF-e do mesmo depositante que veio na mesma carga, ou o CT-e do transporte. Os itens da NF-e entram nos esperados.</DialogDescription>
      </DialogHeader>
      <ArquivosXml id="doc-arquivos" arquivos={arquivos} onChange={setArquivos} />
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={enviando}>
          Cancelar
        </Button>
        <Button
          disabled={enviando || !arquivos.length}
          onClick={() =>
            iniciar(async () => {
              const fd = new FormData();
              fd.append("recebimentoId", recebimentoId);
              for (const a of arquivos) fd.append("arquivos", a);
              const r = await adicionarDocumentos(fd);
              if (!r.ok) return void toast.error(r.erro, { duration: 10_000 });
              toast.success(r.mensagem ?? "Documentos juntados.");
              avisar(r.data?.avisos);
              fechar();
              router.refresh();
            })
          }
        >
          {enviando && <LoaderCircle className="animate-spin" />} Juntar
        </Button>
      </DialogFooter>
    </>
  );
}

export function BotaoRemoverDocumento({ documentoId, rotulo }: { documentoId: string; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" className="size-8" aria-label={`Tirar ${rotulo} do recebimento`} onClick={() => setAberto(true)}>
        <Trash2 />
      </Button>
      <ConfirmarAcao
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo={`Tirar ${rotulo} do recebimento?`}
        descricao="Os itens esperados desta nota saem da conferência. O que já foi lançado nas caixas não muda."
        rotuloConfirmar="Tirar"
        destrutivo
        acao={() => removerDocumento(documentoId)}
      />
    </>
  );
}

/** Selo de conferência fechada, para a tela do recebimento. */
export function SeloConferido({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <Lock className="size-3" aria-hidden /> conferência concluída
    </span>
  );
}
