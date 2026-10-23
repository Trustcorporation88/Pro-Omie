"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EnviarEmail, type AlvoEmail } from "@/components/email/enviar-email";
import { Ban, Check, FileDown, FilePlus2, LoaderCircle, Pencil, Receipt, RotateCcw, Send, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { Campo, CampoSelect } from "@/components/financeiro/campos";
import { fmtData, fmtMoeda } from "@/lib/format";
import { parcelasPorCondicao } from "@/modules/financeiro/parcelas";
import { alterarSituacaoProposta, cancelarPedido, desfazerFaturamento, faturarPedido, gerarPedido, type AcaoProposta } from "@/modules/vendas/acoes";
import type { DocumentoVenda, OpcoesVenda } from "@/modules/vendas/tipos";
import { fmtQtd } from "@/modules/estoque/tipos";
import { cn } from "@/lib/utils";

type Confirmacao = { titulo: string; descricao: string; rotulo: string; destrutivo?: boolean; motivo?: boolean; acao: (m?: string) => ReturnType<typeof alterarSituacaoProposta> };

/** Botões da página de detalhe de proposta ou pedido, conforme a situação e as permissões. */
export function AcoesDocumento({
  doc,
  podeEditar,
  podeFaturar,
  opcoes,
  hoje,
  email,
}: {
  doc: DocumentoVenda;
  podeEditar: boolean;
  podeFaturar: boolean;
  opcoes: OpcoesVenda;
  hoje: string;
  email?: AlvoEmail | null;
}) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState<Confirmacao | null>(null);
  const [faturar, setFaturar] = useState(false);
  const [gerando, iniciarGerar] = useTransition();
  const proposta = doc.tipo === "proposta";
  const base = proposta ? "/vendas/propostas" : "/vendas/pedidos";
  const pdf = `/api/vendas/${proposta ? "propostas" : "pedidos"}/${doc.id}/pdf`;

  const situacao = (acao: AcaoProposta, titulo: string, descricao: string, rotulo: string, extra: Partial<Confirmacao> = {}) =>
    setConfirmar({ titulo, descricao, rotulo, acao: (m) => alterarSituacaoProposta(doc.id, acao, m), ...extra });

  const botoes: React.ReactNode[] = [];
  if (proposta && podeEditar) {
    const s = doc.status;
    if (s === "RASCUNHO" || s === "ENVIADA")
      botoes.push(
        <Button key="editar" variant="outline" asChild>
          <Link href={`${base}/${doc.id}/editar`}>
            <Pencil /> Editar
          </Link>
        </Button>,
      );
    if (s === "RASCUNHO")
      botoes.push(
        <Button key="enviar" variant="outline" onClick={() => situacao("enviar", "Marcar como enviada?", "Use depois de mandar o PDF ao cliente.", "Marcar como enviada")}>
          <Send /> Marcar como enviada
        </Button>,
      );
    if (s === "RASCUNHO" || s === "ENVIADA") {
      botoes.push(
        <Button key="aprovar" onClick={() => situacao("aprovar", "Aprovar a proposta?", "O cliente aceitou. Depois você gera o pedido de venda a partir dela.", "Aprovar")}>
          <Check /> Aprovar
        </Button>,
      );
      botoes.push(
        <Button key="recusar" variant="outline" onClick={() => situacao("recusar", "Recusar a proposta?", "Informe o motivo (preço, prazo, concorrente…). Ele fica no histórico.", "Recusar", { destrutivo: true, motivo: true })}>
          <X /> Recusar
        </Button>,
      );
    }
    if (s === "APROVADA" && !doc.vinculo)
      botoes.push(
        <Button
          key="pedido"
          disabled={gerando}
          onClick={() =>
            iniciarGerar(async () => {
              const r = await gerarPedido(doc.id);
              if (!r.ok) return void toast.error(r.erro);
              toast.success(r.mensagem ?? "Pedido gerado.");
              router.push(`/vendas/pedidos/${r.data?.id}`);
            })
          }
        >
          {gerando ? <LoaderCircle className="animate-spin" /> : <FilePlus2 />} Gerar pedido
        </Button>,
      );
    if ((s === "RASCUNHO" || s === "ENVIADA" || s === "APROVADA") && !doc.vinculo)
      botoes.push(
        <Button key="cancelar" variant="ghost" onClick={() => situacao("cancelar", "Cancelar a proposta?", "Ela sai das listas de abertas, mas o histórico fica.", "Cancelar proposta", { destrutivo: true, motivo: true })}>
          <Ban /> Cancelar
        </Button>,
      );
    if (s === "RECUSADA" || s === "CANCELADA")
      botoes.push(
        <Button key="reabrir" variant="outline" onClick={() => situacao("reabrir", "Reabrir como rascunho?", "A proposta volta a ser editável, com o mesmo número.", "Reabrir")}>
          <RotateCcw /> Reabrir
        </Button>,
      );
  }
  if (!proposta && podeEditar) {
    const s = doc.status;
    if (s === "ABERTO") {
      botoes.push(
        <Button key="editar" variant="outline" asChild>
          <Link href={`${base}/${doc.id}/editar`}>
            <Pencil /> Editar
          </Link>
        </Button>,
      );
      if (podeFaturar)
        botoes.push(
          <Button key="faturar" onClick={() => setFaturar(true)}>
            <Receipt /> Faturar
          </Button>,
        );
      botoes.push(
        <Button
          key="cancelar"
          variant="ghost"
          onClick={() =>
            setConfirmar({
              titulo: "Cancelar o pedido?",
              descricao: "Ele não poderá mais ser faturado. O histórico fica.",
              rotulo: "Cancelar pedido",
              destrutivo: true,
              motivo: true,
              acao: (m) => cancelarPedido(doc.id, m),
            })
          }
        >
          <Ban /> Cancelar
        </Button>,
      );
    }
    if (s === "FATURADO" && podeFaturar)
      botoes.push(
        <Button
          key="desfazer"
          variant="outline"
          onClick={() =>
            setConfirmar({
              titulo: "Desfazer o faturamento?",
              descricao: "As contas a receber geradas por este pedido são excluídas e ele volta a ficar em aberto. Só é possível se nenhuma tiver recebimento.",
              rotulo: "Desfazer faturamento",
              destrutivo: true,
              acao: () => desfazerFaturamento(doc.id),
            })
          }
        >
          <Undo2 /> Desfazer faturamento
        </Button>,
      );
  }
  botoes.push(
    <Button key="pdf" variant="outline" asChild>
      <a href={pdf} target="_blank" rel="noopener">
        <FileDown /> PDF
      </a>
    </Button>,
  );
  if (email) botoes.push(<EnviarEmail key="email" alvo={email} />);

  return (
    <>
      {botoes}
      {confirmar && (
        <ConfirmarAcao
          aberto
          onAbertoChange={(v) => !v && setConfirmar(null)}
          titulo={confirmar.titulo}
          descricao={confirmar.descricao}
          rotuloConfirmar={confirmar.rotulo}
          destrutivo={confirmar.destrutivo}
          pedirMotivo={confirmar.motivo}
          acao={confirmar.acao}
          aoConcluir={() => setConfirmar(null)}
        />
      )}
      {faturar && <DialogoFaturar doc={doc} opcoes={opcoes} hoje={hoje} onFechar={() => setFaturar(false)} />}
    </>
  );
}

