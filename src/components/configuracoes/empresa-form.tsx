"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { consultarCep, consultarCnpj } from "@/modules/auth/acoes";
import { salvarEmpresa } from "@/modules/configuracoes/acoes";
import { fmtCnae } from "@/modules/configuracoes/formatos";
import type { TipoEmpresa, ValoresEmpresa } from "@/modules/configuracoes/tipos";
import { UFS, fmtCep, fmtDocumento, fmtTelefone, soDigitos, validarCNPJ } from "@/lib/format";
import { ROTULOS, opcoes } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

const REGIMES = opcoes(ROTULOS.regimeTributario);

const CLASSE_SELECT = cn(
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow]",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50",
  "dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground",
);

const TEXTOS: Record<string, { titulo: string; descricao: string }> = {
  "matriz:editar": { titulo: "Editar matriz", descricao: "Dados cadastrais da empresa principal." },
  "matriz:novo": { titulo: "Cadastrar matriz", descricao: "Dados cadastrais da empresa principal." },
  "filial:editar": { titulo: "Editar filial", descricao: "Dados cadastrais da filial." },
  "filial:novo": { titulo: "Nova filial", descricao: "A filial fica vinculada à matriz." },
};

function Campo({
  id,
  rotulo,
  obrigatorio,
  erro,
  ajuda,
  className,
  children,
}: {
  id: string;
  rotulo: string;
  obrigatorio?: boolean;
  erro?: string;
  ajuda?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("col-span-6 space-y-1.5", className)}>
      <Label htmlFor={id}>
        {rotulo}
        {obrigatorio && (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        )}
      </Label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className="text-xs text-destructive">
          {erro}
        </p>
      ) : ajuda ? (
        <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</legend>
      <div className="grid grid-cols-6 gap-3">{children}</div>
    </fieldset>
  );
}

