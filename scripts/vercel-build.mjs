// Build na Vercel: gera o Prisma Client, aplica as migrations SÓ em produção e compila o Next.
// Previews nunca alteram o banco de produção.
import { execSync } from "node:child_process";

const executar = (comando) => {
  console.log(`\n▶ ${comando}`);
  execSync(comando, { stdio: "inherit", env: process.env });
};

const ambiente = process.env.VERCEL_ENV ?? "local";

executar("npx prisma generate");

if (ambiente === "production") {
  if (!process.env.DIRECT_URL) {
    console.error("✖ DIRECT_URL não definida: configure a conexão de migrations (pooler do Supabase, porta 5432).");
    process.exit(1);
  }
  executar("npx prisma migrate deploy");
} else {
  console.log(`\nℹ Ambiente "${ambiente}": migrations não aplicadas (só em produção).`);
}

executar("npx next build");
