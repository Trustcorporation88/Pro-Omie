
-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'FINANCEIRO', 'VENDAS', 'ESTOQUE', 'CONTADOR');

-- CreateEnum
CREATE TYPE "RegimeTributario" AS ENUM ('MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('FISICA', 'JURIDICA', 'ESTRANGEIRA');

-- CreateEnum
CREATE TYPE "IndicadorIE" AS ENUM ('CONTRIBUINTE', 'ISENTO', 'NAO_CONTRIBUINTE');

-- CreateEnum
CREATE TYPE "TipoProduto" AS ENUM ('PRODUTO', 'SERVICO');

-- CreateEnum
CREATE TYPE "TipoCategoria" AS ENUM ('RECEITA', 'DESPESA');

-- CreateEnum
CREATE TYPE "GrupoDRE" AS ENUM ('RECEITA_BRUTA', 'DEDUCOES', 'CUSTOS', 'DESPESAS_PESSOAL', 'DESPESAS_ADMINISTRATIVAS', 'DESPESAS_COMERCIAIS', 'RECEITAS_FINANCEIRAS', 'DESPESAS_FINANCEIRAS', 'OUTRAS_RECEITAS', 'OUTRAS_DESPESAS', 'IMPOSTOS_LUCRO', 'NAO_OPERACIONAL');

-- CreateEnum
CREATE TYPE "TipoConta" AS ENUM ('CORRENTE', 'POUPANCA', 'CAIXA', 'CARTAO_CREDITO', 'INVESTIMENTO', 'CONTA_PAGAMENTO');

-- CreateEnum
CREATE TYPE "MeioPagamento" AS ENUM ('DINHEIRO', 'PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'TRANSFERENCIA', 'CHEQUE', 'DEBITO_AUTOMATICO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoTitulo" AS ENUM ('RECEBER', 'PAGAR');

-- CreateEnum
CREATE TYPE "StatusTitulo" AS ENUM ('ABERTO', 'PARCIAL', 'QUITADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrigemTitulo" AS ENUM ('MANUAL', 'RECORRENCIA', 'CONCILIACAO', 'VENDA', 'COMPRA', 'CONTRATO', 'NOTA_FISCAL');

-- CreateEnum
CREATE TYPE "TipoMovimento" AS ENUM ('CREDITO', 'DEBITO');

-- CreateEnum
CREATE TYPE "OrigemMovimento" AS ENUM ('BAIXA', 'TRANSFERENCIA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "StatusExtratoItem" AS ENUM ('PENDENTE', 'CONCILIADO', 'IGNORADO');

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "inscricaoEstadual" TEXT,
    "inscricaoMunicipal" TEXT,
    "regimeTributario" "RegimeTributario" NOT NULL DEFAULT 'SIMPLES_NACIONAL',
    "cnae" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "codigoMunicipio" TEXT,
    "matrizId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL DEFAULT 'FINANCEIRO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "trocarSenha" BOOLEAN NOT NULL DEFAULT false,
    "versaoSessao" INTEGER NOT NULL DEFAULT 1,
    "ultimoAcesso" TIMESTAMP(3),
    "tentativasFalhas" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoAte" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "resumo" TEXT,
    "dados" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoas" (
    "id" TEXT NOT NULL,
    "tipoPessoa" "TipoPessoa" NOT NULL DEFAULT 'JURIDICA',
    "documento" TEXT,
    "nome" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cliente" BOOLEAN NOT NULL DEFAULT true,
    "fornecedor" BOOLEAN NOT NULL DEFAULT false,
    "indicadorIE" "IndicadorIE" NOT NULL DEFAULT 'NAO_CONTRIBUINTE',
    "inscricaoEstadual" TEXT,
    "inscricaoMunicipal" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "contato" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "codigoMunicipio" TEXT,
    "limiteCredito" DECIMAL(14,2),
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pessoas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "tipo" "TipoProduto" NOT NULL DEFAULT 'PRODUTO',
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "gtin" TEXT,
    "ncm" TEXT,
    "cest" TEXT,
    "origem" INTEGER NOT NULL DEFAULT 0,
    "codigoServico" TEXT,
    "precoVenda" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "precoCusto" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "controlaEstoque" BOOLEAN NOT NULL DEFAULT true,
    "estoqueMinimo" DECIMAL(14,4),
    "estoqueMaximo" DECIMAL(14,4),
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "codigo" TEXT,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCategoria" NOT NULL,
    "grupoDre" "GrupoDRE" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "centros_custo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "centros_custo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_bancarias" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoConta" NOT NULL DEFAULT 'CORRENTE',
    "bancoCodigo" TEXT,
    "bancoNome" TEXT,
    "agencia" TEXT,
    "numero" TEXT,
    "saldoInicial" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dataSaldoInicial" DATE NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formas_pagamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "meio" "MeioPagamento" NOT NULL DEFAULT 'OUTRO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formas_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condicoes_pagamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "dias" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condicoes_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "titulos" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "tipo" "TipoTitulo" NOT NULL,
    "status" "StatusTitulo" NOT NULL DEFAULT 'ABERTO',
    "origem" "OrigemTitulo" NOT NULL DEFAULT 'MANUAL',
    "origemId" TEXT,
    "empresaId" TEXT NOT NULL,
    "pessoaId" TEXT,
    "descricao" TEXT NOT NULL,
    "documento" TEXT,
    "categoriaId" TEXT,
    "centroCustoId" TEXT,
    "contaBancariaId" TEXT,
    "formaPagamentoId" TEXT,
    "emissao" DATE NOT NULL,
    "competencia" DATE NOT NULL,
    "vencimento" DATE NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "valorPago" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "parcela" INTEGER NOT NULL DEFAULT 1,
    "totalParcelas" INTEGER NOT NULL DEFAULT 1,
    "grupoId" TEXT,
    "observacoes" TEXT,
    "quitadoEm" DATE,
    "canceladoEm" TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "titulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "titulo_rateios" (
    "id" TEXT NOT NULL,
    "tituloId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "centroCustoId" TEXT,
    "percentual" DECIMAL(7,4) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "titulo_rateios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baixas" (
    "id" TEXT NOT NULL,
    "tituloId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "formaPagamentoId" TEXT,
    "data" DATE NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "juros" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "multa" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "observacao" TEXT,
    "estornada" BOOLEAN NOT NULL DEFAULT false,
    "estornadaEm" TIMESTAMP(3),
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "baixas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "tipo" "TipoMovimento" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "descricao" TEXT NOT NULL,
    "origem" "OrigemMovimento" NOT NULL,
    "baixaId" TEXT,
    "transferenciaId" TEXT,
    "conciliado" BOOLEAN NOT NULL DEFAULT false,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transferencias" (
    "id" TEXT NOT NULL,
    "contaOrigemId" TEXT NOT NULL,
    "contaDestinoId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "descricao" TEXT,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transferencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extrato_importacoes" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "arquivoNome" TEXT NOT NULL,
    "dataInicio" DATE,
    "dataFim" DATE,
    "saldoFinal" DECIMAL(14,2),
    "dataSaldo" DATE,
    "totalItens" INTEGER NOT NULL DEFAULT 0,
    "novosItens" INTEGER NOT NULL DEFAULT 0,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extrato_importacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extrato_itens" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "fitId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "descricao" TEXT NOT NULL,
    "documento" TEXT,
    "status" "StatusExtratoItem" NOT NULL DEFAULT 'PENDENTE',
    "movimentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extrato_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regras_conciliacao" (
    "id" TEXT NOT NULL,
    "termo" TEXT NOT NULL,
    "tipo" "TipoTitulo",
    "categoriaId" TEXT NOT NULL,
    "pessoaId" TEXT,
    "centroCustoId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regras_conciliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anexos" (
    "id" TEXT NOT NULL,
    "tituloId" TEXT,
    "nome" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "storage" TEXT NOT NULL DEFAULT 'db',
    "caminho" TEXT,
    "dados" BYTEA,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "auditoria_entidade_entidadeId_idx" ON "auditoria"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "auditoria_createdAt_idx" ON "auditoria"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pessoas_documento_key" ON "pessoas"("documento");

-- CreateIndex
CREATE INDEX "pessoas_nome_idx" ON "pessoas"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_codigo_key" ON "produtos"("codigo");

-- CreateIndex
CREATE INDEX "produtos_descricao_idx" ON "produtos"("descricao");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_tipo_nome_key" ON "categorias"("tipo", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "centros_custo_nome_key" ON "centros_custo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "formas_pagamento_nome_key" ON "formas_pagamento"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "condicoes_pagamento_nome_key" ON "condicoes_pagamento"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "titulos_numero_key" ON "titulos"("numero");

-- CreateIndex
CREATE INDEX "titulos_tipo_status_vencimento_idx" ON "titulos"("tipo", "status", "vencimento");

-- CreateIndex
CREATE INDEX "titulos_pessoaId_idx" ON "titulos"("pessoaId");

-- CreateIndex
CREATE INDEX "titulos_grupoId_idx" ON "titulos"("grupoId");

-- CreateIndex
CREATE INDEX "titulos_competencia_idx" ON "titulos"("competencia");

-- CreateIndex
CREATE INDEX "titulo_rateios_tituloId_idx" ON "titulo_rateios"("tituloId");

-- CreateIndex
CREATE INDEX "titulo_rateios_categoriaId_idx" ON "titulo_rateios"("categoriaId");

-- CreateIndex
CREATE INDEX "baixas_tituloId_idx" ON "baixas"("tituloId");

-- CreateIndex
CREATE INDEX "baixas_data_idx" ON "baixas"("data");

-- CreateIndex
CREATE UNIQUE INDEX "movimentos_baixaId_key" ON "movimentos"("baixaId");

-- CreateIndex
CREATE INDEX "movimentos_contaBancariaId_data_idx" ON "movimentos"("contaBancariaId", "data");

-- CreateIndex
CREATE INDEX "movimentos_data_idx" ON "movimentos"("data");

-- CreateIndex
CREATE UNIQUE INDEX "extrato_itens_movimentoId_key" ON "extrato_itens"("movimentoId");

-- CreateIndex
CREATE INDEX "extrato_itens_contaBancariaId_status_data_idx" ON "extrato_itens"("contaBancariaId", "status", "data");

-- CreateIndex
CREATE UNIQUE INDEX "extrato_itens_contaBancariaId_fitId_key" ON "extrato_itens"("contaBancariaId", "fitId");

-- CreateIndex
CREATE INDEX "anexos_tituloId_idx" ON "anexos"("tituloId");

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_matrizId_fkey" FOREIGN KEY ("matrizId") REFERENCES "empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_bancarias" ADD CONSTRAINT "contas_bancarias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "centros_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulos" ADD CONSTRAINT "titulos_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "formas_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulo_rateios" ADD CONSTRAINT "titulo_rateios_tituloId_fkey" FOREIGN KEY ("tituloId") REFERENCES "titulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulo_rateios" ADD CONSTRAINT "titulo_rateios_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titulo_rateios" ADD CONSTRAINT "titulo_rateios_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "centros_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_tituloId_fkey" FOREIGN KEY ("tituloId") REFERENCES "titulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baixas" ADD CONSTRAINT "baixas_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "formas_pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos" ADD CONSTRAINT "movimentos_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos" ADD CONSTRAINT "movimentos_baixaId_fkey" FOREIGN KEY ("baixaId") REFERENCES "baixas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos" ADD CONSTRAINT "movimentos_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "transferencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_contaOrigemId_fkey" FOREIGN KEY ("contaOrigemId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_contaDestinoId_fkey" FOREIGN KEY ("contaDestinoId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extrato_importacoes" ADD CONSTRAINT "extrato_importacoes_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extrato_itens" ADD CONSTRAINT "extrato_itens_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "extrato_importacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extrato_itens" ADD CONSTRAINT "extrato_itens_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extrato_itens" ADD CONSTRAINT "extrato_itens_movimentoId_fkey" FOREIGN KEY ("movimentoId") REFERENCES "movimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_conciliacao" ADD CONSTRAINT "regras_conciliacao_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_conciliacao" ADD CONSTRAINT "regras_conciliacao_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_conciliacao" ADD CONSTRAINT "regras_conciliacao_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "centros_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_tituloId_fkey" FOREIGN KEY ("tituloId") REFERENCES "titulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
