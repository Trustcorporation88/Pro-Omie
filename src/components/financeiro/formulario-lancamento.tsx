"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck, LoaderCircle, Plus, Trash, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CampoMoeda } from "@/components/campo-moeda";
import { SeletorPessoa } from "@/components/seletor-pessoa";
import { criarLancamentoAcao, editarTituloAcao } from "@/modules/financeiro/acoes";
import { distribuirRateio, gerarParcelas, parcelasPorCondicao, proximaData, type Intervalo, type Parcela } from "@/modules/financeiro/parcelas";
import { arred2, fmtData, fmtMoeda, fmtNumero } from "@/lib/format";
import type { Resultado } from "@/lib/acoes";
import { cn } from "@/lib/utils";
import { Campo, CampoPercentual, CampoSelect, Segmentado } from "./campos";
import { TEXTOS, type OpcoesFormulario, type RateioForm, type TipoTitulo, type ValoresLancamento } from "./tipos";

type Repeticao = "unica" | "parcelada" | "recorrente";
type ModoParcelas = "intervalo" | "condicao";

const INTERVALOS: { valor: Intervalo; rotulo: string }[] = [
  { valor: "mensal", rotulo: "Mensal" },
  { valor: "quinzenal", rotulo: "Quinzenal (15 dias)" },
  { valor: "semanal", rotulo: "Semanal" },
];
const INTERVALOS_RECORRENCIA: { valor: Intervalo; rotulo: string }[] = [...INTERVALOS, { valor: "anual", rotulo: "Anual" }];
const MAX_REPETICOES = 120;
const LINHA_VAZIA: RateioForm = { categoriaId: "", centroCustoId: null, percentual: 100 };

function valoresPadrao(opcoes: OpcoesFormulario, hoje: string): ValoresLancamento {
  return {
    pessoaId: null,
    pessoaNome: null,
    descricao: "",
    documento: "",
    empresaId: opcoes.empresaPadraoId,
    valor: 0,
    emissao: hoje,
    competencia: hoje,
    vencimento: "",
    contaBancariaId: "",
    formaPagamentoId: "",
    observacoes: "",
    rateios: [LINHA_VAZIA],
  };
}

function Aviso({ children, tom = "alerta" }: { children: React.ReactNode; tom?: "alerta" | "perigo" }) {
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border p-3 text-sm",
        tom === "alerta" ? "border-warning/40 bg-warning/10" : "border-destructive/30 bg-destructive/5 text-destructive",
      )}
    >
      <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", tom === "alerta" ? "text-[oklch(0.5_0.13_65)] dark:text-warning" : "")} />
      <div>{children}</div>
    </div>
  );
}

