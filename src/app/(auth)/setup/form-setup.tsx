"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { configurarInicial, consultarCep, consultarCnpj } from "@/modules/auth/acoes";
import { fmtDocumento, soDigitos } from "@/lib/format";

type Campos = Record<string, string>;

const REGIMES = [
  ["SIMPLES_NACIONAL", "Simples Nacional"],
  ["MEI", "MEI"],
  ["LUCRO_PRESUMIDO", "Lucro Presumido"],
  ["LUCRO_REAL", "Lucro Real"],
] as const;

export function FormSetup({ token }: { token: string }) {
  const [estado, acao, pendente] = useActionState(configurarInicial, null);
  const [buscando, iniciar] = useTransition();
  const [v, setV] = useState<Campos>({ regimeTributario: "SIMPLES_NACIONAL" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  const erro = (k: string) => (estado && !estado.ok ? estado.campos?.[k] : undefined);

  function buscarCnpj() {
    iniciar(async () => {
      const r = await consultarCnpj(v.cnpj ?? "", token);
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Não encontrado" : r.erro);
      const d = r.data;
      setV((s) => ({
        ...s,
        razaoSocial: d.razaoSocial || s.razaoSocial,
        nomeFantasia: d.nomeFantasia || s.nomeFantasia,
        inscricaoEstadual: d.inscricaoEstadual || s.inscricaoEstadual,
        cep: d.cep,
        logradouro: d.logradouro,
        numero: d.numero,
        complemento: d.complemento,
        bairro: d.bairro,
        cidade: d.cidade,
        uf: d.uf,
        codigoMunicipio: d.codigoMunicipio,
        cnae: d.cnae,
        emailEmpresa: d.email,
        telefone: d.telefone,
        regimeTributario: d.regimeSugerido ?? s.regimeTributario,
      }));
      toast.success(
        `Dados carregados (${d.fonte})${d.situacao ? ` · situação ${d.situacao}` : ""}${d.inscricaoEstadual ? ` · IE ${d.inscricaoEstadual}` : ""}`,
      );
    });
  }

  function buscarCep() {
    iniciar(async () => {
      const r = await consultarCep(v.cep ?? "", token);
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Não encontrado" : r.erro);
      const d = r.data;
      setV((s) => ({ ...s, logradouro: d.logradouro, bairro: d.bairro, cidade: d.cidade, uf: d.uf, codigoMunicipio: d.codigoMunicipio }));
    });
  }

  const campo = (k: string, rotulo: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{rotulo}</Label>
      <Input id={k} name={k} value={v[k] ?? ""} onChange={set(k)} aria-invalid={!!erro(k)} {...props} />
      {erro(k) && <p className="text-xs text-destructive">{erro(k)}</p>}
    </div>
  );

  return (
    <form action={acao} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      {/* campos preenchidos pela consulta, enviados ocultos */}
      {["complemento", "codigoMunicipio", "cnae", "emailEmpresa", "telefone"].map((k) => (
        <input key={k} type="hidden" name={k} value={v[k] ?? ""} />
      ))}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Empresa</h3>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            {campo("cnpj", "CNPJ", {
              placeholder: "00.000.000/0000-00",
              required: true,
              onBlur: () => setV((s) => ({ ...s, cnpj: fmtDocumento(soDigitos(s.cnpj)) })),
            })}
          </div>
          <Button type="button" variant="secondary" onClick={buscarCnpj} disabled={buscando}>
            {buscando ? <Loader2 className="animate-spin" /> : <Search />} Buscar
          </Button>
        </div>
        {campo("razaoSocial", "Razão social", { required: true })}
        <div className="grid grid-cols-2 gap-3">
          {campo("nomeFantasia", "Nome fantasia")}
          <div className="space-y-1.5">
            <Label htmlFor="regimeTributario">Regime tributário</Label>
            <select
              id="regimeTributario"
              name="regimeTributario"
              value={v.regimeTributario}
              onChange={set("regimeTributario")}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            >
              {REGIMES.map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {campo("inscricaoEstadual", "Inscrição estadual")}
          {campo("inscricaoMunicipal", "Inscrição municipal")}
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          {campo("cep", "CEP", { onBlur: () => v.cep && soDigitos(v.cep).length === 8 && buscarCep() })}
          <div className="grid grid-cols-2 gap-2">
            {campo("numero", "Número")}
            {campo("uf", "UF", { maxLength: 2 })}
          </div>
        </div>
        {campo("logradouro", "Endereço")}
        <div className="grid grid-cols-2 gap-3">
          {campo("bairro", "Bairro")}
          {campo("cidade", "Cidade")}
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Administrador</h3>
        {campo("nome", "Seu nome", { required: true, autoComplete: "name" })}
        {campo("email", "E-mail de acesso", { type: "email", required: true, autoComplete: "username" })}
        <div className="grid grid-cols-2 gap-3">
          {campo("senha", "Senha", { type: "password", required: true, autoComplete: "new-password" })}
          {campo("confirmar", "Confirmar senha", { type: "password", required: true, autoComplete: "new-password" })}
        </div>
        <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres, com letras e números.</p>
      </div>

      {estado && !estado.ok && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {estado.erro}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pendente}>
        {pendente && <Loader2 className="animate-spin" />} Criar empresa e entrar
      </Button>
    </form>
  );
}
