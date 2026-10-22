-- Vendas (Fase 2): propostas comerciais e pedidos de venda com itens, numeração por estabelecimento.
-- Só cria tabelas novas; nada existente é alterado.
-- CreateEnum
CREATE TYPE "StatusProposta" AS ENUM ('RASCUNHO', 'ENVIADA', 'APROVADA', 'RECUSADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('ABERTO', 'FATURADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "sequencias_documento" (
    "empresaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sequencias_documento_pkey" PRIMARY KEY ("empresaId","tipo")
);

-- CreateTable
CREATE TABLE "propostas" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "StatusProposta" NOT NULL DEFAULT 'RASCUNHO',
    "pessoaId" TEXT NOT NULL,
    "vendedorId" TEXT,
    "emissao" DATE NOT NULL,
    "validade" DATE NOT NULL,
    "condicaoPagamentoId" TEXT,
    "formaPagamentoId" TEXT,
    "observacoes" TEXT,
    "observacoesInternas" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "motivoRecusa" TEXT,
    "enviadaEm" TIMESTAMP(3),
    "aprovadaEm" TIMESTAMP(3),
    "recusadaEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "propostas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposta_itens" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "produtoId" TEXT,
    "tipo" "TipoProduto" NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL,
    "precoUnitario" DECIMAL(14,4) NOT NULL,
    "descontoPercentual" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "proposta_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "StatusPedido" NOT NULL DEFAULT 'ABERTO',
    "propostaId" TEXT,
    "pessoaId" TEXT NOT NULL,
    "vendedorId" TEXT,
    "emissao" DATE NOT NULL,
    "condicaoPagamentoId" TEXT,
    "formaPagamentoId" TEXT,
    "observacoes" TEXT,
    "observacoesInternas" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "faturadoEm" TIMESTAMP(3),
    "canceladoEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_itens" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "produtoId" TEXT,
    "tipo" "TipoProduto" NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL,
    "precoUnitario" DECIMAL(14,4) NOT NULL,
    "descontoPercentual" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "pedido_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "propostas_empresaId_status_emissao_idx" ON "propostas"("empresaId", "status", "emissao");

-- CreateIndex
CREATE INDEX "propostas_pessoaId_idx" ON "propostas"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "propostas_empresaId_numero_key" ON "propostas"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "proposta_itens_propostaId_ordem_idx" ON "proposta_itens"("propostaId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_propostaId_key" ON "pedidos"("propostaId");

-- CreateIndex
CREATE INDEX "pedidos_empresaId_status_emissao_idx" ON "pedidos"("empresaId", "status", "emissao");

-- CreateIndex
CREATE INDEX "pedidos_pessoaId_idx" ON "pedidos"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_empresaId_numero_key" ON "pedidos"("empresaId", "numero");

-- CreateIndex
CREATE INDEX "pedido_itens_pedidoId_ordem_idx" ON "pedido_itens"("pedidoId", "ordem");

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_condicaoPagamentoId_fkey" FOREIGN KEY ("condicaoPagamentoId") REFERENCES "condicoes_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "formas_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_itens" ADD CONSTRAINT "proposta_itens_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "propostas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposta_itens" ADD CONSTRAINT "proposta_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "propostas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_condicaoPagamentoId_fkey" FOREIGN KEY ("condicaoPagamentoId") REFERENCES "condicoes_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "formas_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_itens" ADD CONSTRAINT "pedido_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

