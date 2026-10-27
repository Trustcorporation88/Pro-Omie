import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { fmtDocumento } from "@/lib/format";
import { hojeISO } from "@/lib/datas";
import { ocupacaoDoIntervalo } from "@/modules/armazem/faturamento";
import { diasNoMes, ehCompetencia, ehDataISO } from "@/modules/armazem/tipos";

export const dynamic = "force-dynamic";

const celula = (v: string | number | null | undefined) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v).replace(".", ",") : "";
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const ORIGEM: Record<string, string> = { FOTOGRAFIA: "fotografia do dia", REPETIDO: "repetiu o dia anterior", SEM_DADOS: "sem dados" };

/** Extrato da ocupação dia a dia (CSV): ?de=AAAA-MM-DD&ate=AAAA-MM-DD (ou ?competencia=AAAA-MM)[&depositante=ID][&estab=ID]. */
export async function GET(request: Request) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  if (!pode(u.papel, "armazem:ver")) return Response.json({ erro: "Sem permissão." }, { status: 403 });
  const url = new URL(request.url);
  const competencia = url.searchParams.get("competencia") ?? "";
  let de = url.searchParams.get("de") ?? "";
  let ate = url.searchParams.get("ate") ?? "";
  if (ehCompetencia(competencia)) {
    de = `${competencia}-01`;
    ate = `${competencia}-${String(diasNoMes(competencia)).padStart(2, "0")}`;
  }
  if (!ehDataISO(de) || !ehDataISO(ate) || de > ate) return Response.json({ erro: "Informe o período: de e ate (AAAA-MM-DD) ou competencia (AAAA-MM)." }, { status: 400 });
  const escopo = await escopoEmpresa();
  const estab = url.searchParams.get("estab");
  const depositante = url.searchParams.get("depositante");
  const ids = estab && escopo.ids.includes(estab) ? [estab] : escopo.ids;
  const hoje = hojeISO();
  if (ate > hoje) ate = hoje;
  const ocupacao = de > ate ? new Map() : await ocupacaoDoIntervalo(ids, de, ate);
  const deps = new Set<string>();
  for (const m of ocupacao.values()) for (const d of m.keys()) if (!depositante || d === depositante) deps.add(d);
  const [pessoas, empresas] = await Promise.all([
    prisma.pessoa.findMany({ where: { id: { in: [...deps] }, empresaId: escopo.ativa.id }, select: { id: true, nome: true, documento: true } }),
    prisma.empresa.findMany({ where: { id: { in: ids } }, select: { id: true, razaoSocial: true, nomeFantasia: true } }),
  ]);
  const pessoa = new Map(pessoas.map((p) => [p.id, p]));
  const cab = ["Estabelecimento", "Depositante", "CNPJ/CPF", "Data", "Posições ocupadas", "Reservadas vazias", "Volumes", "Volumes fora de posição", "Endereços", "Origem"];
  const linhas: (string | number)[][] = [];
  for (const [empresaId, m] of ocupacao) {
    const e = empresas.find((x) => x.id === empresaId);
    for (const [dep, dias] of m) {
      const p = pessoa.get(dep);
      if (!p || (depositante && dep !== depositante)) continue;
      if (!dias.some((d: { posicoes: number; reservadasVazias: number; volumes: number }) => d.posicoes || d.reservadasVazias || d.volumes)) continue;
      for (const d of dias)
        linhas.push([e ? e.nomeFantasia || e.razaoSocial : "", p.nome, p.documento ? fmtDocumento(p.documento) : "", d.dia.split("-").reverse().join("/"), d.posicoes, d.reservadasVazias, d.volumes, d.volumesForaPosicao, d.enderecos.join(" "), ORIGEM[d.origem] ?? d.origem]);
    }
  }
  const corpo = Buffer.from(`\uFEFF${[cab, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n")}`, "utf8");
  return new Response(corpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ocupacao-armazem-${de}-a-${ate}.csv"`, "Cache-Control": "private, no-store" },
  });
}
