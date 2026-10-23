-- Fase 4, etapa 2: emissão de NF-e (notas, eventos, inutilizações), configuração de emissão e dados fiscais do produto.
-- Só acrescenta: tabelas novas e colunas opcionais ou com padrão; nada existente muda de valor.
-- CreateEnum
CREATE TYPE "StatusNotaFiscal" AS ENUM ('PROCESSANDO', 'AUTORIZADA', 'REJEITADA', 'DENEGADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "cfopInterestadual" TEXT,
ADD COLUMN     "cfopInterno" TEXT,
ADD COLUMN     "csosnInterestadual" TEXT,
ADD COLUMN     "csosnInterno" TEXT,
ADD COLUMN     "textoFiscal" TEXT;

-- AlterTable
ALTER TABLE "configuracoes_fiscais" ADD COLUMN     "nfeAmbiente" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "nfeAtiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nfeInformacoes" TEXT,
ADD COLUMN     "nfeMotor" "MotorFiscal" NOT NULL DEFAULT 'SEFAZ',
ADD COLUMN     "nfeProximoNumero" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nfeSerie" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "notas_fiscais" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pedidoId" TEXT,
    "modelo" INTEGER NOT NULL DEFAULT 55,
    "serie" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "ambiente" INTEGER NOT NULL,
    "motor" "MotorFiscal" NOT NULL,
    "tpEmis" INTEGER NOT NULL DEFAULT 1,
    "chave" TEXT,
    "status" "StatusNotaFiscal" NOT NULL DEFAULT 'PROCESSANDO',
    "cStat" TEXT,
    "xMotivo" TEXT,
    "protocolo" TEXT,
    "emitidaEm" TIMESTAMP(3) NOT NULL,
    "autorizadaEm" TIMESTAMP(3),
    "naturezaOperacao" TEXT NOT NULL,
    "destinatarioNome" TEXT NOT NULL,
    "destinatarioDocumento" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "xml" TEXT,
    "xmlAutorizado" TEXT,
    "contingenciaMotivo" TEXT,
    "canceladaEm" TIMESTAMP(3),
    "cancelamentoProtocolo" TEXT,
    "cancelamentoJustificativa" TEXT,
    "focusRef" TEXT,
    "emitidaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notas_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_notas_fiscais" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "tipoEvento" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "detalhe" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "cStat" TEXT,
    "xMotivo" TEXT,
    "protocolo" TEXT,
    "registradoEm" TIMESTAMP(3),
    "xml" TEXT,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_notas_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inutilizacoes_nfe" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ambiente" INTEGER NOT NULL,
    "serie" INTEGER NOT NULL,
    "numeroInicial" INTEGER NOT NULL,
    "numeroFinal" INTEGER NOT NULL,
    "justificativa" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "cStat" TEXT,
    "xMotivo" TEXT,
    "protocolo" TEXT,
    "xml" TEXT,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inutilizacoes_nfe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notas_fiscais_pedidoId_idx" ON "notas_fiscais"("pedidoId");

-- CreateIndex
CREATE INDEX "notas_fiscais_empresaId_emitidaEm_idx" ON "notas_fiscais"("empresaId", "emitidaEm");

-- CreateIndex
CREATE INDEX "notas_fiscais_empresaId_status_idx" ON "notas_fiscais"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notas_fiscais_empresaId_modelo_serie_numero_ambiente_key" ON "notas_fiscais"("empresaId", "modelo", "serie", "numero", "ambiente");

-- CreateIndex
CREATE INDEX "eventos_notas_fiscais_notaId_idx" ON "eventos_notas_fiscais"("notaId");

-- CreateIndex
CREATE INDEX "inutilizacoes_nfe_empresaId_serie_idx" ON "inutilizacoes_nfe"("empresaId", "serie");

-- AddForeignKey
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_notas_fiscais" ADD CONSTRAINT "eventos_notas_fiscais_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "notas_fiscais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inutilizacoes_nfe" ADD CONSTRAINT "inutilizacoes_nfe_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

