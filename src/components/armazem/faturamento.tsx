"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Camera, Download, FilePlus2, LoaderCircle, MoreHorizontal, Pencil, Plus, Power, ReceiptText, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Campo, CampoSelect, Segmentado } from "@/components/financeiro/campos";
import { CampoMoeda } from "@/components/campo-moeda";
import { SeletorPessoa } from "@/components/seletor-pessoa";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { Selo } from "@/components/selos";
import { fmtData, fmtMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { alternarTarifaArmazem, atualizarFotografiaArmazem, desfazerFaturamentoArmazemAcao, gerarFaturamentoArmazemAcao, gerarTodosFaturamentosArmazem, salvarTarifaArmazem } from "@/modules/armazem/faturamento-acoes";
import { ROTULO_METODO, competenciaCurta, type DiaOcupacao, type MetodoArmazenagem } from "@/modules/armazem/tipos";

type Opcao = { valor: string; rotulo: string };
export type OpcoesTarifa = { estabelecimentos: Opcao[]; servicos: Opcao[]; categorias: Opcao[]; contas: Opcao[]; formas: Opcao[]; inicioPadrao: string };
export type TarifaEdicao = {
  id: string;
  empresaId: string;
  depositanteId: string;
  depositante: string;
  valorPosicao: number;
  metodo: MetodoArmazenagem;
  minimoPosicoes: number | null;
  cobrarReservadas: boolean;
  inicio: string;
  produtoId: string | null;
  descricao: string;
  diaVencimento: number;
  categoriaId: string | null;
  contaBancariaId: string | null;
  formaPagamentoId: string | null;
  gerarCobranca: boolean;
  observacoes: string | null;
  ativo: boolean;
};

// ───────────────────────── Tarifa ─────────────────────────

export function BotaoNovaTarifa({ opcoes, depositante, rotulo = "Nova tarifa", variante = "outline", tamanho = "default" }: { opcoes: OpcoesTarifa; depositante?: { id: string; nome: string; empresaId: string }; rotulo?: string; variante?: "outline" | "default"; tamanho?: "default" | "sm" }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant={variante} size={tamanho} onClick={() => setAberto(true)}>
        <Plus /> {rotulo}
      </Button>
      <DialogoTarifa aberto={aberto} onAbertoChange={setAberto} opcoes={opcoes} depositante={depositante} />
    </>
  );
}

