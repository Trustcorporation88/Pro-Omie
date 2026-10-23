-- CreateEnum
CREATE TYPE "TipoCobranca" AS ENUM ('BOLETO', 'PIX', 'UNDEFINED');

-- CreateTable
CREATE TABLE "configuracoes_cobranca" (
    "empresaId" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "ambiente" INTEGER NOT NULL DEFAULT 2,
    "chaveCifrada" BYTEA,
    "chaveFinal" TEXT,
    "contaBancariaId" TEXT,
    "formaPadrao" "TipoCobranca" NOT NULL DEFAULT 'UNDEFINED',
    "multaPercentual" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "jurosMensal" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "notificarPeloAsaas" BOOLEAN NOT NULL DEFAULT false,
    "enviarEmailAutomatico" BOOLEAN NOT NULL DEFAULT true,
    "webhookToken" TEXT,
    "webhookId" TEXT,
    "webhookRegistradoEm" TIMESTAMP(3),
    "testadaEm" TIMESTAMP(3),
    "atualizadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_cobranca_pkey" PRIMARY KEY ("empresaId")
);

-- CreateTable
CREATE TABLE "clientes_asaas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_asaas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cobrancas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tituloId" TEXT NOT NULL,
    "pessoaId" TEXT,
    "asaasPaymentId" TEXT NOT NULL,
    "asaasCustomerId" TEXT NOT NULL,
    "tipo" "TipoCobranca" NOT NULL,
    "status" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "valorLiquido" DECIMAL(14,2),
    "vencimento" DATE NOT NULL,
    "urlFatura" TEXT,
    "urlBoleto" TEXT,
    "linhaDigitavel" TEXT,
    "codigoBarras" TEXT,
    "nossoNumero" TEXT,
    "pixPayload" TEXT,
    "pixExpiraEm" TIMESTAMP(3),
    "pagoEm" TIMESTAMP(3),
    "baixaId" TEXT,
    "canceladaEm" TIMESTAMP(3),
    "erro" TEXT,
    "criadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cobrancas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_cobranca" (
    "id" TEXT NOT NULL,
    "asaasEventId" TEXT NOT NULL,
    "cobrancaId" TEXT,
    "empresaId" TEXT,
    "evento" TEXT NOT NULL,
    "paymentId" TEXT,
    "payload" JSONB NOT NULL,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" TIMESTAMP(3),
    "erro" TEXT,

    CONSTRAINT "eventos_cobranca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_asaas_empresaId_pessoaId_key" ON "clientes_asaas"("empresaId", "pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "cobrancas_asaasPaymentId_key" ON "cobrancas"("asaasPaymentId");

-- CreateIndex
CREATE INDEX "cobrancas_tituloId_idx" ON "cobrancas"("tituloId");

-- CreateIndex
CREATE INDEX "cobrancas_empresaId_status_idx" ON "cobrancas"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_cobranca_asaasEventId_key" ON "eventos_cobranca"("asaasEventId");

-- CreateIndex
CREATE INDEX "eventos_cobranca_paymentId_idx" ON "eventos_cobranca"("paymentId");

-- AddForeignKey
ALTER TABLE "configuracoes_cobranca" ADD CONSTRAINT "configuracoes_cobranca_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_tituloId_fkey" FOREIGN KEY ("tituloId") REFERENCES "titulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_cobranca" ADD CONSTRAINT "eventos_cobranca_cobrancaId_fkey" FOREIGN KEY ("cobrancaId") REFERENCES "cobrancas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

