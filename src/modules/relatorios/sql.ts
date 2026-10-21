import "server-only";
import { Prisma } from "@/lib/db";

// Mesmo schema usado pelo adapter em src/lib/db.ts (padrão "erp").
const ESQUEMA = (() => {
  const s = process.env.DATABASE_SCHEMA ?? "erp";
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : "erp";
})();

type Tabela = "titulos" | "titulo_rateios" | "baixas" | "movimentos" | "categorias" | "contas_bancarias" | "centros_custo";

/** Nome de tabela qualificado com o schema do ERP, para uso dentro de prisma.$queryRaw`...`. */
export function tabela(nome: Tabela) {
  return Prisma.raw(`"${ESQUEMA}"."${nome}"`);
}