function DialogoTarifa({ aberto, onAbertoChange, opcoes, tarifa, depositante }: { aberto: boolean; onAbertoChange: (v: boolean) => void; opcoes: OpcoesTarifa; tarifa?: TarifaEdicao; depositante?: { id: string; nome: string; empresaId: string } }) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-2xl">{aberto && <CorpoTarifa opcoes={opcoes} tarifa={tarifa} depositante={depositante} fechar={() => onAbertoChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function CorpoTarifa({ opcoes, tarifa, depositante, fechar }: { opcoes: OpcoesTarifa; tarifa?: TarifaEdicao; depositante?: { id: string; nome: string; empresaId: string }; fechar: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({
    estabelecimentoId: tarifa?.empresaId ?? depositante?.empresaId ?? (opcoes.estabelecimentos.length === 1 ? opcoes.estabelecimentos[0].valor : ""),
    depositanteId: tarifa?.depositanteId ?? depositante?.id ?? null,
    valorPosicao: tarifa?.valorPosicao ?? 0,
    metodo: (tarifa?.metodo ?? "PRO_RATA") as MetodoArmazenagem,
    minimo: tarifa?.minimoPosicoes ? String(tarifa.minimoPosicoes) : "",
    cobrarReservadas: tarifa?.cobrarReservadas ?? true,
    inicio: tarifa?.inicio ?? opcoes.inicioPadrao,
    produtoId: tarifa?.produtoId ?? (opcoes.servicos.length === 1 ? opcoes.servicos[0].valor : ""),
    descricao: tarifa?.descricao ?? "Armazenagem de mercadorias",
    diaVencimento: String(tarifa?.diaVencimento ?? 10),
    categoriaId: tarifa?.categoriaId ?? "",
    contaBancariaId: tarifa?.contaBancariaId ?? "",
    formaPagamentoId: tarifa?.formaPagamentoId ?? "",
    gerarCobranca: tarifa?.gerarCobranca ?? false,
    observacoes: tarifa?.observacoes ?? "",
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, iniciar] = useTransition();
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((a) => ({ ...a, [k]: x }));
  function salvar() {
    const minimo = v.minimo.trim() ? Number(v.minimo) : null;
    const dia = Number(v.diaVencimento);
    iniciar(async () => {
      const r = await salvarTarifaArmazem({
        id: tarifa?.id ?? null,
        estabelecimentoId: v.estabelecimentoId,
        depositanteId: v.depositanteId ?? "",
        valorPosicao: v.valorPosicao,
        metodo: v.metodo,
        minimoPosicoes: minimo,
        cobrarReservadas: v.cobrarReservadas,
        inicio: v.inicio,
        produtoId: v.produtoId || null,
        descricao: v.descricao,
        diaVencimento: Number.isFinite(dia) ? Math.trunc(dia) : 0,
        categoriaId: v.categoriaId || null,
        contaBancariaId: v.contaBancariaId || null,
        formaPagamentoId: v.formaPagamentoId || null,
        gerarCobranca: v.gerarCobranca,
        observacoes: v.observacoes || null,
      });
      if (!r.ok) {
        setErros(r.campos ?? {});
        return void toast.error(r.erro);
      }
      toast.success(r.mensagem ?? "Tarifa salva.");
      fechar();
      router.refresh();
    });
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{tarifa ? `Tarifa de ${tarifa.depositante}` : "Nova tarifa de armazenagem"}</DialogTitle>
        <DialogDescription>Preço por posição-pallet por mês. Todo dia o sistema fotografa as posições ocupadas pelo depositante; no fim do mês, a tarifa vira o valor da armazenagem.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="tar-dep" rotulo="Depositante" obrigatorio erro={erros.depositanteId} className="sm:col-span-2">
          <SeletorPessoa id="tar-dep" valor={v.depositanteId} rotuloInicial={tarifa?.depositante ?? depositante?.nome} onChange={(id) => set("depositanteId", id)} papel="cliente" placeholder="Escolha o depositante…" invalido={!!erros.depositanteId} />
        </Campo>
        {opcoes.estabelecimentos.length > 1 && (
          <Campo id="tar-estab" rotulo="Estabelecimento" obrigatorio erro={erros.estabelecimentoId} ajuda="O que presta o serviço (emite o pedido e a nota)" className="sm:col-span-2">
            <CampoSelect id="tar-estab" opcoes={opcoes.estabelecimentos} valor={v.estabelecimentoId} onChange={(x) => set("estabelecimentoId", x)} vazio="Escolha…" />
          </Campo>
        )}
        <Campo id="tar-valor" rotulo="Valor por posição-pallet/mês" obrigatorio erro={erros.valorPosicao}>
          <CampoMoeda id="tar-valor" valor={v.valorPosicao} onChange={(x) => set("valorPosicao", x)} />
        </Campo>
        <Campo id="tar-inicio" rotulo="Início da cobrança" obrigatorio erro={erros.inicio} ajuda="Os dias antes dele não entram">
          <Input id="tar-inicio" type="date" value={v.inicio} onChange={(e) => set("inicio", e.target.value)} />
        </Campo>
        <div className="space-y-1.5 sm:col-span-2">
          <p className="text-sm font-medium">Como contar as posições</p>
          <Segmentado
            rotulo="Como contar as posições"
            valor={v.metodo}
            onChange={(x) => set("metodo", x)}
            opcoes={[
              { valor: "PRO_RATA", rotulo: "Por dia (posição-dia)" },
              { valor: "PICO", rotulo: "Maior ocupação do mês" },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {v.metodo === "PRO_RATA"
              ? "Soma as posições de cada dia e divide pelos dias do mês: 10 posições por 15 dias = 5 posições no mês."
              : "Cobra o maior número de posições ocupadas num mesmo dia do mês."}
          </p>
        </div>
        <Campo id="tar-minimo" rotulo="Mínimo de posições por mês" erro={erros.minimoPosicoes} ajuda="Opcional: posições contratadas">
          <Input id="tar-minimo" type="number" min={1} value={v.minimo} onChange={(e) => set("minimo", e.target.value)} placeholder="Sem mínimo" />
        </Campo>
        <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
          <Switch id="tar-reservadas" checked={v.cobrarReservadas} onCheckedChange={(x) => set("cobrarReservadas", x)} />
          <Label htmlFor="tar-reservadas" className="block cursor-pointer text-sm leading-snug font-normal">
            Cobrar as posições reservadas para ele, mesmo vazias
            <span className="block text-xs text-muted-foreground">Reserva em Endereços do armazém</span>
          </Label>
        </div>
        <Campo id="tar-servico" rotulo="Serviço do cadastro" erro={erros.produtoId} ajuda="Dá o código de tributação da NFS-e (armazenagem: item 11.04 do ISS)">
          <CampoSelect id="tar-servico" opcoes={opcoes.servicos} valor={v.produtoId} onChange={(x) => set("produtoId", x)} vazio="—" />
        </Campo>
        <Campo id="tar-desc" rotulo="Descrição (sai no pedido e na nota)" obrigatorio erro={erros.descricao}>
          <Input id="tar-desc" value={v.descricao} onChange={(e) => set("descricao", e.target.value)} />
        </Campo>
        <Campo id="tar-dia" rotulo="Dia do vencimento" obrigatorio erro={erros.diaVencimento} ajuda="No mês seguinte ao da armazenagem (1 a 28)">
          <Input id="tar-dia" type="number" min={1} max={28} value={v.diaVencimento} onChange={(e) => set("diaVencimento", e.target.value)} />
        </Campo>
        <Campo id="tar-cat" rotulo="Categoria da receita" erro={erros.categoriaId}>
          <CampoSelect id="tar-cat" opcoes={opcoes.categorias} valor={v.categoriaId} onChange={(x) => set("categoriaId", x)} vazio="A primeira de receita" />
        </Campo>
        <Campo id="tar-conta" rotulo="Conta prevista" erro={erros.contaBancariaId}>
          <CampoSelect id="tar-conta" opcoes={opcoes.contas} valor={v.contaBancariaId} onChange={(x) => set("contaBancariaId", x)} vazio="—" />
        </Campo>
        <Campo id="tar-forma" rotulo="Forma de pagamento" erro={erros.formaPagamentoId}>
          <CampoSelect id="tar-forma" opcoes={opcoes.formas} valor={v.formaPagamentoId} onChange={(x) => set("formaPagamentoId", x)} vazio="—" />
        </Campo>
        <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 sm:col-span-2">
          <Switch id="tar-cobranca" checked={v.gerarCobranca} onCheckedChange={(x) => set("gerarCobranca", x)} />
          <Label htmlFor="tar-cobranca" className="cursor-pointer text-sm font-normal">
            Gerar boleto/Pix (Asaas) e enviar ao depositante no faturamento
          </Label>
        </div>
        <Campo id="tar-obs" rotulo="Observações (saem no pedido)" className="sm:col-span-2">
          <Textarea id="tar-obs" value={v.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={2} />
        </Campo>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={fechar} disabled={enviando}>
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={enviando}>
          {enviando && <LoaderCircle className="animate-spin" />} Salvar tarifa
        </Button>
      </DialogFooter>
    </>
  );
}

export function AcoesTarifa({ tarifa, opcoes }: { tarifa: TarifaEdicao; opcoes: OpcoesTarifa }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [enviando, iniciar] = useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Ações da tarifa de ${tarifa.depositante}`} disabled={enviando}>
            {enviando ? <LoaderCircle className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditando(true)}>
            <Pencil /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              iniciar(async () => {
                const r = await alternarTarifaArmazem(tarifa.id);
                if (!r.ok) return void toast.error(r.erro);
                toast.success(r.data?.ativo ? "Tarifa reativada." : "Tarifa suspensa.");
                router.refresh();
              })
            }
          >
            <Power /> {tarifa.ativo ? "Suspender" : "Reativar"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogoTarifa aberto={editando} onAbertoChange={setEditando} opcoes={opcoes} tarifa={tarifa} />
    </>
  );
}

// ───────────────────────── Mês ─────────────────────────

export function BotaoAtualizarFotografia() {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={enviando}
      onClick={() =>
        iniciar(async () => {
          const r = await atualizarFotografiaArmazem();
          if (!r.ok) return void toast.error(r.erro);
          toast.success(`Fotografia de hoje: ${r.data?.posicoes ?? 0} posições ocupadas por ${r.data?.depositantes ?? 0} depositante(s).`);
          router.refresh();
        })
      }
    >
      {enviando ? <LoaderCircle className="animate-spin" /> : <Camera />} Atualizar fotografia de hoje
    </Button>
  );
}

export function BotaoGerarTodos({ competencia, estab, pendentes, total }: { competencia: string; estab: string; pendentes: number; total: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button onClick={() => setAberto(true)} disabled={!pendentes}>
        <FilePlus2 /> Faturar {pendentes > 1 ? `os ${pendentes}` : pendentes === 1 ? "o pendente" : "pendentes"}
      </Button>
      <ConfirmarAcao
        aberto={aberto}
        onAbertoChange={setAberto}
        titulo={`Faturar a armazenagem de ${competenciaCurta(competencia)}?`}
        descricao={`Gera ${pendentes === 1 ? "1 pedido faturado" : `${pendentes} pedidos faturados`} (${fmtMoeda(total)}) com a conta a receber e, onde a tarifa pede, o boleto/Pix. Depois, emita a NFS-e em cada pedido.`}
        rotuloConfirmar="Faturar"
        acao={async () => {
          const r = await gerarTodosFaturamentosArmazem(competencia, estab || null);
          if (r.ok && r.data?.erros.length) toast.warning(r.mensagem ?? "", { duration: 12_000 });
          return r;
        }}
        aoConcluir={() => router.refresh()}
      />
    </>
  );
}

export function BotaoFaturar({ empresaId, depositanteId, competencia, depositante, valor }: { empresaId: string; depositanteId: string; competencia: string; depositante: string; valor: number }) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  return (
    <Button
      size="sm"
      disabled={enviando}
      onClick={() =>
        iniciar(async () => {
          const r = await gerarFaturamentoArmazemAcao(empresaId, depositanteId, competencia);
          if (!r.ok) return void toast.error(r.erro, { duration: 10_000 });
          toast.success(r.mensagem ?? `Armazenagem de ${depositante} faturada.`, { duration: 8_000 });
          router.refresh();
        })
      }
      title={`Gerar o pedido de ${fmtMoeda(valor)}`}
    >
      {enviando ? <LoaderCircle className="animate-spin" /> : <ReceiptText />} Faturar
    </Button>
  );
}

export function MenuLinhaFaturamento({
  depositante,
  competencia,
  csv,
  dias,
  faturamento,
  podeFaturar,
}: {
  depositante: string;
  competencia: string;
  csv: string;
  dias: DiaOcupacao[];
  faturamento: { id: string; pedidoId: string | null } | null;
  podeFaturar: boolean;
}) {
  const [dialogo, setDialogo] = useState<null | "dias" | "desfazer">(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Mais ações de ${depositante}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialogo("dias")}>
            <CalendarDays /> Ver dia a dia
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={csv}>
              <Download /> Extrato (CSV)
            </a>
          </DropdownMenuItem>
          {faturamento?.pedidoId && (
            <DropdownMenuItem asChild>
              <Link href={`/vendas/pedidos/${faturamento.pedidoId}`}>
                <ReceiptText /> Abrir pedido (NFS-e)
              </Link>
            </DropdownMenuItem>
          )}
          {faturamento && podeFaturar && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialogo("desfazer")}>
                <Undo2 /> Desfazer faturamento
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogoDias aberto={dialogo === "dias"} onAbertoChange={(x) => !x && setDialogo(null)} depositante={depositante} competencia={competencia} dias={dias} />
      {faturamento && (
        <ConfirmarAcao
          aberto={dialogo === "desfazer"}
          onAbertoChange={(x) => !x && setDialogo(null)}
          titulo={`Desfazer a armazenagem de ${depositante}?`}
          descricao="O pedido é cancelado, a conta a receber é excluída e a cobrança em aberto é cancelada no Asaas. Não dá para desfazer com recebimento registrado ou nota fiscal emitida."
          rotuloConfirmar="Desfazer"
          destrutivo
          acao={() => desfazerFaturamentoArmazemAcao(faturamento.id)}
        />
      )}
    </>
  );
}

const ROTULO_ORIGEM: Record<DiaOcupacao["origem"], string> = { FOTOGRAFIA: "fotografia", REPETIDO: "repetiu o dia anterior", SEM_DADOS: "sem dados" };

export function DialogoDias({ aberto, onAbertoChange, depositante, competencia, dias }: { aberto: boolean; onAbertoChange: (v: boolean) => void; depositante: string; competencia: string; dias: DiaOcupacao[] }) {
  const maximo = Math.max(1, ...dias.map((d) => d.posicoes + d.reservadasVazias));
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {depositante} · {competenciaCurta(competencia)}
          </DialogTitle>
          <DialogDescription>Posições ocupadas no fim de cada dia (a última fotografia do dia). Em cinza claro, as reservadas vazias.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {dias.map((d) => (
            <div key={d.dia} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-sm">
              <span className={cn("tabular-nums", d.origem !== "FOTOGRAFIA" && "text-muted-foreground")}>{fmtData(d.dia).slice(0, 5)}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-3.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted/50" aria-hidden>
                  <span className="h-full bg-primary/70" style={{ width: `${(d.posicoes / maximo) * 100}%` }} />
                  <span className="h-full bg-primary/20" style={{ width: `${(d.reservadasVazias / maximo) * 100}%` }} />
                </span>
                <span className="hidden w-44 truncate text-xs text-muted-foreground sm:block" title={d.enderecos.join(", ")}>
                  {d.origem === "FOTOGRAFIA" ? d.enderecos.slice(0, 4).join(", ") + (d.enderecos.length > 4 ? ` +${d.enderecos.length - 4}` : "") : ROTULO_ORIGEM[d.origem]}
                </span>
              </span>
              <span className="text-right tabular-nums">
                {d.posicoes}
                {d.reservadasVazias ? <span className="text-xs text-muted-foreground"> +{d.reservadasVazias}</span> : null}
              </span>
            </div>
          ))}
          {!dias.length && <p className="text-sm text-muted-foreground">Sem dias nesta competência.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SeloSituacao({ situacao }: { situacao: "SEM_TARIFA" | "PENDENTE" | "NADA_A_COBRAR" | "FATURADO" | "EM_ANDAMENTO" }) {
  const mapa = {
    SEM_TARIFA: { tom: "alerta", rotulo: "Sem tarifa" },
    PENDENTE: { tom: "info", rotulo: "A faturar" },
    NADA_A_COBRAR: { tom: "neutro", rotulo: "Nada a cobrar" },
    FATURADO: { tom: "sucesso", rotulo: "Faturado" },
    EM_ANDAMENTO: { tom: "roxo", rotulo: "Mês em andamento" },
  } as const;
  const m = mapa[situacao];
  return <Selo tom={m.tom}>{m.rotulo}</Selo>;
}

export const rotuloMetodo = (m: MetodoArmazenagem) => ROTULO_METODO[m];
