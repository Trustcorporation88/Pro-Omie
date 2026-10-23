"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Campo, CampoSelect } from "@/components/financeiro/campos";
import { SeletorPessoa } from "@/components/seletor-pessoa";
import { addDias } from "@/lib/datas";
import { fmtDecimal, lerDecimal } from "@/modules/vendas/calculos";
import { ajustarEstoque, registrarEntrada } from "@/modules/estoque/acoes";
import { MOTIVOS_AJUSTE, fatorKg, fmtPeso, fmtQtd, rotuloGrupo, type MaterialEstoque } from "@/modules/estoque/tipos";
import { cn } from "@/lib/utils";

type Estab = { id: string; nome: string; matriz: boolean };

const arred3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Agrupa os materiais na ordem recebida (já vem ordenada por grupo e nome). */
function porGrupo(materiais: MaterialEstoque[]) {
  const grupos: { grupo: string | null; itens: MaterialEstoque[] }[] = [];
  for (const m of materiais) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.grupo === m.grupo) ultimo.itens.push(m);
    else grupos.push({ grupo: m.grupo, itens: [m] });
  }
  return grupos;
}

function useFocoNoErro(falhas: number, formRef: React.RefObject<HTMLFormElement | null>) {
  useEffect(() => {
    if (!falhas) return;
    const campo = formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
    campo?.scrollIntoView({ block: "center" });
    campo?.focus({ preventScroll: true });
  }, [falhas, formRef]);
}

/** Erros do servidor vêm como itens.N.campo; aqui viram erro por material. */
function errosPorMaterial(campos: Record<string, string> | undefined, enviados: string[]) {
  const porId: Record<string, string> = {};
  const gerais: Record<string, string> = {};
  for (const [k, v] of Object.entries(campos ?? {})) {
    const m = /^itens\.(\d+)\./.exec(k);
    if (m && enviados[Number(m[1])]) porId[enviados[Number(m[1])]] = v;
    else gerais[k] = v;
  }
  return { porId, gerais };
}

