-- AlterTable
ALTER TABLE "configuracoes_fiscais" ADD COLUMN     "nfeIbsCbs" TEXT NOT NULL DEFAULT 'NAO';

-- AlterTable
ALTER TABLE "itens_estoque" ADD COLUMN     "custoUnitario" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "lancamentos_estoque" ADD COLUMN     "documentoId" TEXT;

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "cClassTrib" TEXT,
ADD COLUMN     "cstIbsCbs" TEXT;

-- AlterTable
ALTER TABLE "saldos_estoque" ADD COLUMN     "custoMedio" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "vinculos_produto_fornecedor" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "fornecedorDocumento" TEXT NOT NULL,
    "codigoFornecedor" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vinculos_produto_fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vinculos_produto_fornecedor_empresaId_fornecedorDocumento_c_key" ON "vinculos_produto_fornecedor"("empresaId", "fornecedorDocumento", "codigoFornecedor");

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_estoque_documentoId_key" ON "lancamentos_estoque"("documentoId");

-- AddForeignKey
ALTER TABLE "lancamentos_estoque" ADD CONSTRAINT "lancamentos_estoque_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documentos_recebidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_produto_fornecedor" ADD CONSTRAINT "vinculos_produto_fornecedor_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

