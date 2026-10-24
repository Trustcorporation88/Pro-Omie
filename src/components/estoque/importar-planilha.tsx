"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, CircleCheck, Download, FileSpreadsheet, Info, LoaderCircle, RotateCcw, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Campo, Segmentado } from "@/components/financeiro/campos";
import { Selo } from "@/components/selos";
import { fmtData, fmtMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fmtQtd } from "@/modules/estoque/tipos";
import { conferirPlanilhaEstoque, importarPlanilhaEstoque } from "@/modules/estoque/planilha-acoes";
import type { LinhaPrevia, ModoQuantidade, PreviaImportacao, ResultadoImportacao } from "@/modules/estoque/planilha";

type Estabelecimento = { id: string; nome: string; matriz: boolean };
type Filtro = "todas" | "erros" | "mudancas";

const plural = (n: number, s: string, p: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? s : p}`;
const sinal = (n: number, unidade: string) => `${n > 0 ? "+" : "−"}${fmtQtd(Math.abs(n), unidade)}`;

const AJUDA_MODO: Record<ModoQuantidade, string> = {
  ENTRADA: "Produção, triagem ou compra: cada quantidade é somada ao saldo atual.",
  INVENTARIO: "Contagem física: o saldo passa a ser a quantidade da planilha e o sistema lança o ajuste da diferença. Materiais fora da planilha não mudam.",
};

/** Importação do estoque por planilha: modelo para baixar, envio, prévia linha a linha e importação tudo ou nada. */
export function ImportarPlanilhaEstoque({
  estabelecimentos,
  hoje,
  totalMateriais,
  podeCadastrar,
}: {
  estabelecimentos: Estabelecimento[];
  hoje: string;
  totalMateriais: number;
  podeCadastrar: boolean;
}) {
  const router = useRouter();
  const [estab, setEstab] = useState(estabelecimentos[0]?.id ?? "");
  const [modo, setModo] = useState<ModoQuantidade>("ENTRADA");
  const [data, setData] = useState(hoje);
  const [observacao, setObservacao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [feito, setFeito] = useState<(ResultadoImportacao & { mensagem: string }) | null>(null);
  const [conferindo, iniciarConferir] = useTransition();
  const [importando, iniciarImportar] = useTransition();
  const pedido = useRef(0);
  const entrada = useRef<HTMLInputElement>(null);
  const nomeEstab = estabelecimentos.find((e) => e.id === estab)?.nome ?? "";

  function formulario(f: File, m: ModoQuantidade, e: string) {
    const fd = new FormData();
    fd.set("arquivo", f);
    fd.set("modo", m);
    fd.set("estabelecimentoId", e);
    return fd;
  }

  function conferir(f: File | null, m: ModoQuantidade, e: string) {
    if (!f) return;
    const n = ++pedido.current;
    iniciarConferir(async () => {
      const r = await conferirPlanilhaEstoque(formulario(f, m, e));
      if (n !== pedido.current) return;
      if (r.ok && r.data) {
        setPrevia(r.data);
        setErro(null);
        setFiltro(r.data.resumo.comErro ? "erros" : "todas");
      } else {
        setPrevia(null);
        setErro(r.ok ? "A conferência não devolveu resultado. Tente de novo." : r.erro);
      }
    });
  }

  function importar() {
    if (!arquivo || !previa) return;
    iniciarImportar(async () => {
      const fd = formulario(arquivo, modo, estab);
      fd.set("assinatura", previa.assinatura);
      fd.set("data", data);
      fd.set("observacao", observacao);
      const r = await importarPlanilhaEstoque(fd);
      if (r.ok && r.data) {
        const mensagem = r.mensagem ?? "Planilha importada.";
        toast.success(mensagem, { duration: 8000 });
        setFeito({ ...r.data, mensagem });
        setPrevia(null);
        setArquivo(null);
        if (entrada.current) entrada.current.value = "";
        router.refresh();
      } else if (!r.ok) {
        toast.error(r.erro, { duration: 10000 });
        if (/conferência/.test(r.erro)) conferir(arquivo, modo, estab);
      }
    });
  }

  function recomecar() {
    setFeito(null);
    setPrevia(null);
    setErro(null);
    setArquivo(null);
    if (entrada.current) entrada.current.value = "";
  }

  if (feito)
    return (
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CircleCheck className="size-5 text-[oklch(0.55_0.15_150)]" aria-hidden /> Planilha importada
          </CardTitle>
          <CardDescription>{feito.mensagem}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/estoque">Ver saldos</Link>
          </Button>
          {feito.lancamento && (
            <Button variant="outline" asChild>
              <Link href={`/estoque/movimentacoes?tipo=${feito.lancamento.tipo === "ENTRADA" ? "entrada" : "ajuste"}`}>Ver o lançamento</Link>
            </Button>
          )}
          <Button variant="ghost" onClick={recomecar}>
            <RotateCcw /> Importar outra planilha
          </Button>
        </CardContent>
      </Card>
    );

  const r = previa?.resumo;
  const linhas = previa
    ? previa.linhas.filter((l) => (filtro === "erros" ? l.acao === "ERRO" : filtro === "mudancas" ? l.acao === "NOVO" || l.acao === "ATUALIZA" || temMovimento(l) : true))
    : [];
  const nada = !!r && !r.comErro && !r.novos && !r.atualizados && !r.movimentos;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span> Baixe o modelo
            </CardTitle>
            <CardDescription>
              {totalMateriais > 0
                ? `Já vem com os ${plural(totalMateriais, "material cadastrado", "materiais cadastrados")} e o saldo atual de ${nomeEstab}. Preencha a coluna Quantidade (e, se quiser, preço e custo).`
                : "Ainda não há materiais: o modelo vem com os recicláveis mais comuns. Apague o que não usa, acrescente linhas e preencha as quantidades."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Button variant="outline" asChild>
              <a href={`/api/estoque/modelo?estabelecimento=${encodeURIComponent(estab)}`} download>
                <Download /> Baixar modelo (.xlsx)
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Colunas: Código, Descrição, Unidade, Grupo, NCM, Preço de venda, Quantidade e Custo unitário. A aba Instruções explica cada uma. Também serve uma planilha sua, com esses nomes no cabeçalho, ou um .csv.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span> Envie a planilha
            </CardTitle>
            <CardDescription>Nada é gravado antes da conferência: você vê o que cada linha vai fazer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {estabelecimentos.length > 1 && (
              <Campo id="imp-estab" rotulo="Estabelecimento">
                <select
                  id="imp-estab"
                  value={estab}
                  disabled={importando}
                  onChange={(e) => {
                    setEstab(e.target.value);
                    conferir(arquivo, modo, e.target.value);
                  }}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                >
                  {estabelecimentos.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                      {e.matriz ? " (matriz)" : ""}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">A coluna Quantidade é</p>
              <Segmentado<ModoQuantidade>
                rotulo="A coluna Quantidade é"
                valor={modo}
                onChange={(m) => {
                  setModo(m);
                  conferir(arquivo, m, estab);
                }}
                opcoes={[
                  { valor: "ENTRADA", rotulo: "Entrada (soma ao saldo)" },
                  { valor: "INVENTARIO", rotulo: "Inventário (saldo contado)" },
                ]}
              />
              <p className="text-xs text-muted-foreground">{AJUDA_MODO[modo]}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
              <Campo id="imp-data" rotulo="Data do lançamento">
                <Input id="imp-data" type="date" value={data} max="2200-12-31" onChange={(e) => setData(e.target.value)} disabled={importando} />
              </Campo>
              <Campo id="imp-obs" rotulo="Observação (opcional)">
                <Input id="imp-obs" value={observacao} maxLength={500} placeholder="Ex.: inventário de outubro" onChange={(e) => setObservacao(e.target.value)} disabled={importando} />
              </Campo>
            </div>
            <Campo id="imp-arquivo" rotulo="Planilha (.xlsx ou .csv, até 2 MB)">
              <Input
                id="imp-arquivo"
                ref={entrada}
                type="file"
                accept=".xlsx,.xlsm,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                disabled={importando}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setArquivo(f);
                  setPrevia(null);
                  setErro(null);
                  conferir(f, modo, estab);
                }}
                className="cursor-pointer file:mr-3 file:cursor-pointer"
              />
            </Campo>
            {conferindo && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden /> Conferindo a planilha…
              </p>
            )}
            {erro && !conferindo && (
              <p className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {erro}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {previa && r && (
        <Card className={cn(conferindo && "opacity-60")}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden /> <span className="min-w-0 break-all">{previa.arquivo}</span>
              <Selo>{previa.formato === "csv" ? "CSV" : `aba ${previa.aba}`}</Selo>
            </CardTitle>
            <CardDescription>
              {plural(r.linhas, "linha", "linhas")} com dados · {previa.modo === "ENTRADA" ? "entrada" : "inventário"} em {previa.estabelecimento.nome}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {r.novos > 0 && <Selo tom="sucesso">{plural(r.novos, "material novo", "materiais novos")}</Selo>}
              {r.atualizados > 0 && <Selo tom="info">{plural(r.atualizados, "atualizado", "atualizados")}</Selo>}
              {r.iguais > 0 && <Selo>{plural(r.iguais, "sem mudança no cadastro", "sem mudança no cadastro")}</Selo>}
              {r.movimentos > 0 && (
                <Selo tom="roxo">
                  {previa.modo === "ENTRADA" ? `${plural(r.movimentos, "item entra", "itens entram")} no estoque` : `${plural(r.movimentos, "saldo muda", "saldos mudam")}`}
                </Selo>
              )}
              {r.comErro > 0 && <Selo tom="perigo">{plural(r.comErro, "linha com erro", "linhas com erro")}</Selo>}
            </div>
            {previa.avisos.map((m) => (
              <p key={m} className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm" role="status">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {m}
              </p>
            ))}
            {previa.colunas.semQuantidade && (
              <p className="flex gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> A planilha não tem a coluna Quantidade: só o cadastro dos materiais muda.
              </p>
            )}
            {previa.colunas.ignoradas.length > 0 && (
              <p className="flex gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Colunas ignoradas: {previa.colunas.ignoradas.join(", ")}.
              </p>
            )}
            {r.comErro > 0 && (
              <p className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                Corrija {r.comErro === 1 ? "a linha com erro" : `as ${r.comErro} linhas com erro`} na planilha e envie de novo. Enquanto houver erro, nada é gravado.
              </p>
            )}
            {!podeCadastrar && (r.novos > 0 || r.atualizados > 0 || r.comErro > 0) && (
              <p className="text-xs text-muted-foreground">Seu acesso lança quantidades, mas não cadastra materiais nem muda preços.</p>
            )}

            <Segmentado<Filtro>
              rotulo="Mostrar"
              valor={filtro}
              onChange={setFiltro}
              opcoes={[
                { valor: "todas", rotulo: `Todas (${r.linhas})` },
                ...(r.comErro ? [{ valor: "erros" as const, rotulo: `Com erro (${r.comErro})` }] : []),
                { valor: "mudancas", rotulo: `Com mudança (${previa.linhas.filter((l) => l.acao === "NOVO" || l.acao === "ATUALIZA" || temMovimento(l)).length})` },
              ]}
            />
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-14">Linha</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead className="text-right">{previa.modo === "ENTRADA" ? "Entrada" : "Saldo (sistema → contado)"}</TableHead>
                  <TableHead>Observações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <LinhaTabela key={l.linha} l={l} />
                ))}
                {!linhas.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      Nenhuma linha neste filtro.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {r.comErro
                  ? "Importação bloqueada até a planilha não ter erros."
                  : nada
                    ? "Nada para importar: a planilha bate com o cadastro e com o estoque."
                    : resumoAcao(r, previa.modo, previa.estabelecimento.nome, data)}
              </p>
              <Button onClick={importar} disabled={importando || conferindo || r.comErro > 0 || nada || !data} className="shrink-0">
                {importando ? <LoaderCircle className="animate-spin" /> : <Upload />} Importar planilha
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function temMovimento(l: LinhaPrevia) {
  const e = l.efeito;
  if (!e) return false;
  if (e.tipo === "ENTRADA") return e.quantidade > 0;
  return e.diferenca !== 0 || (e.custo !== null && e.contado > 0 && Math.abs(e.custo - e.custoAtual) > 0.00005);
}

function resumoAcao(r: PreviaImportacao["resumo"], modo: ModoQuantidade, estab: string, data: string) {
  const partes = [
    r.novos ? `cadastrar ${plural(r.novos, "material", "materiais")}` : "",
    r.atualizados ? `atualizar ${plural(r.atualizados, "material", "materiais")}` : "",
    r.movimentos ? (modo === "ENTRADA" ? `lançar a entrada de ${plural(r.movimentos, "item", "itens")}` : `ajustar ${plural(r.movimentos, "saldo", "saldos")} (inventário)`) : "",
  ].filter(Boolean);
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}` : partes[0];
  return `Vai ${lista}${r.movimentos ? ` em ${estab}, com data de ${fmtData(data)}` : ""}.`;
}

