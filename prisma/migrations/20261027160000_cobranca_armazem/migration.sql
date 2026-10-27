-- CreateTable
CREATE TABLE "tarifas_armazem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "depositanteId" TEXT NOT NULL,
    "valorPosicao" DECIMAL(14,2) NOT NULL,
    "metodo" TEXT NOT NULL DEFAULT 'PRO_RATA',
    "minimoPosicoes" INTEGER,
    "cobrarReservadas" BOOLEAN NOT NULL DEFAULT true,
    "inicio" DATE NOT NULL,
    "produtoId" TEXT,
    "descricao" TEXT NOT NULL DEFAULT 'Armazenagem de mercadorias',
    "diaVencimento" INTEGER NOT NULL DEFAULT 10,
    "categoriaId" TEXT,
    "contaBancariaId" TEXT,
    "formaPagamentoId" TEXT,
    "gerarCobranca" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarifas_armazem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faturamentos_armazem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "depositanteId" TEXT NOT NULL,
    "tarifaId" TEXT,
    "competencia" DATE NOT NULL,
    "metodo" TEXT NOT NULL,
    "valorPosicao" DECIMAL(14,2) NOT NULL,
    "minimoPosicoes" INTEGER,
    "cobrarReservadas" BOOLEAN NOT NULL,
    "diasMes" INTEGER NOT NULL,
    "diasVigencia" INTEGER NOT NULL,
    "diasRepetidos" INTEGER NOT NULL DEFAULT 0,
    "posicoesDia" INTEGER NOT NULL,
    "reservadasDia" INTEGER NOT NULL DEFAULT 0,
    "pico" INTEGER NOT NULL,
    "posicoesCobradas" DECIMAL(12,4) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "vencimento" DATE NOT NULL,
    "pedidoId" TEXT,
    "tituloId" TEXT,
    "cobrancaId" TEXT,
    "erro" TEXT,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faturamentos_armazem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocupacoes_armazem" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "depositanteId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "posicoes" INTEGER NOT NULL,
    "reservadasVazias" INTEGER NOT NULL DEFAULT 0,
    "volumes" INTEGER NOT NULL DEFAULT 0,
    "volumesForaPosicao" INTEGER NOT NULL DEFAULT 0,
    "enderecos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ocupacoes_armazem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fotografias_armazem" (
    "empresaId" TEXT NOT NULL,
    "dia" DATE NOT NULL,
    "feitaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fotografias_armazem_pkey" PRIMARY KEY ("empresaId","dia")
);

-- CreateIndex
CREATE UNIQUE INDEX "tarifas_armazem_empresaId_depositanteId_key" ON "tarifas_armazem"("empresaId", "depositanteId");

-- CreateIndex
CREATE UNIQUE INDEX "faturamentos_armazem_pedidoId_key" ON "faturamentos_armazem"("pedidoId");

-- CreateIndex
CREATE INDEX "faturamentos_armazem_empresaId_competencia_idx" ON "faturamentos_armazem"("empresaId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "faturamentos_armazem_empresaId_depositanteId_competencia_key" ON "faturamentos_armazem"("empresaId", "depositanteId", "competencia");

-- CreateIndex
CREATE INDEX "ocupacoes_armazem_empresaId_dia_idx" ON "ocupacoes_armazem"("empresaId", "dia");

-- CreateIndex
CREATE UNIQUE INDEX "ocupacoes_armazem_empresaId_depositanteId_dia_key" ON "ocupacoes_armazem"("empresaId", "depositanteId", "dia");

-- AddForeignKey
ALTER TABLE "tarifas_armazem" ADD CONSTRAINT "tarifas_armazem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifas_armazem" ADD CONSTRAINT "tarifas_armazem_depositanteId_fkey" FOREIGN KEY ("depositanteId") REFERENCES "pessoas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifas_armazem" ADD CONSTRAINT "tarifas_armazem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturamentos_armazem" ADD CONSTRAINT "faturamentos_armazem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturamentos_armazem" ADD CONSTRAINT "faturamentos_armazem_depositanteId_fkey" FOREIGN KEY ("depositanteId") REFERENCES "pessoas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturamentos_armazem" ADD CONSTRAINT "faturamentos_armazem_tarifaId_fkey" FOREIGN KEY ("tarifaId") REFERENCES "tarifas_armazem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faturamentos_armazem" ADD CONSTRAINT "faturamentos_armazem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