function Secao({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Formulário de lançamento (criação, duplicação e edição) em painel lateral. */
export function FormularioLancamento({
  tipo,
  opcoes,
  hoje,
  aberto,
  onAbertoChange,
  iniciais,
  edicao,
}: {
  tipo: TipoTitulo;
  opcoes: OpcoesFormulario;
  hoje: string;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  /** valores iniciais (duplicação ou edição) */
  iniciais?: Partial<ValoresLancamento>;
  /** presente no modo de edição */
  edicao?: { id: string; numero: number; valorPago: number };
}) {
  const router = useRouter();
  const tx = TEXTOS[tipo];
  const categorias = tipo === "RECEBER" ? opcoes.categoriasReceita : opcoes.categoriasDespesa;

  const [v, setV] = useState<ValoresLancamento>(() => {
    const base = { ...valoresPadrao(opcoes, hoje), ...iniciais };
    return base.rateios.length ? base : { ...base, rateios: [LINHA_VAZIA] };
  });
  const [competenciaManual, setCompetenciaManual] = useState(
    () => !!iniciais?.competencia && iniciais.competencia !== (iniciais.emissao ?? hoje),
  );
  const [usarRateio, setUsarRateio] = useState(() => (iniciais?.rateios?.length ?? 0) > 1);
  const [repeticao, setRepeticao] = useState<Repeticao>("unica");
  const [modoParcelas, setModoParcelas] = useState<ModoParcelas>("intervalo");
  const [qtdParcelas, setQtdParcelas] = useState(2);
  const [intervaloParcelas, setIntervaloParcelas] = useState<Intervalo>("mensal");
  const [condicaoId, setCondicaoId] = useState(opcoes.condicoes[0]?.id ?? "");
  const [ajustes, setAjustes] = useState<{ chave: string; itens: Record<number, Partial<Parcela>> }>({ chave: "", itens: {} });
  const [qtdOcorrencias, setQtdOcorrencias] = useState(12);
  const [intervaloRecorrencia, setIntervaloRecorrencia] = useState<Intervalo>("mensal");
  const [baixarAgora, setBaixarAgora] = useState(false);
  const [dataBaixa, setDataBaixa] = useState(hoje);
  const [contaBaixa, setContaBaixa] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, iniciar] = useTransition();

  const limparErro = (...chaves: string[]) =>
    setErros((e) => (chaves.some((c) => e[c]) ? Object.fromEntries(Object.entries(e).filter(([k]) => !chaves.includes(k))) : e));

  function set<K extends keyof ValoresLancamento>(k: K, valor: ValoresLancamento[K]) {
    setV((s) => ({ ...s, [k]: valor }));
    limparErro(k);
  }

  function mudarEmissao(iso: string) {
    setV((s) => ({ ...s, emissao: iso, competencia: competenciaManual ? s.competencia : iso }));
    limparErro("emissao");
  }

  // ───────────── Rateio ─────────────
  const somaPercentual = arred2(v.rateios.reduce((a, r) => a + (r.percentual || 0), 0));
  const rateioValores = distribuirRateio(v.valor > 0 ? v.valor : 0, v.rateios);

  function setRateio(i: number, mud: Partial<RateioForm>) {
    setV((s) => ({ ...s, rateios: s.rateios.map((r, j) => (j === i ? { ...r, ...mud } : r)) }));
    limparErro("rateios", `rateios.${i}.categoriaId`, `rateios.${i}.percentual`);
  }

  function alternarRateio(ativo: boolean) {
    setUsarRateio(ativo);
    setV((s) => {
      const primeiro = s.rateios[0] ?? LINHA_VAZIA;
      if (!ativo) return { ...s, rateios: [{ ...primeiro, percentual: 100 }] };
      if (s.rateios.length > 1) return s;
      return { ...s, rateios: [{ ...primeiro, percentual: 50 }, { categoriaId: "", centroCustoId: null, percentual: 50 }] };
    });
    limparErro("rateios");
  }

  function adicionarLinhaRateio() {
    setV((s) => {
      const soma = arred2(s.rateios.reduce((a, r) => a + (r.percentual || 0), 0));
      return { ...s, rateios: [...s.rateios, { categoriaId: "", centroCustoId: null, percentual: Math.max(0, arred2(100 - soma)) }] };
    });
  }

  function removerLinhaRateio(i: number) {
    setV((s) => ({ ...s, rateios: s.rateios.filter((_, j) => j !== i) }));
    limparErro("rateios");
  }

  // ───────────── Parcelas ─────────────
  const condicao = opcoes.condicoes.find((c) => c.id === condicaoId) ?? null;
  const chaveParcelas = [repeticao, modoParcelas, v.valor, qtdParcelas, intervaloParcelas, v.vencimento, condicao?.dias ?? "", v.emissao].join("|");
  const parcelasBase = useMemo<Parcela[]>(() => {
    if (repeticao !== "parcelada" || !(v.valor > 0)) return [];
    if (modoParcelas === "condicao") return condicao && v.emissao ? parcelasPorCondicao(v.valor, condicao.dias, v.emissao) : [];
    if (!v.vencimento || qtdParcelas < 2 || qtdParcelas > MAX_REPETICOES) return [];
    return gerarParcelas(v.valor, qtdParcelas, v.vencimento, intervaloParcelas);
  }, [repeticao, modoParcelas, v.valor, v.emissao, v.vencimento, qtdParcelas, intervaloParcelas, condicao]);
  // edições manuais valem enquanto os parâmetros de geração não mudam
  const parcelas = ajustes.chave === chaveParcelas ? parcelasBase.map((p, i) => ({ ...p, ...ajustes.itens[i] })) : parcelasBase;
  const somaParcelas = arred2(parcelas.reduce((a, p) => a + (p.valor || 0), 0));
  const diferencaParcelas = arred2(somaParcelas - v.valor);

  function ajustarParcela(i: number, mud: Partial<Parcela>) {
    setAjustes((a) => {
      const itens = a.chave === chaveParcelas ? a.itens : {};
      return { chave: chaveParcelas, itens: { ...itens, [i]: { ...itens[i], ...mud } } };
    });
    limparErro("parcelas");
  }

  // ───────────── Recorrência ─────────────
  const ocorrencias =
    repeticao === "recorrente" && v.vencimento && qtdOcorrencias >= 2 && qtdOcorrencias <= MAX_REPETICOES
      ? Array.from({ length: qtdOcorrencias }, (_, i) => proximaData(v.vencimento, intervaloRecorrencia, i))
      : [];

  const precisaVencimento = !!edicao || repeticao !== "parcelada" || modoParcelas === "intervalo";
  const qtdTitulos = edicao ? 1 : repeticao === "parcelada" ? parcelas.length : repeticao === "recorrente" ? ocorrencias.length : 1;

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!v.descricao.trim()) e.descricao = "Informe a descrição.";
    if (!(v.valor > 0)) e.valor = "Informe um valor maior que zero.";
    if (!v.emissao) e.emissao = "Informe a emissão.";
    if (!v.competencia) e.competencia = "Informe a competência.";
    if (precisaVencimento && !v.vencimento) e.vencimento = "Informe o vencimento.";
    if (!edicao && !v.empresaId) e.empresaId = "Selecione a empresa.";
    const linhas = usarRateio ? v.rateios : v.rateios.slice(0, 1);
    linhas.forEach((r, i) => {
      if (!r.categoriaId) e[`rateios.${i}.categoriaId`] = "Selecione a categoria.";
      if (usarRateio && !(r.percentual > 0)) e[`rateios.${i}.percentual`] = "Informe o percentual.";
    });
    if (usarRateio && Math.abs(somaPercentual - 100) > 0.01) e.rateios = `O rateio precisa somar 100% (está em ${fmtNumero(somaPercentual)}%).`;
    if (edicao && v.valor < edicao.valorPago - 0.005) e.valor = `O valor não pode ser menor que o já baixado (${fmtMoeda(edicao.valorPago)}).`;
    if (!edicao && repeticao === "parcelada") {
      if (modoParcelas === "condicao" && !condicao) e.parcelas = "Escolha a condição de pagamento.";
      else if (modoParcelas === "intervalo" && (qtdParcelas < 2 || qtdParcelas > MAX_REPETICOES))
        e.parcelas = `Informe de 2 a ${MAX_REPETICOES} parcelas.`;
      else if (!parcelas.length) e.parcelas = "Informe valor e vencimento para gerar as parcelas.";
      else if (parcelas.some((p) => !p.vencimento)) e.parcelas = "Informe o vencimento de todas as parcelas.";
      else if (parcelas.some((p) => !(p.valor > 0))) e.parcelas = "Todas as parcelas precisam ter valor maior que zero.";
      else if (Math.abs(diferencaParcelas) > 0.005)
        e.parcelas = `A soma das parcelas (${fmtMoeda(somaParcelas)}) difere do valor total (${fmtMoeda(v.valor)}).`;
    }
    if (!edicao && repeticao === "recorrente" && (qtdOcorrencias < 2 || qtdOcorrencias > MAX_REPETICOES))
      e.ocorrencias = `Informe de 2 a ${MAX_REPETICOES} ocorrências.`;
    if (!edicao && baixarAgora) {
      if (!contaBaixa) e["baixarAgora.contaBancariaId"] = "Selecione a conta.";
      if (!dataBaixa) e["baixarAgora.data"] = "Informe a data.";
      else if (dataBaixa > hoje) e["baixarAgora.data"] = "A data não pode ser futura.";
    }
    return e;
  }

  function concluir(r: Resultado<unknown>, mensagem: string | undefined, abrirId?: string) {
    if (r.ok) {
      toast.success(
        mensagem ?? "Salvo.",
        abrirId ? { action: { label: "Abrir", onClick: () => router.push(`/financeiro/titulos/${abrirId}`) } } : undefined,
      );
      setErros({});
      onAbertoChange(false);
      router.refresh();
      return;
    }
    const campos: Record<string, string> = {};
    for (const [k, msg] of Object.entries(r.campos ?? {})) {
      const chave = k.startsWith("parcelas") ? "parcelas" : k;
      if (!campos[chave]) campos[chave] = msg;
    }
    setErros(campos);
    toast.error(r.erro);
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const problemas = validar();
    if (Object.keys(problemas).length) {
      setErros(problemas);
      toast.error(Object.values(problemas)[0]);
      return;
    }
    const rateios = (usarRateio ? v.rateios : v.rateios.slice(0, 1)).map((r) => ({
      categoriaId: r.categoriaId,
      centroCustoId: r.centroCustoId || null,
      percentual: usarRateio ? r.percentual : 100,
    }));
    const comuns = {
      pessoaId: v.pessoaId,
      descricao: v.descricao,
      documento: v.documento,
      contaBancariaId: v.contaBancariaId || null,
      formaPagamentoId: v.formaPagamentoId || null,
      emissao: v.emissao,
      competencia: v.competencia,
      observacoes: v.observacoes,
      rateios,
    };
    iniciar(async () => {
      if (edicao) {
        const r = await editarTituloAcao(edicao.id, { ...comuns, vencimento: v.vencimento, valor: v.valor });
        concluir(r, r.ok ? r.mensagem : undefined);
        return;
      }
      const lista: Parcela[] =
        repeticao === "parcelada"
          ? parcelas
          : repeticao === "recorrente"
            ? ocorrencias.map((vencimento) => ({ vencimento, valor: v.valor }))
            : [{ vencimento: v.vencimento, valor: v.valor }];
      const r = await criarLancamentoAcao({
        ...comuns,
        tipo,
        empresaId: v.empresaId,
        parcelas: lista,
        recorrencia: repeticao === "recorrente" ? { intervalo: intervaloRecorrencia } : null,
        baixarAgora: baixarAgora ? { data: dataBaixa, contaBancariaId: contaBaixa, formaPagamentoId: v.formaPagamentoId || null } : null,
      });
      const ids = r.ok ? (r.data?.ids ?? []) : [];
      concluir(r, ids.length > 1 ? `${ids.length} lançamentos criados.` : r.ok ? r.mensagem : undefined, ids.length === 1 ? ids[0] : undefined);
    });
  }

  const resumoRodape = edicao
    ? `Valor ${fmtMoeda(v.valor)}`
    : repeticao === "parcelada"
      ? `${parcelas.length} parcela(s) · ${fmtMoeda(somaParcelas)}`
      : repeticao === "recorrente"
        ? `${ocorrencias.length} ocorrência(s) · ${fmtMoeda(arred2(v.valor * ocorrencias.length))}`
        : `Total ${fmtMoeda(v.valor)}`;

  return (
    <Sheet open={aberto} onOpenChange={(a) => !salvando && onAbertoChange(a)}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        <form onSubmit={salvar} className="flex min-h-full flex-col" noValidate>
          <SheetHeader className="border-b">
            <SheetTitle>{edicao ? `Editar ${tx.singular} #${edicao.numero}` : tx.novo}</SheetTitle>
            <SheetDescription>
              {edicao
                ? "Altere os dados do título. As baixas já registradas são mantidas."
                : "Preencha os dados do lançamento. Campos com * são obrigatórios."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 p-4">
            {edicao && edicao.valorPago > 0 && (
              <Aviso>
                Este título já tem <strong className="tabular">{fmtMoeda(edicao.valorPago)}</strong> baixados. O valor não pode
                ficar menor que isso; para reduzir além, estorne as baixas no detalhe do título.
              </Aviso>
            )}

            <Secao titulo="Dados do lançamento">
              <div className="grid grid-cols-6 gap-3">
                <Campo className="col-span-6" rotulo={tx.pessoa} erro={erros.pessoaId}>
                  <SeletorPessoa
                    valor={v.pessoaId}
                    rotuloInicial={v.pessoaNome}
                    papel={tx.papel}
                    placeholder={`Selecione o ${tx.pessoa.toLowerCase()}…`}
                    onChange={(pid, p) => setV((s) => ({ ...s, pessoaId: pid, pessoaNome: p?.nome ?? null }))}
                  />
                </Campo>
                <Campo className="col-span-6 sm:col-span-4" id="fl-descricao" rotulo="Descrição" obrigatorio erro={erros.descricao}>
                  <Input
                    id="fl-descricao"
                    value={v.descricao}
                    maxLength={200}
                    aria-invalid={!!erros.descricao}
                    onChange={(e) => set("descricao", e.target.value)}
                    placeholder={tipo === "RECEBER" ? "Ex.: Mensalidade de suporte" : "Ex.: Aluguel do escritório"}
                  />
                </Campo>
                <Campo className="col-span-6 sm:col-span-2" id="fl-documento" rotulo="Documento" erro={erros.documento}>
                  <Input
                    id="fl-documento"
                    value={v.documento}
                    maxLength={60}
                    onChange={(e) => set("documento", e.target.value)}
                    placeholder="Nº da NF/boleto"
                  />
                </Campo>
                {!edicao && opcoes.empresas.length > 1 && (
                  <Campo className="col-span-6" id="fl-empresa" rotulo="Empresa" obrigatorio erro={erros.empresaId}>
                    <CampoSelect
                      id="fl-empresa"
                      opcoes={opcoes.empresas}
                      valor={v.empresaId}
                      onChange={(x) => set("empresaId", x)}
                      vazio={v.empresaId ? undefined : "Selecione…"}
                      aria-invalid={!!erros.empresaId}
                    />
                  </Campo>
                )}
                <Campo
                  className="col-span-6 sm:col-span-2"
                  id="fl-valor"
                  rotulo={repeticao === "recorrente" && !edicao ? "Valor de cada ocorrência" : "Valor"}
                  obrigatorio
                  erro={erros.valor}
                >
                  <CampoMoeda id="fl-valor" valor={v.valor} onChange={(n) => set("valor", n)} aria-invalid={!!erros.valor} />
                </Campo>
                <Campo className="col-span-3 sm:col-span-2" id="fl-emissao" rotulo="Emissão" obrigatorio erro={erros.emissao}>
                  <Input id="fl-emissao" type="date" value={v.emissao} onChange={(e) => mudarEmissao(e.target.value)} aria-invalid={!!erros.emissao} />
                </Campo>
                <Campo
                  className="col-span-3 sm:col-span-2"
                  id="fl-competencia"
                  rotulo="Competência"
                  obrigatorio
                  erro={erros.competencia}
                  ajuda={!edicao && repeticao === "recorrente" ? "Avança com cada ocorrência." : undefined}
                >
                  <Input
                    id="fl-competencia"
                    type="date"
                    value={v.competencia}
                    aria-invalid={!!erros.competencia}
                    onChange={(e) => {
                      setCompetenciaManual(true);
                      set("competencia", e.target.value);
                    }}
                  />
                </Campo>
                {precisaVencimento && (
                  <Campo
                    className="col-span-6 sm:col-span-2"
                    id="fl-vencimento"
                    rotulo={!edicao && repeticao !== "unica" ? "1º vencimento" : "Vencimento"}
                    obrigatorio
                    erro={erros.vencimento}
                  >
                    <Input
                      id="fl-vencimento"
                      type="date"
                      value={v.vencimento}
                      aria-invalid={!!erros.vencimento}
                      onChange={(e) => set("vencimento", e.target.value)}
                    />
                  </Campo>
                )}
                <Campo className={cn("col-span-6", precisaVencimento ? "sm:col-span-2" : "sm:col-span-3")} id="fl-conta" rotulo="Conta prevista">
                  <CampoSelect id="fl-conta" opcoes={opcoes.contas} valor={v.contaBancariaId} onChange={(x) => set("contaBancariaId", x)} vazio="—" />
                </Campo>
                <Campo className={cn("col-span-6", precisaVencimento ? "sm:col-span-2" : "sm:col-span-3")} id="fl-forma" rotulo="Forma de pagamento">
                  <CampoSelect id="fl-forma" opcoes={opcoes.formas} valor={v.formaPagamentoId} onChange={(x) => set("formaPagamentoId", x)} vazio="—" />
                </Campo>
              </div>
            </Secao>

            <Secao
              titulo="Classificação"
              acao={
                <Label className="cursor-pointer text-xs font-normal text-muted-foreground">
                  <Switch checked={usarRateio} onCheckedChange={alternarRateio} size="sm" aria-label="Ratear entre categorias e centros de custo" />
                  Ratear entre categorias/centros
                </Label>
              }
            >
              {!usarRateio ? (
                <div className="grid grid-cols-6 gap-3">
                  <Campo className="col-span-6 sm:col-span-3" id="fl-categoria" rotulo="Categoria" obrigatorio erro={erros["rateios.0.categoriaId"]}>
                    <CampoSelect
                      id="fl-categoria"
                      opcoes={categorias}
                      valor={v.rateios[0]?.categoriaId ?? ""}
                      onChange={(x) => setRateio(0, { categoriaId: x })}
                      vazio="Selecione…"
                      aria-invalid={!!erros["rateios.0.categoriaId"]}
                    />
                  </Campo>
                  <Campo className="col-span-6 sm:col-span-3" id="fl-centro" rotulo="Centro de custo">
                    <CampoSelect
                      id="fl-centro"
                      opcoes={opcoes.centros}
                      valor={v.rateios[0]?.centroCustoId ?? ""}
                      onChange={(x) => setRateio(0, { centroCustoId: x || null })}
                      vazio="—"
                    />
                  </Campo>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 text-left text-xs text-muted-foreground">
                          <th className="px-2 py-1.5 font-medium">Categoria*</th>
                          <th className="px-2 py-1.5 font-medium">Centro de custo</th>
                          <th className="w-28 px-2 py-1.5 font-medium">%</th>
                          <th className="w-28 px-2 py-1.5 text-right font-medium">Valor</th>
                          <th className="w-9" />
                        </tr>
                      </thead>
                      <tbody>
                        {v.rateios.map((r, i) => (
                          <tr key={i} className="border-t align-top">
                            <td className="p-1.5">
                              <CampoSelect
                                opcoes={categorias}
                                valor={r.categoriaId}
                                onChange={(x) => setRateio(i, { categoriaId: x })}
                                vazio="Selecione…"
                                aria-label={`Categoria da linha ${i + 1}`}
                                aria-invalid={!!erros[`rateios.${i}.categoriaId`]}
                                className="h-8 min-w-40"
                              />
                            </td>
                            <td className="p-1.5">
                              <CampoSelect
                                opcoes={opcoes.centros}
                                valor={r.centroCustoId ?? ""}
                                onChange={(x) => setRateio(i, { centroCustoId: x || null })}
                                vazio="—"
                                aria-label={`Centro de custo da linha ${i + 1}`}
                                className="h-8 min-w-32"
                              />
                            </td>
                            <td className="p-1.5">
                              <CampoPercentual
                                valor={r.percentual}
                                onChange={(n) => setRateio(i, { percentual: n })}
                                aria-label={`Percentual da linha ${i + 1}`}
                                aria-invalid={!!erros[`rateios.${i}.percentual`]}
                                className="h-8"
                              />
                            </td>
                            <td className="p-1.5 pt-3 text-right tabular text-muted-foreground">{fmtMoeda(rateioValores[i]?.valor ?? 0)}</td>
                            <td className="p-1.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => removerLinhaRateio(i)}
                                disabled={v.rateios.length <= 1}
                                aria-label={`Remover linha ${i + 1}`}
                              >
                                <Trash />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/30 text-xs">
                          <td className="px-2 py-1.5" colSpan={2}>
                            <Button type="button" variant="ghost" size="xs" onClick={adicionarLinhaRateio}>
                              <Plus /> Adicionar linha
                            </Button>
                          </td>
                          <td
                            className={cn(
                              "px-2 py-1.5 text-right font-semibold tabular",
                              Math.abs(somaPercentual - 100) > 0.01 ? "text-destructive" : "text-success",
                            )}
                          >
                            {fmtNumero(somaPercentual)}%
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold tabular">{fmtMoeda(v.valor)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {(erros.rateios || Object.keys(erros).some((k) => k.startsWith("rateios."))) && (
                    <p className="text-xs text-destructive" role="alert">
                      {erros.rateios ?? "Revise as linhas do rateio: categoria e percentual são obrigatórios."}
                    </p>
                  )}
                  {!erros.rateios && Math.abs(somaPercentual - 100) > 0.01 && (
                    <p className="text-xs text-muted-foreground">O rateio precisa somar 100%. Faltam {fmtNumero(arred2(100 - somaPercentual))}%.</p>
                  )}
                </div>
              )}
            </Secao>

            {!edicao && (
              <Secao titulo="Repetição">
                <Segmentado<Repeticao>
                  rotulo="Repetição"
                  valor={repeticao}
                  onChange={(x) => {
                    setRepeticao(x);
                    limparErro("parcelas", "ocorrencias", "vencimento");
                  }}
                  opcoes={[
                    { valor: "unica", rotulo: "Única" },
                    { valor: "parcelada", rotulo: "Parcelada" },
                    { valor: "recorrente", rotulo: "Recorrente" },
                  ]}
                />

                {repeticao === "parcelada" && (
                  <div className="space-y-3 rounded-lg border p-3">
                    {opcoes.condicoes.length > 0 && (
                      <Segmentado<ModoParcelas>
                        rotulo="Como parcelar"
                        valor={modoParcelas}
                        onChange={(x) => {
                          setModoParcelas(x);
                          limparErro("parcelas", "vencimento");
                        }}
                        opcoes={[
                          { valor: "intervalo", rotulo: "Nº de parcelas" },
                          { valor: "condicao", rotulo: "Condição de pagamento" },
                        ]}
                      />
                    )}
                    {modoParcelas === "intervalo" ? (
                      <div className="grid grid-cols-6 gap-3">
                        <Campo className="col-span-3 sm:col-span-2" id="fl-qtd-parcelas" rotulo="Nº de parcelas" obrigatorio>
                          <Input
                            id="fl-qtd-parcelas"
                            type="number"
                            min={2}
                            max={MAX_REPETICOES}
                            value={qtdParcelas || ""}
                            onChange={(e) => setQtdParcelas(Math.min(MAX_REPETICOES, Math.max(0, Math.trunc(Number(e.target.value)) || 0)))}
                            className="tabular"
                          />
                        </Campo>
                        <Campo className="col-span-3 sm:col-span-2" id="fl-intervalo-parcelas" rotulo="Intervalo">
                          <CampoSelect
                            id="fl-intervalo-parcelas"
                            opcoes={INTERVALOS}
                            valor={intervaloParcelas}
                            onChange={(x) => setIntervaloParcelas(x as Intervalo)}
                          />
                        </Campo>
                      </div>
                    ) : (
                      <Campo
                        id="fl-condicao"
                        rotulo="Condição de pagamento"
                        obrigatorio
                        ajuda={condicao ? `Prazos de ${condicao.dias.replace(/,/g, ", ")} dias contados da emissão (${fmtData(v.emissao)}).` : undefined}
                      >
                        <CampoSelect
                          id="fl-condicao"
                          opcoes={opcoes.condicoes.map((c) => ({ valor: c.id, rotulo: `${c.nome} (${c.dias})` }))}
                          valor={condicaoId}
                          onChange={setCondicaoId}
                          vazio={condicaoId ? undefined : "Selecione…"}
                        />
                      </Campo>
                    )}

                    {parcelas.length > 0 ? (
                      <div className="max-h-72 overflow-y-auto rounded-md border">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                            <tr>
                              <th className="w-20 px-3 py-1.5 font-medium">Parcela</th>
                              <th className="px-3 py-1.5 font-medium">Vencimento</th>
                              <th className="px-3 py-1.5 text-right font-medium">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parcelas.map((p, i) => (
                              <tr key={i} className="border-t">
                                <td className="px-3 py-1 tabular text-muted-foreground">
                                  {i + 1}/{parcelas.length}
                                </td>
                                <td className="px-3 py-1">
                                  <Input
                                    type="date"
                                    value={p.vencimento}
                                    onChange={(e) => ajustarParcela(i, { vencimento: e.target.value })}
                                    className="h-8"
                                    aria-label={`Vencimento da parcela ${i + 1}`}
                                  />
                                </td>
                                <td className="px-3 py-1">
                                  <CampoMoeda
                                    valor={p.valor}
                                    onChange={(n) => ajustarParcela(i, { valor: n })}
                                    className="h-8"
                                    aria-label={`Valor da parcela ${i + 1}`}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="sticky bottom-0 bg-muted text-xs">
                            <tr>
                              <td className="px-3 py-1.5 font-medium" colSpan={2}>
                                Soma das parcelas
                                {Math.abs(diferencaParcelas) > 0.005 ? (
                                  <span className="ml-2 font-normal text-destructive">
                                    difere {fmtMoeda(Math.abs(diferencaParcelas))} do total ({fmtMoeda(v.valor)})
                                  </span>
                                ) : (
                                  <span className="ml-2 inline-flex items-center gap-1 font-normal text-success">
                                    <CircleCheck className="size-3.5" /> confere com o total
                                  </span>
                                )}
                              </td>
                              <td
                                className={cn(
                                  "px-3 py-1.5 text-right font-semibold tabular",
                                  Math.abs(diferencaParcelas) > 0.005 && "text-destructive",
                                )}
                              >
                                {fmtMoeda(somaParcelas)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {modoParcelas === "condicao"
                          ? "Informe o valor e a condição para ver as parcelas."
                          : "Informe o valor, o 1º vencimento e o nº de parcelas para ver a prévia."}
                      </p>
                    )}
                    {erros.parcelas && (
                      <p className="text-xs text-destructive" role="alert">
                        {erros.parcelas}
                      </p>
                    )}
                  </div>
                )}

                {repeticao === "recorrente" && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="grid grid-cols-6 gap-3">
                      <Campo className="col-span-3 sm:col-span-2" id="fl-ocorrencias" rotulo="Ocorrências" obrigatorio erro={erros.ocorrencias}>
                        <Input
                          id="fl-ocorrencias"
                          type="number"
                          min={2}
                          max={MAX_REPETICOES}
                          value={qtdOcorrencias || ""}
                          onChange={(e) => {
                            setQtdOcorrencias(Math.min(MAX_REPETICOES, Math.max(0, Math.trunc(Number(e.target.value)) || 0)));
                            limparErro("ocorrencias");
                          }}
                          className="tabular"
                        />
                      </Campo>
                      <Campo className="col-span-3 sm:col-span-2" id="fl-intervalo-recorrencia" rotulo="Intervalo">
                        <CampoSelect
                          id="fl-intervalo-recorrencia"
                          opcoes={INTERVALOS_RECORRENCIA}
                          valor={intervaloRecorrencia}
                          onChange={(x) => setIntervaloRecorrencia(x as Intervalo)}
                        />
                      </Campo>
                    </div>
                    {ocorrencias.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {ocorrencias.length} lançamentos de <span className="tabular">{fmtMoeda(v.valor)}</span>, de {fmtData(ocorrencias[0])} a{" "}
                          {fmtData(ocorrencias[ocorrencias.length - 1])} · total{" "}
                          <span className="font-medium text-foreground tabular">{fmtMoeda(arred2(v.valor * ocorrencias.length))}</span>
                        </p>
                        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                          {ocorrencias.map((d, i) => (
                            <span key={d + i} className="rounded-md bg-muted px-2 py-0.5 text-xs tabular">
                              {i + 1}. {fmtData(d)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Informe o 1º vencimento e a quantidade para ver as datas.</p>
                    )}
                  </div>
                )}
              </Secao>
            )}

            {!edicao && (
              <Secao titulo={tipo === "RECEBER" ? "Recebimento" : "Pagamento"}>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="fl-baixar-agora"
                    checked={baixarAgora}
                    onCheckedChange={(x) => {
                      setBaixarAgora(x === true);
                      if (x === true && !contaBaixa) setContaBaixa(v.contaBancariaId || opcoes.contas[0]?.valor || "");
                    }}
                  />
                  <Label htmlFor="fl-baixar-agora" className="font-normal">
                    {tx.jaBaixado}
                  </Label>
                </div>
                {baixarAgora && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="grid grid-cols-6 gap-3">
                      <Campo className="col-span-6 sm:col-span-2" id="fl-data-baixa" rotulo="Data" obrigatorio erro={erros["baixarAgora.data"]}>
                        <Input
                          id="fl-data-baixa"
                          type="date"
                          max={hoje}
                          value={dataBaixa}
                          aria-invalid={!!erros["baixarAgora.data"]}
                          onChange={(e) => {
                            setDataBaixa(e.target.value);
                            limparErro("baixarAgora.data");
                          }}
                        />
                      </Campo>
                      <Campo className="col-span-6 sm:col-span-4" id="fl-conta-baixa" rotulo="Conta" obrigatorio erro={erros["baixarAgora.contaBancariaId"]}>
                        <CampoSelect
                          id="fl-conta-baixa"
                          opcoes={opcoes.contas}
                          valor={contaBaixa}
                          onChange={(x) => {
                            setContaBaixa(x);
                            limparErro("baixarAgora.contaBancariaId");
                          }}
                          vazio={contaBaixa ? undefined : "Selecione…"}
                          aria-invalid={!!erros["baixarAgora.contaBancariaId"]}
                        />
                      </Campo>
                    </div>
                    {qtdTitulos > 1 && (
                      <p className="text-xs text-muted-foreground">
                        Todas as {qtdTitulos} {repeticao === "recorrente" ? "ocorrências" : "parcelas"} serão baixadas nesta data.
                      </p>
                    )}
                    {opcoes.contas.length === 0 && <p className="text-xs text-destructive">Cadastre uma conta bancária para registrar a baixa.</p>}
                  </div>
                )}
              </Secao>
            )}

            <Secao titulo="Observações">
              <Textarea
                id="fl-observacoes"
                aria-label="Observações"
                value={v.observacoes}
                maxLength={2000}
                rows={3}
                onChange={(e) => set("observacoes", e.target.value)}
                placeholder="Informações internas sobre o lançamento"
              />
            </Secao>
          </div>

          <SheetFooter className="sticky bottom-0 flex-row items-center justify-between gap-2 border-t bg-background">
            <span className="text-xs text-muted-foreground tabular">{resumoRodape}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando}>
                {salvando && <LoaderCircle className="animate-spin" />}
                {edicao ? "Salvar alterações" : qtdTitulos > 1 ? `Criar ${qtdTitulos} lançamentos` : "Salvar"}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
