import { usuarioAtual, ErroAcao } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { dadosDemonstrativo, gerarDemonstrativoPdf, nomeArquivoDemonstrativo } from "@/modules/armazem/demonstrativo";
import { ehDataISO } from "@/modules/armazem/tipos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Demonstrativo da armazenagem em PDF: ?faturamento=<id> (o faturado) ou ?estab=&depositante=&inicio=AAAA-MM-DD (a prévia
 * do período ainda não faturado). Abre no navegador; o nome do arquivo vem pronto para salvar.
 */
export async function GET(request: Request) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  if (!pode(u.papel, "armazem:ver")) return Response.json({ erro: "Sem permissão." }, { status: 403 });
  const url = new URL(request.url);
  const faturamento = url.searchParams.get("faturamento");
  const estab = url.searchParams.get("estab") ?? "";
  const depositante = url.searchParams.get("depositante") ?? "";
  const inicio = url.searchParams.get("inicio") ?? "";
  if (!faturamento && (!estab || !depositante || !ehDataISO(inicio))) {
    return Response.json({ erro: "Informe o faturamento, ou o estabelecimento, o depositante e o início do período (AAAA-MM-DD)." }, { status: 400 });
  }
  const escopo = await escopoEmpresa();
  try {
    const d = await dadosDemonstrativo(faturamento ? { faturamentoId: faturamento } : { empresaId: estab, depositanteId: depositante, periodoInicio: inicio }, escopo.ids);
    const pdf = await gerarDemonstrativoPdf(d);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `inline; filename="${nomeArquivoDemonstrativo(d)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ErroAcao) return Response.json({ erro: e.message }, { status: 404 });
    throw e;
  }
}
