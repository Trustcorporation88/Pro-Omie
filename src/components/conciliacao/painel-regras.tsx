"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Plus, Trash, Wand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { SeletorPessoa } from "@/components/seletor-pessoa";
import { Selo } from "@/components/selos";
import { cn } from "@/lib/utils";
import { alternarRegra, excluirRegra, salvarRegra } from "@/modules/conciliacao/acoes";
import type { OpcoesConciliacao, RegraResumo, TipoLancamento } from "@/modules/conciliacao/tipos";

const CLASSE_SELECT = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs aria-invalid:border-destructive";

const ROTULO_TIPO: Record<"RECEBER" | "PAGAR" | "AMBOS", string> = {
  RECEBER: "Entradas (créditos)",
  PAGAR: "Saídas (débitos)",
  AMBOS: "Entradas e saídas",
};

function FormularioRegra({ opcoes }: { opcoes: OpcoesConciliacao }) {
  const router = useRouter();
  const [termo, setTermo] = useState("");
  const [tipo, setTipo] = useState<TipoLancamento | "">("PAGAR");
  const [categoriaId, setCategoriaId] = useState("");
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [chavePessoa, setChavePessoa] = useState(0);
  const [centroCustoId, setCentroCustoId] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, iniciar] = useTransition();

  const grupos =
    tipo === "RECEBER"
      ? [{ rotulo: "Receitas", itens: opcoes.categoriasReceita }]
      : tipo === "PAGAR"
        ? [{ rotulo: "Despesas", itens: opcoes.categoriasDespesa }]
        : [
            { rotulo: "Receitas", itens: opcoes.categoriasReceita },
            { rotulo: "Despesas", itens: opcoes.categoriasDespesa },
          ];

  function trocarTipo(novo: TipoLancamento | "") {
    setTipo(novo);
    const permitidas =
      novo === "RECEBER" ? opcoes.categoriasReceita : novo === "PAGAR" ? opcoes.categoriasDespesa : [...opcoes.categoriasReceita, ...opcoes.categoriasDespesa];
    if (!permitidas.some((c) => c.valor === categoriaId)) setCategoriaId("");
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const novos: Record<string, string> = {};
    if (termo.trim().length < 3) novos.termo = "Use ao menos 3 caracteres.";
    if (!categoriaId) novos.categoriaId = "Escolha a categoria.";
    setErros(novos);
    if (Object.keys(novos).length) return;
    iniciar(async () => {
      const r = await salvarRegra({ termo: termo.trim(), tipo: tipo || null, categoriaId, pessoaId, centroCustoId: centroCustoId || null });
      if (r.ok) {
        toast.success(r.mensagem ?? "Regra criada.");
        setTermo("");
        setCategoriaId("");
        setPessoaId(null);
        setChavePessoa((k) => k + 1);
        setCentroCustoId("");
        router.refresh();
      } else {
        setErros(r.campos ?? {});
        toast.error(r.erro);
      }
    });
  }

  return (
    <form onSubmit={salvar} className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <p className="text-sm font-medium">Nova regra</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="regra-termo">
            Quando a descrição contiver<span className="text-destructive">*</span>
          </Label>
          <Input
            id="regra-termo"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Ex.: TAR PACOTE, ENERGISA, GOOGLE CLOUD"
            aria-invalid={!!erros.termo}
            maxLength={100}
          />
          {erros.termo && <p className="text-xs text-destructive">{erros.termo}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="regra-tipo">Vale para</Label>
          <select id="regra-tipo" value={tipo} onChange={(e) => trocarTipo(e.target.value as TipoLancamento | "")} className={CLASSE_SELECT}>
            <option value="PAGAR">{ROTULO_TIPO.PAGAR}</option>
            <option value="RECEBER">{ROTULO_TIPO.RECEBER}</option>
            <option value="">{ROTULO_TIPO.AMBOS}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="regra-categoria">
            Categoria<span className="text-destructive">*</span>
          </Label>
          <select
            id="regra-categoria"
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            aria-invalid={!!erros.categoriaId}
            className={CLASSE_SELECT}
          >
            <option value="">Selecione…</option>
            {grupos.map((g) => (
              <optgroup key={g.rotulo} label={g.rotulo}>
                {g.itens.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {erros.categoriaId && <p className="text-xs text-destructive">{erros.categoriaId}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Cliente/fornecedor</Label>
          <SeletorPessoa
            key={chavePessoa}
            valor={pessoaId}
            onChange={(id) => setPessoaId(id)}
            papel={tipo === "RECEBER" ? "cliente" : tipo === "PAGAR" ? "fornecedor" : undefined}
            placeholder="Opcional"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="regra-centro">Centro de custo</Label>
          <select id="regra-centro" value={centroCustoId} onChange={(e) => setCentroCustoId(e.target.value)} className={CLASSE_SELECT}>
            <option value="">—</option>
            {opcoes.centros.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={salvando}>
          {salvando ? <LoaderCircle className="animate-spin" /> : <Plus />} Adicionar regra
        </Button>
      </div>
    </form>
  );
}

function ItemRegra({ regra, podeEditar }: { regra: RegraResumo; podeEditar: boolean }) {
  const router = useRouter();
  const [alternando, iniciar] = useTransition();
  const [excluir, setExcluir] = useState(false);
  return (
    <li className={cn("flex items-start gap-3 py-3", !regra.ativo && "opacity-60")}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-all">“{regra.termo}”</span>
          <Selo tom={regra.tipo === "RECEBER" ? "sucesso" : regra.tipo === "PAGAR" ? "perigo" : "neutro"}>
            {ROTULO_TIPO[regra.tipo ?? "AMBOS"]}
          </Selo>
          {!regra.ativo && <Selo>Inativa</Selo>}
        </div>
        <p className="text-sm">{regra.categoria}</p>
        {(regra.pessoa || regra.centroCusto) && (
          <p className="text-xs text-muted-foreground">
            {[regra.pessoa && `Pessoa: ${regra.pessoa}`, regra.centroCusto && `Centro: ${regra.centroCusto}`].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      {podeEditar && (
        <div className="flex shrink-0 items-center gap-1">
          {alternando && <LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
          <Switch
            checked={regra.ativo}
            disabled={alternando}
            aria-label={regra.ativo ? "Inativar regra" : "Ativar regra"}
            onCheckedChange={() =>
              iniciar(async () => {
                const r = await alternarRegra(regra.id);
                if (r.ok) {
                  toast.success(regra.ativo ? "Regra inativada." : "Regra ativada.");
                  router.refresh();
                } else toast.error(r.erro);
              })
            }
          />
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" aria-label="Excluir regra" onClick={() => setExcluir(true)}>
            <Trash />
          </Button>
          <ConfirmarAcao
            aberto={excluir}
            onAbertoChange={setExcluir}
            titulo={`Excluir a regra “${regra.termo}”?`}
            descricao="Os lançamentos já criados não são alterados. Para só pausar a regra, use o botão de ativar/inativar."
            rotuloConfirmar="Excluir"
            destrutivo
            acao={() => excluirRegra(regra.id)}
          />
        </div>
      )}
    </li>
  );
}

/** Painel lateral com as regras de conciliação (termo → categoria/pessoa/centro). */
export function PainelRegras({ regras, opcoes, podeEditar }: { regras: RegraResumo[]; opcoes: OpcoesConciliacao; podeEditar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const ativas = regras.filter((r) => r.ativo).length;
  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Wand /> Regras
        {ativas > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular">{ativas}</span>}
      </Button>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Regras de conciliação</SheetTitle>
            <SheetDescription>
              Quando a descrição do extrato contém o termo (sem diferenciar maiúsculas e acentos), a categoria, o cliente/fornecedor e o
              centro de custo são sugeridos ao criar o lançamento.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6">
            {podeEditar && <FormularioRegra opcoes={opcoes} />}
            {regras.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhuma regra ainda. Crie aqui ou marque “Criar regra para descrições parecidas” ao criar um lançamento pela conciliação.
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {regras.length} regra(s) · {ativas} ativa(s)
                </p>
                <ul className="divide-y">
                  {regras.map((r) => (
                    <ItemRegra key={r.id} regra={r} podeEditar={podeEditar} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