/** Entrada da produção ou triagem: o peso de cada material produzido (em branco = não entrou). */
export function FormularioEntrada({
  materiais,
  estabelecimentos,
  padraoEstabelecimento,
  hoje,
}: {
  materiais: MaterialEstoque[];
  estabelecimentos: Estab[];
  padraoEstabelecimento: string;
  hoje: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [data, setData] = useState(hoje);
  const [empresaId, setEmpresaId] = useState(padraoEstabelecimento);
  const [pessoa, setPessoa] = useState<{ id: string | null; nome: string | null }>({ id: null, nome: null });
  const [referencia, setReferencia] = useState("");
  const [observacao, setObservacao] = useState("");
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<{ porId: Record<string, string>; gerais: Record<string, string> }>({ porId: {}, gerais: {} });
  const [falhas, setFalhas] = useState(0);
  const [salvando, iniciar] = useTransition();
  useFocoNoErro(falhas, formRef);

  const lidas = useMemo(
    () =>
      Object.fromEntries(
        materiais.map((m) => {
          const t = (qtd[m.id] ?? "").trim();
          return [m.id, t ? lerDecimal(t, 3) : null];
        }),
      ),
    [materiais, qtd],
  );
  const preenchidos = materiais.filter((m) => lidas[m.id] !== null);
  const totalKg = preenchidos.reduce((a, m) => a + (Number.isFinite(lidas[m.id]!) ? (lidas[m.id] ?? 0) * (fatorKg(m.unidade) ?? 0) : 0), 0);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const enviados = preenchidos.map((m) => m.id);
    iniciar(async () => {
      const r = await registrarEntrada({
        empresaId,
        data,
        pessoaId: pessoa.id,
        referencia,
        observacao,
        itens: preenchidos.map((m) => ({ produtoId: m.id, quantidade: qtd[m.id] ?? "" })),
      });
      if (!r.ok) {
        setErros(errosPorMaterial(r.campos, enviados));
        setFalhas((n) => n + 1);
        return void toast.error(r.erro);
      }
      toast.success(r.mensagem ?? "Entrada registrada.");
      router.push("/estoque");
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={salvar} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da entrada</CardTitle>
          <CardDescription>De onde veio o material. Cliente e referência são opcionais e ajudam a rastrear a origem.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-6 gap-4">
          <Campo className="col-span-6 sm:col-span-2" id="en-data" rotulo="Data" obrigatorio erro={erros.gerais.data}>
            <Input id="en-data" type="date" value={data} max={addDias(hoje, 1)} onChange={(e) => setData(e.target.value)} aria-invalid={!!erros.gerais.data} />
          </Campo>
          {estabelecimentos.length > 1 && (
            <Campo className="col-span-6 sm:col-span-4" id="en-estab" rotulo="Onde está o material" obrigatorio erro={erros.gerais.empresaId}>
              <CampoSelect
                id="en-estab"
                opcoes={estabelecimentos.map((e) => ({ valor: e.id, rotulo: `${e.nome}${e.matriz ? " (matriz)" : ""}` }))}
                valor={empresaId}
                onChange={setEmpresaId}
              />
            </Campo>
          )}
          <Campo className="col-span-6 sm:col-span-3" id="en-cliente" rotulo="Cliente de origem" erro={erros.gerais.pessoaId}>
            <SeletorPessoa
              id="en-cliente"
              valor={pessoa.id}
              rotuloInicial={pessoa.nome}
              papel="cliente"
              placeholder="Opcional"
              invalido={!!erros.gerais.pessoaId}
              onChange={(id, p) => setPessoa({ id, nome: p?.nome ?? null })}
            />
          </Campo>
          <Campo className="col-span-6 sm:col-span-3" id="en-ref" rotulo="Referência" ajuda="Processo de destruição, MTR, lote ou ticket de pesagem." erro={erros.gerais.referencia}>
            <Input id="en-ref" value={referencia} maxLength={120} onChange={(e) => setReferencia(e.target.value)} placeholder="Ex.: MTR 2026/001234" />
          </Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Materiais</CardTitle>
          <CardDescription>Preencha só o que entrou. Use vírgula para os decimais (ex.: 1.240,5).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {erros.gerais.itens && (
            <p className="text-sm text-destructive" role="alert">
              {erros.gerais.itens}
            </p>
          )}
          {porGrupo(materiais).map((g) => (
            <div key={g.grupo ?? "sem"}>
              <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{rotuloGrupo(g.grupo)}</p>
              <ul className="divide-y rounded-lg border">
                {g.itens.map((m) => {
                  const saldo = m.saldos[empresaId] ?? 0;
                  const q = lidas[m.id];
                  const valida = q !== null && Number.isFinite(q) && q > 0;
                  const erro = erros.porId[m.id];
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                      <label htmlFor={`en-q-${m.id}`} className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.descricao}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {`${m.codigo} · saldo ${fmtQtd(saldo, m.unidade)}`}
                          {valida && <span className="text-success">{` → ${fmtQtd(arred3(saldo + q!), m.unidade)}`}</span>}
                        </span>
                        {erro && <span className="block text-xs text-destructive">{erro}</span>}
                      </label>
                      <div className="relative w-40 shrink-0">
                        <Input
                          id={`en-q-${m.id}`}
                          inputMode="decimal"
                          className={cn("pr-10 text-right tabular-nums", valida && "border-success/60")}
                          placeholder="—"
                          value={qtd[m.id] ?? ""}
                          aria-invalid={!!erro}
                          onChange={(e) => {
                            setQtd((s) => ({ ...s, [m.id]: e.target.value }));
                            if (erro) setErros((x) => ({ ...x, porId: Object.fromEntries(Object.entries(x.porId).filter(([k]) => k !== m.id)) }));
                          }}
                          onBlur={() => valida && setQtd((s) => ({ ...s, [m.id]: fmtDecimal(q!, 0, 3) }))}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{m.unidade.toLowerCase()}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p className="text-right text-sm tabular-nums">
            {preenchidos.length ? (
              <>
                <span className="text-muted-foreground">{preenchidos.length === 1 ? "1 material · " : `${preenchidos.length} materiais · `}</span>
                <span className="font-semibold">{fmtPeso(totalKg)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Nenhum material preenchido</span>
            )}
          </p>
          <Campo id="en-obs" rotulo="Observação" erro={erros.gerais.observacao}>
            <Textarea id="en-obs" rows={2} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </Campo>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" asChild>
          <Link href="/estoque">Cancelar</Link>
        </Button>
        <Button type="submit" disabled={salvando}>
          {salvando && <LoaderCircle className="animate-spin" />} Registrar entrada
        </Button>
      </div>
    </form>
  );
}

/** Ajuste pelo saldo contado: inventário, perda ou correção. Em branco = sem mudança. */
export function FormularioAjuste({
  materiais,
  estabelecimentos,
  padraoEstabelecimento,
  hoje,
  materialInicial,
}: {
  materiais: MaterialEstoque[];
  estabelecimentos: Estab[];
  padraoEstabelecimento: string;
  hoje: string;
  materialInicial?: string | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [data, setData] = useState(hoje);
  const [empresaId, setEmpresaId] = useState(padraoEstabelecimento);
  const [motivo, setMotivo] = useState("INVENTARIO");
  const [observacao, setObservacao] = useState("");
  const [contado, setContado] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<{ porId: Record<string, string>; gerais: Record<string, string> }>({ porId: {}, gerais: {} });
  const [falhas, setFalhas] = useState(0);
  const [salvando, iniciar] = useTransition();
  useFocoNoErro(falhas, formRef);

  useEffect(() => {
    if (materialInicial) document.getElementById(`aj-q-${materialInicial}`)?.focus();
  }, [materialInicial]);

  const lidos = Object.fromEntries(
    materiais.map((m) => {
      const t = (contado[m.id] ?? "").trim();
      return [m.id, t ? lerDecimal(t, 3) : null];
    }),
  );
  const preenchidos = materiais.filter((m) => lidos[m.id] !== null);
  const mudam = preenchidos.filter((m) => Number.isFinite(lidos[m.id]!) && arred3(lidos[m.id]! - (m.saldos[empresaId] ?? 0)) !== 0);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const enviados = preenchidos.map((m) => m.id);
    iniciar(async () => {
      const r = await ajustarEstoque({
        empresaId,
        data,
        motivo,
        observacao,
        itens: preenchidos.map((m) => ({ produtoId: m.id, saldoEsperado: m.saldos[empresaId] ?? 0, contado: contado[m.id] ?? "" })),
      });
      if (!r.ok) {
        setErros(errosPorMaterial(r.campos, enviados));
        setFalhas((n) => n + 1);
        return void toast.error(r.erro);
      }
      toast.success(r.mensagem ?? "Estoque ajustado.");
      router.push("/estoque");
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={salvar} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do ajuste</CardTitle>
          <CardDescription>Informe o saldo real (contado ou pesado). O sistema registra a diferença e guarda o motivo no histórico.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-6 gap-4">
          <Campo className="col-span-6 sm:col-span-2" id="aj-data" rotulo="Data" obrigatorio erro={erros.gerais.data}>
            <Input id="aj-data" type="date" value={data} max={addDias(hoje, 1)} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo className="col-span-6 sm:col-span-4" id="aj-motivo" rotulo="Motivo" obrigatorio erro={erros.gerais.motivo}>
            <CampoSelect id="aj-motivo" opcoes={Object.entries(MOTIVOS_AJUSTE).map(([valor, rotulo]) => ({ valor, rotulo }))} valor={motivo} onChange={setMotivo} />
          </Campo>
          {estabelecimentos.length > 1 && (
            <Campo className="col-span-6" id="aj-estab" rotulo="Estabelecimento" obrigatorio erro={erros.gerais.empresaId}>
              <CampoSelect
                id="aj-estab"
                opcoes={estabelecimentos.map((e) => ({ valor: e.id, rotulo: `${e.nome}${e.matriz ? " (matriz)" : ""}` }))}
                valor={empresaId}
                onChange={(v) => {
                  setEmpresaId(v);
                  setContado({}); // os saldos mudam com o estabelecimento
                }}
              />
            </Campo>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo contado</CardTitle>
          <CardDescription>Preencha só os materiais que mudaram.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {erros.gerais.itens && (
            <p className="text-sm text-destructive" role="alert">
              {erros.gerais.itens}
            </p>
          )}
          {porGrupo(materiais).map((g) => (
            <div key={g.grupo ?? "sem"}>
              <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{rotuloGrupo(g.grupo)}</p>
              <ul className="divide-y rounded-lg border">
                {g.itens.map((m) => {
                  const saldo = m.saldos[empresaId] ?? 0;
                  const c = lidos[m.id];
                  const valido = c !== null && Number.isFinite(c) && c >= 0;
                  const dif = valido ? arred3(c! - saldo) : 0;
                  const erro = erros.porId[m.id];
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                      <label htmlFor={`aj-q-${m.id}`} className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.descricao}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {`no sistema ${fmtQtd(saldo, m.unidade)}`}
                          {valido && dif !== 0 && (
                            <span className={dif > 0 ? "text-success" : "text-destructive"}>{` · ${dif > 0 ? "+" : "−"}${fmtQtd(Math.abs(dif), m.unidade)}`}</span>
                          )}
                          {valido && dif === 0 && " · sem diferença"}
                        </span>
                        {erro && <span className="block text-xs text-destructive">{erro}</span>}
                      </label>
                      <div className="relative w-40 shrink-0">
                        <Input
                          id={`aj-q-${m.id}`}
                          inputMode="decimal"
                          className="pr-10 text-right tabular-nums"
                          placeholder="—"
                          value={contado[m.id] ?? ""}
                          aria-invalid={!!erro}
                          onChange={(e) => setContado((s) => ({ ...s, [m.id]: e.target.value }))}
                          onBlur={() => valido && setContado((s) => ({ ...s, [m.id]: fmtDecimal(c!, 0, 3) }))}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{m.unidade.toLowerCase()}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <Campo id="aj-obs" rotulo="Observação" erro={erros.gerais.observacao}>
            <Textarea id="aj-obs" rows={2} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: fardos pesados de novo na balança do pátio" />
          </Campo>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-sm text-muted-foreground">{mudam.length ? `${mudam.length === 1 ? "1 material muda" : `${mudam.length} materiais mudam`}` : ""}</span>
        <Button type="button" variant="outline" asChild>
          <Link href="/estoque">Cancelar</Link>
        </Button>
        <Button type="submit" disabled={salvando}>
          {salvando && <LoaderCircle className="animate-spin" />} Salvar ajuste
        </Button>
      </div>
    </form>
  );
}
