"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, ChevronDown, Download, Eye, HelpCircle, LoaderCircle, Plus, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { CampoMoeda } from "@/components/campo-moeda";
import { Campo, CampoSelect } from "@/components/financeiro/campos";
import { addDias } from "@/lib/datas";
import { arred2, fmtMoeda } from "@/lib/format";
import type { Opcao } from "@/lib/rotulos";
import { lancarNotaNoContasAPagar, manifestarNota } from "@/modules/fiscal/acoes";
import { AJUDA_MANIFESTACAO, MANIFESTACAO_FINAL, type TipoManifestacao } from "@/modules/fiscal/tipos";

type Props = {
  id: string;
  podeManifestar: boolean;
  manifestacao: TipoManifestacao | null;
  podeLancar: boolean;
  temXml: boolean;
  completo: boolean;
  lancamento: {
    descricao: string;
    valor: number;
    emissao: string;
    duplicatas: { numero: string; vencimento: string; valor: number }[];
    categorias: Opcao[];
    centros: Opcao[];
  } | null;
};

export function AcoesNota({ id, podeManifestar, manifestacao, podeLancar, temXml, completo, lancamento }: Props) {
  const [confirmar, setConfirmar] = useState<TipoManifestacao | null>(null);
  const [naoRealizada, setNaoRealizada] = useState(false);
  const [lancar, setLancar] = useState(false);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const final = !!manifestacao && MANIFESTACAO_FINAL.includes(manifestacao);

  function ciencia() {
    iniciar(async () => {
      const r = await manifestarNota(id, { tipo: "CIENCIA" });
      if (r.ok) {
        toast.success("Ciência registrada. O XML completo chega na próxima busca.");
        router.refresh();
      } else toast.error(r.erro);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {podeManifestar && !final && (
        <>
          {!manifestacao && (
            <Button variant="outline" disabled={pendente} onClick={ciencia}>
              {pendente ? <LoaderCircle className="animate-spin" /> : <Eye />} Dar ciência
            </Button>
          )}
          <Button disabled={pendente} onClick={() => setConfirmar("CONFIRMACAO")}>
            <Check /> Confirmar operação
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={pendente}>
                Recusar <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onSelect={() => setConfirmar("DESCONHECIMENTO")}>
                <HelpCircle /> Desconhecer a operação
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNaoRealizada(true)}>
                <Ban /> Operação não realizada
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      {podeLancar && lancamento && (
        <Button variant={podeManifestar && !final ? "outline" : "default"} onClick={() => setLancar(true)}>
          <Receipt /> Lançar no contas a pagar
        </Button>
      )}
      {temXml && (
        <Button variant="outline" asChild>
          <a href={`/api/fiscal/xml/${id}`}>
            <Download /> {completo ? "Baixar XML" : "Baixar resumo (XML)"}
          </a>
        </Button>
      )}

      <ConfirmarAcao
        aberto={confirmar === "CONFIRMACAO"}
        onAbertoChange={(v) => !v && setConfirmar(null)}
        titulo="Confirmar a operação?"
        descricao={<p>{AJUDA_MANIFESTACAO.CONFIRMACAO} O evento vai para a SEFAZ e fica no histórico da nota.</p>}
        rotuloConfirmar="Confirmar operação"
        acao={() => manifestarNota(id, { tipo: "CONFIRMACAO" })}
      />
      <ConfirmarAcao
        aberto={confirmar === "DESCONHECIMENTO"}
        onAbertoChange={(v) => !v && setConfirmar(null)}
        titulo="Desconhecer esta operação?"
        descricao={
          <p>
            {AJUDA_MANIFESTACAO.DESCONHECIMENTO} Use quando a nota foi emitida contra o CNPJ sem a empresa ter comprado (inclusive para se proteger de nota
            emitida indevidamente). O evento vai para a SEFAZ.
          </p>
        }
        rotuloConfirmar="Desconhecer"
        destrutivo
        acao={() => manifestarNota(id, { tipo: "DESCONHECIMENTO" })}
      />
      <DialogoNaoRealizada id={id} aberto={naoRealizada} onAbertoChange={setNaoRealizada} />
      {lancamento && <DialogoLancar id={id} aberto={lancar} onAbertoChange={setLancar} dados={lancamento} />}
    </div>
  );
}

function DialogoNaoRealizada({ id, aberto, onAbertoChange }: { id: string; aberto: boolean; onAbertoChange: (v: boolean) => void }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Operação não realizada</DialogTitle>
          <DialogDescription>{AJUDA_MANIFESTACAO.NAO_REALIZADA}</DialogDescription>
        </DialogHeader>
        <Campo id="just" rotulo="Justificativa" obrigatorio erro={erro} ajuda={`${texto.trim().length} de 15 a 255 caracteres.`}>
          <Textarea id="just" value={texto} maxLength={255} rows={3} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: mercadoria devolvida no ato da entrega por avaria" />
        </Campo>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbertoChange(false)} disabled={pendente}>
            Voltar
          </Button>
          <Button
            disabled={pendente}
            onClick={() => {
              if (texto.trim().length < 15) return setErro("Escreva pelo menos 15 caracteres.");
              setErro("");
              iniciar(async () => {
                const r = await manifestarNota(id, { tipo: "NAO_REALIZADA", justificativa: texto });
                if (r.ok) {
                  toast.success(r.mensagem ?? "Manifestação registrada.");
                  onAbertoChange(false);
                  router.refresh();
                } else toast.error(r.erro);
              });
            }}
          >
            {pendente && <LoaderCircle className="animate-spin" />} Enviar à SEFAZ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Parcela = { chave: number; vencimento: string; valor: number };

function DialogoLancar({ id, aberto, onAbertoChange, dados }: { id: string; aberto: boolean; onAbertoChange: (v: boolean) => void; dados: NonNullable<Props["lancamento"]> }) {
  const router = useRouter();
  const iniciais = useMemo<Parcela[]>(
    () =>
      dados.duplicatas.length
        ? dados.duplicatas.map((d, i) => ({ chave: i + 1, vencimento: d.vencimento, valor: d.valor }))
        : [{ chave: 1, vencimento: addDias(dados.emissao, 30), valor: dados.valor }],
    [dados],
  );
  const [parcelas, setParcelas] = useState<Parcela[]>(iniciais);
  const [descricao, setDescricao] = useState(dados.descricao);
  const [categoria, setCategoria] = useState("");
  const [centro, setCentro] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const total = arred2(parcelas.reduce((a, p) => a + (p.valor || 0), 0));
  const diferenca = arred2(total - dados.valor);

  function salvar() {
    const e: Record<string, string> = {};
    if (!categoria) e.categoriaId = "Escolha a categoria.";
    if (!descricao.trim()) e.descricao = "Informe a descrição.";
    if (parcelas.some((p) => !p.vencimento || !(p.valor > 0))) e.parcelas = "Toda parcela precisa de vencimento e valor.";
    setErros(e);
    if (Object.keys(e).length) return void toast.error(Object.values(e)[0]);
    iniciar(async () => {
      const r = await lancarNotaNoContasAPagar(id, {
        categoriaId: categoria,
        centroCustoId: centro || null,
        descricao,
        parcelas: parcelas.map((p) => ({ vencimento: p.vencimento, valor: p.valor })),
      });
      if (r.ok) {
        toast.success(r.mensagem ?? "Lançado.");
        onAbertoChange(false);
        router.refresh();
      } else {
        setErros(r.campos ?? {});
        toast.error(r.erro);
      }
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Lançar no contas a pagar</DialogTitle>
          <DialogDescription>
            {dados.duplicatas.length ? "Parcelas preenchidas com as duplicatas da nota." : "A nota não traz duplicatas: confira o vencimento."} O fornecedor é
            cadastrado pelo CNPJ se ainda não existir.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Campo id="desc" rotulo="Descrição" obrigatorio erro={erros.descricao}>
            <Input id="desc" value={descricao} maxLength={200} onChange={(e) => setDescricao(e.target.value)} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="cat" rotulo="Categoria" obrigatorio erro={erros.categoriaId}>
              <CampoSelect id="cat" opcoes={dados.categorias} valor={categoria} onChange={setCategoria} vazio="Escolha…" />
            </Campo>
            <Campo id="cc" rotulo="Centro de custo" erro={erros.centroCustoId}>
              <CampoSelect id="cc" opcoes={dados.centros} valor={centro} onChange={setCentro} vazio="Nenhum" />
            </Campo>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Parcelas</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setParcelas((ps) => [...ps, { chave: Math.max(0, ...ps.map((p) => p.chave)) + 1, vencimento: addDias(ps.at(-1)?.vencimento ?? dados.emissao, 30), valor: 0 }])
                }
              >
                <Plus /> Parcela
              </Button>
            </div>
            <ul className="space-y-2">
              {parcelas.map((p, i) => (
                <li key={p.chave} className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_2.25rem] items-center gap-2">
                  <span className="tabular text-sm text-muted-foreground">{i + 1}.</span>
                  <Input type="date" aria-label={`Vencimento da parcela ${i + 1}`} value={p.vencimento} onChange={(e) => setParcelas((ps) => ps.map((x) => (x.chave === p.chave ? { ...x, vencimento: e.target.value } : x)))} />
                  <CampoMoeda aria-label={`Valor da parcela ${i + 1}`} valor={p.valor} onChange={(v) => setParcelas((ps) => ps.map((x) => (x.chave === p.chave ? { ...x, valor: v } : x)))} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remover parcela ${i + 1}`} disabled={parcelas.length === 1} onClick={() => setParcelas((ps) => ps.filter((x) => x.chave !== p.chave))}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            {erros.parcelas && <p className="text-xs text-destructive">{erros.parcelas}</p>}
            <p className="text-right text-sm">
              Total <span className="tabular font-medium">{fmtMoeda(total)}</span>
              {Math.abs(diferenca) >= 0.01 && (
                <span className="ml-2 text-xs text-[oklch(0.5_0.13_65)] dark:text-warning">
                  ({diferenca > 0 ? "+" : "−"}
                  {fmtMoeda(Math.abs(diferenca))} em relação à nota)
                </span>
              )}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbertoChange(false)} disabled={pendente}>
            Voltar
          </Button>
          <Button onClick={salvar} disabled={pendente}>
            {pendente && <LoaderCircle className="animate-spin" />} Lançar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LinkTitulo({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Link href={`/financeiro/titulos/${id}`} className="hover:underline">
      {children}
    </Link>
  );
}
