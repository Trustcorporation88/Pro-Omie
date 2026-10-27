import { usuarioAtual } from "@/lib/auth/sessao";
import { pode } from "@/lib/auth/permissoes";
import { fmtDocumento } from "@/lib/format";
import { num } from "@/lib/serial";
import { itensParaCsv } from "@/modules/armazem/consultas";
import { codigoVolume } from "@/modules/armazem/tipos";

export const dynamic = "force-dynamic";

const celula = (v: string | number | null | undefined) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000).replace(".", ",") : "";
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/** CSV dos itens armazenados (mesmos filtros da tela: q, depositante, estab). */
export async function GET(request: Request) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  if (!pode(u.papel, "armazem:ver")) return Response.json({ erro: "Sem permissão." }, { status: 403 });
  const url = new URL(request.url);
  const lista = await itensParaCsv({ q: (url.searchParams.get("q") ?? "").trim().slice(0, 100), depositante: url.searchParams.get("depositante") ?? "", estab: url.searchParams.get("estab") ?? "" });
  const cab = ["Depositante", "CNPJ/CPF", "Código", "Descrição", "NCM", "Lote", "Quantidade", "Unidade", "Valor unitário", "Volume", "Ref. do depositante", "Endereço", "Recebimento", "Chegada", "NF-e", "Estabelecimento"];
  const linhas = lista.map((c) => [
    c.volume.depositante.nome,
    c.volume.depositante.documento ? fmtDocumento(c.volume.depositante.documento) : "",
    c.produto.codigo,
    c.produto.descricao,
    c.produto.ncm ?? "",
    c.lote,
    num(c.quantidade),
    c.produto.unidade,
    c.produto.valorUnitario === null ? "" : num(c.produto.valorUnitario),
    codigoVolume(c.volume.tipo, c.volume.numero),
    c.volume.referenciaDepositante ?? "",
    c.volume.endereco?.codigo ?? "",
    `REC-${String(c.recebimento.numero).padStart(4, "0")}`,
    c.recebimento.chegadaEm.toISOString().slice(0, 10).split("-").reverse().join("/"),
    c.recebimento.documentos.filter((d) => d.tipo === "NFE").map((d) => d.numero).join(", "),
    c.volume.empresa.nomeFantasia || c.volume.empresa.razaoSocial,
  ]);
  const corpo = Buffer.from(`\uFEFF${[cab, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n")}`, "utf8");
  return new Response(corpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="itens-armazenados.csv"`, "Cache-Control": "private, no-store" },
  });
}
