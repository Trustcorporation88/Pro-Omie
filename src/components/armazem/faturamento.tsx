"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Camera, Download, FilePlus2, FileText, LoaderCircle, Mail, MoreHorizontal, Pencil, Plus, Power, ReceiptText, Undo2 } from "lucide-react";
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
import { alternarTarifaArmazem, atualizarFotografiaArmazem, desfazerFaturamentoArmazemAcao, enviarDemonstrativoPorEmail, gerarFaturamentoArmazemAcao, gerarTodosFaturamentosArmazem, inicioSugeridoArmazem, salvarTarifaArmazem } from "@/modules/armazem/faturamento-acoes";
import { ROTULO_METODO, dataBr, type DiaOcupacao, type MetodoArmazenagem, type TipoPeriodo } from "@/modules/armazem/tipos";

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
  periodo: TipoPeriodo;
  inicio: string;
  produtoId: string | null;
  descricao: string;
  prazoPagamento: number;
  categoriaId: string | null;
  contaBancariaId: string | null;
  formaPagamentoId: string | null;
  gerarCobranca: boolean;
  faturarAutomatico: boolean;
  observacoes: string | null;
  ativo: boolean;
  /** fim do último período faturado (o início só muda para depois dele) */
  ultimoFaturado: string | null;
};

type DepositanteInicial = { id: string; nome: string; empresaId: string; inicio?: string | null };

// ───────────────────────── Tarifa ─────────────────────────

