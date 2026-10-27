"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, LoaderCircle, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Campo, Segmentado } from "@/components/financeiro/campos";
import { Selo } from "@/components/selos";
import { hojeISO } from "@/lib/datas";
import { cn } from "@/lib/utils";
import { buscarEnderecos, buscarVolumes, darSaidaVolumes, desfazerSaida, enderecarVolumes, transferirConteudo, type OpcaoEndereco, type OpcaoVolume } from "@/modules/armazem/acoes";
import { fmtQuantidade, type TipoVolume } from "@/modules/armazem/tipos";
import { lerQuantidade, type LinhaConteudoTela } from "./editor-conteudo";

// ───────────────────────── Endereçar ─────────────────────────

/** Escolhe o endereço para um ou vários volumes (reservados ao depositante aparecem primeiro, com a ocupação). */
export function DialogoEnderecar({
  aberto,
  onAbertoChange,
  volumeIds,
  rotulo,
  estabelecimentoId,
  depositanteId,
  enderecoAtual,
  aoConcluir,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  volumeIds: string[];
  rotulo: string;
  estabelecimentoId: string;
  depositanteId: string | null;
  enderecoAtual?: string | null;
  aoConcluir?: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        {aberto && (
          <CorpoEnderecar
            volumeIds={volumeIds}
            rotulo={rotulo}
            estabelecimentoId={estabelecimentoId}
            depositanteId={depositanteId}
            enderecoAtual={enderecoAtual ?? null}
            fechar={() => onAbertoChange(false)}
            aoConcluir={aoConcluir}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CorpoEnderecar({
  volumeIds,
  rotulo,
  estabelecimentoId,
  depositanteId,
  enderecoAtual,
  fechar,
  aoConcluir,
}: {
  volumeIds: string[];
  rotulo: string;
  estabelecimentoId: string;
  depositanteId: string | null;
  enderecoAtual: string | null;
  fechar: () => void;
  aoConcluir?: () => void;
}) {
  const router = useRouter();
  const [termo, setTermo] = useState("");
  const [opcoes, setOpcoes] = useState<OpcaoEndereco[] | null>(null);
  const [escolhido, setEscolhido] = useState<OpcaoEndereco | null>(null);
  const [buscando, iniciarBusca] = useTransition();
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    const t = setTimeout(
      () =>
        iniciarBusca(async () => {
          const r = await buscarEnderecos(estabelecimentoId, termo, depositanteId);
          setOpcoes(r.ok ? (r.data ?? []) : []);
        }),
      termo ? 220 : 0,
    );
    return () => clearTimeout(t);
  }, [termo, estabelecimentoId, depositanteId]);

  function confirmar(enderecoId: string | null) {
    iniciar(async () => {
      const r = await enderecarVolumes({ volumeIds, enderecoId });
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem ?? "Pronto.");
      fechar();
      aoConcluir?.();
      router.refresh();
    });
  }

  const cheio = (o: OpcaoEndereco) => o.capacidade !== null && o.ocupados + volumeIds.length > o.capacidade;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Endereçar {rotulo}</DialogTitle>
        <DialogDescription>
          {enderecoAtual ? `Hoje em ${enderecoAtual}. ` : ""}Digite o código da posição (ou parte dele) e escolha. Posições reservadas a outro depositante não aparecem.
        </DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input autoFocus value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Ex.: A-01 ou A-01-02" className="pl-8 uppercase placeholder:normal-case" aria-label="Código do endereço" />
      </div>
      <div className="max-h-80 space-y-1 overflow-y-auto" role="listbox" aria-label="Endereços">
        {opcoes === null || (buscando && !opcoes.length) ? (
          <p className="flex items-center gap-2 px-1 py-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Buscando…
          </p>
        ) : !opcoes.length ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">Nenhum endereço ativo com esse código. Cadastre em Serviços › Endereços do armazém.</p>
        ) : (
          opcoes.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={escolhido?.id === o.id}
              disabled={cheio(o)}
              onClick={() => setEscolhido(o)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50",
                escolhido?.id === o.id && "border-primary bg-primary/5",
              )}
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium">
                  <MapPin className="size-3.5 text-muted-foreground" aria-hidden /> {o.codigo}
                  {escolhido?.id === o.id && <Check className="size-4 text-primary" aria-hidden />}
                </span>
                {o.reservadoPara && <span className="block text-xs text-muted-foreground">reservado: {o.reservadoPara}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {o.ocupados === 0 ? <Selo tom="sucesso">livre</Selo> : `${o.ocupados}${o.capacidade !== null ? ` de ${o.capacidade}` : ""} ${o.ocupados === 1 ? "volume" : "volumes"}`}
                {cheio(o) && <span className="block text-destructive">sem espaço</span>}
              </span>
            </button>
          ))
        )}
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        {enderecoAtual ? (
          <Button variant="ghost" onClick={() => confirmar(null)} disabled={enviando}>
            Tirar do endereço
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={fechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={() => escolhido && confirmar(escolhido.id)} disabled={enviando || !escolhido}>
            {enviando && <LoaderCircle className="animate-spin" />} {escolhido ? `Colocar em ${escolhido.codigo}` : "Escolha o endereço"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

// ───────────────────────── Transferir ─────────────────────────

/** Passa itens desta caixa ou pallet para outro volume do mesmo depositante, ou para um volume novo. */
export function DialogoTransferir({
  aberto,
  onAbertoChange,
  origem,
  conteudo,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  origem: { id: string; codigo: string };
  conteudo: (LinhaConteudoTela & { id: string })[];
}) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-2xl">{aberto && <CorpoTransferir origem={origem} conteudo={conteudo} fechar={() => onAbertoChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function CorpoTransferir({ origem, conteudo, fechar }: { origem: { id: string; codigo: string }; conteudo: (LinhaConteudoTela & { id: string })[]; fechar: () => void }) {
  const router = useRouter();
  const [modo, setModo] = useState<"novo" | "existente">("novo");
  const [novoTipo, setNovoTipo] = useState<TipoVolume>("CAIXA");
  const [termo, setTermo] = useState("");
  const [opcoes, setOpcoes] = useState<OpcaoVolume[]>([]);
  const [destino, setDestino] = useState<OpcaoVolume | null>(null);
  const [marcados, setMarcados] = useState<Record<string, string>>({});
  const [buscando, iniciarBusca] = useTransition();
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    if (modo !== "existente") return;
    const t = setTimeout(
      () =>
        iniciarBusca(async () => {
          const r = await buscarVolumes(origem.id, termo);
          setOpcoes(r.ok ? (r.data ?? []) : []);
        }),
      termo ? 220 : 0,
    );
    return () => clearTimeout(t);
  }, [termo, modo, origem.id]);

  const linhas = conteudo
    .filter((c) => c.id in marcados)
    .map((c) => ({ conteudoId: c.id, quantidade: lerQuantidade(marcados[c.id] ?? ""), max: c.quantidade, rotulo: `${c.codigo}${c.lote ? ` lote ${c.lote}` : ""}` }));
  const invalida = linhas.find((l) => !(l.quantidade > 0) || l.quantidade > l.max + 0.0005);

  function confirmar() {
    if (!linhas.length) return void toast.error("Marque o que vai passar para o outro volume.");
    if (invalida) return void toast.error(`${invalida.rotulo}: quantidade entre 0 e ${invalida.max.toLocaleString("pt-BR")}.`);
    if (modo === "existente" && !destino) return void toast.error("Escolha o volume de destino.");
    iniciar(async () => {
      const r = await transferirConteudo({ origemId: origem.id, destinoId: modo === "existente" ? destino!.id : null, novoTipo: modo === "novo" ? novoTipo : null, linhas: linhas.map(({ conteudoId, quantidade }) => ({ conteudoId, quantidade })) });
      if (!r.ok) return void toast.error(r.erro);
      toast.success(`Itens transferidos para ${r.data?.codigo}.`);
      fechar();
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Transferir itens de {origem.codigo}</DialogTitle>
        <DialogDescription>Para reembalar, juntar códigos e lotes iguais ou separar o que vai sair. Cada item mantém o recebimento (e a NF-e) de origem.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <p className="text-sm font-medium">O que transferir</p>
        <div className="space-y-1.5">
          {conteudo.map((c) => {
            const marcado = c.id in marcados;
            return (
              <div key={c.id} className={cn("flex flex-wrap items-center gap-3 rounded-md border px-3 py-2", marcado && "border-primary/50 bg-primary/5")}>
                <Checkbox
                  id={`tr-${c.id}`}
                  checked={marcado}
                  onCheckedChange={(v) =>
                    setMarcados((m) => {
                      const n = { ...m };
                      if (v === true) n[c.id] = c.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });
                      else delete n[c.id];
                      return n;
                    })
                  }
                />
                <label htmlFor={`tr-${c.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                  <span className="font-medium">{c.codigo}</span>
                  {c.lote ? <span className="text-muted-foreground"> · lote {c.lote}</span> : null}
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.descricao} · há {fmtQuantidade(c.quantidade, c.unidade)}
                  </span>
                </label>
                {marcado && (
                  <Input
                    aria-label={`Quantidade de ${c.codigo}`}
                    inputMode="decimal"
                    value={marcados[c.id]}
                    onChange={(e) => setMarcados((m) => ({ ...m, [c.id]: e.target.value }))}
                    className="w-28 text-right tabular-nums"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Para onde</p>
        <Segmentado
          rotulo="Destino"
          valor={modo}
          onChange={setModo}
          opcoes={[
            { valor: "novo", rotulo: "Volume novo" },
            { valor: "existente", rotulo: "Volume existente" },
          ]}
        />
        {modo === "novo" ? (
          <Segmentado
            rotulo="Tipo do volume novo"
            valor={novoTipo}
            onChange={setNovoTipo}
            opcoes={[
              { valor: "CAIXA", rotulo: "Caixa" },
              { valor: "PALLET", rotulo: "Pallet" },
            ]}
          />
        ) : (
          <div className="space-y-1.5">
            <Input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="CX-0012, PL-3 ou o número" className="uppercase placeholder:normal-case" aria-label="Volume de destino" />
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {buscando && !opcoes.length ? (
                <p className="text-sm text-muted-foreground">Buscando…</p>
              ) : !opcoes.length ? (
                <p className="text-sm text-muted-foreground">Nenhum outro volume deste depositante no estabelecimento.</p>
              ) : (
                opcoes.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setDestino(o)}
                    className={cn("flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-left text-sm hover:bg-muted/50", destino?.id === o.id && "border-primary bg-primary/5")}
                  >
                    <span className="font-medium">{o.codigo}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.itens} {o.itens === 1 ? "item" : "itens"} · {o.endereco ?? "sem endereço"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={enviando}>
          Cancelar
        </Button>
        <Button onClick={confirmar} disabled={enviando || !linhas.length}>
          {enviando && <LoaderCircle className="animate-spin" />} Transferir {linhas.length ? `${linhas.length} ${linhas.length === 1 ? "item" : "itens"}` : ""}
        </Button>
      </DialogFooter>
    </>
  );
}

// ───────────────────────── Saída ─────────────────────────

/** Saída de volumes inteiros (retirada pelo depositante ou entrega por conta e ordem dele). */
export function DialogoSaida({
  aberto,
  onAbertoChange,
  volumeIds,
  rotulo,
  aoConcluir,
}: {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  volumeIds: string[];
  rotulo: string;
  aoConcluir?: () => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-lg">{aberto && <CorpoSaida volumeIds={volumeIds} rotulo={rotulo} fechar={() => onAbertoChange(false)} aoConcluir={aoConcluir} />}</DialogContent>
    </Dialog>
  );
}

function CorpoSaida({ volumeIds, rotulo, fechar, aoConcluir }: { volumeIds: string[]; rotulo: string; fechar: () => void; aoConcluir?: () => void }) {
  const router = useRouter();
  const [data, setData] = useState(hojeISO());
  const [documento, setDocumento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, iniciar] = useTransition();
  function confirmar() {
    iniciar(async () => {
      const r = await darSaidaVolumes({ volumeIds, data, documento, observacao: observacao || null });
      if (!r.ok) {
        setErros(r.campos ?? {});
        return void toast.error(r.erro);
      }
      toast.success(r.mensagem ?? "Saída registrada.");
      fechar();
      aoConcluir?.();
      router.refresh();
    });
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Dar saída de {rotulo}</DialogTitle>
        <DialogDescription>O volume sai inteiro e libera o endereço. Para retirar só parte, transfira antes os itens para outro volume.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Campo id="saida-data" rotulo="Data" erro={erros.data}>
          <Input id="saida-data" type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <Campo id="saida-doc" rotulo="Documento da saída" obrigatorio erro={erros.documento} ajuda="Ex.: NF-e de retorno nº 123">
          <Input id="saida-doc" value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="NF-e de retorno nº…" />
        </Campo>
      </div>
      <Campo id="saida-obs" rotulo="Observação">
        <Textarea id="saida-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} placeholder="Quem retirou, placa do veículo…" />
      </Campo>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={enviando}>
          Cancelar
        </Button>
        <Button onClick={confirmar} disabled={enviando}>
          {enviando && <LoaderCircle className="animate-spin" />} Registrar saída
        </Button>
      </DialogFooter>
    </>
  );
}

export function DialogoDesfazerSaida({ aberto, onAbertoChange, volumeId, codigo }: { aberto: boolean; onAbertoChange: (v: boolean) => void; volumeId: string; codigo: string }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [enviando, iniciar] = useTransition();
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Desfazer a saída de {codigo}</DialogTitle>
          <DialogDescription>O volume volta ao armazém, sem endereço. Use quando a saída foi registrada por engano ou a mercadoria voltou.</DialogDescription>
        </DialogHeader>
        <Campo id="desf-motivo" rotulo="Motivo" obrigatorio>
          <Textarea id="desf-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
        </Campo>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbertoChange(false)} disabled={enviando}>
            Voltar
          </Button>
          <Button
            disabled={enviando || !motivo.trim()}
            onClick={() =>
              iniciar(async () => {
                const r = await desfazerSaida(volumeId, motivo);
                if (!r.ok) return void toast.error(r.erro);
                toast.success(r.mensagem ?? "Saída desfeita.");
                onAbertoChange(false);
                router.refresh();
              })
            }
          >
            {enviando && <LoaderCircle className="animate-spin" />} Desfazer saída
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
