import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const inicio = Date.now();
  try {
    await prisma.$queryRaw`select 1`;
    return Response.json({ status: "ok", banco: "ok", ms: Date.now() - inicio });
  } catch (e) {
    console.error("[health] banco indisponível", e);
    return Response.json({ status: "degradado", banco: "erro" }, { status: 503 });
  }
}
