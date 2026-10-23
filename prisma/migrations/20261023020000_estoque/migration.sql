-- Estoque (Fase 3): lançamentos (entrada da produção, saída na venda, ajuste), itens e saldo por estabelecimento.
-- Em produtos e pedidos só adiciona colunas opcionais (grupo do material e data do faturamento).
-- CreateEnum
CREATE TYPE "TipoLancamentoEstoque" AS ENUM ('ENTRADA', 'VENDA', 'AJUSTE');

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "dataFaturamento" DATE;

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "grupoMaterial" TEXT;

-- CreateTable
CREATE TABLE "lancamentos_estoque" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" "TipoLancamentoEstoque" NOT NULL,
    "data" DATE NOT NULL,
    "pedidoId" TEXT,
    "pessoaId" TEXT,
    "referencia" TEXT,
    "motivo" TEXT,
    "observacao" TEXT,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lancamentos_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_estoque" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL,
    "saldoContado" DECIMAL(14,3),

    CONSTRAINT "itens_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saldos_estoque" (
    "empresaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saldos_estoque_pkey" PRIMARY KEY ("empresaId","produtoId")
);

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_estoque_pedidoId_key" ON "lancamentos_estoque"("pedidoId");

-- CreateIndex
CREATE INDEX "lancamentos_estoque_empresaId_tipo_data_idx" ON "lancamentos_estoque"("empresaId", "tipo", "data");

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_estoque_empresaId_numero_key" ON "lancamentos_estoque"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "itens_estoque_lancamentoId_idx" ON "itens_estoque"("lancamentoId");

-- CreateIndex
CREATE INDEX "itens_estoque_produtoId_idx" ON "itens_estoque"("produtoId");

-- CreateIndex
CREATE INDEX "saldos_estoque_produtoId_idx" ON "saldos_estoque"("produtoId");

-- CreateIndex
CREATE INDEX "pedidos_empresaId_status_dataFaturamento_idx" ON "pedidos"("empresaId", "status", "dataFaturamento");

-- AddForeignKey
ALTER TABLE "lancamentos_estoque" ADD CONSTRAINT "lancamentos_estoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_estoque" ADD CONSTRAINT "lancamentos_estoque_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_estoque" ADD CONSTRAINT "lancamentos_estoque_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_estoque" ADD CONSTRAINT "itens_estoque_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamentos_estoque"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_estoque" ADD CONSTRAINT "itens_estoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldos_estoque" ADD CONSTRAINT "saldos_estoque_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saldos_estoque" ADD CONSTRAINT "saldos_estoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Trava no banco: o saldo nunca fica negativo (as regras do app já impedem; isto é a última barreira).
ALTER TABLE "saldos_estoque" ADD CONSTRAINT "saldos_estoque_nao_negativo" CHECK ("quantidade" >= 0);
