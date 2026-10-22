"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Campo, CampoSelect } from "@/components/financeiro/campos";
import { SeletorPessoa } from "@/components/seletor-pessoa";
import { SeletorProduto } from "@/components/vendas/seletor-produto";
import { fmtMoeda } from "@/lib/format";
import { fmtDecimal, lerDecimal, totaisDocumento, totalItem } from "@/modules/vendas/calculos";
import { salvarPedido, salvarProposta } from "@/modules/vendas/acoes";
import type { OpcoesVenda, TipoDocumentoVenda } from "@/modules/vendas/tipos";
import { linhaVazia, type LinhaDocumentoForm, type ValoresDocumento } from "@/modules/vendas/valores";
import { cn } from "@/lib/utils";

type LinhaForm = LinhaDocumentoForm & { chave: number };

/** Formulário de proposta ou pedido de venda, com itens e totais calculados na hora (o servidor recalcula). */
export function FormularioDocumento({
  tipo,
  id,
  numero,
  opcoes,
  iniciais,
}: {
  tipo: TipoDocumentoVenda;
  id: string | null;
  numero?: number;
  opcoes: OpcoesVenda;
  iniciais: ValoresDocumento;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const proximaChave = useRef(Math.max(iniciais.itens.length, 1) + 1);
  const [v, setV] = useState(() => ({ ...iniciais }));
  const [linhas, setLinhas] = useState<LinhaForm[]>(() =>
    (iniciais.itens.length ? iniciais.itens : [linhaVazia()]).map((l, i) => ({ ...l, chave: i + 1 })),
  );
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falhas, setFalhas] = useState(0);
  const [salvando, iniciar] = useTransition();
  const proposta = tipo === "proposta";
  const base = proposta ? "/vendas/propostas" : "/vendas/pedidos";

  useEffect(() => {
    if (!falhas) return;
    const campo = formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
    campo?.scrollIntoView({ block: "center" });
    campo?.focus({ preventScroll: true });
  }, [falhas]);

  const set = <K extends keyof ValoresDocumento>(k: K, valor: ValoresDocumento[K]) => {
    setV((a) => ({ ...a, [k]: valor }));
    setErros((e) => (e[k] ? Object.fromEntries(Object.entries(e).filter(([c]) => c !== k)) : e));
  };
  const setLinha = (chave: number, mudanca: Partial<LinhaForm>) => {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...mudanca } : l)));
    setErros((e) => (Object.keys(e).some((c) => c.startsWith("itens.")) ? Object.fromEntries(Object.entries(e).filter(([c]) => !c.startsWith("itens."))) : e));
  };

  const calculadas = useMemo(
    () =>
      linhas.map((l) => {
        const q = lerDecimal(l.quantidade, 3);
        const p = lerDecimal(l.precoUnitario, 4);
        const dsc = l.descontoPercentual.trim() ? lerDecimal(l.descontoPercentual, 2) : 0;
        const valido = Number.isFinite(q) && Number.isFinite(p) && Number.isFinite(dsc);
        return { q, p, dsc, valido, total: valido ? totalItem({ quantidade: q, precoUnitario: p, descontoPercentual: dsc }) : 0 };
      }),
    [linhas],
  );
  const totais = useMemo(
    () => totaisDocumento(calculadas.filter((c) => c.valido).map((c) => ({ quantidade: c.q, precoUnitario: c.p, descontoPercentual: c.dsc }))),
    [calculadas],
  );

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const entrada = {
      empresaId: v.empresaId,
      pessoaId: v.pessoaId ?? "",
      vendedorId: v.vendedorId || null,
      emissao: v.emissao,
      ...(proposta ? { validade: v.validade } : {}),
      ...(proposta && !id && v.oportunidadeId ? { oportunidadeId: v.oportunidadeId } : {}),
      condicaoPagamentoId: v.condicaoPagamentoId || null,
      formaPagamentoId: v.formaPagamentoId || null,
      observacoes: v.observacoes,
      observacoesInternas: v.observacoesInternas,
      itens: linhas.map((l) => ({
        produtoId: l.produtoId,
        tipo: l.tipo,
        descricao: l.descricao,
        unidade: l.unidade,
        quantidade: l.quantidade,
        precoUnitario: l.precoUnitario || "0",
        descontoPercentual: l.descontoPercentual || "0",
      })),
    };
    iniciar(async () => {
      const r = proposta ? await salvarProposta(id, entrada as Parameters<typeof salvarProposta>[1]) : await salvarPedido(id, entrada);
      if (!r.ok) {
        setErros(r.campos ?? {});
        setFalhas((n) => n + 1);
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem ?? "Salvo.");
      router.push(`${base}/${r.data?.id ?? id}`);
      router.refresh();
    });
  }

  const erroItem = (i: number, campo: string) => erros[`itens.${i}.${campo}`];

  return (
    <form ref={formRef} onSubmit={salvar} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados {proposta ? "da proposta" : "do pedido"}</CardTitle>
          <CardDescription>
            {numero ? `Nº ${String(numero).padStart(4, "0")}` : "O número é gerado ao salvar."}
            {v.oportunidadeTitulo && ` Ligada à oportunidade: ${v.oportunidadeTitulo}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-6 gap-4">
          <Campo className="col-span-6 md:col-span-3" id="dv-cliente" rotulo="Cliente" obrigatorio erro={erros.pessoaId}>
            <SeletorPessoa
              id="dv-cliente"
              valor={v.pessoaId}
              rotuloInicial={v.pessoaNome}
              papel="cliente"
              placeholder="Selecione o cliente…"
              invalido={!!erros.pessoaId}
              onChange={(pid, p) => {
                set("pessoaId", pid);
                set("pessoaNome", p?.nome ?? null);
              }}
            />
          </Campo>
          <Campo className="col-span-3 md:col-span-1" id="dv-emissao" rotulo="Emissão" obrigatorio erro={erros.emissao}>
            <Input id="dv-emissao" type="date" value={v.emissao} onChange={(e) => set("emissao", e.target.value)} aria-invalid={!!erros.emissao} />
          </Campo>
          {proposta && (
            <Campo className="col-span-3 md:col-span-1" id="dv-validade" rotulo="Válida até" obrigatorio erro={erros.validade}>
              <Input id="dv-validade" type="date" value={v.validade} onChange={(e) => set("validade", e.target.value)} aria-invalid={!!erros.validade} />
            </Campo>
          )}
          <Campo className={cn("col-span-6", proposta ? "md:col-span-1" : "md:col-span-2")} id="dv-vendedor" rotulo="Responsável" erro={erros.vendedorId}>
            <CampoSelect id="dv-vendedor" opcoes={opcoes.vendedores} valor={v.vendedorId} onChange={(x) => set("vendedorId", x)} aria-invalid={!!erros.vendedorId} />
          </Campo>
          {opcoes.emitentes.length > 1 && (
            <Campo className="col-span-6 md:col-span-2" id="dv-empresa" rotulo="Empresa emissora" obrigatorio erro={erros.empresaId}>
              <CampoSelect id="dv-empresa" opcoes={opcoes.emitentes} valor={v.empresaId} onChange={(x) => set("empresaId", x)} disabled={!!id} aria-invalid={!!erros.empresaId} />
            </Campo>
          )}
          <Campo className="col-span-6 md:col-span-2" id="dv-condicao" rotulo="Condição de pagamento" erro={erros.condicaoPagamentoId}>
            <CampoSelect id="dv-condicao" opcoes={opcoes.condicoes} valor={v.condicaoPagamentoId} onChange={(x) => set("condicaoPagamentoId", x)} vazio="A combinar" />
          </Campo>
          <Campo className="col-span-6 md:col-span-2" id="dv-forma" rotulo="Forma de pagamento" erro={erros.formaPagamentoId}>
            <CampoSelect id="dv-forma" opcoes={opcoes.formas} valor={v.formaPagamentoId} onChange={(x) => set("formaPagamentoId", x)} vazio="—" />
          </Campo>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-end justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">Itens</CardTitle>
            <CardDescription>Produtos e serviços. Quantidade com até 3 casas (kg) e preço com até 4.</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setLinhas((ls) => [...ls, { ...linhaVazia(), chave: proximaChave.current++ }])}
          >
            <Plus /> Adicionar item
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {erros.itens && (
            <p className="text-sm text-destructive" role="alert">
              {erros.itens}
            </p>
          )}
          {linhas.map((l, i) => (
            <div key={l.chave} className="rounded-lg border p-3">
              <div className="grid grid-cols-12 gap-3">
                <Campo className="col-span-12 md:col-span-5" id={`it-${l.chave}-prod`} rotulo={`Item ${i + 1}`}>
                  <SeletorProduto
                    id={`it-${l.chave}-prod`}
                    valor={l.produtoId}
                    rotuloInicial={l.produtoRotulo}
                    onChange={(p) =>
                      setLinha(
                        l.chave,
                        p
                          ? {
                              produtoId: p.id,
                              produtoRotulo: `${p.codigo} · ${p.descricao}`,
                              tipo: p.tipo,
                              descricao: p.descricao,
                              unidade: p.unidade,
                              precoUnitario: fmtDecimal(p.precoVenda, 2, 4),
                            }
                          : { produtoId: null, produtoRotulo: null },
                      )
                    }
                  />
                </Campo>
                <Campo className="col-span-12 md:col-span-7" id={`it-${l.chave}-desc`} rotulo="Descrição" obrigatorio erro={erroItem(i, "descricao")}>
                  <Input
                    id={`it-${l.chave}-desc`}
                    value={l.descricao}
                    maxLength={300}
                    onChange={(e) => setLinha(l.chave, { descricao: e.target.value })}
                    aria-invalid={!!erroItem(i, "descricao")}
                    placeholder="Ex.: Sucata de alumínio prensada"
                  />
                </Campo>
                <Campo className="col-span-6 md:col-span-2" id={`it-${l.chave}-tipo`} rotulo="Tipo">
                  <CampoSelect
                    id={`it-${l.chave}-tipo`}
                    opcoes={[
                      { valor: "PRODUTO", rotulo: "Produto" },
                      { valor: "SERVICO", rotulo: "Serviço" },
                    ]}
                    valor={l.tipo}
                    onChange={(x) => setLinha(l.chave, { tipo: x as LinhaForm["tipo"] })}
                  />
                </Campo>
                <Campo className="col-span-6 md:col-span-1" id={`it-${l.chave}-un`} rotulo="Un." erro={erroItem(i, "unidade")}>
                  <Input id={`it-${l.chave}-un`} value={l.unidade} maxLength={6} onChange={(e) => setLinha(l.chave, { unidade: e.target.value.toUpperCase() })} />
                </Campo>
                <Campo className="col-span-6 md:col-span-2" id={`it-${l.chave}-qtd`} rotulo="Quantidade" obrigatorio erro={erroItem(i, "quantidade")}>
                  <Input
                    id={`it-${l.chave}-qtd`}
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    value={l.quantidade}
                    onChange={(e) => setLinha(l.chave, { quantidade: e.target.value })}
                    onBlur={() => calculadas[i].valido && setLinha(l.chave, { quantidade: fmtDecimal(calculadas[i].q, 0, 3) })}
                    aria-invalid={!!erroItem(i, "quantidade")}
                  />
                </Campo>
                <Campo className="col-span-6 md:col-span-2" id={`it-${l.chave}-preco`} rotulo="Preço unitário" erro={erroItem(i, "precoUnitario")}>
                  <Input
                    id={`it-${l.chave}-preco`}
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    placeholder="0,00"
                    value={l.precoUnitario}
                    onChange={(e) => setLinha(l.chave, { precoUnitario: e.target.value })}
                    onBlur={() => l.precoUnitario && calculadas[i].valido && setLinha(l.chave, { precoUnitario: fmtDecimal(calculadas[i].p, 2, 4) })}
                    aria-invalid={!!erroItem(i, "precoUnitario")}
                  />
                </Campo>
                <Campo className="col-span-6 md:col-span-1" id={`it-${l.chave}-dsc`} rotulo="Desc. %" erro={erroItem(i, "descontoPercentual")}>
                  <Input
                    id={`it-${l.chave}-dsc`}
                    inputMode="decimal"
                    className="text-right tabular-nums"
                    placeholder="0"
                    value={l.descontoPercentual}
                    onChange={(e) => setLinha(l.chave, { descontoPercentual: e.target.value })}
                    aria-invalid={!!erroItem(i, "descontoPercentual")}
                  />
                </Campo>
                <div className="col-span-6 flex items-end justify-between gap-2 md:col-span-4">
                  <div className="space-y-1.5">
                    <span className="text-sm font-medium">Total</span>
                    <p className="h-9 text-lg leading-9 font-semibold tabular-nums">{calculadas[i].valido ? fmtMoeda(calculadas[i].total) : "—"}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover item ${i + 1}`}
                    disabled={linhas.length === 1}
                    onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </div>
          ))}

          <div className="ml-auto w-full max-w-xs space-y-1 pt-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">{fmtMoeda(totais.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Descontos</span>
              <span className="tabular-nums">− {fmtMoeda(totais.desconto)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{fmtMoeda(totais.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Observações</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Campo id="dv-obs" rotulo="Para o cliente" ajuda="Sai no PDF.">
            <Textarea id="dv-obs" rows={4} maxLength={2000} value={v.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
          </Campo>
          <Campo id="dv-obs-int" rotulo="Internas" ajuda="Só aparecem aqui, nunca no PDF.">
            <Textarea id="dv-obs-int" rows={4} maxLength={2000} value={v.observacoesInternas} onChange={(e) => set("observacoesInternas", e.target.value)} />
          </Campo>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" asChild>
          <Link href={id ? `${base}/${id}` : base}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={salvando}>
          {salvando && <LoaderCircle className="animate-spin" />} {id ? "Salvar alterações" : proposta ? "Criar proposta" : "Criar pedido"}
        </Button>
      </div>
    </form>
  );
}