function LinhaTabela({ l }: { l: LinhaPrevia }) {
  const e = l.efeito;
  return (
    <TableRow className={cn("align-top", l.acao === "ERRO" && "bg-destructive/5")}>
      <TableCell className="tabular text-xs text-muted-foreground">{l.linha}</TableCell>
      <TableCell className="min-w-52 max-w-80 whitespace-normal">
        <span className="block font-mono text-xs text-muted-foreground">{l.codigo || "—"}</span>
        <span className="block text-sm font-medium">{l.descricao || "—"}</span>
        <span className="text-xs text-muted-foreground">
          {l.unidade}
          {l.grupo ? ` · ${l.grupo}` : ""}
        </span>
      </TableCell>
      <TableCell className="min-w-40 max-w-72 whitespace-normal">
        {l.acao === "NOVO" && <Selo tom="sucesso">Novo</Selo>}
        {l.acao === "ATUALIZA" && <Selo tom="info">Atualiza</Selo>}
        {l.acao === "IGUAL" && <span className="text-xs text-muted-foreground">Sem mudança</span>}
        {l.acao === "ERRO" && <Selo tom="perigo">Erro</Selo>}
        {l.mudancas.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {l.mudancas.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
      </TableCell>
      <TableCell className="tabular text-right text-sm whitespace-nowrap">
        {!e ? (
          <span className="text-muted-foreground">—</span>
        ) : e.tipo === "ENTRADA" ? (
          <>
            <span className="font-medium text-[oklch(0.5_0.14_150)] dark:text-[oklch(0.75_0.14_150)]">{sinal(e.quantidade, l.unidade)}</span>
            {e.custo !== null && <span className="block text-xs text-muted-foreground">a {fmtMoeda(e.custo)}</span>}
          </>
        ) : (
          <>
            <span>
              {fmtQtd(e.atual, l.unidade)} → <span className="font-medium">{fmtQtd(e.contado, l.unidade)}</span>
            </span>
            <span className={cn("block text-xs", e.diferenca === 0 ? "text-muted-foreground" : e.diferenca > 0 ? "text-[oklch(0.5_0.14_150)] dark:text-[oklch(0.75_0.14_150)]" : "text-destructive")}>
              {e.diferenca === 0 ? "sem diferença" : sinal(e.diferenca, l.unidade)}
            </span>
            {e.custo !== null && e.contado > 0 && <span className="block text-xs text-muted-foreground">custo {fmtMoeda(e.custo)}</span>}
          </>
        )}
      </TableCell>
      <TableCell className="min-w-56 max-w-96 whitespace-normal text-xs">
        {l.erros.map((m) => (
          <p key={m} className="text-destructive">
            {m}
          </p>
        ))}
        {l.avisos.map((m) => (
          <p key={m} className="text-muted-foreground">
            {m}
          </p>
        ))}
      </TableCell>
    </TableRow>
  );
}
