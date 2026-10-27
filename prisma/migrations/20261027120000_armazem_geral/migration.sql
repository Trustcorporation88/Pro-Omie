-- CreateEnum
CREATE TYPE "StatusRecebimentoArmazem" AS ENUM ('CONFERENCIA', 'CONCLUIDO');

-- CreateEnum
CREATE TYPE "TipoVolumeArmazem" AS ENUM ('CAIXA', 'PALLET');

-- CreateEnum
CREATE TYPE "StatusVolumeArmazem" AS ENUM ('ABERTO', 'FECHADO', 'EXPEDIDO');

-- AlterTable
ALTER TABLE "documentos_recebidos" ADD COLUMN     "armazenagem" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "enderecos_armazem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "zona" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'PORTA_PALLET',
    "capacidade" INTEGER,
    "depositanteId" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enderecos_armazem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos_depositante" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "depositanteId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "ncm" TEXT,
    "gtin" TEXT,
    "valorUnitario" DECIMAL(14,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_depositante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recebimentos_armazem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "depositanteId" TEXT NOT NULL,
    "status" "StatusRecebimentoArmazem" NOT NULL DEFAULT 'CONFERENCIA',
    "chegadaEm" DATE NOT NULL,
    "observacao" TEXT,
    "concluidoEm" TIMESTAMP(3),
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recebimentos_armazem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_armazem" (
    "id" TEXT NOT NULL,
    "recebimentoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoDocumentoFiscal" NOT NULL,
    "chave" TEXT NOT NULL,
    "numero" TEXT,
    "serie" TEXT,
    "emitenteDocumento" TEXT,
    "emitenteNome" TEXT,
    "emitidoEm" TIMESTAMP(3),
    "valor" DECIMAL(14,2),
    "nfesReferenciadas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pesoKg" DECIMAL(15,3),
    "volumesDeclarados" INTEGER,
    "documentoRecebidoId" TEXT,
    "xml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_armazem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_recebimento_armazem" (
    "id" TEXT NOT NULL,
    "recebimentoId" TEXT NOT NULL,
    "documentoId" TEXT,
    "numeroItem" INTEGER,
    "produtoId" TEXT NOT NULL,
    "lote" TEXT NOT NULL DEFAULT '',
    "quantidade" DECIMAL(15,3) NOT NULL,
    "valorUnitario" DECIMAL(14,4),
    "cfop" TEXT,

    CONSTRAINT "itens_recebimento_armazem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volumes_armazem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoVolumeArmazem" NOT NULL,
    "numero" INTEGER NOT NULL,
    "depositanteId" TEXT NOT NULL,
    "recebimentoId" TEXT,
    "status" "StatusVolumeArmazem" NOT NULL DEFAULT 'ABERTO',
    "enderecoId" TEXT,
    "enderecadoEm" TIMESTAMP(3),
    "referenciaDepositante" TEXT,
    "observacao" TEXT,
    "expedidoEm" TIMESTAMP(3),
    "documentoSaida" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volumes_armazem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conteudos_volume" (
    "id" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "lote" TEXT NOT NULL DEFAULT '',
    "quantidade" DECIMAL(15,3) NOT NULL,
    "recebimentoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conteudos_volume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos_armazem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "resumo" TEXT NOT NULL,
    "dados" JSONB,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentos_armazem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enderecos_armazem_empresaId_zona_idx" ON "enderecos_armazem"("empresaId", "zona");

-- CreateIndex
CREATE UNIQUE INDEX "enderecos_armazem_empresaId_codigo_key" ON "enderecos_armazem"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_depositante_empresaId_depositanteId_codigo_key" ON "produtos_depositante"("empresaId", "depositanteId", "codigo");

-- CreateIndex
CREATE INDEX "recebimentos_armazem_empresaId_status_idx" ON "recebimentos_armazem"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "recebimentos_armazem_empresaId_numero_key" ON "recebimentos_armazem"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "documentos_armazem_recebimentoId_idx" ON "documentos_armazem"("recebimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_armazem_empresaId_chave_key" ON "documentos_armazem"("empresaId", "chave");

-- CreateIndex
CREATE INDEX "itens_recebimento_armazem_recebimentoId_idx" ON "itens_recebimento_armazem"("recebimentoId");

-- CreateIndex
CREATE INDEX "volumes_armazem_empresaId_status_idx" ON "volumes_armazem"("empresaId", "status");

-- CreateIndex
CREATE INDEX "volumes_armazem_enderecoId_idx" ON "volumes_armazem"("enderecoId");

-- CreateIndex
CREATE INDEX "volumes_armazem_depositanteId_idx" ON "volumes_armazem"("depositanteId");

-- CreateIndex
CREATE UNIQUE INDEX "volumes_armazem_empresaId_tipo_numero_key" ON "volumes_armazem"("empresaId", "tipo", "numero");

-- CreateIndex
CREATE INDEX "conteudos_volume_produtoId_lote_idx" ON "conteudos_volume"("produtoId", "lote");

-- CreateIndex
CREATE INDEX "conteudos_volume_recebimentoId_idx" ON "conteudos_volume"("recebimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "conteudos_volume_volumeId_produtoId_lote_recebimentoId_key" ON "conteudos_volume"("volumeId", "produtoId", "lote", "recebimentoId");

-- CreateIndex
CREATE INDEX "movimentos_armazem_volumeId_createdAt_idx" ON "movimentos_armazem"("volumeId", "createdAt");

-- AddForeignKey
ALTER TABLE "enderecos_armazem" ADD CONSTRAINT "enderecos_armazem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enderecos_armazem" ADD CONSTRAINT "enderecos_armazem_depositanteId_fkey" FOREIGN KEY ("depositanteId") REFERENCES "pessoas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos_depositante" ADD CONSTRAINT "produtos_depositante_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos_depositante" ADD CONSTRAINT "produtos_depositante_depositanteId_fkey" FOREIGN KEY ("depositanteId") REFERENCES "pessoas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimentos_armazem" ADD CONSTRAINT "recebimentos_armazem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recebimentos_armazem" ADD CONSTRAINT "recebimentos_armazem_depositanteId_fkey" FOREIGN KEY ("depositanteId") REFERENCES "pessoas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_armazem" ADD CONSTRAINT "documentos_armazem_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "recebimentos_armazem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_armazem" ADD CONSTRAINT "documentos_armazem_documentoRecebidoId_fkey" FOREIGN KEY ("documentoRecebidoId") REFERENCES "documentos_recebidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_recebimento_armazem" ADD CONSTRAINT "itens_recebimento_armazem_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "recebimentos_armazem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_recebimento_armazem" ADD CONSTRAINT "itens_recebimento_armazem_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documentos_armazem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_recebimento_armazem" ADD CONSTRAINT "itens_recebimento_armazem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos_depositante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volumes_armazem" ADD CONSTRAINT "volumes_armazem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volumes_armazem" ADD CONSTRAINT "volumes_armazem_depositanteId_fkey" FOREIGN KEY ("depositanteId") REFERENCES "pessoas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volumes_armazem" ADD CONSTRAINT "volumes_armazem_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "recebimentos_armazem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volumes_armazem" ADD CONSTRAINT "volumes_armazem_enderecoId_fkey" FOREIGN KEY ("enderecoId") REFERENCES "enderecos_armazem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteudos_volume" ADD CONSTRAINT "conteudos_volume_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "volumes_armazem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteudos_volume" ADD CONSTRAINT "conteudos_volume_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos_depositante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conteudos_volume" ADD CONSTRAINT "conteudos_volume_recebimentoId_fkey" FOREIGN KEY ("recebimentoId") REFERENCES "recebimentos_armazem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_armazem" ADD CONSTRAINT "movimentos_armazem_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "volumes_armazem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Quantidades sempre positivas (linha zerada é apagada)
ALTER TABLE "conteudos_volume" ADD CONSTRAINT "conteudos_volume_quantidade_positiva" CHECK ("quantidade" > 0);
ALTER TABLE "itens_recebimento_armazem" ADD CONSTRAINT "itens_recebimento_armazem_quantidade_positiva" CHECK ("quantidade" > 0);
