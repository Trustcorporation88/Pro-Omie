"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CampoMoeda } from "@/components/campo-moeda";
import { META, rotuloNovo, type Campo, type EntidadeCadastro } from "@/modules/cadastros/campos";
import { salvarCadastro } from "@/modules/cadastros/acoes";
import { consultarCep, consultarCnpj } from "@/modules/auth/acoes";
import { fmtCep, fmtDocumento, fmtTelefone, parseMoeda, soDigitos } from "@/lib/format";
import type { Opcao } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

type Valores = Record<string, string | number | boolean | null>;

const LARGURA: Record<number, string> = { 1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4", 6: "col-span-6" };

export function FormularioCadastro({
  entidade,
  id,
  iniciais,
  opcoesDinamicas = {},
  aberto,
  onAbertoChange,
}: {
  entidade: EntidadeCadastro;
  id: string | null;
  iniciais?: Valores;
  opcoesDinamicas?: Record<string, Opcao[]>;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
}) {
  const meta = META[entidade];
  const router = useRouter();
  const [valores, setValores] = useState<Valores>(() => ({ ...meta.padrao, ...(iniciais ?? {}) }));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, iniciarSalvar] = useTransition();
  const [buscando, iniciarBusca] = useTransition();

  const set = (nome: string, v: string | number | boolean | null) => setValores((s) => ({ ...s, [nome]: v }));

  function buscarDocumento() {
    const doc = soDigitos(String(valores.documento ?? ""));
    if (doc.length !== 14) return void toast.info("A consulta automática funciona para CNPJ (14 dígitos).");
    iniciarBusca(async () => {
      const r = await consultarCnpj(doc);
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Não encontrado" : r.erro);
      const d = r.data;
      setValores((s) => ({
        ...s,
        tipoPessoa: "JURIDICA",
        nome: d.razaoSocial || s.nome,
        nomeFantasia: d.nomeFantasia || s.nomeFantasia,
        email: d.email || s.email,
        telefone: d.telefone ? fmtTelefone(d.telefone) : s.telefone,
        cep: d.cep ? fmtCep(d.cep) : s.cep,
        logradouro: d.logradouro,
        numero: d.numero,
        complemento: d.complemento,
        bairro: d.bairro,
        cidade: d.cidade,
        uf: d.uf,
        codigoMunicipio: d.codigoMunicipio,
        inscricaoEstadual: d.inscricaoEstadual || s.inscricaoEstadual,
        indicadorIE:
          d.contribuinteIcms === true ? "CONTRIBUINTE" : d.contribuinteIcms === false ? "NAO_CONTRIBUINTE" : s.indicadorIE,
      }));
      toast.success(
        `Dados carregados (${d.fonte})${d.situacao ? ` · ${d.situacao}` : ""}${d.inscricaoEstadual ? ` · IE ${d.inscricaoEstadual}` : ""}`,
      );
    });
  }

  function buscarEndereco() {
    const cep = soDigitos(String(valores.cep ?? ""));
    if (cep.length !== 8) return;
    iniciarBusca(async () => {
      const r = await consultarCep(cep);
      if (!r.ok || !r.data) return void toast.error(r.ok ? "CEP não encontrado" : r.erro);
      const d = r.data;
      setValores((s) => ({ ...s, logradouro: d.logradouro || s.logradouro, bairro: d.bairro || s.bairro, cidade: d.cidade, uf: d.uf, codigoMunicipio: d.codigoMunicipio }));
    });
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    iniciarSalvar(async () => {
      const r = await salvarCadastro(entidade, id, valores);
      if (r.ok) {
        toast.success(r.mensagem);
        setErros({});
        onAbertoChange(false);
        router.refresh();
      } else {
        setErros(r.campos ?? {});
        toast.error(r.erro);
      }
    });
  }

  const secoes = Array.from(new Set(meta.campos.filter((c) => c.tipo !== "oculto").map((c) => c.secao ?? "")));

  const renderCampo = (c: Campo) => {
    const v = valores[c.nome];
    const erro = erros[c.nome];
    const comum = { id: c.nome, "aria-invalid": !!erro, placeholder: c.placeholder };
    let controle: React.ReactNode;
    switch (c.tipo) {
      case "booleano":
        return (
          <div key={c.nome} className={cn(LARGURA[c.largura ?? 3], "flex items-center gap-2 pt-6")}>
            <Checkbox id={c.nome} checked={!!v} onCheckedChange={(x) => set(c.nome, x === true)} />
            <Label htmlFor={c.nome} className="font-normal">
              {c.rotulo}
            </Label>
            {erro && <p className="text-xs text-destructive">{erro}</p>}
          </div>
        );
      case "selecao": {
        const ops = c.opcoes ?? opcoesDinamicas[c.opcoesDinamicas ?? ""] ?? [];
        controle = (
          <select
            {...comum}
            value={String(v ?? "")}
            onChange={(e) => set(c.nome, e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs aria-invalid:border-destructive"
          >
            {!c.obrigatorio && <option value="">—</option>}
            {c.obrigatorio && !v && <option value="">Selecione…</option>}
            {ops.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        );
        break;
      }
      case "area":
        controle = <Textarea {...comum} value={String(v ?? "")} onChange={(e) => set(c.nome, e.target.value)} rows={3} />;
        break;
      case "moeda":
        controle = <CampoMoeda {...comum} valor={typeof v === "number" ? v : parseMoeda(String(v ?? ""))} onChange={(n) => set(c.nome, n)} />;
        break;
      case "documento":
        controle = (
          <div className="flex gap-2">
            <Input
              {...comum}
              value={String(v ?? "")}
              onChange={(e) => set(c.nome, e.target.value)}
              onBlur={() => set(c.nome, fmtDocumento(soDigitos(String(v ?? ""))))}
            />
            <Button type="button" variant="secondary" onClick={buscarDocumento} disabled={buscando} title="Buscar na Receita">
              {buscando ? <LoaderCircle className="animate-spin" /> : <Search />}
            </Button>
          </div>
        );
        break;
      case "cep":
        controle = (
          <Input
            {...comum}
            value={String(v ?? "")}
            onChange={(e) => set(c.nome, e.target.value)}
            onBlur={() => {
              set(c.nome, fmtCep(String(v ?? "")));
              buscarEndereco();
            }}
          />
        );
        break;
      case "telefone":
        controle = (
          <Input {...comum} value={String(v ?? "")} onChange={(e) => set(c.nome, e.target.value)} onBlur={() => set(c.nome, fmtTelefone(String(v ?? "")))} />
        );
        break;
      default:
        controle = (
          <Input
            {...comum}
            type={c.tipo === "email" ? "email" : c.tipo === "data" ? "date" : c.tipo === "numero" ? "text" : "text"}
            inputMode={c.tipo === "numero" ? "decimal" : undefined}
            value={String(v ?? "")}
            onChange={(e) => set(c.nome, e.target.value)}
          />
        );
    }
    return (
      <div key={c.nome} className={cn(LARGURA[c.largura ?? 3], "space-y-1.5")}>
        <Label htmlFor={c.nome}>
          {c.rotulo}
          {c.obrigatorio && <span className="text-destructive">*</span>}
        </Label>
        {controle}
        {erro ? <p className="text-xs text-destructive">{erro}</p> : c.ajuda ? <p className="text-xs text-muted-foreground">{c.ajuda}</p> : null}
      </div>
    );
  };

  return (
    <Sheet open={aberto} onOpenChange={onAbertoChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <form onSubmit={salvar} className="flex min-h-full flex-col">
          <SheetHeader>
            <SheetTitle>{id ? `Editar ${meta.singular}` : rotuloNovo(meta)}</SheetTitle>
            <SheetDescription>{meta.descricao}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-6 px-4">
            {secoes.map((secao) => (
              <fieldset key={secao || "geral"} className="space-y-3">
                {secao && <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{secao}</legend>}
                <div className="grid grid-cols-6 gap-3">{meta.campos.filter((c) => (c.secao ?? "") === secao && c.tipo !== "oculto").map(renderCampo)}</div>
              </fieldset>
            ))}
          </div>
          <SheetFooter className="sticky bottom-0 flex-row justify-end gap-2 border-t bg-background">
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <LoaderCircle className="animate-spin" />} Salvar
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
