import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_SESSAO, verificarSessao } from "@/lib/auth/jwt";

// Rotas acessíveis sem login. /api/cron confere o CRON_SECRET na própria rota (chamado pelo Cron da Vercel).
const PUBLICAS = ["/login", "/setup", "/api/health", "/api/cron"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  const sessao = await verificarSessao(request.cookies.get(COOKIE_SESSAO)?.value);
  if (!sessao) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?voltar=${encodeURIComponent(pathname + search)}` : "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|marca/|robots.txt).*)"],
};
