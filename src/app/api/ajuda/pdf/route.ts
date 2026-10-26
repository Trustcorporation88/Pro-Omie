import { usuarioAtual } from "@/lib/auth/sessao";
import { ROTULO_PAPEL } from "@/lib/auth/permissoes";
import { hojeISO } from "@/lib/datas";
import { MANUAL } from "@/modules/ajuda/conteudo";
import { podeVerSecao } from "@/modules/ajuda/tipos";
import { gerarManualPdf } from "@/modules/ajuda/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Manual do usuário em PDF, com as partes que o perfil de quem baixa usa (o administrador recebe o manual completo). */
export async function GET() {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const secoes = MANUAL.filter((s) => podeVerSecao(s, u.papel));
  const pdf = await gerarManualPdf(secoes, { geradoEm: hojeISO().split("-").reverse().join("/"), perfil: ROTULO_PAPEL[u.papel] });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `attachment; filename="manual-pro-omie.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
