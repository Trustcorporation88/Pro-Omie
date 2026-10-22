"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ROTULO_PAPEL, type PapelUsuario } from "@/lib/auth/permissoes";
import { fmtDocumento } from "@/lib/format";
import { criarUsuario, editarUsuario } from "@/modules/configuracoes/acoes";
import { DESCRICAO_PAPEL, PAPEIS, type EmpresaOpcao, type SegredoExibido } from "@/modules/configuracoes/tipos";

/** Formulário (Dialog) para criar ou editar usuário. Na criação, a senha provisória volta por `aoCriar`. */
export function FormularioUsuario({
  id,
  iniciais,
  empresasDisponiveis,
  podeLiberarTodas,
  papelTravado,
  aberto,
  onAbertoChange,
  aoCriar,
  retornarFoco,
}: {
  /** null = novo usuário */
  id: string | null;
  iniciais: { nome: string; email: string; papel: PapelUsuario; todasEmpresas: boolean; empresas: string[] };
  /** empresas (matrizes) do grupo que podem ser liberadas (para administrador de empresa, só as dele) */
  empresasDisponiveis: EmpresaOpcao[];
  /** só o administrador do grupo libera "todas as empresas" */
  podeLiberarTodas: boolean;
  /** motivo pelo qual o papel não pode ser alterado (desabilita a escolha) */
  papelTravado?: string;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  aoCriar?: (segredo: SegredoExibido) => void;
  /** para onde levar o foco do teclado ao fechar (o botão que abriu o formulário) */
  retornarFoco?: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [nome, setNome] = useState(iniciais.nome);
  const [email, setEmail] = useState(iniciais.email);
  const [papel, setPapel] = useState<string>(iniciais.papel);
  const [todasEmpresas, setTodasEmpresas] = useState(iniciais.todasEmpresas);
  const [empresas, setEmpresas] = useState<string[]>(iniciais.empresas);
  const [erros, setErros] = useState<Record<string, string>>({});
  // A escolha aparece sempre, para todo papel (inclusive administrador): "todas" inclui as empresas cadastradas
  // depois e, para administrador, significa administrador do grupo. Só o administrador do grupo libera "todas".
  const escolheEmpresas = empresasDisponiveis.length > 0;
  const todasMarcada = podeLiberarTodas && todasEmpresas;
  const acesso = {
    todasEmpresas: escolheEmpresas ? todasMarcada : podeLiberarTodas,
    empresas: escolheEmpresas && !todasMarcada ? empresas : [],
  };
  const [falhas, setFalhas] = useState(0);
  const [salvando, iniciar] = useTransition();
  const edicao = id !== null;

  // Depois de uma tentativa com erro, leva o foco ao primeiro campo inválido.
  useEffect(() => {
    if (falhas === 0) return;
    formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [falhas]);

  const limparErro = (campo: string) =>
    setErros((e) => {
      if (!e[campo]) return e;
      const { [campo]: _removido, ...resto } = e;
      return resto;
    });

  function falhar(campos: Record<string, string> | undefined, mensagem: string) {
    setErros(campos ?? {});
    setFalhas((n) => n + 1);
    toast.error(mensagem);
  }

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    iniciar(async () => {
      if (id !== null) {
        const r = await editarUsuario(id, { nome, papel, ...acesso });
        if (!r.ok) return falhar(r.campos, r.erro);
        toast.success(r.mensagem ?? "Alterações salvas.");
        onAbertoChange(false);
        router.refresh();
        return;
      }
      const r = await criarUsuario({ nome, email, papel, ...acesso });
      if (!r.ok) return falhar(r.campos, r.erro);
      toast.success(r.mensagem ?? "Usuário criado.");
      onAbertoChange(false);
      router.refresh();
      if (r.data) aoCriar?.({ tipo: "criado", nome: r.data.nome, email: r.data.email, senha: r.data.senhaProvisoria });
      else toast.error("Usuário criado, mas a senha provisória não pôde ser exibida. Use “Redefinir senha”.");
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !salvando && onAbertoChange(v)}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-lg"
        onCloseAutoFocus={(e) => {
          if (!retornarFoco) return;
          e.preventDefault();
          retornarFoco();
        }}
      >
        <form ref={formRef} onSubmit={salvar} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{edicao ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              {edicao
                ? "Altere o nome e o papel de acesso. O e-mail não pode ser alterado."
                : "O sistema gera uma senha provisória, exibida uma única vez após a criação."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-nome`}>
              Nome
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </Label>
            <Input
              id={`${uid}-nome`}
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                limparErro("nome");
              }}
              required
              autoComplete="off"
              aria-invalid={erros.nome ? true : undefined}
              aria-describedby={erros.nome ? `${uid}-nome-erro` : undefined}
            />
            {erros.nome && (
              <p id={`${uid}-nome-erro`} className="text-xs text-destructive">
                {erros.nome}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-email`}>
              E-mail
              {!edicao && (
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              )}
            </Label>
            <Input
              id={`${uid}-email`}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                limparErro("email");
              }}
              required={!edicao}
              readOnly={edicao}
              className={edicao ? "bg-muted/50" : undefined}
              aria-invalid={erros.email ? true : undefined}
              aria-describedby={erros.email ? `${uid}-email-erro` : undefined}
            />
            {erros.email ? (
              <p id={`${uid}-email-erro`} className="text-xs text-destructive">
                {erros.email}
              </p>
            ) : (
              !edicao && <p className="text-xs text-muted-foreground">Usado para entrar no sistema (gravado em minúsculas).</p>
            )}
          </div>

          <div className="space-y-2">
            <span id={`${uid}-papel-rotulo`} className="flex items-center gap-1 text-sm leading-none font-medium">
              Papel
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </span>
            <RadioGroup
              value={papel}
              onValueChange={(v) => {
                setPapel(v);
                limparErro("papel");
              }}
              disabled={!!papelTravado}
              required
              aria-labelledby={`${uid}-papel-rotulo`}
              aria-invalid={erros.papel ? true : undefined}
              aria-describedby={erros.papel ? `${uid}-papel-erro` : papelTravado ? `${uid}-papel-aviso` : undefined}
              className="gap-2"
            >
              {PAPEIS.map((p) => (
                <Label
                  key={p}
                  htmlFor={`${uid}-papel-${p}`}
                  className="cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-accent/40 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5 has-disabled:cursor-not-allowed has-disabled:opacity-60"
                >
                  <RadioGroupItem id={`${uid}-papel-${p}`} value={p} className="mt-0.5" />
                  <span className="space-y-1">
                    <span className="block text-sm leading-none font-medium">{ROTULO_PAPEL[p]}</span>
                    <span className="block text-xs leading-snug text-muted-foreground">{DESCRICAO_PAPEL[p]}</span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
            {erros.papel ? (
              <p id={`${uid}-papel-erro`} className="text-xs text-destructive">
                {erros.papel}
              </p>
            ) : (
              papelTravado && (
                <p id={`${uid}-papel-aviso`} className="text-xs text-muted-foreground">
                  {papelTravado}
                </p>
              )
            )}
          </div>

          {escolheEmpresas && (
            <fieldset className="space-y-2">
              <legend className="flex items-center gap-1 text-sm leading-none font-medium">Empresas</legend>
              {papel === "ADMIN" && (
                <p className="text-xs text-muted-foreground">
                  {todasMarcada
                    ? "Administrador do grupo: administra todas as empresas, cadastra novas e libera qualquer acesso."
                    : "Administrador da empresa: administra só as empresas marcadas (dados, filiais, usuários e auditoria delas)."}
                </p>
              )}
              {podeLiberarTodas && (
                <Label
                  htmlFor={`${uid}-todas`}
                  className="cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-accent/40 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"
                >
                  <Checkbox
                    id={`${uid}-todas`}
                    checked={todasEmpresas}
                    onCheckedChange={(v) => {
                      setTodasEmpresas(v === true);
                      limparErro("empresas");
                    }}
                    className="mt-0.5"
                  />
                  <span className="space-y-1">
                    <span className="block text-sm leading-none font-medium">Todas as empresas do grupo</span>
                    <span className="block text-xs leading-snug text-muted-foreground">Inclui as que forem cadastradas depois.</span>
                  </span>
                </Label>
              )}
              {!todasMarcada && (
                <div className="grid gap-2 pl-1" role="group" aria-label="Empresas liberadas" aria-describedby={erros.empresas ? `${uid}-empresas-erro` : undefined}>
                  {empresasDisponiveis.map((e) => {
                    const marcada = empresas.includes(e.id);
                    return (
                      <Label key={e.id} htmlFor={`${uid}-emp-${e.id}`} className="cursor-pointer items-center gap-3 font-normal">
                        <Checkbox
                          id={`${uid}-emp-${e.id}`}
                          checked={marcada}
                          onCheckedChange={(v) => {
                            setEmpresas((atual) => (v === true ? [...new Set([...atual, e.id])] : atual.filter((x) => x !== e.id)));
                            limparErro("empresas");
                          }}
                        />
                        <span className="text-sm">
                          {e.nome} <span className="text-xs text-muted-foreground">· {fmtDocumento(e.cnpj)}</span>
                        </span>
                      </Label>
                    );
                  })}
                </div>
              )}
              {erros.empresas && (
                <p id={`${uid}-empresas-erro`} className="text-xs text-destructive">
                  {erros.empresas}
                </p>
              )}
            </fieldset>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <LoaderCircle className="animate-spin" />} {edicao ? "Salvar" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
