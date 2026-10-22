"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CampoMoeda } from "@/components/campo-moeda";
import { Campo, CampoSelect } from "@/components/financeiro/campos";
import { SeletorPessoa } from "@/components/seletor-pessoa";
import { fmtTelefone } from "@/lib/format";
import { consultarCnpj } from "@/modules/auth/acoes";
import { salvarCadastro } from "@/modules/cadastros/acoes";
import { salvarOportunidade } from "@/modules/crm/acoes";
import { AJUDA_ETAPA, ETAPAS_ABERTAS, ORIGENS, ROTULO_ETAPA, opcoesDe, type OpcoesCrm, type ValoresOportunidade } from "@/modules/crm/tipos";

const soDigitos = (s: string) => s.replace(/\D/g, "");

type ClienteRapido = { nome: string; documento: string; telefone: string; email: string; extras: Record<string, unknown> };
const clienteVazio = (): ClienteRapido => ({ nome: "", documento: "", telefone: "", email: "", extras: {} });

type PropsDialogo = {
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
  id: string | null;
  iniciais: ValoresOportunidade;
  opcoes: OpcoesCrm;
  podeCadastrar: boolean;
  aoSalvar?: (id: string) => void;
  /** edição: excluir (só quando permitido) */
  onExcluir?: () => void;
};

