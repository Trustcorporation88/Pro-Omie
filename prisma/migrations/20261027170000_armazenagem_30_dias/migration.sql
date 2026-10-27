-- Cobrança da armazenagem por períodos de 30 dias vencidos (ou mês do calendário).

-- Tarifas: tipo de período e prazo de pagamento após o fim do período (no lugar do dia do vencimento)
ALTER TABLE "tarifas_armazem" ADD COLUMN "periodo" TEXT NOT NULL DEFAULT 'DIAS30';
ALTER TABLE "tarifas_armazem" ADD COLUMN "prazoPagamento" INTEGER NOT NULL DEFAULT 10;
UPDATE "tarifas_armazem" SET "periodo" = 'MES', "prazoPagamento" = "diaVencimento";
ALTER TABLE "tarifas_armazem" DROP COLUMN "diaVencimento";

-- Faturamentos: período (início e fim) no lugar da competência mensal
ALTER TABLE "faturamentos_armazem" ADD COLUMN "periodoInicio" DATE;
ALTER TABLE "faturamentos_armazem" ADD COLUMN "periodoFim" DATE;
ALTER TABLE "faturamentos_armazem" ADD COLUMN "tipoPeriodo" TEXT NOT NULL DEFAULT 'DIAS30';
UPDATE "faturamentos_armazem" SET "periodoInicio" = "competencia", "periodoFim" = ("competencia" + INTERVAL '1 month' - INTERVAL '1 day')::date, "tipoPeriodo" = 'MES';
ALTER TABLE "faturamentos_armazem" ALTER COLUMN "periodoInicio" SET NOT NULL;
ALTER TABLE "faturamentos_armazem" ALTER COLUMN "periodoFim" SET NOT NULL;
ALTER TABLE "faturamentos_armazem" RENAME COLUMN "diasMes" TO "diasPeriodo";
DROP INDEX "faturamentos_armazem_empresaId_depositanteId_competencia_key";
DROP INDEX "faturamentos_armazem_empresaId_competencia_idx";
ALTER TABLE "faturamentos_armazem" DROP COLUMN "competencia";
CREATE UNIQUE INDEX "faturamentos_armazem_empresaId_depositanteId_periodoInicio_key" ON "faturamentos_armazem"("empresaId", "depositanteId", "periodoInicio");
CREATE INDEX "faturamentos_armazem_empresaId_periodoFim_idx" ON "faturamentos_armazem"("empresaId", "periodoFim");
