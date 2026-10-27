import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { escopoEmpresa } from "@/lib/auth/empresa";
import { fmtData, fmtDocumento } from "@/lib/format";
import { hojeISO } from "@/lib/datas";
import { num } from "@/lib/serial";
import { codigoVolume, normalizarCodigoEndereco } from "@/modules/armazem/tipos";
import { pdfEtiquetasEnderecos, pdfEtiquetasVolumes, type EtiquetaVolume } from "@/modules/armazem/etiquetas";

export const dynamic = "force-dynamic";

const MAX = 500;
const nome = (e: { nomeFantasia: string | null; razaoSocial: string }) => e.nomeFantasia || e.razaoSocial;

/**
 * Etiquetas em PDF.
 * ?tipo=volumes&ids=a,b | &recebimento=ID   (caixas e pallets)
 * ?tipo=enderecos&ids=a,b | &estab=ID&zona=A (endereços ativos)
 * &formato=termica (padrão: 10 x 15 cm e 10 x 5 cm) ou a4
 */
export async function GET(request: Request) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  if (!pode(u.papel, "armazem:ver")) return Response.json({ erro: "Sem permissão." }, { status: 403 });
  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");
  const formato = url.searchParams.get("formato") === "a4" ? "a4" : "termica";
  const ids = (url.searchParams.get("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, MAX);
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "") || url.origin;
  const escopo = await escopoEmpresa();

  if (tipo === "volumes") {
    const recebimento = url.searchParams.get("recebimento");
    if (!ids.length && !recebimento) return Response.json({ erro: "Informe os volumes." }, { status: 400 });
    const volumes = await prisma.volumeArmazem.findMany({
      where: {
        empresaId: { in: escopo.ids },
        ...(ids.length ? { id: { in: ids } } : { OR: [{ recebimentoId: recebimento! }, { conteudo: { some: { recebimentoId: recebimento! } } }], status: { not: "EXPEDIDO" } }),
      },
      orderBy: [{ tipo: "asc" }, { numero: "asc" }],
      take: MAX,
      include: {
        empresa: { select: { nomeFantasia: true, razaoSocial: true } },
        depositante: { select: { nome: true, nomeFantasia: true, documento: true } },
        endereco: { select: { codigo: true } },
        recebimento: { select: { numero: true, documentos: { where: { tipo: "NFE" }, select: { numero: true } } } },
        conteudo: { orderBy: [{ produto: { codigo: "asc" } }, { lote: "asc" }], include: { produto: { select: { codigo: true, descricao: true, unidade: true } } } },
      },
    });
    if (!volumes.length) return Response.json({ erro: "Nenhum volume encontrado nesta empresa." }, { status: 404 });
    const etiquetas: EtiquetaVolume[] = volumes.map((v) => ({
      id: v.id,
      tipo: v.tipo,
      codigo: codigoVolume(v.tipo, v.numero),
      estabelecimento: nome(v.empresa),
      depositante: v.depositante.nomeFantasia || v.depositante.nome,
      depositanteDocumento: v.depositante.documento ? fmtDocumento(v.depositante.documento) : null,
      recebimento: v.recebimento?.numero ?? null,
      notas: (v.recebimento?.documentos ?? []).map((d) => d.numero).filter(Boolean).join(", "),
      endereco: v.endereco?.codigo ?? null,
      referenciaDepositante: v.referenciaDepositante,
      conteudo: v.conteudo.map((c) => ({ codigo: c.produto.codigo, descricao: c.produto.descricao, lote: c.lote, quantidade: num(c.quantidade), unidade: c.produto.unidade })),
    }));
    const pdf = await pdfEtiquetasVolumes(etiquetas, { base, formato, impressoEm: fmtData(hojeISO()) });
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="etiquetas-volumes.pdf"`, "Cache-Control": "private, no-store" },
    });
  }

  if (tipo === "enderecos") {
    const estab = url.searchParams.get("estab");
    const zona = url.searchParams.get("zona");
    const enderecos = await prisma.enderecoArmazem.findMany({
      where: {
        empresaId: { in: estab && escopo.ids.includes(estab) ? [estab] : escopo.ids },
        ...(ids.length ? { id: { in: ids } } : { ativo: true, ...(zona ? { zona: normalizarCodigoEndereco(zona) } : {}) }),
      },
      orderBy: { codigo: "asc" },
      take: 2000,
      include: { empresa: { select: { nomeFantasia: true, razaoSocial: true } }, depositante: { select: { nome: true, nomeFantasia: true } } },
    });
    if (!enderecos.length) return Response.json({ erro: "Nenhum endereço encontrado nesta empresa." }, { status: 404 });
    const pdf = await pdfEtiquetasEnderecos(
      enderecos.map((e) => ({ id: e.id, codigo: e.codigo, zona: e.zona, tipo: e.tipo, estabelecimento: nome(e.empresa), reservadoPara: e.depositante ? e.depositante.nomeFantasia || e.depositante.nome : null })),
      { base, formato },
    );
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="etiquetas-enderecos.pdf"`, "Cache-Control": "private, no-store" },
    });
  }
  return Response.json({ erro: "Tipo inválido (volumes ou enderecos)." }, { status: 400 });
}