/** Criar ou editar oportunidade. Na criação, permite cadastrar o cliente na hora (com busca do CNPJ na Receita). */
export function DialogoOportunidade(props: PropsDialogo) {
  return (
    <Dialog open={props.aberto} onOpenChange={props.onAbertoChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <CorpoOportunidade {...props} />
      </DialogContent>
    </Dialog>
  );
}

function CorpoOportunidade({
  onExcluir,
  onAbertoChange,
  id,
  iniciais,
  opcoes,
  podeCadastrar,
  aoSalvar,
}: PropsDialogo) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [v, setV] = useState(iniciais);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [falhas, setFalhas] = useState(0);
  const [salvando, iniciar] = useTransition();
  const [novoCliente, setNovoCliente] = useState<ClienteRapido | null>(null);
  const [errosCliente, setErrosCliente] = useState<Record<string, string>>({});
  const [cadastrando, iniciarCadastro] = useTransition();
  const [buscando, iniciarBusca] = useTransition();

  useEffect(() => {
    if (falhas) formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [falhas]);

  const set = <K extends keyof ValoresOportunidade>(k: K, valor: ValoresOportunidade[K]) => {
    setV((a) => ({ ...a, [k]: valor }));
    setErros((e) => (e[k] ? Object.fromEntries(Object.entries(e).filter(([c]) => c !== k)) : e));
  };
  const setCliente = (k: keyof Omit<ClienteRapido, "extras">, valor: string) => {
    setNovoCliente((c) => (c ? { ...c, [k]: valor } : c));
    setErrosCliente((e) => (e[k] ? Object.fromEntries(Object.entries(e).filter(([c]) => c !== k)) : e));
  };

  function buscarCnpj() {
    const doc = soDigitos(novoCliente?.documento ?? "");
    if (doc.length !== 14) return void toast.info("A busca automática funciona com CNPJ (14 dígitos).");
    iniciarBusca(async () => {
      const r = await consultarCnpj(doc);
      if (!r.ok || !r.data) return void toast.error(r.ok ? "CNPJ não encontrado." : r.erro);
      const d = r.data;
      setNovoCliente((c) =>
        c
          ? {
              ...c,
              nome: d.razaoSocial || c.nome,
              telefone: d.telefone ? fmtTelefone(d.telefone) : c.telefone,
              email: d.email || c.email,
              extras: {
                nomeFantasia: d.nomeFantasia || null,
                cep: d.cep || null,
                logradouro: d.logradouro || null,
                numero: d.numero || null,
                complemento: d.complemento || null,
                bairro: d.bairro || null,
                cidade: d.cidade || null,
                uf: d.uf || null,
                codigoMunicipio: d.codigoMunicipio || null,
                inscricaoEstadual: d.inscricaoEstadual || null,
                indicadorIE: d.contribuinteIcms === true ? "CONTRIBUINTE" : "NAO_CONTRIBUINTE",
              },
            }
          : c,
      );
      toast.success("Dados da Receita preenchidos.");
    });
  }

  function cadastrarCliente() {
    if (!novoCliente) return;
    const doc = soDigitos(novoCliente.documento);
    iniciarCadastro(async () => {
      const r = await salvarCadastro("pessoas", null, {
        tipoPessoa: doc.length === 11 ? "FISICA" : "JURIDICA",
        documento: doc,
        nome: novoCliente.nome,
        cliente: true,
        fornecedor: false,
        indicadorIE: "NAO_CONTRIBUINTE",
        email: novoCliente.email,
        telefone: novoCliente.telefone,
        ...novoCliente.extras,
      });
      if (!r.ok || !r.data) {
        setErrosCliente(r.ok ? {} : (r.campos ?? {}));
        return void toast.error(r.ok ? "Não foi possível cadastrar." : r.erro);
      }
      const nomeCliente = (novoCliente.extras.nomeFantasia as string | null) || novoCliente.nome;
      setV((a) => ({ ...a, pessoaId: r.data!.id, pessoaNome: nomeCliente, titulo: a.titulo || nomeCliente }));
      setErros((e) => Object.fromEntries(Object.entries(e).filter(([c]) => c !== "pessoaId")));
      setNovoCliente(null);
      toast.success("Cliente cadastrado.");
    });
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    iniciar(async () => {
      const r = await salvarOportunidade(id, {
        titulo: v.titulo,
        pessoaId: v.pessoaId ?? "",
        contato: v.contato,
        responsavelId: v.responsavelId || null,
        ...(id ? {} : { etapa: v.etapa }),
        valor: v.valor,
        previsaoFechamento: v.previsaoFechamento || null,
        origem: v.origem || null,
        observacoes: v.observacoes,
      });
      if (!r.ok) {
        setErros(r.campos ?? {});
        setFalhas((n) => n + 1);
        return void toast.error(r.erro);
      }
      toast.success(r.mensagem ?? "Salvo.");
      onAbertoChange(false);
      router.refresh();
      if (r.data?.id) aoSalvar?.(r.data.id);
    });
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>{id ? "Editar oportunidade" : "Nova oportunidade"}</DialogTitle>
          <DialogDescription>Um negócio em andamento com um cliente. O valor estimado entra na previsão do funil.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={salvar} noValidate className="grid grid-cols-6 gap-4">
          <Campo className="col-span-6" id="op-cliente" rotulo="Cliente" obrigatorio erro={erros.pessoaId}>
            <SeletorPessoa
              key={v.pessoaId ?? "vazio"}
              id="op-cliente"
              valor={v.pessoaId}
              rotuloInicial={v.pessoaNome}
              papel="cliente"
              placeholder="Busque o cliente…"
              invalido={!!erros.pessoaId}
              onChange={(pid, p) => {
                set("pessoaId", pid);
                set("pessoaNome", p?.nome ?? null);
                if (p && !v.titulo.trim()) set("titulo", p.nome);
              }}
            />
          </Campo>
          {podeCadastrar && !novoCliente && (
            <div className="col-span-6 -mt-2">
              <Button type="button" variant="link" className="h-auto px-0 text-sm" onClick={() => setNovoCliente(clienteVazio())}>
                <UserPlus /> Cliente novo? Cadastre aqui
              </Button>
            </div>
          )}
          {novoCliente && (
            <div
              className="col-span-6 grid grid-cols-6 gap-3 rounded-lg border bg-muted/30 p-3"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
                  e.preventDefault();
                  cadastrarCliente();
                }
              }}
            >
              <p className="col-span-6 text-sm font-medium">Cadastro rápido de cliente</p>
              <Campo className="col-span-6 sm:col-span-3" id="cr-doc" rotulo="CNPJ ou CPF" erro={errosCliente.documento}>
                <div className="flex gap-2">
                  <Input
                    id="cr-doc"
                    inputMode="numeric"
                    value={novoCliente.documento}
                    onChange={(e) => setCliente("documento", e.target.value)}
                    aria-invalid={!!errosCliente.documento}
                    placeholder="Opcional"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={buscarCnpj} disabled={buscando} aria-label="Buscar CNPJ na Receita">
                    {buscando ? <LoaderCircle className="animate-spin" /> : <Search />}
                  </Button>
                </div>
              </Campo>
              <Campo className="col-span-6 sm:col-span-3" id="cr-nome" rotulo="Nome ou razão social" obrigatorio erro={errosCliente.nome}>
                <Input id="cr-nome" value={novoCliente.nome} onChange={(e) => setCliente("nome", e.target.value)} aria-invalid={!!errosCliente.nome} />
              </Campo>
              <Campo className="col-span-6 sm:col-span-3" id="cr-tel" rotulo="Telefone" erro={errosCliente.telefone}>
                <Input id="cr-tel" inputMode="tel" value={novoCliente.telefone} onChange={(e) => setCliente("telefone", e.target.value)} />
              </Campo>
              <Campo className="col-span-6 sm:col-span-3" id="cr-email" rotulo="E-mail" erro={errosCliente.email}>
                <Input id="cr-email" type="email" value={novoCliente.email} onChange={(e) => setCliente("email", e.target.value)} aria-invalid={!!errosCliente.email} />
              </Campo>
              <div className="col-span-6 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setNovoCliente(null)}>
                  Cancelar
                </Button>
                <Button type="button" variant="secondary" onClick={cadastrarCliente} disabled={cadastrando}>
                  {cadastrando && <LoaderCircle className="animate-spin" />} Cadastrar cliente
                </Button>
              </div>
            </div>
          )}
          <Campo className="col-span-6" id="op-titulo" rotulo="Título" obrigatorio erro={erros.titulo}>
            <Input
              id="op-titulo"
              value={v.titulo}
              maxLength={160}
              onChange={(e) => set("titulo", e.target.value)}
              aria-invalid={!!erros.titulo}
              placeholder="Ex.: Coleta mensal de resíduos · Fábrica X"
            />
          </Campo>
          <Campo className="col-span-6 sm:col-span-3" id="op-valor" rotulo="Valor estimado" erro={erros.valor}>
            <CampoMoeda id="op-valor" valor={v.valor} onChange={(x) => set("valor", x)} aria-invalid={!!erros.valor} />
          </Campo>
          <Campo className="col-span-6 sm:col-span-3" id="op-previsao" rotulo="Previsão de fechamento" erro={erros.previsaoFechamento}>
            <Input id="op-previsao" type="date" value={v.previsaoFechamento} onChange={(e) => set("previsaoFechamento", e.target.value)} />
          </Campo>
          {!id && (
            <Campo className="col-span-6 sm:col-span-3" id="op-etapa" rotulo="Etapa" ajuda={AJUDA_ETAPA[v.etapa]}>
              <CampoSelect
                id="op-etapa"
                opcoes={ETAPAS_ABERTAS.map((e) => ({ valor: e, rotulo: ROTULO_ETAPA[e] }))}
                valor={v.etapa}
                onChange={(x) => set("etapa", x as ValoresOportunidade["etapa"])}
              />
            </Campo>
          )}
          <Campo className="col-span-6 sm:col-span-3" id="op-resp" rotulo="Responsável" erro={erros.responsavelId}>
            <CampoSelect id="op-resp" opcoes={opcoes.responsaveis} valor={v.responsavelId} onChange={(x) => set("responsavelId", x)} />
          </Campo>
          <Campo className="col-span-6 sm:col-span-3" id="op-origem" rotulo="Origem do contato" erro={erros.origem}>
            <CampoSelect id="op-origem" opcoes={opcoesDe(ORIGENS)} valor={v.origem} onChange={(x) => set("origem", x)} vazio="—" />
          </Campo>
          <Campo className="col-span-6 sm:col-span-3" id="op-contato" rotulo="Contato no cliente" erro={erros.contato}>
            <Input id="op-contato" value={v.contato} maxLength={200} onChange={(e) => set("contato", e.target.value)} placeholder="Nome, cargo e telefone" />
          </Campo>
          <Campo className="col-span-6" id="op-obs" rotulo="Observações" erro={erros.observacoes}>
            <Textarea id="op-obs" rows={3} maxLength={4000} value={v.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
          </Campo>
          <DialogFooter className="col-span-6">
            {id && onExcluir && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive sm:mr-auto"
                onClick={() => {
                  onAbertoChange(false);
                  onExcluir();
                }}
              >
                <Trash2 /> Excluir
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || cadastrando}>
              {salvando && <LoaderCircle className="animate-spin" />} {id ? "Salvar" : "Criar oportunidade"}
            </Button>
          </DialogFooter>
        </form>
    </>
  );
}

/** Valores de uma oportunidade nova. */
export function oportunidadeVazia(responsavelId: string, etapa: ValoresOportunidade["etapa"] = "DESCOBERTA"): ValoresOportunidade {
  return { titulo: "", pessoaId: null, pessoaNome: null, contato: "", responsavelId, etapa, valor: 0, previsaoFechamento: "", origem: "", observacoes: "" };
}

/** Botão "Nova oportunidade" com o diálogo. */
export function BotaoNovaOportunidade({ usuarioId, opcoes, podeCadastrar }: { usuarioId: string; opcoes: OpcoesCrm; podeCadastrar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button onClick={() => setAberto(true)}>
        <Plus /> Nova oportunidade
      </Button>
      <DialogoOportunidade
        aberto={aberto}
        onAbertoChange={setAberto}
        id={null}
        iniciais={oportunidadeVazia(usuarioId)}
        opcoes={opcoes}
        podeCadastrar={podeCadastrar}
        aoSalvar={(id) => router.push(`/crm/oportunidades/${id}`)}
      />
    </>
  );
}
