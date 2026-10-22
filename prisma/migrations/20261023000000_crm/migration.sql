-- CRM (Fase 2): oportunidades do funil, atividades e vínculo da proposta com a oportunidade.
-- Cria tabelas novas; em propostas só adiciona a coluna opcional oportunidadeId.
-- CreateEnum
CREATE TYPE "EtapaOportunidade" AS ENUM ('DESCOBERTA', 'PROPOSTA', 'NEGOCIACAO', 'GANHA', 'PERDIDA');

-- CreateEnum
CREATE TYPE "TipoAtividade" AS ENUM ('LIGACAO', 'WHATSAPP', 'EMAIL', 'REUNIAO', 'VISITA', 'TAREFA');

-- AlterTable
ALTER TABLE "propostas" ADD COLUMN     "oportunidadeId" TEXT;

-- CreateTable
CREATE TABLE "oportunidades" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "contato" TEXT,
    "responsavelId" TEXT,
    "etapa" "EtapaOportunidade" NOT NULL DEFAULT 'DESCOBERTA',
    "etapaDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "etapaAntesFechar" "EtapaOportunidade",
    "valor" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "previsaoFechamento" DATE,
    "origem" TEXT,
    "motivoPerda" TEXT,
    "detalhePerda" TEXT,
    "observacoes" TEXT,
    "ganhaEm" TIMESTAMP(3),
    "perdidaEm" TIMESTAMP(3),
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atividades" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoAtividade" NOT NULL DEFAULT 'TAREFA',
    "assunto" TEXT NOT NULL,
    "descricao" TEXT,
    "data" DATE NOT NULL,
    "hora" TEXT,
    "responsavelId" TEXT,
    "oportunidadeId" TEXT,
    "pessoaId" TEXT,
    "concluidaEm" TIMESTAMP(3),
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atividades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oportunidades_empresaId_etapa_idx" ON "oportunidades"("empresaId", "etapa");

-- CreateIndex
CREATE INDEX "oportunidades_pessoaId_idx" ON "oportunidades"("pessoaId");

-- CreateIndex
CREATE INDEX "oportunidades_responsavelId_idx" ON "oportunidades"("responsavelId");

-- CreateIndex
CREATE INDEX "atividades_empresaId_concluidaEm_data_idx" ON "atividades"("empresaId", "concluidaEm", "data");

-- CreateIndex
CREATE INDEX "atividades_responsavelId_concluidaEm_data_idx" ON "atividades"("responsavelId", "concluidaEm", "data");

-- CreateIndex
CREATE INDEX "atividades_oportunidadeId_idx" ON "atividades"("oportunidadeId");

-- CreateIndex
CREATE INDEX "atividades_pessoaId_idx" ON "atividades"("pessoaId");

-- CreateIndex
CREATE INDEX "propostas_oportunidadeId_idx" ON "propostas"("oportunidadeId");

-- AddForeignKey
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

