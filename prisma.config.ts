import "dotenv/config";
import { defineConfig } from "prisma/config";

// A CLI (migrate deploy) usa a conexão direta/sessão (DIRECT_URL, porta 5432 do pooler).
// O app em runtime usa DATABASE_URL (pooler em modo transação, porta 6543) via adapter-pg.
// O schema "erp" vem do parâmetro ?schema=erp na URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