/** Faturamento do pedido: escolhe categorias (por tipo de item), condição e conta; mostra as parcelas antes de gerar. */
function DialogoFaturar({ doc, opcoes, hoje, onFechar }: { doc: DocumentoVenda; opcoes: OpcoesVenda; hoje: string; onFechar: () => void }) {
  const router = useRouter();
  const temProduto = doc.itens.some((i) => i.tipo === "PRODUTO");
  const temServico = doc.itens.some((i) => i.tipo === "SERVICO");
  const [emissao, setEmissao] = useState(hoje);
  const [condicao, setCondicao] = useState(doc.condicaoPagamentoId ?? "");
  const [forma, setForma] = useState(doc.formaPagamentoId ?? "");
  const [conta, setConta] = useState("");
  const [catProdutos, setCatProdutos] = useState(opcoes.categoriaSugerida.PRODUTO ?? "");
  const [catServicos, setCatServicos] = useState(opcoes.categoriaSugerida.SERVICO ?? "");
  const [centro, setCentro] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, iniciar] = useTransition();
  const dias = opcoes.condicoes.find((c) => c.valor === condicao)?.dias ?? "0";
  const faltaEstoque = doc.estoque.filter((e) => e.saldo < e.quantidade);
  const parcelas = useMemo(() => (/^\d{4}-\d{2}-\d{2}$/.test(emissao) ? parcelasPorCondicao(doc.total, dias, emissao) : []), [doc.total, dias, emissao]);

  function confirmar() {
    iniciar(async () => {
      const r = await faturarPedido(doc.id, {
        emissao,
        condicaoPagamentoId: condicao || null,
        formaPagamentoId: forma || null,
        contaBancariaId: conta || null,
        categoriaProdutosId: temProduto ? catProdutos || null : null,
        categoriaServicosId: temServico ? catServicos || null : null,
        centroCustoId: centro || null,
      });
      if (!r.ok) {
        setErros(r.campos ?? {});
        return void toast.error(r.erro);
      }
      toast.success(r.mensagem ?? "Pedido faturado.");
      onFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !enviando && onFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Faturar pedido nº {String(doc.numero).padStart(4, "0")}</DialogTitle>
          <DialogDescription>Gera as contas a receber de {fmtMoeda(doc.total)} para {doc.pessoaNome}, uma por parcela da condição de pagamento.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Campo id="ft-emissao" rotulo="Data do faturamento" obrigatorio erro={erros.emissao}>
            <Input id="ft-emissao" type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} />
          </Campo>
          <Campo id="ft-condicao" rotulo="Condição de pagamento">
            <CampoSelect id="ft-condicao" opcoes={opcoes.condicoes} valor={condicao} onChange={setCondicao} vazio="À vista" />
          </Campo>
          {temProduto && (
            <Campo id="ft-cat-prod" rotulo="Categoria dos produtos" obrigatorio erro={erros.categoriaProdutosId}>
              <CampoSelect id="ft-cat-prod" opcoes={opcoes.categoriasReceita} valor={catProdutos} onChange={setCatProdutos} vazio="Selecione…" aria-invalid={!!erros.categoriaProdutosId} />
            </Campo>
          )}
          {temServico && (
            <Campo id="ft-cat-serv" rotulo="Categoria dos serviços" obrigatorio erro={erros.categoriaServicosId}>
              <CampoSelect id="ft-cat-serv" opcoes={opcoes.categoriasReceita} valor={catServicos} onChange={setCatServicos} vazio="Selecione…" aria-invalid={!!erros.categoriaServicosId} />
            </Campo>
          )}
          <Campo id="ft-forma" rotulo="Forma de pagamento">
            <CampoSelect id="ft-forma" opcoes={opcoes.formas} valor={forma} onChange={setForma} vazio="—" />
          </Campo>
          <Campo id="ft-conta" rotulo="Conta prevista">
            <CampoSelect id="ft-conta" opcoes={opcoes.contas} valor={conta} onChange={setConta} vazio="—" />
          </Campo>
          <Campo className="col-span-2" id="ft-centro" rotulo="Centro de custo">
            <CampoSelect id="ft-centro" opcoes={opcoes.centros} valor={centro} onChange={setCentro} vazio="—" />
          </Campo>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="mb-2 font-medium">
            {parcelas.length} {parcelas.length === 1 ? "parcela" : "parcelas"}
          </p>
          <ul className="space-y-1">
            {parcelas.map((p, i) => (
              <li key={i} className="flex justify-between tabular-nums">
                <span className="text-muted-foreground">
                  {i + 1}ª · vence em {fmtData(p.vencimento)}
                </span>
                <span>{fmtMoeda(p.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
        {doc.estoque.length > 0 && (
          <div className={cn("rounded-lg border p-3 text-sm", faltaEstoque.length ? "border-destructive/40 bg-destructive/5" : "bg-muted/30")}>
            <p className="mb-2 font-medium">Baixa no estoque</p>
            <ul className="space-y-1">
              {doc.estoque.map((e) => {
                const falta = e.saldo < e.quantidade;
                return (
                  <li key={e.produtoId} className="flex flex-wrap justify-between gap-x-3 tabular-nums">
                    <span className="min-w-0 truncate">{e.descricao}</span>
                    <span className={cn("text-muted-foreground", falta && "font-medium text-destructive")}>
                      {`sai ${fmtQtd(e.quantidade, e.unidade)} · saldo ${fmtQtd(e.saldo, e.unidade)}`}
                      {!falta && ` · fica ${fmtQtd(Math.round((e.saldo - e.quantidade) * 1000) / 1000, e.unidade)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
            {faltaEstoque.length > 0 && (
              <p className="mt-2 text-destructive" role="alert">
                Falta saldo. Registre a{" "}
                <Link href="/estoque/entradas/nova" className="font-medium underline">
                  entrada da produção
                </Link>
                , ajuste o estoque ou corrija a quantidade do pedido.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={enviando || !parcelas.length || faltaEstoque.length > 0}>
            {enviando && <LoaderCircle className="animate-spin" />} Faturar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
