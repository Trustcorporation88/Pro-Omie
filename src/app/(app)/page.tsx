import Link from "next/link";
import {
  CalendarClock,
  ChevronRight,
  Circle,
  CircleArrowDown,
  CircleArrowUp,
  CircleCheck,
  CreditCard,
  Landmark,
  Package,
  Sparkles,
  Tags,
  Target,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Selo } from "@/components/selos";
import { NAVEGACAO } from "@/components/layout/navegacao";
import { BarrasHorizontais, CartaoKpi } from "@/components/relatorios/cartao-kpi";
import { GraficoMensal } from "@/components/relatorios/grafico-mensal";
import { exigirUsuario, type UsuarioSessao } from "@/lib/auth/sessao";
import { pode, ROTULO_PAPEL } from "@/lib/auth/permissoes";
import { diffDias, FUSO, hojeISO, isoParaDate } from "@/lib/datas";
import { fmtData, fmtMesAno, fmtMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { carregarPainel, type DadosPainel, type PrimeirosPassos } from "@/modules/relatorios/painel";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { certificadosVencendo } from "@/modules/configuracoes/certificado";
import { AVISO_CERTIFICADO_DIAS, diaSP, situacaoCertificado } from "@/modules/configuracoes/certificado-tipos";

function saudacao(): string {
  const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone: FUSO, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

function dataPorExtenso(iso: string): string {
  const s = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    isoParaDate(iso),
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function quando(hoje: string, vencimento: string): string {
  const d = diffDias(hoje, vencimento);
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  return `em ${d} dias`;
}

const titulos = (n: number) => `${n} ${n === 1 ? "título" : "títulos"}`;

function ValorMes({ v, classe }: { v: number; classe?: string }) {
  if (Math.abs(v) < 0.005) return <span className="text-muted-foreground/40">—</span>;
  return <span className={classe}>{fmtMoeda(v)}</span>;
}

export default async function PainelPage() {
  const u = await exigirUsuario();
  const hoje = hojeISO();
  const nome = u.nome.trim().split(/\s+/)[0] || u.nome;
  const cabecalho = <PageHeader titulo={`${saudacao()}, ${nome}`} descricao={dataPorExtenso(hoje)} />;

  if (!pode(u.papel, "financeiro:ver")) {
    return (
      <>
        {cabecalho}
        <BoasVindas u={u} />
      </>
    );
  }

  const [d, certificados] = await Promise.all([
    carregarPainel(hoje),
    pode(u.papel, "config:admin")
      ? escopoEmpresa()
          .then((e) => certificadosVencendo(e.ids, AVISO_CERTIFICADO_DIAS))
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const relatorios = pode(u.papel, "relatorios:ver");
  return (
    <>
      {cabecalho}
      {certificados.length > 0 && <AvisoCertificados itens={certificados} />}
      {d.primeirosPassos && <Implantacao passos={d.primeirosPassos} />}
      <Indicadores d={d} relatorios={relatorios} />
      <EntradasSaidas d={d} relatorios={relatorios} />
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <ProximosVencimentos d={d} />
        <DespesasDoMes d={d} relatorios={relatorios} />
      </div>
    </>
  );
}

// ───────────── Certificado digital vencendo ─────────────

function AvisoCertificados({ itens }: { itens: { empresa: string; validoAte: string }[] }) {
  const algumVencido = itens.some((i) => situacaoCertificado(i.validoAte).tom === "perigo");
  return (
    <div
      role="alert"
      className={cn(
        "mb-4 flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        algumVencido ? "border-destructive/40 bg-destructive/5" : "border-warning/50 bg-warning/10",
      )}
    >
      <div className="flex items-start gap-2.5">
        <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", algumVencido ? "text-destructive" : "text-[oklch(0.5_0.13_65)] dark:text-warning")} aria-hidden />
        <ul className="space-y-0.5">
          {itens.map((i) => {
            const s = situacaoCertificado(i.validoAte);
            const data = diaSP(i.validoAte);
            return (
              <li key={`${i.empresa}-${i.validoAte}`}>
                <span className="font-medium">{`Certificado digital de ${i.empresa}`}</span>
                {s.tom === "perigo" ? ` venceu em ${data}: sem ele não dá para emitir notas.` : ` vence em ${data} (${s.dias <= 1 ? "em até 1 dia" : `${s.dias} dias`}).`}
              </li>
            );
          })}
        </ul>
      </div>
      <Link href="/configuracoes/empresa" className="shrink-0 font-medium text-primary hover:underline">
        Enviar o renovado
      </Link>
    </div>
  );
}

// ───────────── Usuário sem acesso ao financeiro ─────────────

const ICONES_CADASTRO: Record<string, LucideIcon> = { Users, Package, Tags, Target, Wallet, CreditCard, CalendarClock };

function BoasVindas({ u }: { u: UsuarioSessao }) {
  const atalhos = (NAVEGACAO.find((g) => g.titulo === "Cadastros")?.itens ?? []).filter(
    (i) => !i.emBreve && (!i.permissao || pode(u.papel, i.permissao)),
  );
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle>Bem-vindo ao Pro Omie</CardTitle>
        <CardDescription>
          Perfil {ROTULO_PAPEL[u.papel]}. {atalhos.length ? "Estes são os cadastros liberados para você:" : "Ainda não há módulos liberados para o seu perfil."}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        {atalhos.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {atalhos.map((a) => {
              const Icone = ICONES_CADASTRO[a.icone] ?? ChevronRight;
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <span className="rounded-md bg-primary/10 p-1.5 text-primary">
                    <Icone className="size-4" />
                  </span>
                  <span className="font-medium">{a.titulo}</span>
                  <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Fale com um administrador para liberar o acesso.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────── Implantação (enquanto não há títulos) ─────────────

function Implantacao({ passos }: { passos: PrimeirosPassos }) {
  const itens = [
    { feito: passos.contas, titulo: "Cadastrar contas bancárias", descricao: "Bancos e caixa com o saldo inicial.", href: "/cadastros/contas-bancarias" },
    { feito: passos.pessoas, titulo: "Clientes e fornecedores", descricao: "Quem paga e quem recebe.", href: "/cadastros/pessoas" },
    { feito: passos.categorias, titulo: "Revisar categorias", descricao: "Plano de contas e grupos da DRE.", href: "/cadastros/categorias" },
    { feito: passos.lancamento, titulo: "Lançar a primeira conta", descricao: "Uma conta a receber ou a pagar.", href: "/financeiro/receber" },
    { feito: passos.extrato, titulo: "Importar o extrato OFX", descricao: "Concilie com o banco.", href: "/financeiro/conciliacao" },
  ];
  const feitos = itens.filter((i) => i.feito).length;
  const pct = Math.round((feitos / itens.length) * 100);
  return (
    <Card className="mb-4 gap-3 border-primary/30 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-primary" /> Primeiros passos
        </CardTitle>
        <CardDescription className="text-xs">
          Conclua a implantação para os indicadores ganharem vida · {feitos} de {itens.length} concluídos
        </CardDescription>
        <CardAction className="text-xs font-medium text-muted-foreground tabular">{pct}%</CardAction>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <Progress value={pct} className="h-1.5" />
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {itens.map((i, n) => (
            <li key={i.href}>
              <Link
                href={i.href}
                className="flex h-full items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                {i.feito ? (
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                )}
                <span>
                  <span className={cn("block text-sm font-medium", i.feito && "text-muted-foreground line-through")}>
                    {n + 1}. {i.titulo}
                  </span>
                  <span className="block text-xs text-muted-foreground">{i.descricao}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

// ───────────── Indicadores ─────────────

function Indicadores({ d, relatorios }: { d: DadosPainel; relatorios: boolean }) {
  const contas = [...d.saldos.contas].sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
  const faixa = `de=${d.hoje}&ate=${d.ate7}`;
  const { atrasados: at } = d;
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="gap-1 px-4 py-3.5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Saldo em contas</span>
          <span className="rounded-md bg-primary/10 p-1 text-primary">
            <Landmark className="size-3.5" />
          </span>
        </div>
        <div className={cn("text-xl font-semibold tracking-tight tabular", d.saldos.total < 0 && "text-destructive")}>{fmtMoeda(d.saldos.total)}</div>
        {contas.length ? (
          <ul className="mt-0.5 space-y-0.5 text-xs">
            {contas.slice(0, 4).map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-2">
                <span className="truncate text-muted-foreground" title={c.nome}>
                  {c.nome}
                </span>
                <span className={cn("shrink-0 tabular", c.saldo < 0 && "text-destructive")}>{fmtMoeda(c.saldo)}</span>
              </li>
            ))}
            {contas.length > 4 && <li className="text-muted-foreground">+ {contas.length - 4} contas</li>}
          </ul>
        ) : (
          <Link href="/cadastros/contas-bancarias" className="text-xs text-primary hover:underline">
            Cadastrar conta bancária
          </Link>
        )}
        {relatorios && contas.length > 0 && (
          <Link href="/financeiro/fluxo-de-caixa" className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
            Fluxo de caixa <ChevronRight className="size-3" />
          </Link>
        )}
      </Card>

      <CartaoKpi
        titulo="A receber · hoje e 7 dias"
        valor={fmtMoeda(d.receber.total)}
        icone={CircleArrowDown}
        tom="sucesso"
        tomValor={d.receber.total > 0 ? "sucesso" : "neutro"}
        href={`/financeiro/receber?status=abertos&${faixa}`}
      >
        Hoje <span className="tabular">{fmtMoeda(d.receber.hoje)}</span> · {titulos(d.receber.quantidade)}
        <br />
        Até {fmtData(d.ate7)}
      </CartaoKpi>

      <CartaoKpi
        titulo="A pagar · hoje e 7 dias"
        valor={fmtMoeda(d.pagar.total)}
        icone={CircleArrowUp}
        tom="perigo"
        tomValor={d.pagar.total > 0 ? "perigo" : "neutro"}
        href={`/financeiro/pagar?status=abertos&${faixa}`}
      >
        Hoje <span className="tabular">{fmtMoeda(d.pagar.hoje)}</span> · {titulos(d.pagar.quantidade)}
        <br />
        Até {fmtData(d.ate7)}
      </CartaoKpi>

      <Card className="gap-1 px-4 py-3.5 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Em atraso</span>
          <span className="rounded-md bg-warning/15 p-1 text-[oklch(0.5_0.13_65)] dark:text-warning">
            <TriangleAlert className="size-3.5" />
          </span>
        </div>
        <Link
          href="/financeiro/receber?status=vencidos"
          className="-mx-1.5 flex items-baseline justify-between gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent/60"
        >
          <span className="text-xs text-muted-foreground">
            A receber · {titulos(at.qtdReceber)}
          </span>
          <span className={cn("text-base font-semibold tabular", at.receber > 0 && "text-[oklch(0.5_0.13_65)] dark:text-warning")}>
            {fmtMoeda(at.receber)}
          </span>
        </Link>
        <Link
          href="/financeiro/pagar?status=vencidos"
          className="-mx-1.5 flex items-baseline justify-between gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent/60"
        >
          <span className="text-xs text-muted-foreground">A pagar · {titulos(at.qtdPagar)}</span>
          <span className={cn("text-base font-semibold tabular", at.pagar > 0 && "text-destructive")}>{fmtMoeda(at.pagar)}</span>
        </Link>
      </Card>
    </div>
  );
}

// ───────────── Entradas × saídas ─────────────

function EntradasSaidas({ d, relatorios }: { d: DadosPainel; relatorios: boolean }) {
  const temMovimento = d.meses.some((m) => m.entradas || m.saidas);
  const total = d.meses.reduce((a, m) => a + m.resultado, 0);
  return (
    <Card className="mb-4 gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Entradas × saídas — últimos 6 meses</CardTitle>
        <CardDescription className="text-xs">Realizado nas contas, sem transferências entre contas.</CardDescription>
        {relatorios && (
          <CardAction>
            <Link href="/financeiro/fluxo-de-caixa?agrupamento=mes" className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
              Fluxo de caixa <ChevronRight className="size-3" />
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        {temMovimento ? (
          <GraficoMensal pontos={d.meses} />
        ) : (
          <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            Nenhum pagamento ou recebimento nos últimos 6 meses.
          </div>
        )}
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 w-24 text-xs text-muted-foreground" />
              {d.meses.map((m) => (
                <TableHead key={m.mes} className="h-8 text-right text-xs text-muted-foreground">
                  {m.rotulo}
                </TableHead>
              ))}
              <TableHead className="h-8 text-right text-xs">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular">
            <TableRow className="hover:bg-transparent">
              <TableCell className="py-1.5 text-muted-foreground">Entradas</TableCell>
              {d.meses.map((m) => (
                <TableCell key={m.mes} className="py-1.5 text-right">
                  <ValorMes v={m.entradas} classe="text-success" />
                </TableCell>
              ))}
              <TableCell className="py-1.5 text-right font-medium text-success">{fmtMoeda(d.meses.reduce((a, m) => a + m.entradas, 0))}</TableCell>
            </TableRow>
            <TableRow className="hover:bg-transparent">
              <TableCell className="py-1.5 text-muted-foreground">Saídas</TableCell>
              {d.meses.map((m) => (
                <TableCell key={m.mes} className="py-1.5 text-right">
                  <ValorMes v={m.saidas} classe="text-destructive" />
                </TableCell>
              ))}
              <TableCell className="py-1.5 text-right font-medium text-destructive">{fmtMoeda(d.meses.reduce((a, m) => a + m.saidas, 0))}</TableCell>
            </TableRow>
            <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
              <TableCell className="py-1.5">Resultado</TableCell>
              {d.meses.map((m) => (
                <TableCell key={m.mes} className="py-1.5 text-right">
                  <ValorMes v={m.resultado} classe={m.resultado < 0 ? "text-destructive" : undefined} />
                </TableCell>
              ))}
              <TableCell className={cn("py-1.5 text-right font-semibold", total < 0 && "text-destructive")}>{fmtMoeda(total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ───────────── Despesas do mês ─────────────

function DespesasDoMes({ d, relatorios }: { d: DadosPainel; relatorios: boolean }) {
  const mes = fmtMesAno(d.despesas.mes);
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Despesas do mês por categoria</CardTitle>
        <CardDescription className="text-xs">
          Competência {mes} · total <span className="tabular">{fmtMoeda(d.despesas.total)}</span>
        </CardDescription>
        {relatorios && (
          <CardAction>
            <Link href="/financeiro/dre" className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
              DRE <ChevronRight className="size-3" />
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="px-4">
        {d.despesas.categorias.length ? (
          <BarrasHorizontais itens={d.despesas.categorias.map((c) => ({ nome: c.nome, valor: c.valor, apagado: c.outras }))} />
        ) : (
          <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground">
            Nenhuma despesa com competência em {mes}.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────── Próximos vencimentos ─────────────

function ProximosVencimentos({ d }: { d: DadosPainel }) {
  return (
    <Card className="gap-0 overflow-hidden py-0 lg:col-span-2">
      <CardHeader className="border-b px-4 py-3 [.border-b]:pb-3">
        <CardTitle className="text-sm">Próximos vencimentos</CardTitle>
        <CardDescription className="text-xs">Os 10 próximos títulos em aberto, a receber e a pagar.</CardDescription>
        <CardAction className="flex gap-3 text-xs font-medium">
          <Link href="/financeiro/receber?status=abertos" className="text-primary hover:underline">
            A receber
          </Link>
          <Link href="/financeiro/pagar?status=abertos" className="text-primary hover:underline">
            A pagar
          </Link>
        </CardAction>
      </CardHeader>
      {d.proximos.length ? (
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Vencimento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Pessoa</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.proximos.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="tabular">
                  {fmtData(t.vencimento)}
                  <span className={cn("ml-1.5 text-xs", t.vencimento === d.hoje ? "font-medium text-[oklch(0.5_0.13_65)] dark:text-warning" : "text-muted-foreground")}>
                    {quando(d.hoje, t.vencimento)}
                  </span>
                </TableCell>
                <TableCell>
                  <Selo tom={t.tipo === "RECEBER" ? "sucesso" : "perigo"}>{t.tipo === "RECEBER" ? "Receber" : "Pagar"}</Selo>
                </TableCell>
                <TableCell>
                  <span className="block max-w-[180px] truncate" title={t.pessoa ?? undefined}>
                    {t.pessoa ?? <span className="text-muted-foreground">—</span>}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex max-w-[320px] items-center gap-2">
                    <Link href={`/financeiro/titulos/${t.id}`} className="truncate font-medium hover:text-primary hover:underline" title={t.descricao}>
                      <span className="mr-1.5 text-xs text-muted-foreground tabular">#{t.numero}</span>
                      {t.descricao}
                    </Link>
                    {t.parcial && <Selo tom="alerta">Parcial</Selo>}
                  </div>
                </TableCell>
                <TableCell className={cn("text-right font-medium tabular", t.tipo === "RECEBER" ? "text-success" : "text-destructive")}>
                  {fmtMoeda(t.saldo)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum título em aberto com vencimento a partir de hoje.</p>
      )}
    </Card>
  );
}
