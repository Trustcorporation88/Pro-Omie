-- Fase 4, etapa 1: captação de notas recebidas (NF-e, CT-e, NFS-e), com motor SEFAZ direto (padrão) e Focus NFe (reserva).
-- Só cria tipos e tabelas novas; nada existente é alterado.
-- CreateEnum
CREATE TYPE "MotorFiscal" AS ENUM ('SEFAZ', 'FOCUS');

-- CreateEnum
CREATE TYPE "TipoDocumentoFiscal" AS ENUM ('NFE', 'CTE', 'NFSE');

-- CreateEnum
CREATE TYPE "DirecaoDocumento" AS ENUM ('ENTRADA', 'SAIDA', 'TERCEIRO');

-- CreateEnum
CREATE TYPE "SituacaoDocumento" AS ENUM ('AUTORIZADO', 'CANCELADO', 'DENEGADO');

-- CreateEnum
CREATE TYPE "Manifestacao" AS ENUM ('CIENCIA', 'CONFIRMACAO', 'DESCONHECIMENTO', 'NAO_REALIZADA');

-- CreateTable
CREATE TABLE "configuracoes_fiscais" (
    "empresaId" TEXT NOT NULL,
    "captacaoAtiva" BOOLEAN NOT NULL DEFAULT false,
    "motor" "MotorFiscal" NOT NULL DEFAULT 'SEFAZ',
    "ambiente" INTEGER NOT NULL DEFAULT 1,
    "captarNfe" BOOLEAN NOT NULL DEFAULT true,
    "captarCte" BOOLEAN NOT NULL DEFAULT true,
    "captarNfse" BOOLEAN NOT NULL DEFAULT true,
    "cienciaAutomatica" BOOLEAN NOT NULL DEFAULT true,
    "travaToken" TEXT,
    "travaAte" TIMESTAMP(3),
    "focusEmpresaId" TEXT,
    "focusTokenProducao" BYTEA,
    "focusTokenHomologacao" BYTEA,
    "focusAtivadaEm" TIMESTAMP(3),
    "atualizadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_fiscais_pkey" PRIMARY KEY ("empresaId")
);

-- CreateTable
CREATE TABLE "cursores_captura" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoDocumentoFiscal" NOT NULL,
    "motor" "MotorFiscal" NOT NULL,
    "ultimoNsu" TEXT NOT NULL DEFAULT '0',
    "maxNsu" TEXT,
    "consultadoEm" TIMESTAMP(3),
    "status" TEXT,
    "mensagem" TEXT,
    "proximaConsulta" TIMESTAMP(3),
    "pendente" BOOLEAN NOT NULL DEFAULT false,
    "documentosUltima" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cursores_captura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_recebidos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoDocumentoFiscal" NOT NULL,
    "chave" TEXT NOT NULL,
    "direcao" "DirecaoDocumento" NOT NULL DEFAULT 'ENTRADA',
    "numero" TEXT,
    "serie" TEXT,
    "emitenteDocumento" TEXT,
    "emitenteNome" TEXT,
    "emitenteIe" TEXT,
    "destinatarioDocumento" TEXT,
    "valor" DECIMAL(14,2),
    "emitidoEm" TIMESTAMP(3),
    "situacao" "SituacaoDocumento" NOT NULL DEFAULT 'AUTORIZADO',
    "protocolo" TEXT,
    "completo" BOOLEAN NOT NULL DEFAULT false,
    "xml" TEXT NOT NULL,
    "nsu" TEXT,
    "motor" "MotorFiscal" NOT NULL,
    "manifestacao" "Manifestacao",
    "manifestadoEm" TIMESTAMP(3),
    "manifestacaoProtocolo" TEXT,
    "manifestacaoErro" TEXT,
    "pessoaId" TEXT,
    "lancadoEm" TIMESTAMP(3),
    "lancadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentos_recebidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_documentos" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "documentoId" TEXT,
    "chaveDocumento" TEXT NOT NULL,
    "tipoEvento" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL DEFAULT 1,
    "descricao" TEXT,
    "detalhe" TEXT,
    "ocorridoEm" TIMESTAMP(3),
    "protocolo" TEXT,
    "xml" TEXT NOT NULL,
    "nsu" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cursores_captura_empresaId_tipo_motor_key" ON "cursores_captura"("empresaId", "tipo", "motor");

-- CreateIndex
CREATE INDEX "documentos_recebidos_empresaId_tipo_emitidoEm_idx" ON "documentos_recebidos"("empresaId", "tipo", "emitidoEm");

-- CreateIndex
CREATE INDEX "documentos_recebidos_empresaId_manifestacao_idx" ON "documentos_recebidos"("empresaId", "manifestacao");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_recebidos_empresaId_chave_key" ON "documentos_recebidos"("empresaId", "chave");

-- CreateIndex
CREATE INDEX "eventos_documentos_documentoId_idx" ON "eventos_documentos"("documentoId");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_documentos_empresaId_chaveDocumento_tipoEvento_sequ_key" ON "eventos_documentos"("empresaId", "chaveDocumento", "tipoEvento", "sequencia");

-- AddForeignKey
ALTER TABLE "configuracoes_fiscais" ADD CONSTRAINT "configuracoes_fiscais_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cursores_captura" ADD CONSTRAINT "cursores_captura_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_recebidos" ADD CONSTRAINT "documentos_recebidos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_recebidos" ADD CONSTRAINT "documentos_recebidos_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_documentos" ADD CONSTRAINT "eventos_documentos_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "documentos_recebidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

