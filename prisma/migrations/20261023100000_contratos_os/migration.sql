-- CreateEnum
CREATE TYPE "Periodicidade" AS ENUM ('MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "StatusOs" AS ENUM ('ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "contratos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "periodicidade" "Periodicidade" NOT NULL DEFAULT 'MENSAL',
    "diaVencimento" INTEGER NOT NULL DEFAULT 10,
    "inicio" DATE NOT NULL,
    "fim" DATE,
    "proximaCompetencia" DATE NOT NULL,
    "antecedenciaDias" INTEGER NOT NULL DEFAULT 10,
    "categoriaId" TEXT,
    "contaBancariaId" TEXT,
    "formaPagamentoId" TEXT,
    "gerarCobranca" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos_geracoes" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "competencia" DATE NOT NULL,
    "pedidoId" TEXT,
    "tituloId" TEXT,
    "cobrancaId" TEXT,
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contratos_geracoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordens_servico" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricao" TEXT NOT NULL,
    "detalhes" TEXT,
    "status" "StatusOs" NOT NULL DEFAULT 'ABERTA',
    "responsavelId" TEXT,
    "abertura" DATE NOT NULL,
    "previsao" DATE,
    "conclusao" DATE,
    "quantidade" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "valorUnitario" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "pedidoId" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordens_servico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contratos_empresaId_ativo_proximaCompetencia_idx" ON "contratos"("empresaId", "ativo", "proximaCompetencia");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_empresaId_numero_key" ON "contratos"("empresaId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_geracoes_contratoId_competencia_key" ON "contratos_geracoes"("contratoId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_servico_pedidoId_key" ON "ordens_servico"("pedidoId");

-- CreateIndex
CREATE INDEX "ordens_servico_empresaId_status_idx" ON "ordens_servico"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_servico_empresaId_numero_key" ON "ordens_servico"("empresaId", "numero");

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_geracoes" ADD CONSTRAINT "contratos_geracoes_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

