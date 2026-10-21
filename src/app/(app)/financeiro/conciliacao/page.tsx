import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, History, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { AbasFiltro, DataFiltro, Paginacao } from "@/components/filtros";
import { SeletorConta } from "@/components/conciliacao/seletor-conta";
import { BotaoAbrirImportacao, ImportarOfx } from "@/components/conciliacao/importar-ofx";
import { PainelRegras } from "@/components/conciliacao/painel-regras";
import { BotaoConciliarAuto } from "@/components/conciliacao/botao-conciliar-auto";
import { TabelaPendentes } from "@/components/conciliacao/tabela-pendentes";
import { TabelaConciliados, TabelaIgnorados } from "@/components/conciliacao/tabela-conciliados";
import { exigirUsuario } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { ehISOValido } from "@/lib/datas";
import { fmtData, fmtDataHora, fmtMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { carregarOpcoesFinanceiras } from "@/modules/financeiro/opcoes";
import {
  carregarConciliados,
  carregarIgnorados,
  carregarPendentes,
  carregarRegras,
  carregarResumo,
  contadoresPeriodo,
  escolherConta,
  listarContasConciliacao,
} from "@/modules/conciliacao/consultas";
import type { OpcoesConciliacao, ResumoConta } from "@/modules/conciliacao/tipos";

export const metadata: Metadata = { title: "Conciliação bancária" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const POR_PAGINA = 100;
const ABAS = ["pendentes", "conciliados", "ignorados"] as const;
type Aba = (typeof ABAS)[number];

function Indicador({
  rotulo,
  valor,
  detalhe,
  className,
}: {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-1 px-4 py-3", className)}>
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <div className="text-xl font-semibold tabular">{valor}</div>
      {detalhe && <div className="text-xs text-muted-foreground">{detalhe}</div>}
    </Card>
  );
}

function Resumo({ r }: { r: ResumoConta }) {
  const conferem = r.diferenca !== null && Math.abs(r.diferenca) < 0.005;
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Indicador
        rotulo="Saldo no sistema"
        valor={fmtMoeda(r.saldoSistemaNaData ?? r.saldoAtual)}
        detalhe={
          r.extrato?.data ? (
            <>
              em {fmtData(r.extrato.data)}
              {r.saldoSistemaNaData !== null && Math.abs(r.saldoSistemaNaData - r.saldoAtual) >= 0.005 && <> · hoje {fmtMoeda(r.saldoAtual)}</>}
            </>
          ) : (
            "saldo atual"
          )
        }
      />
      <Indicador
        rotulo="Saldo do extrato"
        valor={r.extrato ? fmtMoeda(r.extrato.saldo) : <span className="text-muted-foreground">—</span>}
        detalhe={
          r.extrato
            ? r.extrato.data
              ? `em ${fmtData(r.extrato.data)} · último OFX com saldo`
              : "último OFX com saldo"
            : "importe um OFX para comparar"
        }
      />
      <Indicador
        rotulo="Diferença (extrato − sistema)"
        className={cn(
          r.diferenca !== null && !conferem && "border-destructive/40 bg-destructive/5",
          conferem && "border-success/40 bg-success/5",
        )}
        valor={
          r.diferenca === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className={conferem ? "text-success" : "text-destructive"}>{fmtMoeda(r.diferenca)}</span>
          )
        }
        detalhe={
          r.diferenca === null ? (
            "sem saldo de extrato"
          ) : conferem ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CircleCheck className="size-3.5" /> Saldos conferem
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <TriangleAlert className="size-3.5 text-destructive" /> Concilie os pendentes ou revise os lançamentos
            </span>
          )
        }
      />
      <Indicador
        rotulo="Lançamentos do extrato"
        valor={
          <>
            {r.contadores.pendentes} <span className="text-sm font-normal text-muted-foreground">pendente(s)</span>
          </>
        }
        detalhe={`${r.contadores.conciliados} conciliado(s) · ${r.contadores.ignorados} ignorado(s)`}
      />
    </div>
  );
}

