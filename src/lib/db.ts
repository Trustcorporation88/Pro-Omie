import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";

/**
 * Cliente Prisma único por processo.
 * DATABASE_URL aponta para o pooler do Supabase em modo transação (porta 6543).
 * Todas as tabelas vivem no schema "erp".
 *
 * O cliente fica em globalThis também em produção: o Next empacota rotas de API, páginas e
 * server actions em grafos de módulos separados, e sem isso cada um abriria o próprio pool.
 *
 * Na Vercel cada instância de função tem o próprio pool, então ele é pequeno, as conexões
 * ociosas fecham rápido e attachDatabasePool mantém a instância viva só até elas fecharem.
 * Fora da Vercel, attachDatabasePool não faz nada.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function criarCliente() {
  const connectionString = process.env.DATABASE_URL;
  const local = !connectionString || /localhost|127\.0\.0\.1/.test(connectionString);
  const naVercel = Boolean(process.env.VERCEL);
  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? (naVercel ? 3 : 8)),
    idleTimeoutMillis: naVercel ? 5_000 : 30_000,
    connectionTimeoutMillis: 15_000,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  pool.on("error", (e) => console.error("[db] erro numa conexão ociosa do pool", e.message));
  attachDatabasePool(pool);
  const adapter = new PrismaPg(pool, { schema: process.env.DATABASE_SCHEMA ?? "erp" });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? criarCliente();
globalForPrisma.prisma = prisma;

export { Prisma };
export type DB = Prisma.TransactionClient | PrismaClient;