/** Formulário (Sheet) de matriz ou filial. Busca dados pelo CNPJ (Receita) e pelo CEP (ViaCEP). */
export function FormularioEmpresa({
  tipo,
  id,
  iniciais,
  aberto,
  onAbertoChange,
  retornarFoco,
}: {
  tipo: TipoEmpresa;
  /** null = cadastro novo */
  id: string | null;
  iniciais: ValoresEmpresa;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  /** para onde levar o foco do teclado ao fechar (o botão que abriu o formulário) */
  retornarFoco?: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const ultimoCep = useRef(soDigitos(iniciais.cep));
  const [valores, setValores] = useState<ValoresEmpresa>(iniciais);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falhas, setFalhas] = useState(0);
  const [salvando, iniciarSalvar] = useTransition();
  const [buscandoCnpj, iniciarBuscaCnpj] = useTransition();
  const [buscandoCep, iniciarBuscaCep] = useTransition();
  const texto = TEXTOS[`${tipo}:${id ? "editar" : "novo"}`];

  // Depois de uma tentativa de salvar com erro, leva o foco ao primeiro campo inválido.
  useEffect(() => {
    if (falhas === 0) return;
    formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [falhas]);

  const set = (nome: keyof ValoresEmpresa, v: string) => {
    setValores((s) => ({ ...s, [nome]: v }));
    setErros((e) => {
      if (!e[nome]) return e;
      const { [nome]: _removido, ...resto } = e;
      return resto;
    });
  };

  /** Propriedades comuns de todo controle: id, valor, mudança, acessibilidade. */
  const controle = (nome: keyof ValoresEmpresa, comAjuda = false) => ({
    id: `${uid}-${nome}`,
    name: nome,
    value: valores[nome],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(nome, e.target.value),
    autoComplete: "off",
    "aria-invalid": erros[nome] ? (true as const) : undefined,
    "aria-describedby": erros[nome] ? `${uid}-${nome}-erro` : comAjuda ? `${uid}-${nome}-ajuda` : undefined,
  });

  function buscarCnpj() {
    const cnpj = soDigitos(valores.cnpj);
    if (cnpj.length !== 14) return void toast.info("Informe os 14 dígitos do CNPJ para consultar.");
    if (!validarCNPJ(cnpj)) return void toast.error("CNPJ inválido.");
    iniciarBuscaCnpj(async () => {
      const r = await consultarCnpj(cnpj);
      if (!r.ok || !r.data) return void toast.error(r.ok ? "CNPJ não encontrado." : r.erro);
      const d = r.data;
      ultimoCep.current = soDigitos(d.cep);
      // Só aplica se o CNPJ do formulário ainda for o consultado (o usuário pode ter mudado enquanto esperava).
      setValores((s) =>
        soDigitos(s.cnpj) !== cnpj
          ? s
          : {
              ...s,
              razaoSocial: d.razaoSocial || s.razaoSocial,
              nomeFantasia: d.nomeFantasia || s.nomeFantasia,
              regimeTributario: d.regimeSugerido ?? s.regimeTributario,
              cnae: d.cnae ? fmtCnae(d.cnae) : s.cnae,
              email: d.email || s.email,
              telefone: d.telefone ? fmtTelefone(d.telefone) : s.telefone,
              cep: d.cep ? fmtCep(d.cep) : s.cep,
              logradouro: d.logradouro || s.logradouro,
              numero: d.numero || s.numero,
              complemento: d.complemento || s.complemento,
              bairro: d.bairro || s.bairro,
              cidade: d.cidade || s.cidade,
              uf: d.uf || s.uf,
              codigoMunicipio: d.codigoMunicipio || s.codigoMunicipio,
              inscricaoEstadual: d.inscricaoEstadual || s.inscricaoEstadual,
            },
      );
      setErros({});
      toast.success(
        `Dados carregados (${d.fonte})${d.situacao ? ` · ${d.situacao}` : ""}${d.inscricaoEstadual ? ` · IE ${d.inscricaoEstadual}` : ""}`,
      );
    });
  }

  function buscarEndereco() {
    const cep = soDigitos(valores.cep);
    if (cep.length !== 8 || cep === ultimoCep.current) return;
    ultimoCep.current = cep;
    iniciarBuscaCep(async () => {
      const r = await consultarCep(cep);
      if (!r.ok || !r.data) {
        ultimoCep.current = ""; // permite tentar de novo
        return void toast.error(r.ok ? "CEP não encontrado." : r.erro);
      }
      const d = r.data;
      setValores((s) =>
        soDigitos(s.cep) !== cep
          ? s
          : {
              ...s,
              logradouro: d.logradouro || s.logradouro,
              bairro: d.bairro || s.bairro,
              cidade: d.cidade || s.cidade,
              uf: d.uf || s.uf,
              codigoMunicipio: d.codigoMunicipio || s.codigoMunicipio,
            },
      );
    });
  }

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    iniciarSalvar(async () => {
      const r = await salvarEmpresa(id, tipo, valores);
      if (r.ok) {
        toast.success(r.mensagem ?? "Dados salvos.");
        onAbertoChange(false);
        router.refresh();
      } else {
        setErros(r.campos ?? {});
        setFalhas((n) => n + 1);
        toast.error(r.erro);
      }
    });
  }

  return (
    <Sheet open={aberto} onOpenChange={(v) => !salvando && onAbertoChange(v)}>
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-2xl"
        onCloseAutoFocus={(e) => {
          if (!retornarFoco) return;
          e.preventDefault();
          retornarFoco();
        }}
      >
        <form ref={formRef} onSubmit={salvar} noValidate className="flex min-h-full flex-col">
          <SheetHeader>
            <SheetTitle>{texto.titulo}</SheetTitle>
            <SheetDescription>{texto.descricao}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 px-4 pb-4">
            <Secao titulo="Identificação">
              <Campo id={`${uid}-cnpj`} rotulo="CNPJ" obrigatorio erro={erros.cnpj} className="sm:col-span-3">
                <div className="flex gap-2">
                  <Input
                    {...controle("cnpj")}
                    required
                    inputMode="numeric"
                    placeholder="00.000.000/0000-00"
                    onBlur={() => set("cnpj", fmtDocumento(valores.cnpj))}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={buscarCnpj}
                    disabled={salvando || buscandoCnpj}
                    aria-label="Buscar dados do CNPJ na Receita Federal"
                    title="Buscar na Receita"
                  >
                    {buscandoCnpj ? <LoaderCircle className="animate-spin" /> : <Search />}
                  </Button>
                </div>
              </Campo>
              <Campo id={`${uid}-regimeTributario`} rotulo="Regime tributário" obrigatorio erro={erros.regimeTributario} className="sm:col-span-3">
                <select {...controle("regimeTributario")} required className={CLASSE_SELECT}>
                  {REGIMES.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo id={`${uid}-razaoSocial`} rotulo="Razão social" obrigatorio erro={erros.razaoSocial}>
                <Input {...controle("razaoSocial")} required />
              </Campo>
              <Campo id={`${uid}-nomeFantasia`} rotulo="Nome fantasia" erro={erros.nomeFantasia} className="sm:col-span-3">
                <Input {...controle("nomeFantasia")} />
              </Campo>
              <Campo
                id={`${uid}-cnae`}
                rotulo="CNAE principal"
                erro={erros.cnae}
                ajuda="7 dígitos, ex.: 6201-5/01"
                className="sm:col-span-3"
              >
                <Input
                  {...controle("cnae", true)}
                  inputMode="numeric"
                  placeholder="0000-0/00"
                  onBlur={() => set("cnae", fmtCnae(valores.cnae))}
                />
              </Campo>
              <Campo id={`${uid}-inscricaoEstadual`} rotulo="Inscrição estadual" erro={erros.inscricaoEstadual} className="sm:col-span-3">
                <Input {...controle("inscricaoEstadual")} />
              </Campo>
              <Campo id={`${uid}-inscricaoMunicipal`} rotulo="Inscrição municipal" erro={erros.inscricaoMunicipal} className="sm:col-span-3">
                <Input {...controle("inscricaoMunicipal")} />
              </Campo>
            </Secao>

            <Secao titulo="Endereço">
              <Campo id={`${uid}-cep`} rotulo="CEP" erro={erros.cep} className="sm:col-span-2">
                <div className="relative">
                  <Input
                    {...controle("cep")}
                    inputMode="numeric"
                    placeholder="00000-000"
                    aria-busy={buscandoCep}
                    onBlur={() => {
                      set("cep", fmtCep(valores.cep));
                      buscarEndereco();
                    }}
                  />
                  {buscandoCep && (
                    <LoaderCircle
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                    />
                  )}
                </div>
              </Campo>
              <Campo id={`${uid}-logradouro`} rotulo="Logradouro" erro={erros.logradouro} className="sm:col-span-4">
                <Input {...controle("logradouro")} />
              </Campo>
              <Campo id={`${uid}-numero`} rotulo="Número" erro={erros.numero} className="sm:col-span-2">
                <Input {...controle("numero")} />
              </Campo>
              <Campo id={`${uid}-complemento`} rotulo="Complemento" erro={erros.complemento} className="sm:col-span-4">
                <Input {...controle("complemento")} />
              </Campo>
              <Campo id={`${uid}-bairro`} rotulo="Bairro" erro={erros.bairro} className="sm:col-span-3">
                <Input {...controle("bairro")} />
              </Campo>
              <Campo id={`${uid}-cidade`} rotulo="Cidade" erro={erros.cidade} className="sm:col-span-3">
                <Input {...controle("cidade")} />
              </Campo>
              <Campo id={`${uid}-uf`} rotulo="UF" erro={erros.uf} className="sm:col-span-2">
                <select {...controle("uf")} className={CLASSE_SELECT}>
                  <option value="">—</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo
                id={`${uid}-codigoMunicipio`}
                rotulo="Código do município (IBGE)"
                erro={erros.codigoMunicipio}
                ajuda="7 dígitos; vem da busca por CEP ou CNPJ."
                className="sm:col-span-4"
              >
                <Input {...controle("codigoMunicipio", true)} inputMode="numeric" />
              </Campo>
            </Secao>

            <Secao titulo="Contato">
              <Campo id={`${uid}-email`} rotulo="E-mail" erro={erros.email} className="sm:col-span-3">
                <Input {...controle("email")} type="email" inputMode="email" autoCapitalize="none" spellCheck={false} />
              </Campo>
              <Campo id={`${uid}-telefone`} rotulo="Telefone" erro={erros.telefone} className="sm:col-span-3">
                <Input
                  {...controle("telefone")}
                  type="tel"
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                  onBlur={() => set("telefone", fmtTelefone(valores.telefone))}
                />
              </Campo>
            </Secao>
          </div>

          <SheetFooter className="sticky bottom-0 flex-row justify-end gap-2 border-t bg-background">
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
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
