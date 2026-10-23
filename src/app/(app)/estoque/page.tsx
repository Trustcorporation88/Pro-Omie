import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, BarChart3, Boxes, PackageOpen, Plus, Scale, ShoppingCart, SlidersHorizontal, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, CampoBusca, SelectFiltro } from "@/components/filtros";
import { CartaoKpi } from "@/components/relatorios/cartao-kpi";
import { Selo } from "@/components/selos";
import { BotaoAtualizarPrecos, BotaoMateriaisPadrao } from "@/components/estoque/dialogos-materiais";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { diffDias, hojeISO } from "@/lib/datas";
import { fmtData, fmtMoeda } from "@/lib/format";
import { carregarSaldos, lerFiltrosSaldo } from "@/modules/estoque/consultas";
import { GRUPOS_MATERIAL, MATERIAIS_PADRAO, fmtPeso, fmtQtd, rotuloGrupo, type LinhaSaldo } from "@/modules/estoque/tipos";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Estoque" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/** "há 12 dias", "hoje", ou a data. */
function haQuanto(iso: string, hoje: string) {
  const d = diffDias(iso, hoje);
  if (d <= 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 60) return `há ${d} dias`;
  return fmtData(iso);
}

export default async function Pagina({ searchParams }: Props) {
  const u = await exigirUsuario("estoque:ver");
  const f = lerFiltrosSaldo(await searchParams);
  const { linhas, estabelecimentos, totais, entradasMesKg, vendidoMes } = await carregarSaldos(f);
  const hoje = hojeISO();
  const podeEditar = pode(u.papel, "estoque:editar");
  const podeVender = pode(u.papel, "vendas:editar");
  const podePrecos = pode(u.papel, "cadastros:editar");
  const codigos = linhas.map((l) => l.codigo);
  const faltamPadrao = MATERIAIS_PADRAO.some((m) => !codigos.includes(m.codigo));

  if (totais.materiais === 0) {
    return (
      <>
        <PageHeader titulo="Estoque" descricao="Materiais no pátio: a produção entra por aqui e a venda faturada dá baixa sozinha." />
        <EstadoVazio
          titulo="Nenhum material cadastrado"
          descricao="Escolha os recicláveis que a empresa vende (papel, papelão, plástico, alumínio, ferro, cobre, prata e outros). Cada um vira um produto vendido por kg, com saldo próprio."
        >
          {podeEditar && <BotaoMateriaisPadrao codigosExistentes={[]} destaque rotulo="Escolher materiais" />}
        </EstadoVazio>
      </>
    );
  }

  const grupos: { grupo: string | null; itens: LinhaSaldo[] }[] = [];
  for (const l of linhas) {
    const g = grupos[grupos.length - 1];
    if (g && g.grupo === l.grupo) g.itens.push(l);
    else grupos.push({ grupo: l.grupo, itens: [l] });
  }

  return (
    <>
      <PageHeader titulo="Estoque" descricao="Materiais no pátio: a produção entra por aqui e a venda faturada dá baixa sozinha.">
        {podePrecos && <BotaoAtualizarPrecos materiais={linhas.filter((l) => l.ativo)} />}
        {podeEditar && (
          <Button variant="outline" asChild>
            <Link href="/estoque/ajuste">
              <SlidersHorizontal /> Ajustar
            </Link>
          </Button>
        )}
        {podeEditar && (
          <Button asChild>
            <Link href="/estoque/entradas/nova">
              <Plus /> Nova entrada
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoKpi titulo="Em estoque" valor={fmtPeso(totais.pesoKg)} icone={Scale} tom="info">
          {plural(totais.comSaldo, "material com saldo", "materiais com saldo")}
        </CartaoKpi>
        <CartaoKpi titulo="Valor estimado" valor={fmtMoeda(totais.valor)} icone={Wallet} tom="sucesso">
          {totais.semPreco ? <span className="text-[oklch(0.5_0.13_65)] dark:text-warning">{plural(totais.semPreco, "material sem preço", "materiais sem preço")}</span> : "saldo × preço de venda"}
        </CartaoKpi>
        <CartaoKpi titulo="Entrou no mês" valor={fmtPeso(entradasMesKg)} icone={ArrowDownToLine} href="/estoque/movimentacoes?tipo=entrada">
          produção e triagem
        </CartaoKpi>
        <CartaoKpi titulo="Vendido no mês" valor={fmtPeso(vendidoMes.kg)} icone={ShoppingCart} tom="roxo" href="/estoque/vendas">
          {fmtMoeda(vendidoMes.valor)} faturados
        </CartaoKpi>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <AbasFiltro
            parametro="saldo"
            padrao="todos"
            opcoes={[
              { valor: "todos", rotulo: "Todos" },
              { valor: "com", rotulo: "Com saldo" },
            ]}
          />
          {estabelecimentos.length > 1 && (
            <SelectFiltro
              parametro="estab"
              rotuloTodos="Todos os estabelecimentos"
              opcoes={estabelecimentos.map((e) => ({ valor: e.id, rotulo: `${e.nome}${e.matriz ? " (matriz)" : ""}` }))}
            />
          )}
          <SelectFiltro
            parametro="grupo"
            rotuloTodos="Todos os grupos"
            opcoes={[...Object.entries(GRUPOS_MATERIAL).map(([valor, rotulo]) => ({ valor, rotulo })), { valor: "SEM", rotulo: "Outros produtos" }]}
          />
        </div>
        <CampoBusca placeholder="Material ou código…" className="lg:w-64" />
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio titulo="Nada encontrado" descricao="Mude os filtros ou a busca." />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableCaption className="sr-only">Saldo de cada material</TableCaption>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-3">Material</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Valor estimado</TableHead>
                <TableHead>Última entrada</TableHead>
                <TableHead className="text-right">Vendido em 30 dias</TableHead>
                <TableHead className="w-24 pr-3">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupos.map((g) => (
                <GrupoLinhas key={g.grupo ?? "sem"} grupo={g.grupo} itens={g.itens} hoje={hoje} podeVender={podeVender} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Boxes className="size-4" aria-hidden /> {plural(totais.materiais, "material cadastrado", "materiais cadastrados")}. Outros produtos com estoque entram pelo cadastro de produtos.
        </span>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/estoque/vendas">
              <BarChart3 /> Vendas por material
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/estoque/movimentacoes">
              <PackageOpen /> Movimentações
            </Link>
          </Button>
          {podeEditar && faltamPadrao && <BotaoMateriaisPadrao codigosExistentes={codigos} rotulo="Mais materiais" discreto />}
        </div>
      </div>
    </>
  );
}

function GrupoLinhas({ grupo, itens, hoje, podeVender }: { grupo: string | null; itens: LinhaSaldo[]; hoje: string; podeVender: boolean }) {
  return (
    <>
      <TableRow className="bg-muted/20 hover:bg-muted/20">
        <TableCell colSpan={7} className="py-1.5 pl-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {rotuloGrupo(grupo)}
        </TableCell>
      </TableRow>
      {itens.map((l) => {
        const parado = l.saldo > 0 && l.ultimaEntrada && diffDias(l.ultimaEntrada, hoje) > 60;
        return (
          <TableRow key={l.id} className={cn(!l.ativo && "opacity-60")}>
            <TableCell className="pl-3">
              <Link href={`/estoque/materiais/${l.id}`} className="font-medium hover:underline">
                {l.descricao}
              </Link>
              <div className="text-xs text-muted-foreground">
                {l.codigo}
                {!l.ativo && " · inativo"}
              </div>
            </TableCell>
            <TableCell className={cn("tabular text-right font-medium", l.saldo <= 0 && "font-normal text-muted-foreground")}>{fmtQtd(l.saldo, l.unidade)}</TableCell>
            <TableCell className="tabular text-right text-sm">
              {l.precoVenda ? `${fmtMoeda(l.precoVenda)}/${l.unidade.toLowerCase()}` : <Selo tom="alerta">sem preço</Selo>}
            </TableCell>
            <TableCell className="tabular text-right">{l.saldo > 0 && l.precoVenda ? fmtMoeda(l.valorEstimado) : "—"}</TableCell>
            <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
              {l.ultimaEntrada ? haQuanto(l.ultimaEntrada, hoje) : "—"}
              {parado && <Selo tom="alerta" className="ml-1.5">parado</Selo>}
            </TableCell>
            <TableCell className="tabular text-right text-sm text-muted-foreground">{l.vendido30 ? fmtQtd(l.vendido30, l.unidade) : "—"}</TableCell>
            <TableCell className="pr-3 text-right">
              {podeVender && l.saldo > 0 && l.ativo ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/vendas/pedidos/novo?produto=${l.id}`} aria-label={`Vender ${l.descricao}`}>
                    Vender
                  </Link>
                </Button>
              ) : null}
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
