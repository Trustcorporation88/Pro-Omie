"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Grid3x3, LoaderCircle, MoreHorizontal, Pencil, Plus, Power, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Campo, CampoSelect } from "@/components/financeiro/campos";
import { SeletorPessoa } from "@/components/seletor-pessoa";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { alternarEndereco, excluirEndereco, gerarEnderecos, salvarEndereco } from "@/modules/armazem/acoes";
import { TIPOS_ENDERECO, gerarCodigosEnderecos, normalizarCodigoEndereco, type TipoEndereco } from "@/modules/armazem/tipos";

type Estabelecimento = { id: string; nome: string };
const OPCOES_TIPO = Object.entries(TIPOS_ENDERECO).map(([valor, rotulo]) => ({ valor, rotulo }));
const inteiro = (s: string) => (s.trim() === "" ? null : Number.isInteger(Number(s)) ? Number(s) : NaN);

export type EnderecoEdicao = { id: string; empresaId: string; codigo: string; zona: string | null; tipo: string; capacidade: number | null; observacao: string | null; reservado: { id: string; nome: string } | null };

// ───────────────────────── Novo / editar ─────────────────────────

export function BotaoNovoEndereco({ estabelecimentos }: { estabelecimentos: Estabelecimento[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Plus /> Novo endereço
      </Button>
      <DialogoEndereco aberto={aberto} onAbertoChange={setAberto} estabelecimentos={estabelecimentos} />
    </>
  );
}

function DialogoEndereco({ aberto, onAbertoChange, estabelecimentos, endereco }: { aberto: boolean; onAbertoChange: (v: boolean) => void; estabelecimentos: Estabelecimento[]; endereco?: EnderecoEdicao }) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-lg">{aberto && <CorpoEndereco estabelecimentos={estabelecimentos} endereco={endereco} fechar={() => onAbertoChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function CorpoEndereco({ estabelecimentos, endereco, fechar }: { estabelecimentos: Estabelecimento[]; endereco?: EnderecoEdicao; fechar: () => void }) {
  const router = useRouter();
  const [estab, setEstab] = useState(endereco?.empresaId ?? (estabelecimentos.length === 1 ? estabelecimentos[0].id : ""));
  const [codigo, setCodigo] = useState(endereco?.codigo ?? "");
  const [zona, setZona] = useState(endereco?.zona ?? "");
  const [tipo, setTipo] = useState<string>(endereco?.tipo ?? "PORTA_PALLET");
  const [capacidade, setCapacidade] = useState(endereco?.capacidade ? String(endereco.capacidade) : "");
  const [reservado, setReservado] = useState<string | null>(endereco?.reservado?.id ?? null);
  const [observacao, setObservacao] = useState(endereco?.observacao ?? "");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, iniciar] = useTransition();
  const cap = inteiro(capacidade);
  function salvar() {
    if (Number.isNaN(cap)) return void setErros({ capacidade: "Número inteiro de volumes." });
    iniciar(async () => {
      const r = await salvarEndereco({
        id: endereco?.id ?? null,
        estabelecimentoId: estab,
        codigo,
        zona: zona || null,
        tipo: tipo as TipoEndereco,
        capacidade: cap,
        depositanteId: reservado,
        observacao: observacao || null,
      });
      if (!r.ok) {
        setErros(r.campos ?? {});
        return void toast.error(r.erro);
      }
      toast.success(r.mensagem ?? "Endereço salvo.");
      fechar();
      router.refresh();
    });
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{endereco ? `Endereço ${endereco.codigo}` : "Novo endereço"}</DialogTitle>
        <DialogDescription>A posição no armazém onde ficam as caixas e os pallets. O código vai na etiqueta da posição (ex.: rua A, módulo 01, nível 02 = A-01-02).</DialogDescription>
      </DialogHeader>
      {!endereco && estabelecimentos.length > 1 && (
        <Campo id="end-estab" rotulo="Estabelecimento" obrigatorio erro={erros.estabelecimentoId}>
          <CampoSelect id="end-estab" opcoes={estabelecimentos.map((e) => ({ valor: e.id, rotulo: e.nome }))} valor={estab} onChange={setEstab} vazio="Escolha…" />
        </Campo>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="end-codigo" rotulo="Código" obrigatorio erro={erros.codigo} ajuda={codigo && normalizarCodigoEndereco(codigo) !== codigo ? `Fica: ${normalizarCodigoEndereco(codigo)}` : undefined}>
          <Input id="end-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="A-01-02" className="uppercase placeholder:normal-case" />
        </Campo>
        <Campo id="end-zona" rotulo="Rua / zona" ajuda="Vazio: a parte antes do primeiro hífen">
          <Input id="end-zona" value={zona} onChange={(e) => setZona(e.target.value)} placeholder="A" className="uppercase placeholder:normal-case" />
        </Campo>
        <Campo id="end-tipo" rotulo="Tipo">
          <CampoSelect id="end-tipo" opcoes={OPCOES_TIPO} valor={tipo} onChange={setTipo} />
        </Campo>
        <Campo id="end-cap" rotulo="Capacidade (volumes)" erro={erros.capacidade} ajuda="Vazio: sem limite">
          <Input id="end-cap" type="number" min={1} value={capacidade} onChange={(e) => setCapacidade(e.target.value)} placeholder="Sem limite" />
        </Campo>
      </div>
      <Campo id="end-reserva" rotulo="Reservado para" erro={erros.depositanteId} ajuda="Opcional: só volumes deste depositante entram na posição">
        <SeletorPessoa id="end-reserva" valor={reservado} rotuloInicial={endereco?.reservado?.nome} onChange={(id) => setReservado(id)} papel="cliente" placeholder="Qualquer depositante" />
      </Campo>
      <Campo id="end-obs" rotulo="Observação">
        <Textarea id="end-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
      </Campo>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={enviando}>
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={enviando}>
          {enviando && <LoaderCircle className="animate-spin" />} Salvar
        </Button>
      </DialogFooter>
    </>
  );
}

// ───────────────────────── Gerar em lote ─────────────────────────

export function BotaoGerarEnderecos({ estabelecimentos, destaque = false }: { estabelecimentos: Estabelecimento[]; destaque?: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant={destaque ? "default" : "outline"} onClick={() => setAberto(true)}>
        <Grid3x3 /> Gerar endereços
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-lg">{aberto && <CorpoGerar estabelecimentos={estabelecimentos} fechar={() => setAberto(false)} />}</DialogContent>
      </Dialog>
    </>
  );
}

function CorpoGerar({ estabelecimentos, fechar }: { estabelecimentos: Estabelecimento[]; fechar: () => void }) {
  const router = useRouter();
  const [estab, setEstab] = useState(estabelecimentos.length === 1 ? estabelecimentos[0].id : "");
  const [ruas, setRuas] = useState("A-C");
  const [modulos, setModulos] = useState({ de: "1", ate: "10" });
  const [niveis, setNiveis] = useState({ de: "1", ate: "4" });
  const [posicoes, setPosicoes] = useState({ de: "", ate: "" });
  const [tipo, setTipo] = useState("PORTA_PALLET");
  const [capacidade, setCapacidade] = useState("");
  const [enviando, iniciar] = useTransition();
  const entrada = {
    ruas,
    moduloDe: Number(modulos.de),
    moduloAte: Number(modulos.ate),
    nivelDe: Number(niveis.de),
    nivelAte: Number(niveis.ate),
    posicaoDe: posicoes.de ? Number(posicoes.de) : null,
    posicaoAte: posicoes.ate ? Number(posicoes.ate) : null,
  };
  const previa = gerarCodigosEnderecos(entrada);
  const cap = inteiro(capacidade);
  const faixa = (rotulo: string, v: { de: string; ate: string }, set: (v: { de: string; ate: string }) => void, opcional = false) => (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">
        {rotulo}
        {opcional && <span className="font-normal text-muted-foreground"> (opcional)</span>}
      </legend>
      <div className="flex items-center gap-2">
        <Input aria-label={`${rotulo}: de`} type="number" min={0} value={v.de} onChange={(e) => set({ ...v, de: e.target.value })} className="w-20" />
        <span className="text-sm text-muted-foreground">a</span>
        <Input aria-label={`${rotulo}: até`} type="number" min={0} value={v.ate} onChange={(e) => set({ ...v, ate: e.target.value })} className="w-20" />
      </div>
    </fieldset>
  );
  return (
    <>
      <DialogHeader>
        <DialogTitle>Gerar endereços</DialogTitle>
        <DialogDescription>Cria de uma vez as posições do armazém: rua × módulo × nível (× posição). As que já existem ficam como estão.</DialogDescription>
      </DialogHeader>
      {estabelecimentos.length > 1 && (
        <Campo id="ger-estab" rotulo="Estabelecimento" obrigatorio>
          <CampoSelect id="ger-estab" opcoes={estabelecimentos.map((e) => ({ valor: e.id, rotulo: e.nome }))} valor={estab} onChange={setEstab} vazio="Escolha…" />
        </Campo>
      )}
      <Campo id="ger-ruas" rotulo="Ruas" ajuda="Letras ou números: A-C, A,B,D ou 1-3">
        <Input id="ger-ruas" value={ruas} onChange={(e) => setRuas(e.target.value)} className="uppercase placeholder:normal-case" />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-3">
        {faixa("Módulos", modulos, setModulos)}
        {faixa("Níveis", niveis, setNiveis)}
        {faixa("Posições", posicoes, setPosicoes, true)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="ger-tipo" rotulo="Tipo">
          <CampoSelect id="ger-tipo" opcoes={OPCOES_TIPO} valor={tipo} onChange={setTipo} />
        </Campo>
        <Campo id="ger-cap" rotulo="Capacidade (volumes)" ajuda="Vazio: sem limite">
          <Input id="ger-cap" type="number" min={1} value={capacidade} onChange={(e) => setCapacidade(e.target.value)} />
        </Campo>
      </div>
      <div className="rounded-lg border bg-muted/30 p-3 text-sm" aria-live="polite">
        {"erro" in previa ? (
          <span className="text-destructive">{previa.erro}</span>
        ) : (
          <>
            <span className="font-medium">{previa.codigos.length.toLocaleString("pt-BR")} endereços</span>
            <span className="text-muted-foreground">
              {" "}
              · {previa.codigos[0]?.codigo} … {previa.codigos[previa.codigos.length - 1]?.codigo}
            </span>
          </>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={enviando}>
          Cancelar
        </Button>
        <Button
          disabled={enviando || "erro" in previa || !estab || Number.isNaN(cap)}
          onClick={() =>
            iniciar(async () => {
              const r = await gerarEnderecos({ ...entrada, estabelecimentoId: estab, tipo: tipo as TipoEndereco, capacidade: cap });
              if (!r.ok) return void toast.error(r.erro);
              toast.success(`${r.data!.criados.toLocaleString("pt-BR")} endereços criados${r.data!.existentes ? ` (${r.data!.existentes} já existiam)` : ""}.`);
              fechar();
              router.refresh();
            })
          }
        >
          {enviando && <LoaderCircle className="animate-spin" />} Gerar
        </Button>
      </DialogFooter>
    </>
  );
}

// ───────────────────────── Ações da linha ─────────────────────────

export function AcoesEndereco({ endereco, ativo, ocupado, estabelecimentos }: { endereco: EnderecoEdicao; ativo: boolean; ocupado: boolean; estabelecimentos: Estabelecimento[] }) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<null | "editar" | "excluir">(null);
  const [enviando, iniciar] = useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Ações do endereço ${endereco.codigo}`} disabled={enviando}>
            {enviando ? <LoaderCircle className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialogo("editar")}>
            <Pencil /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/api/armazem/etiquetas?tipo=enderecos&ids=${endereco.id}`} target="_blank" rel="noopener">
              <Printer /> Etiqueta
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={ativo && ocupado}
            onSelect={() =>
              iniciar(async () => {
                const r = await alternarEndereco(endereco.id);
                if (!r.ok) return void toast.error(r.erro);
                toast.success(r.data?.ativo ? "Endereço reativado." : "Endereço inativado.");
                router.refresh();
              })
            }
          >
            <Power /> {ativo ? "Inativar" : "Reativar"}
          </DropdownMenuItem>
          {!ocupado && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialogo("excluir")}>
                <Trash2 /> Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogoEndereco aberto={dialogo === "editar"} onAbertoChange={(v) => !v && setDialogo(null)} estabelecimentos={estabelecimentos} endereco={endereco} />
      <ConfirmarAcao
        aberto={dialogo === "excluir"}
        onAbertoChange={(v) => !v && setDialogo(null)}
        titulo={`Excluir o endereço ${endereco.codigo}?`}
        descricao="A posição está vazia. O histórico dos volumes que passaram por ela continua com o código."
        rotuloConfirmar="Excluir"
        destrutivo
        acao={() => excluirEndereco(endereco.id)}
      />
    </>
  );
}

export function BotaoEditarEndereco({ endereco, estabelecimentos }: { endereco: EnderecoEdicao; estabelecimentos: Estabelecimento[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Pencil /> Editar
      </Button>
      <DialogoEndereco aberto={aberto} onAbertoChange={setAberto} estabelecimentos={estabelecimentos} endereco={endereco} />
    </>
  );
}
