import { usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { prisma } from "@/lib/db";
import { hojeISO } from "@/lib/datas";
import { modeloPlanilha } from "@/modules/estoque/planilha";

export const dynamic = "force-dynamic";

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "empresa";

/** Modelo .xlsx da importação do estoque (?estabelecimento=ID): materiais cadastrados e o saldo atual dele. */
export async function GET(request: Request) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  if (!pode(u.papel, "estoque:ver")) return Response.json({ erro: "Sem permissão." }, { status: 403 });
  const escopo = await escopoEmpresa();
  const pedido = new URL(request.url).searchParams.get("estabelecimento");
  const estId = pedido && escopo.ids.includes(pedido) ? pedido : escopo.ativa.id;
  const [matriz, est] = await Promise.all([
    prisma.empresa.findUnique({ where: { id: escopo.ativa.id }, select: { nomeFantasia: true, razaoSocial: true } }),
    prisma.empresa.findUnique({ where: { id: estId }, select: { id: true, nomeFantasia: true, razaoSocial: true } }),
  ]);
  const empresa = matriz?.nomeFantasia || matriz?.razaoSocial || "Empresa";
  const nomeEst = est?.nomeFantasia || est?.razaoSocial || empresa;
  const hoje = hojeISO();
  const bytes = await modeloPlanilha({ matrizId: escopo.ativa.id, empresa, estabelecimento: { id: estId, nome: nomeEst }, geradoEm: hoje.split("-").reverse().join("/") });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="estoque-${slug(nomeEst)}-${hoje}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
