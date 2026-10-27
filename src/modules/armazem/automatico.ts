// Faturamento automático da armazenagem (rotina diária): fatura os períodos vencidos das tarifas com "Faturar sozinho"
// e manda aos administradores de cada empresa um resumo do que gerou e do que deu erro. Sem sessão; só servidor.
import "server-only";
import { prisma } from "@/lib/db";
import { auditar } from "@/lib/auditoria";
import { hojeISO } from "@/lib/datas";
import { fmtMoeda } from "@/lib/format";
import { enfileirar } from "@/modules/email/fila";
import { modeloArmazenagemAutomatica } from "@/modules/email/modelos";
import { fmtNumeroDoc } from "@/modules/vendas/calculos";
import { carregarFaturamento, gerarFaturamentoArmazem } from "./faturamento";
import { dataBr, resumoApuracao } from "./tipos";

type Gerado = { cliente: string; periodo: string; resumo: string; valor: string; vencimento: string; pedido: string; cobranca: string };
type Falha = { cliente: string; periodo: string; erro: string };

/**
 * Fatura os períodos vencidos (com valor a cobrar) das tarifas ativas com "Faturar sozinho". Pode rodar todo dia:
 * o que já foi faturado não se repete, e o que falhou é tentado de novo no dia seguinte. Um e-mail por empresa e por dia.
 */
export async function faturarArmazenagemAutomatica(p: { urlBase: string }) {
  const hoje = hojeISO();
  const ids = [...new Set((await prisma.tarifaArmazem.findMany({ where: { ativo: true, faturarAutomatico: true }, select: { empresaId: true } })).map((t) => t.empresaId))];
  if (!ids.length) return { dia: hoje, pendentes: 0, gerados: 0, erros: 0, avisos: 0 };
  const dados = await carregarFaturamento({ aba: "pendentes", estab: "", depositante: "" }, ids);
  const pendentes = dados.linhas.filter((l) => l.situacao === "PENDENTE" && l.periodo && l.tarifa?.ativo && l.tarifa.faturarAutomatico);
  const empresas = await prisma.empresa.findMany({ where: { id: { in: ids } }, select: { id: true, matrizId: true } });
  const matrizDe = (empresaId: string) => empresas.find((e) => e.id === empresaId)?.matrizId ?? empresaId;
  const porMatriz = new Map<string, { gerados: Gerado[]; erros: Falha[]; total: number }>();
  const grupo = (empresaId: string) => {
    const m = matrizDe(empresaId);
    if (!porMatriz.has(m)) porMatriz.set(m, { gerados: [], erros: [], total: 0 });
    return porMatriz.get(m)!;
  };
  for (const l of pendentes) {
    const periodo = l.periodo!;
    try {
      const r = await gerarFaturamentoArmazem({ empresaId: l.empresaId, depositanteId: l.depositanteId, periodoInicio: periodo.inicio, usuarioId: null, urlBase: p.urlBase });
      const resumo = resumoApuracao(l.tarifa!.metodo, r.calculo, r.periodo.fim);
      await auditar(
        "faturar_armazenagem",
        "armazem",
        r.faturamentoId,
        `Armazenagem de ${r.rotulo} · ${r.cliente} · ${resumo} · ${fmtMoeda(r.valor)} → pedido nº ${fmtNumeroDoc(r.numero)}${r.cobrancaId ? " · boleto/Pix" : ""} (faturamento automático)`,
        { periodo: r.periodo, calculo: r.calculo, automatico: true },
        { usuarioId: null, empresaId: matrizDe(l.empresaId) },
      );
      const g = grupo(l.empresaId);
      g.gerados.push({
        cliente: r.cliente,
        periodo: r.rotulo,
        resumo,
        valor: fmtMoeda(r.valor),
        vencimento: dataBr(r.vencimento),
        pedido: fmtNumeroDoc(r.numero),
        cobranca: r.cobrancaId ? "boleto/Pix enviado ao cliente, com o demonstrativo" : r.erroCobranca ? `o boleto/Pix não saiu: ${r.erroCobranca}` : "sem boleto/Pix: mande o demonstrativo pelo menu da linha",
      });
      g.total += r.valor;
    } catch (e) {
      grupo(l.empresaId).erros.push({ cliente: l.depositante, periodo: periodo.rotulo, erro: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  }
  let avisos = 0;
  for (const [matrizId, g] of porMatriz) {
    if (!g.gerados.length && !g.erros.length) continue;
    const origemId = `${matrizId}:${hoje}`;
    if (await prisma.email.findFirst({ where: { tipo: "armazenagem_automatica", origemId }, select: { id: true } })) continue;
    const [admins, matriz] = await Promise.all([
      prisma.usuario.findMany({ where: { papel: "ADMIN", ativo: true, OR: [{ todasEmpresas: true }, { empresas: { has: matrizId } }] }, select: { email: true } }),
      prisma.empresa.findUnique({ where: { id: matrizId }, select: { razaoSocial: true, nomeFantasia: true } }),
    ]);
    if (!admins.length) continue;
    await enfileirar({
      empresaId: matrizId,
      tipo: "armazenagem_automatica",
      origemId,
      para: admins.map((a) => a.email),
      ...modeloArmazenagemAutomatica({
        empresa: matriz?.nomeFantasia || matriz?.razaoSocial || "a empresa",
        data: dataBr(hoje),
        gerados: g.gerados,
        erros: g.erros,
        total: fmtMoeda(g.total),
        url: `${p.urlBase}/servicos/armazem/faturamento?aba=faturados`,
      }),
    });
    avisos++;
  }
  const todos = [...porMatriz.values()];
  return { dia: hoje, pendentes: pendentes.length, gerados: todos.reduce((a, g) => a + g.gerados.length, 0), erros: todos.reduce((a, g) => a + g.erros.length, 0), avisos };
}
