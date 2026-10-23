-- AlterTable
ALTER TABLE "configuracoes_fiscais" ADD COLUMN     "nfseAliquotaSimples" DECIMAL(5,2) NOT NULL DEFAULT 6,
ADD COLUMN     "nfseAmbiente" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "nfseAtiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nfseEnviarIM" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nfseInformacoes" TEXT,
ADD COLUMN     "nfseMotor" "MotorFiscal" NOT NULL DEFAULT 'SEFAZ',
ADD COLUMN     "nfseMunicipioAderente" BOOLEAN,
ADD COLUMN     "nfseMunicipioConferidoEm" TIMESTAMP(3),
ADD COLUMN     "nfseProximoNumero" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nfseSerie" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "codigoNbs" TEXT,
ADD COLUMN     "codigoTributacaoMunicipal" TEXT,
ADD COLUMN     "codigoTributacaoNacional" TEXT;

-- CreateTable
CREATE TABLE "notas_servico" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "pedidoId" TEXT,
    "ambiente" INTEGER NOT NULL,
    "motor" "MotorFiscal" NOT NULL,
    "serie" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "idDps" TEXT,
    "chave" TEXT,
    "numeroNfse" TEXT,
    "status" "StatusNotaFiscal" NOT NULL DEFAULT 'PROCESSANDO',
    "codigo" TEXT,
    "mensagem" TEXT,
    "competencia" TIMESTAMP(3) NOT NULL,
    "emitidaEm" TIMESTAMP(3) NOT NULL,
    "autorizadaEm" TIMESTAMP(3),
    "tomadorNome" TEXT NOT NULL,
    "tomadorDocumento" TEXT,
    "codigoTributacaoNacional" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "xml" TEXT,
    "xmlAutorizado" TEXT,
    "canceladaEm" TIMESTAMP(3),
    "cancelamentoCodigo" TEXT,
    "cancelamentoMotivo" TEXT,
    "cancelamentoXml" TEXT,
    "focusRef" TEXT,
    "emitidaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notas_servico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notas_servico_pedidoId_idx" ON "notas_servico"("pedidoId");

-- CreateIndex
CREATE INDEX "notas_servico_empresaId_emitidaEm_idx" ON "notas_servico"("empresaId", "emitidaEm");

-- CreateIndex
CREATE INDEX "notas_servico_empresaId_status_idx" ON "notas_servico"("empresaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notas_servico_empresaId_serie_numero_ambiente_key" ON "notas_servico"("empresaId", "serie", "numero", "ambiente");

-- AddForeignKey
ALTER TABLE "notas_servico" ADD CONSTRAINT "notas_servico_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_servico" ADD CONSTRAINT "notas_servico_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

