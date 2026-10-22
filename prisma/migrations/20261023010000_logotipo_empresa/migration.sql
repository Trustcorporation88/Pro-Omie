-- Logotipo por empresa (matriz), usado no cabeçalho dos PDFs. Só cria a tabela nova.
-- CreateTable
CREATE TABLE "logos_empresa" (
    "empresaId" TEXT NOT NULL,
    "imagem" BYTEA NOT NULL,
    "formato" TEXT NOT NULL,
    "largura" INTEGER NOT NULL,
    "altura" INTEGER NOT NULL,
    "atualizadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logos_empresa_pkey" PRIMARY KEY ("empresaId")
);

-- AddForeignKey
ALTER TABLE "logos_empresa" ADD CONSTRAINT "logos_empresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

