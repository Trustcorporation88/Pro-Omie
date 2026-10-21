import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";

/**
 * Cliente Prisma único por processo.
 * DATABASE_URL aponta para o pooler do Supabase em modo transação (porta 6543).
 * Todas as tabelas vivem no schema "erp".
 *
 * O cliente fica em globalThis também em produção: o Next empacota rotas de API, páginas e
 * server actions em grafos de módulos separados, e sem isso cada um abriria o próprio pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function criarCliente() {
  const connectionString = process.env.DATABASE_URL;
  const local = !connectionString || /localhost|127\.0\.0\.1/.test(connectionString);
  const adapter = new PrismaPg(
    {
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 8),
      ssl: local ? undefined : { rejectUnauthorized: false },
    },
    { schema: process.env.DATABASE_SCHEMA ?? "erp" },
  );
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? criarCliente();
globalForPrisma.prisma = prisma;

export { Prisma };
export type DB = Prisma.TransactionClient | PrismaClient;
