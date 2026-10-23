-- CreateEnum
CREATE TYPE "StatusEmail" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU');

-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "tipo" TEXT NOT NULL,
    "origemId" TEXT,
    "para" TEXT NOT NULL,
    "copia" TEXT,
    "responderPara" TEXT,
    "assunto" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "anexos" JSONB,
    "status" "StatusEmail" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "provedorId" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "proximaTentativa" TIMESTAMP(3),
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens_senha" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_senha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "emails_status_proximaTentativa_idx" ON "emails"("status", "proximaTentativa");

-- CreateIndex
CREATE INDEX "emails_empresaId_createdAt_idx" ON "emails"("empresaId", "createdAt");

-- CreateIndex
CREATE INDEX "emails_tipo_origemId_idx" ON "emails"("tipo", "origemId");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_senha_tokenHash_key" ON "tokens_senha"("tokenHash");

-- CreateIndex
CREATE INDEX "tokens_senha_usuarioId_idx" ON "tokens_senha"("usuarioId");

