import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";

export const dynamic = "force-dynamic";

// PDF e imagens abrem no navegador; o resto é baixado.
const INLINE = /^(application\/pdf|image\/(png|jpeg|webp))$/;

/** Nome ASCII de fallback para navegadores antigos (sem acentos, aspas ou barras). */
function nomeAscii(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\/;]/g, "_")
      .trim() || "anexo"
  );
}

/** Codificação RFC 5987 (filename*=UTF-8''...). */
function rfc5987(valor: string): string {
  return encodeURIComponent(valor).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  if (!pode(u.papel, "financeiro:ver")) return Response.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const anexo = await prisma.anexo.findUnique({
    where: { id },
    select: { nome: true, mimeType: true, dados: true },
  });
  if (!anexo || !anexo.dados) return Response.json({ erro: "Anexo não encontrado." }, { status: 404 });

  const forcarDownload = new URL(request.url).searchParams.get("download") === "1";
  const disposicao = INLINE.test(anexo.mimeType) && !forcarDownload ? "inline" : "attachment";
  const bytes = anexo.dados;

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": anexo.mimeType || "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${disposicao}; filename="${nomeAscii(anexo.nome)}"; filename*=UTF-8''${rfc5987(anexo.nome)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
