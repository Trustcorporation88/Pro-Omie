import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarClock, CircleAlert, FileCheck2, Hourglass, ReceiptText, TriangleAlert, Users } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, SelectFiltro } from "@/components/filtros";
import { CartaoKpi } from "@/components/relatorios/cartao-kpi";
import { Selo } from "@/components/selos";
import { BotaoExportarCsv } from "@/components/relatorios/exportar-csv";
import { AcoesTarifa, BotaoAtualizarFotografia, BotaoFaturar, BotaoGerarTodos, BotaoNovaTarifa, MenuLinhaFaturamento, SeloSituacao, type OpcoesTarifa } from "@/components/armazem/faturamento";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { prisma } from "@/lib/db";
import { fmtData, fmtDataHora, fmtDocumento, fmtMoeda } from "@/lib/format";
import { carregarOpcoesFinanceiras } from "@/modules/financeiro/opcoes";
import { carregarFaturamento, lerFiltrosFaturamento, type AbaFaturamento, type LinhaFaturamento } from "@/modules/armazem/faturamento";
import { ROTULO_METODO_CURTO, somarDias, type MetodoArmazenagem } from "@/modules/armazem/tipos";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";

export const metadata: Metadata = { title: "Faturamento da armazenagem" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const num = (n: number, casas = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const ROTULO_TITULO: Record<string, string> = { ABERTO: "a receber", PARCIAL: "recebido em parte", QUITADO: "recebido", CANCELADO: "título cancelado" };
const VAZIO: Record<AbaFaturamento, { titulo: string; descricao: string }> = {
  pendentes: { titulo: "Nenhum período vencido a faturar", descricao: "Cada mês é cobrado depois que termina, pela apuração dos paletes no último dia. O mês corrente fica em Em andamento." },
  andamento: { titulo: "Nenhum período em andamento", descricao: "Cadastre a tarifa de cada cliente para começar a apurar." },
  faturados: { titulo: "Nenhum faturamento ainda", descricao: "Os períodos faturados aparecem aqui, com o pedido e a conta a receber." },
  "sem-tarifa": { titulo: "Todos os clientes com paletes têm tarifa", descricao: "Quem tiver paletes armazenados sem tarifa aparece aqui, com os paletes dos últimos 30 dias." },
};
const paletes = (n: number) => `${num(n, 0)} ${n === 1 ? "palete" : "paletes"}`;

/** O número que vai para a cobrança, conforme o método: paletes no fim do período, paletes-dia ou o pico. */
function Apuracao({ l }: { l: LinhaFaturamento }) {
  const sub = (t: string) => <span className="block text-xs text-muted-foreground">{t}</span>;
  if (l.situacao === "SEM_TARIFA") {
    const hoje = l.dias.length ? l.dias[l.dias.length - 1].posicoes : 0;
    return (
      <>
        {paletes(hoje)} hoje
        {sub(`pico de ${l.bruto.pico} nos últimos 30 dias`)}
      </>
    );
  }
  const fat = l.faturamento;
  const metodo: MetodoArmazenagem = fat?.metodo ?? l.tarifa?.metodo ?? "FIM_PERIODO";
  if (fat) {
    if (metodo === "FIM_PERIODO") return <>{paletes(fat.apurado)}{sub(`em ${fmtData(l.periodo!.fim)}`)}</>;
    if (metodo === "PICO") return <>{paletes(fat.pico)} (pico){sub(`${num(fat.posicoesDia, 0)} paletes-dia`)}</>;
    return <>{num(fat.posicoesDia, 0)} paletes-dia{sub(`pico ${fat.pico}`)}</>;
  }
  const c = l.calculo;
  if (!c) return <span className="text-muted-foreground">—</span>;
  const andamento = l.situacao === "EM_ANDAMENTO";
  if (metodo === "FIM_PERIODO")
    return (
      <>
        {paletes(c.apurado)}
        {sub(andamento ? `hoje · apuração em ${fmtData(l.periodo!.fim)}` : `em ${fmtData(c.diaApuracao ?? l.periodo!.fim)}`)}
      </>
    );
  if (metodo === "PICO") return <>{paletes(c.pico)} (pico){sub(`média ${num(c.media)}`)}</>;
  return (
    <>
      {num(c.posicoesDia, 0)} paletes-dia
      {sub(`média ${num(c.media)} · pico ${c.pico}${c.reservadasDia ? ` · ${c.reservadasDia} de reservadas` : ""}`)}
    </>
  );
}

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("armazem:ver");
  const f = lerFiltrosFaturamento(await searchParams);
  const dados = await carregarFaturamento(f);
  const podeFaturar = pode(u.papel, "financeiro:editar");
  const podeFotografar = pode(u.papel, "armazem:editar");
  let opcoes: OpcoesTarifa | null = null;
  if (podeFaturar) {
    const escopo = await escopoEmpresa();
    const [fin, servicos] = await Promise.all([
      carregarOpcoesFinanceiras(),
      prisma.produto.findMany({ where: { empresaId: escopo.ativa.id, tipo: "SERVICO", ativo: true }, orderBy: { descricao: "asc" }, select: { id: true, codigo: true, descricao: true } }),
    ]);
    opcoes = {
      estabelecimentos: dados.estabelecimentos.filter((e) => e.ativo).map((e) => ({ valor: e.id, rotulo: e.nome })),
      servicos: servicos.map((s) => ({ valor: s.id, rotulo: `${s.codigo} · ${s.descricao}` })),
      categorias: fin.categoriasReceita,
      contas: fin.contas,
      formas: fin.formas,
      inicioPadrao: dados.hoje,
    };
  }
  const link = (aba: AbaFaturamento) => {
    const p = new URLSearchParams(Object.entries({ aba: aba === "pendentes" ? "" : aba, estab: f.estab, depositante: f.depositante }).filter(([, v]) => v));
    return `/servicos/armazem/faturamento${p.size ? `?${p.toString()}` : ""}`;
  };
  const csv = (l: LinhaFaturamento) => {
    const de = l.periodo?.inicio ?? somarDias(dados.hoje, -29);
    const fim = l.periodo?.fim ?? dados.hoje;
    const p = new URLSearchParams({ de, ate: fim < dados.hoje ? fim : dados.hoje, depositante: l.depositanteId, estab: l.empresaId });
    return `/api/armazem/ocupacao?${p.toString()}`;
  };
  const varios = dados.estabelecimentos.length > 1;
  const aba = dados.aba;
  const semTarifa = aba === "sem-tarifa";
  const faturados = aba === "faturados";

  return (
    <>
      <Link href="/servicos/armazem" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Itens armazenados
      </Link>
      <PageHeader
        titulo="Faturamento da armazenagem"
        descricao="Cobrança por palete, vencida: todo dia o sistema fotografa os paletes de cada cliente; no fim do mês faz a apuração, e a tarifa vira o pedido, a conta a receber e o boleto ou Pix."
      >
        {podeFotografar && <BotaoAtualizarFotografia />}
        {podeFaturar && <BotaoGerarTodos estab={f.estab} pendentes={dados.contagem.pendentes} total={dados.totais.aFaturar} />}
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoKpi titulo="A faturar" valor={fmtMoeda(dados.totais.aFaturar)} icone={ReceiptText} tom={dados.contagem.pendentes ? "alerta" : "neutro"} href={link("pendentes")}>
          {dados.contagem.pendentes} {dados.contagem.pendentes === 1 ? "período vencido" : "períodos vencidos"}
        </CartaoKpi>
        <CartaoKpi titulo="Em andamento" valor={fmtMoeda(dados.totais.emAndamento)} icone={Hourglass} tom="roxo" href={link("andamento")}>
          parcial, até hoje, em {dados.contagem.andamento} {dados.contagem.andamento === 1 ? "período" : "períodos"}
        </CartaoKpi>
        <CartaoKpi titulo="Faturado este mês" valor={fmtMoeda(dados.totais.faturadoNoMes)} icone={FileCheck2} tom="sucesso" href={link("faturados")}>
          {dados.totais.faturadosNoMes} pedido(s) gerado(s)
        </CartaoKpi>
        <CartaoKpi titulo="Sem tarifa" valor={String(dados.contagem["sem-tarifa"])} icone={Users} tom={dados.contagem["sem-tarifa"] ? "perigo" : "neutro"} href={link("sem-tarifa")}>
          têm paletes, mas não têm preço
        </CartaoKpi>
      </div>

      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <AbasFiltro
          parametro="aba"
          padrao="pendentes"
          opcoes={[
            { valor: "pendentes", rotulo: "A faturar", contador: dados.contagem.pendentes },
            { valor: "andamento", rotulo: "Em andamento", contador: dados.contagem.andamento },
            { valor: "faturados", rotulo: "Faturados", contador: dados.contagem.faturados },
            { valor: "sem-tarifa", rotulo: "Sem tarifa", contador: dados.contagem["sem-tarifa"] },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <BotaoExportarCsv
            arquivo={`armazenagem-${aba}-${dados.hoje}.csv`}
            cabecalho={["Cliente", "CNPJ/CPF", "Estabelecimento", "Período", "Como conta", "Paletes apurados", "Paletes-dia", "Pico", "Valor", "Vencimento", "Situação", "Pedido"]}
            linhas={dados.linhas.map((l) => [
              l.depositante,
              l.documento ? fmtDocumento(l.documento) : "",
              l.estabelecimento,
              l.periodo?.rotulo ?? "últimos 30 dias",
              l.faturamento ? ROTULO_METODO_CURTO[l.faturamento.metodo] : l.tarifa ? ROTULO_METODO_CURTO[l.tarifa.metodo] : "sem tarifa",
              l.faturamento?.apurado ?? l.calculo?.apurado ?? (l.dias.length ? l.dias[l.dias.length - 1].posicoes : 0),
              l.faturamento?.posicoesDia ?? l.calculo?.posicoesDia ?? l.bruto.posicoesDia,
              l.faturamento?.pico ?? l.calculo?.pico ?? l.bruto.pico,
              l.faturamento?.valor ?? l.calculo?.valor ?? null,
              l.faturamento?.vencimento ?? (l.situacao === "PENDENTE" ? l.vencimento : null) ?? "",
              { PENDENTE: "a faturar", EM_ANDAMENTO: "em andamento", FATURADO: "faturado", SEM_TARIFA: "sem tarifa" }[l.situacao],
              l.faturamento?.pedido ? fmtNumeroDoc(l.faturamento.pedido.numero) : "",
            ])}
            desabilitado={!dados.linhas.length}
          />
          {dados.depositantes.length > 1 && <SelectFiltro parametro="depositante" rotuloTodos="Todos os depositantes" opcoes={dados.depositantes.map((d) => ({ valor: d.id, rotulo: d.nome }))} />}
          {varios && <SelectFiltro parametro="estab" rotuloTodos="Todos os estabelecimentos" opcoes={dados.estabelecimentos.map((e) => ({ valor: e.id, rotulo: e.nome }))} />}
        </div>
      </div>

      <div className="mb-4 space-y-2">
        {dados.totais.diasRepetidos > 0 && (
          <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[oklch(0.5_0.13_65)]" aria-hidden />
            <span>
              Até {dados.totais.diasRepetidos} {dados.totais.diasRepetidos === 1 ? "dia ficou" : "dias ficaram"} sem fotografia e {dados.totais.diasRepetidos === 1 ? "repetiu" : "repetiram"} o último dia fotografado. Confira no dia a dia de cada depositante.
            </span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {dados.ultimaFotografia ? `Última fotografia: ${fmtDataHora(dados.ultimaFotografia.em)}. ` : "Nenhuma fotografia ainda. "}O sistema fotografa de hora em hora; vale a última de cada dia.
        </p>
      </div>

      {dados.linhas.length === 0 ? (
        <EstadoVazio titulo={VAZIO[aba].titulo} descricao={VAZIO[aba].descricao} />
      ) : (
        <Card className="mb-6 overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-3">Depositante</TableHead>
                <TableHead>{semTarifa ? "Desde" : "Período"}</TableHead>
                {!faturados && !semTarifa && <TableHead>Tarifa</TableHead>}
                <TableHead className="text-right">Apuração</TableHead>
                {!semTarifa && <TableHead className="text-right">Valor</TableHead>}
                <TableHead>Situação</TableHead>
                <TableHead className="pr-3 text-right">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.linhas.map((l) => {
                const fat = l.faturamento;
                const valor = fat?.valor ?? l.calculo?.valor ?? null;
                const primeira = dados.primeiraEntrada[`${l.empresaId}|${l.depositanteId}`] ?? null;
                return (
                  <TableRow key={l.chave}>
                    <TableCell className="max-w-72 min-w-52 pl-3 whitespace-normal">
                      <span className="block text-sm font-medium">{l.depositante}</span>
                      <span className="block text-xs text-muted-foreground">
                        {l.documento ? fmtDocumento(l.documento) : ""}
                        {varios ? ` · ${l.estabelecimento}` : ""}
                      </span>
                      {l.foraPosicaoDia > 0 && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-[oklch(0.5_0.13_65)]">
                          <CircleAlert className="size-3" aria-hidden /> {l.foraPosicaoDia} {l.foraPosicaoDia === 1 ? "caixa-dia" : "caixas-dia"} fora de posição (não cobradas)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-40 text-sm whitespace-normal">
                      {l.periodo ? (
                        <>
                          <span className="whitespace-nowrap">{l.periodo.rotulo}</span>
                          <span className="block text-xs text-muted-foreground">
                            {l.periodo.tipo === "DIAS30" ? "30 dias" : "mês"}
                            {l.periodo.numero ? ` · ${l.periodo.numero}º período` : ""}
                            {l.situacao === "EM_ANDAMENTO" && l.calculo ? ` · ${l.calculo.diasContados} de ${l.calculo.diasPeriodo} dias` : ""}
                          </span>
                        </>
                      ) : (
                        <>
                          {primeira ? fmtData(primeira) : "—"}
                          <span className="block text-xs text-muted-foreground">primeira entrada · últimos 30 dias ao lado</span>
                        </>
                      )}
                    </TableCell>
                    {!faturados && !semTarifa && (
                      <TableCell className="text-sm whitespace-nowrap">
                        {l.tarifa ? (
                          <>
                            {fmtMoeda(l.tarifa.valorPosicao)}
                            <span className="block text-xs text-muted-foreground">
                              {ROTULO_METODO_CURTO[l.tarifa.metodo]}
                              {l.tarifa.minimoPosicoes ? ` · mín. ${l.tarifa.minimoPosicoes}` : ""}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    <TableCell className="min-w-36 text-right text-sm tabular-nums whitespace-normal">
                      <Apuracao l={l} />
                    </TableCell>
                    {!semTarifa && (
                      <TableCell className="min-w-28 text-right text-sm tabular-nums whitespace-normal">
                        {valor !== null ? (
                          <>
                            <span className="font-medium">{fmtMoeda(valor)}</span>
                            {l.calculo?.minimoAplicado && <span className="block text-xs text-muted-foreground">mínimo contratado</span>}
                            {l.situacao === "EM_ANDAMENTO" ? (
                              <span className="block text-xs text-muted-foreground">parcial · fatura em {fmtData(somarDias(l.periodo!.fim, 1))}</span>
                            ) : (
                              (fat?.vencimento ?? l.vencimento) && <span className="block text-xs text-muted-foreground">vence {fmtData(fat?.vencimento ?? l.vencimento!)}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-sm">
                      <SeloSituacao situacao={l.situacao} />
                      {fat?.pedido && (
                        <Link href={`/vendas/pedidos/${fat.pedido.id}`} className="mt-0.5 block text-xs text-muted-foreground hover:underline">
                          pedido nº {fmtNumeroDoc(fat.pedido.numero)}
                          {fat.titulo ? ` · ${ROTULO_TITULO[fat.titulo.status] ?? fat.titulo.status}` : ""}
                        </Link>
                      )}
                      {fat?.erro && <span className="mt-0.5 block max-w-52 text-xs text-destructive">{fat.erro}</span>}
                    </TableCell>
                    <TableCell className="pr-3">
                      <span className="flex items-center justify-end gap-1">
                        {podeFaturar && l.situacao === "PENDENTE" && l.calculo && l.periodo && (
                          <BotaoFaturar empresaId={l.empresaId} depositanteId={l.depositanteId} periodoInicio={l.periodo.inicio} depositante={l.depositante} valor={l.calculo.valor} />
                        )}
                        {podeFaturar && opcoes && semTarifa && !l.tarifa && (
                          <BotaoNovaTarifa opcoes={opcoes} depositante={{ id: l.depositanteId, nome: l.depositante, empresaId: l.empresaId, inicio: primeira }} rotulo="Tarifa" tamanho="sm" />
                        )}
                        {semTarifa && l.tarifa && !l.tarifa.ativo && <Selo>tarifa suspensa</Selo>}
                        <MenuLinhaFaturamento
                          depositante={l.depositante}
                          rotulo={l.periodo ? l.periodo.rotulo : "últimos 30 dias"}
                          csv={csv(l)}
                          dias={l.dias}
                          faturamento={fat ? { id: fat.id, pedidoId: fat.pedido?.id ?? null } : null}
                          podeFaturar={podeFaturar}
                        />
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 py-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Tarifas</CardTitle>
            <CardDescription>Preço por palete de cada cliente. O faturamento guarda a tarifa usada: mudar o preço não muda o que já foi faturado.</CardDescription>
          </div>
          {podeFaturar && opcoes && <BotaoNovaTarifa opcoes={opcoes} />}
        </CardHeader>
        {dados.tarifas.length === 0 ? (
          <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma tarifa cadastrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-4">Depositante</TableHead>
                <TableHead className="text-right">Por palete</TableHead>
                <TableHead>Como conta</TableHead>
                <TableHead>Período e vencimento</TableHead>
                <TableHead>Serviço (NFS-e)</TableHead>
                <TableHead className="pr-4 text-right">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.tarifas.map((t) => (
                <TableRow key={t.id} className={t.ativo ? undefined : "opacity-60"}>
                  <TableCell className="max-w-64 min-w-48 pl-4 whitespace-normal">
                    <span className="block text-sm font-medium">
                      {t.depositante} {!t.ativo && <Selo className="ml-1">Suspensa</Selo>}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      desde {fmtData(t.inicio)}
                      {t.ultimoFaturado ? ` · faturada até ${fmtData(t.ultimoFaturado)}` : ""}
                      {varios ? ` · ${t.estabelecimento}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {fmtMoeda(t.valorPosicao)}
                    <span className="block text-xs text-muted-foreground">{t.periodo === "DIAS30" ? "a cada 30 dias" : "por mês"}</span>
                  </TableCell>
                  <TableCell className="min-w-36 text-sm whitespace-normal">
                    {ROTULO_METODO_CURTO[t.metodo]}
                    <span className="block text-xs text-muted-foreground">
                      {[t.minimoPosicoes ? `mínimo ${t.minimoPosicoes}` : null, t.cobrarReservadas ? "reservadas contam" : "reservadas não contam"].filter(Boolean).join(" · ")}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-44 text-sm whitespace-normal">
                    <span className="flex items-center gap-1">
                      <CalendarClock className="size-3.5 text-muted-foreground" aria-hidden /> {t.periodo === "DIAS30" ? "30 dias, vencido" : "mês, vencido"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      vence {t.prazoPagamento} {t.prazoPagamento === 1 ? "dia" : "dias"} após o período · {t.gerarCobranca ? "com boleto/Pix" : "sem boleto/Pix"}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-sm">{t.produto ?? <span className="text-[oklch(0.5_0.13_65)]">sem serviço: a NFS-e não sai</span>}</TableCell>
                  <TableCell className="pr-4 text-right">{podeFaturar && opcoes && <AcoesTarifa tarifa={t} opcoes={opcoes} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