export default async function ConciliacaoPage({ searchParams }: Props) {
  const u = await exigirUsuario("financeiro:ver");
  const sp = await searchParams;
  const param = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? undefined;
  };
  const editar = pode(u.papel, "financeiro:editar");

  const contas = await listarContasConciliacao();
  const conta = escolherConta(contas, param("conta"));
  if (!conta) {
    return (
      <>
        <PageHeader titulo="Conciliação bancária" descricao="Compare o extrato do banco com os lançamentos do sistema." />
        <EstadoVazio
          titulo="Nenhuma conta bancária ativa"
          descricao="Cadastre a conta corrente da empresa para importar o extrato OFX do banco e conciliar os lançamentos."
        >
          <Button asChild>
            <Link href="/cadastros/contas-bancarias">
              <Plus /> Cadastrar conta bancária
            </Link>
          </Button>
        </EstadoVazio>
      </>
    );
  }

  const abaParam = param("status");
  const aba: Aba = (ABAS as readonly string[]).includes(abaParam ?? "") ? (abaParam as Aba) : "pendentes";
  let de = ehISOValido(param("de")) ? param("de") : undefined;
  let ate = ehISOValido(param("ate")) ? param("ate") : undefined;
  if (de && ate && de > ate) [de, ate] = [ate, de];
  const periodo = { de, ate };
  const filtrando = Boolean(de || ate);
  const pagina = Math.max(1, Number(param("pagina")) || 1);

  const [resumo, opcoesFin, regras, contPeriodo] = await Promise.all([
    carregarResumo(conta.id),
    carregarOpcoesFinanceiras(),
    carregarRegras(),
    filtrando ? contadoresPeriodo(conta.id, periodo) : Promise.resolve(null),
  ]);
  const contadores = contPeriodo ?? resumo.contadores;
  const opcoes: OpcoesConciliacao = {
    categoriasReceita: opcoesFin.categoriasReceita,
    categoriasDespesa: opcoesFin.categoriasDespesa,
    centros: opcoesFin.centros,
  };
  const semImportacao = !resumo.ultimaImportacao;

  let conteudo: React.ReactNode = null;
  let total = 0;
  let paginaAtual = pagina;
  let elegiveisAuto = 0;
  if (!semImportacao) {
    if (aba === "pendentes") {
      const r = await carregarPendentes(conta.id, periodo, pagina, POR_PAGINA);
      total = r.total;
      paginaAtual = r.pagina;
      elegiveisAuto = r.elegiveisAuto;
      conteudo =
        r.linhas.length === 0 ? (
          <EstadoVazio
            titulo={filtrando ? "Nenhum pendente no período" : "Tudo conciliado por aqui"}
            descricao={
              filtrando
                ? "Ajuste ou limpe o filtro de datas para ver os demais lançamentos."
                : "Não há lançamentos do extrato aguardando conciliação. Quando tiver um extrato novo, importe o OFX do internet banking."
            }
          />
        ) : (
          <TabelaPendentes linhas={r.linhas} opcoes={opcoes} podeEditar={editar} />
        );
    } else if (aba === "conciliados") {
      const r = await carregarConciliados(conta.id, periodo, pagina, POR_PAGINA);
      total = r.total;
      paginaAtual = r.pagina;
      conteudo =
        r.linhas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum lançamento conciliado"
            descricao={filtrando ? "Nenhum lançamento conciliado no período escolhido." : "Os lançamentos conciliados aparecem aqui, com o movimento do sistema vinculado."}
          />
        ) : (
          <TabelaConciliados linhas={r.linhas} podeEditar={editar} />
        );
    } else {
      const r = await carregarIgnorados(conta.id, periodo, pagina, POR_PAGINA);
      total = r.total;
      paginaAtual = r.pagina;
      conteudo =
        r.linhas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum lançamento ignorado"
            descricao="Ignore lançamentos que não precisam de registro no sistema (ex.: aplicações e resgates automáticos). Eles podem ser restaurados aqui."
          />
        ) : (
          <TabelaIgnorados linhas={r.linhas} podeEditar={editar} />
        );
    }
  }

  const ult = resumo.ultimaImportacao;

  return (
    <>
      <PageHeader titulo="Conciliação bancária" descricao="Importe o extrato OFX do banco e confira cada lançamento com o sistema.">
        <SeletorConta contas={contas} atual={conta.id} />
        <PainelRegras regras={regras} opcoes={opcoes} podeEditar={editar} />
        {editar && <ImportarOfx contas={contas} contaAtual={conta.id} />}
      </PageHeader>

      <Resumo r={resumo} />

      {ult && (
        <p className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <History className="size-3.5" />
          Última importação: <span className="font-medium text-foreground">{ult.arquivo}</span> em {fmtDataHora(ult.criadoEm)} ·{" "}
          {ult.novos} novo(s) de {ult.total}
          {ult.inicio && (
            <>
              {" "}
              · período {fmtData(ult.inicio)} a {fmtData(ult.fim)}
            </>
          )}
        </p>
      )}

      {semImportacao ? (
        <EstadoVazio
          titulo="Nenhum extrato importado para esta conta"
          descricao="No internet banking, exporte o extrato no formato OFX (Money/Quicken) e importe aqui. Cada lançamento do banco aparece com uma sugestão: um movimento já registrado, um título em aberto ou uma regra para criar o lançamento."
        >
          {editar && <BotaoAbrirImportacao rotulo="Importar o primeiro OFX" />}
        </EstadoVazio>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <AbasFiltro
              parametro="status"
              padrao="pendentes"
              opcoes={[
                { valor: "pendentes", rotulo: "Pendentes", contador: contadores.pendentes },
                { valor: "conciliados", rotulo: "Conciliados", contador: contadores.conciliados },
                { valor: "ignorados", rotulo: "Ignorados", contador: contadores.ignorados },
              ]}
            />
            <DataFiltro parametro="de" rotulo="De" />
            <DataFiltro parametro="ate" rotulo="Até" />
            {filtrando && (
              <Button variant="ghost" size="sm" asChild>
                <Link
                  href={`/financeiro/conciliacao?${new URLSearchParams({
                    conta: conta.id,
                    ...(aba !== "pendentes" ? { status: aba } : {}),
                  }).toString()}`}
                >
                  Limpar período
                </Link>
              </Button>
            )}
            {aba === "pendentes" && editar && <BotaoConciliarAuto contaId={conta.id} elegiveis={elegiveisAuto} className="ml-auto" />}
          </div>
          {conteudo}
          {total > 0 && <Paginacao pagina={paginaAtual} total={total} porPagina={POR_PAGINA} />}
        </>
      )}
    </>
  );
}