export function BotaoNovaTarifa({ opcoes, depositante, rotulo = "Nova tarifa", variante = "outline", tamanho = "default" }: { opcoes: OpcoesTarifa; depositante?: DepositanteInicial; rotulo?: string; variante?: "outline" | "default"; tamanho?: "default" | "sm" }) {
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

function DialogoTarifa({ aberto, onAbertoChange, opcoes, tarifa, depositante }: { aberto: boolean; onAbertoChange: (v: boolean) => void; opcoes: OpcoesTarifa; tarifa?: TarifaEdicao; depositante?: DepositanteInicial }) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-2xl">{aberto && <CorpoTarifa opcoes={opcoes} tarifa={tarifa} depositante={depositante} fechar={() => onAbertoChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function CorpoTarifa({ opcoes, tarifa, depositante, fechar }: { opcoes: OpcoesTarifa; tarifa?: TarifaEdicao; depositante?: DepositanteInicial; fechar: () => void }) {
  const router = useRouter();
  const [v, setV] = useState({
    estabelecimentoId: tarifa?.empresaId ?? depositante?.empresaId ?? (opcoes.estabelecimentos.length === 1 ? opcoes.estabelecimentos[0].valor : ""),
    depositanteId: tarifa?.depositanteId ?? depositante?.id ?? null,
    valorPosicao: tarifa?.valorPosicao ?? 0,
    metodo: (tarifa?.metodo ?? "FIM_PERIODO") as MetodoArmazenagem,
    minimo: tarifa?.minimoPosicoes ? String(tarifa.minimoPosicoes) : "",
    cobrarReservadas: tarifa?.cobrarReservadas ?? false,
    periodo: (tarifa?.periodo ?? "MES") as TipoPeriodo,
    inicio: tarifa?.inicio ?? depositante?.inicio ?? opcoes.inicioPadrao,
    produtoId: tarifa?.produtoId ?? (opcoes.servicos.length === 1 ? opcoes.servicos[0].valor : ""),
    descricao: tarifa?.descricao ?? "Armazenagem de mercadorias",
    prazo: String(tarifa?.prazoPagamento ?? 10),
    categoriaId: tarifa?.categoriaId ?? "",
    contaBancariaId: tarifa?.contaBancariaId ?? "",
    formaPagamentoId: tarifa?.formaPagamentoId ?? "",
    gerarCobranca: tarifa?.gerarCobranca ?? false,
    faturarAutomatico: tarifa?.faturarAutomatico ?? true,
    observacoes: tarifa?.observacoes ?? "",
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, iniciar] = useTransition();
  // início sugerido (primeira entrada do depositante) enquanto a pessoa não mexer na data
  const inicioEditado = useRef(!!tarifa || !!depositante?.inicio);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((a) => ({ ...a, [k]: x }));
  function escolherDepositante(id: string | null) {
    set("depositanteId", id);
    if (!id || inicioEditado.current || !v.estabelecimentoId) return;
    void inicioSugeridoArmazem(v.estabelecimentoId, id).then((r) => {
      if (r.ok && r.data && !inicioEditado.current) set("inicio", r.data.inicio);
    });
  }
  function salvar() {
    const minimo = v.minimo.trim() ? Number(v.minimo) : null;
    const prazo = Number(v.prazo);
    iniciar(async () => {
      const r = await salvarTarifaArmazem({
        id: tarifa?.id ?? null,
        estabelecimentoId: v.estabelecimentoId,
        depositanteId: v.depositanteId ?? "",
        valorPosicao: v.valorPosicao,
        metodo: v.metodo,
        minimoPosicoes: minimo,
        cobrarReservadas: v.cobrarReservadas,
        periodo: v.periodo,
        inicio: v.inicio,
        produtoId: v.produtoId || null,
        descricao: v.descricao,
        prazoPagamento: v.prazo.trim() && Number.isFinite(prazo) ? Math.trunc(prazo) : -1,
        categoriaId: v.categoriaId || null,
        contaBancariaId: v.contaBancariaId || null,
        formaPagamentoId: v.formaPagamentoId || null,
        gerarCobranca: v.gerarCobranca,
        faturarAutomatico: v.faturarAutomatico,
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
        <DialogDescription>Preço por palete. Todo dia o sistema fotografa os paletes de cada cliente; no fim do período faz a apuração, e a tarifa vira o valor da armazenagem (cobrança vencida).</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="tar-dep" rotulo="Depositante" obrigatorio erro={erros.depositanteId} className="sm:col-span-2">
          <SeletorPessoa id="tar-dep" valor={v.depositanteId} rotuloInicial={tarifa?.depositante ?? depositante?.nome} onChange={(id) => escolherDepositante(id)} papel="cliente" placeholder="Escolha o depositante…" invalido={!!erros.depositanteId} />
        </Campo>
        {opcoes.estabelecimentos.length > 1 && (
          <Campo id="tar-estab" rotulo="Estabelecimento" obrigatorio erro={erros.estabelecimentoId} ajuda="O que presta o serviço (emite o pedido e a nota)" className="sm:col-span-2">
            <CampoSelect id="tar-estab" opcoes={opcoes.estabelecimentos} valor={v.estabelecimentoId} onChange={(x) => set("estabelecimentoId", x)} vazio="Escolha…" />
          </Campo>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <p className="text-sm font-medium">Período de cobrança</p>
          <Segmentado
            rotulo="Período de cobrança"
            valor={v.periodo}
            onChange={(x) => set("periodo", x)}
            opcoes={[
              { valor: "MES", rotulo: "Mês do calendário (vencido)" },
              { valor: "DIAS30", rotulo: "A cada 30 dias (vencido)" },
            ]}
          />
        </div>
        <Campo id="tar-valor" rotulo={v.periodo === "DIAS30" ? "Valor por palete a cada 30 dias" : "Valor por palete por mês"} obrigatorio erro={erros.valorPosicao}>
          <CampoMoeda id="tar-valor" valor={v.valorPosicao} onChange={(x) => set("valorPosicao", x)} />
        </Campo>
        <Campo
          id="tar-inicio"
          rotulo="Início da cobrança"
          obrigatorio
          erro={erros.inicio}
          ajuda={
            tarifa?.ultimoFaturado
              ? `Faturada até ${dataBr(tarifa.ultimoFaturado)}: o início só muda para depois disso.`
              : v.periodo === "DIAS30"
                ? "Os períodos de 30 dias contam desta data (em geral, a primeira entrada)."
                : "Cobra a partir desta data (em geral, a primeira entrada); cada mês é apurado no último dia."
          }
        >
          <Input
            id="tar-inicio"
            type="date"
            value={v.inicio}
            onChange={(e) => {
              inicioEditado.current = true;
              set("inicio", e.target.value);
            }}
          />
        </Campo>
        <div className="space-y-1.5 sm:col-span-2">
          <p className="text-sm font-medium">Como contar os paletes</p>
          <Segmentado
            rotulo="Como contar os paletes"
            valor={v.metodo}
            onChange={(x) => set("metodo", x)}
            opcoes={[
              { valor: "FIM_PERIODO", rotulo: v.periodo === "MES" ? "Paletes no fim do mês" : "Paletes no fim do período" },
              { valor: "PRO_RATA", rotulo: "Por dia (palete-dia)" },
              { valor: "PICO", rotulo: "Maior quantidade do período" },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {v.metodo === "FIM_PERIODO"
              ? `Apuração: conta os paletes armazenados no último dia ${v.periodo === "MES" ? "do mês" : "dos 30 dias"} e cobra o valor de cada um, sem proporcional.`
              : v.metodo === "PRO_RATA"
                ? `Soma os paletes de cada dia e divide pelos dias do período: 10 paletes por 15 dias = 5 paletes ${v.periodo === "DIAS30" ? "nos 30 dias" : "no mês"}.`
                : "Cobra o maior número de paletes num mesmo dia do período."}
          </p>
        </div>
        <Campo id="tar-minimo" rotulo="Mínimo de paletes por período" erro={erros.minimoPosicoes} ajuda="Opcional: paletes contratados">
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
        <Campo id="tar-prazo" rotulo="Prazo para pagamento (dias)" obrigatorio erro={erros.prazoPagamento} ajuda="Depois do fim do período (0 = vence quando o período termina)">
          <Input id="tar-prazo" type="number" min={0} max={90} value={v.prazo} onChange={(e) => set("prazo", e.target.value)} />
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
        <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5 sm:col-span-2">
          <Switch id="tar-automatico" checked={v.faturarAutomatico} onCheckedChange={(x) => set("faturarAutomatico", x)} className="mt-0.5" />
          <Label htmlFor="tar-automatico" className="cursor-pointer flex-col items-start gap-1 text-sm font-normal">
            Faturar sozinho
            <span className="text-xs leading-snug text-muted-foreground">
              No dia seguinte ao fim do período (no mês do calendário, no dia 1º), às 6h40: gera o pedido, a conta a receber e o boleto/Pix com o demonstrativo, e avisa os
              administradores por e-mail.
            </span>
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
          toast.success(`Fotografia de hoje: ${r.data?.posicoes ?? 0} paletes de ${r.data?.depositantes ?? 0} cliente(s).`);
          router.refresh();
        })
      }
    >
      {enviando ? <LoaderCircle className="animate-spin" /> : <Camera />} Atualizar fotografia de hoje
    </Button>
  );
}

export function BotaoGerarTodos({ estab, pendentes, total }: { estab: string; pendentes: number; total: number }) {
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
        titulo="Faturar os períodos vencidos?"
        descricao={`Gera ${pendentes === 1 ? "1 pedido faturado" : `${pendentes} pedidos faturados`} (${fmtMoeda(total)}) com a conta a receber e, onde a tarifa pede, o boleto/Pix. Depois, emita a NFS-e em cada pedido.`}
        rotuloConfirmar="Faturar"
        acao={async () => {
          const r = await gerarTodosFaturamentosArmazem(estab || null);
          if (r.ok && r.data?.erros.length) toast.warning(r.mensagem ?? "", { duration: 12_000 });
          return r;
        }}
        aoConcluir={() => router.refresh()}
      />
    </>
  );
}

export function BotaoFaturar({ empresaId, depositanteId, periodoInicio, depositante, valor }: { empresaId: string; depositanteId: string; periodoInicio: string; depositante: string; valor: number }) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  return (
    <Button
      size="sm"
      disabled={enviando}
      onClick={() =>
        iniciar(async () => {
          const r = await gerarFaturamentoArmazemAcao(empresaId, depositanteId, periodoInicio);
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
  rotulo,
  csv,
  dias,
  faturamento,
  podeFaturar,
  demonstrativo,
  emailCliente,
}: {
  depositante: string;
  rotulo: string;
  csv: string;
  dias: DiaOcupacao[];
  faturamento: { id: string; pedidoId: string | null } | null;
  podeFaturar: boolean;
  /** endereço do PDF (do faturado, ou a prévia do período ainda não faturado); nulo em "sem tarifa" */
  demonstrativo: string | null;
  emailCliente: string | null;
}) {
  const [dialogo, setDialogo] = useState<null | "dias" | "desfazer" | "email">(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Mais ações de ${depositante}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {dias.length > 0 && (
            <DropdownMenuItem onSelect={() => setDialogo("dias")}>
              <CalendarDays /> Ver dia a dia
            </DropdownMenuItem>
          )}
          {demonstrativo && (
            <DropdownMenuItem asChild>
              <a href={demonstrativo} target="_blank" rel="noopener">
                <FileText /> {faturamento ? "Demonstrativo (PDF)" : "Prévia do demonstrativo (PDF)"}
              </a>
            </DropdownMenuItem>
          )}
          {faturamento && podeFaturar && (
            <DropdownMenuItem onSelect={() => setDialogo("email")}>
              <Mail /> Enviar demonstrativo por e-mail
            </DropdownMenuItem>
          )}
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
      <DialogoDias aberto={dialogo === "dias"} onAbertoChange={(x) => !x && setDialogo(null)} depositante={depositante} rotulo={rotulo} dias={dias} />
      {faturamento && dialogo === "email" && (
        <DialogoEnviarDemonstrativo onFechar={() => setDialogo(null)} faturamentoId={faturamento.id} depositante={depositante} rotulo={rotulo} paraPadrao={emailCliente ?? ""} />
      )}
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

/** Manda o demonstrativo do período faturado ao cliente (o PDF vai anexo). */
function DialogoEnviarDemonstrativo({ onFechar, faturamentoId, depositante, rotulo, paraPadrao }: { onFechar: () => void; faturamentoId: string; depositante: string; rotulo: string; paraPadrao: string }) {
  const [para, setPara] = useState(paraPadrao);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <Dialog open onOpenChange={(x) => !x && !pendente && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar demonstrativo por e-mail</DialogTitle>
          <DialogDescription>
            O demonstrativo da armazenagem de {rotulo} vai em PDF para {depositante}, com o e-mail da empresa como “responder para”.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Campo id="dem-para" rotulo="Para" obrigatorio erro={erro ?? undefined} ajuda="Vários e-mails: separe por vírgula">
            <Input id="dem-para" type="text" value={para} onChange={(e) => setPara(e.target.value)} placeholder="financeiro@cliente.com.br" />
          </Campo>
          <Campo id="dem-mensagem" rotulo="Mensagem (opcional)">
            <Textarea id="dem-mensagem" value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} />
          </Campo>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button
            disabled={pendente || !para.trim()}
            onClick={() =>
              iniciar(async () => {
                const r = await enviarDemonstrativoPorEmail(faturamentoId, { para, mensagem: mensagem || null });
                if (!r.ok) {
                  setErro(r.campos?.para ?? null);
                  toast.error(r.erro);
                  return;
                }
                toast.success(r.mensagem ?? "Demonstrativo enviado.");
                onFechar();
              })
            }
          >
            {pendente ? <LoaderCircle className="animate-spin" /> : <Mail />} Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ROTULO_ORIGEM: Record<DiaOcupacao["origem"], string> = { FOTOGRAFIA: "fotografia", REPETIDO: "repetiu o dia anterior", SEM_DADOS: "sem dados" };

export function DialogoDias({ aberto, onAbertoChange, depositante, rotulo, dias }: { aberto: boolean; onAbertoChange: (v: boolean) => void; depositante: string; rotulo: string; dias: DiaOcupacao[] }) {
  const maximo = Math.max(1, ...dias.map((d) => d.posicoes + d.reservadasVazias));
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {depositante} · {rotulo}
          </DialogTitle>
          <DialogDescription>Paletes no fim de cada dia (a última fotografia do dia). Em cinza claro, as posições reservadas vazias.</DialogDescription>
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

export function SeloSituacao({ situacao }: { situacao: "SEM_TARIFA" | "PENDENTE" | "FATURADO" | "EM_ANDAMENTO" }) {
  const mapa = {
    SEM_TARIFA: { tom: "alerta", rotulo: "Sem tarifa" },
    PENDENTE: { tom: "info", rotulo: "A faturar" },
    FATURADO: { tom: "sucesso", rotulo: "Faturado" },
    EM_ANDAMENTO: { tom: "roxo", rotulo: "Em andamento" },
  } as const;
  const m = mapa[situacao];
  return <Selo tom={m.tom}>{m.rotulo}</Selo>;
}

export const rotuloMetodo = (m: MetodoArmazenagem) => ROTULO_METODO[m];
export const rotuloData = dataBr;
