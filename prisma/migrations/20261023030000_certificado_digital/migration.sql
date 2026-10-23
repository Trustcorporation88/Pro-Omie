-- Certificado digital A1 por estabelecimento (arquivo e senha cifrados no app). Só cria a tabela nova.
-- CreateTable
CREATE TABLE "certificados_digitais" (
    "empresaId" TEXT NOT NULL,
    "arquivoCifrado" BYTEA NOT NULL,
    "senhaCifrada" BYTEA NOT NULL,
    "titular" TEXT NOT NULL,
    "cnpj" TEXT,
    "emissor" TEXT,
    "numeroSerie" TEXT NOT NULL,
    "impressaoDigital" TEXT NOT NULL,
    "validoDe" TIMESTAMP(3) NOT NULL,
    "validoAte" TIMESTAMP(3) NOT NULL,
    "enviadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificados_digitais_pkey" PRIMARY KEY ("empresaId")
);

-- CreateIndex
CREATE INDEX "certificados_digitais_validoAte_idx" ON "certificados_digitais"("validoAte");

-- AddForeignKey
ALTER TABLE "certificados_digitais" ADD CONSTRAINT "certificados_digitais_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

