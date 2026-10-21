import Link from "next/link";
import { Calendar, CalendarClock, CircleCheck, TriangleAlert, Wallet } from "lucide-react";
import { addDias } from "@/lib/datas";
import { fmtMoeda, fmtMesAno } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TEXTOS, type FiltrosTitulos, type ResumoTitulos, type TipoTitulo } from "./tipos";

/** Cartões de resumo da lista de títulos; cada cartão aplica o filtro correspondente. */
export function CartoesResumo({
  tipo,
  resumo,
  filtros,
  hoje,
}: {
  tipo: TipoTitulo;
  resumo: ResumoTitulos;
  filtros: FiltrosTitulos;
  hoje: string;
}) {
  const rota = TEXTOS[tipo].rota;
  const amanha = addDias(hoje, 1);
  const em7 = addDias(hoje, 7);
  const semOutros = !filtros.q && !filtros.categoria && !filtros.conta;
  const semDatas = !filtros.de && !filtros.ate;
  const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
  const cartoes = [
    {
      chave: "aberto",
      titulo: "Em aberto",
      icone: Wallet,
      valor: resumo.aberto.valor,
      detalhe: plural(resumo.aberto.qtd, "título", "títulos"),
      href: rota,
      ativo: filtros.status === "abertos" && semDatas && semOutros,
      cor: "",
    },
    {
      chave: "vencido",
      titulo: "Vencido",
      icone: TriangleAlert,
      valor: resumo.vencido.valor,
      detalhe: plural(resumo.vencido.qtd, "título", "títulos"),
      href: `${rota}?status=vencidos`,
      ativo: filtros.status === "vencidos" && semDatas && semOutros,
      cor: resumo.vencido.valor > 0 ? "text-destructive" : "",
    },
    {
      chave: "hoje",
      titulo: "Vence hoje",
      icone: CalendarClock,
      valor: resumo.venceHoje.valor,
      detalhe: plural(resumo.venceHoje.qtd, "título", "títulos"),
      href: `${rota}?de=${hoje}&ate=${hoje}`,
      ativo: filtros.status === "abertos" && filtros.de === hoje && filtros.ate === hoje && semOutros,
      cor: resumo.venceHoje.valor > 0 ? "text-[oklch(0.5_0.13_65)] dark:text-warning" : "",
    },
    {
      chave: "proximos",
      titulo: "Próximos 7 dias",
      icone: Calendar,
      valor: resumo.proximos7.valor,
      detalhe: plural(resumo.proximos7.qtd, "título", "títulos"),
      href: `${rota}?de=${amanha}&ate=${em7}`,
      ativo: filtros.status === "abertos" && filtros.de === amanha && filtros.ate === em7 && semOutros,
      cor: "",
    },
    {
      chave: "quitado",
      titulo: "Quitado no mês",
      icone: CircleCheck,
      valor: resumo.quitadoMes.valor,
      detalhe: `${plural(resumo.quitadoMes.qtd, "baixa", "baixas")} em ${fmtMesAno(hoje)} · ${tipo === "RECEBER" ? "recebido" : "pago"}`,
      href: `${rota}?status=quitados`,
      ativo: filtros.status === "quitados" && semDatas && semOutros,
      cor: resumo.quitadoMes.valor > 0 ? (tipo === "RECEBER" ? "text-success" : "text-destructive") : "",
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {cartoes.map((c) => (
        <Link
          key={c.chave}
          href={c.href}
          scroll={false}
          aria-current={c.ativo ? "true" : undefined}
          className={cn(
            "group rounded-xl border bg-card p-4 shadow-sm outline-none transition hover:border-primary/40 hover:shadow focus-visible:ring-[3px] focus-visible:ring-ring/50",
            c.ativo && "border-primary/60 ring-1 ring-primary/25",
          )}
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
            <span>{c.titulo}</span>
            <c.icone className="size-4 opacity-60 transition group-hover:opacity-100" />
          </div>
          <div className={cn("mt-1.5 truncate text-xl font-semibold tracking-tight tabular", c.cor)}>{fmtMoeda(c.valor)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{c.detalhe}</div>
        </Link>
      ))}
    </div>
  );
}
