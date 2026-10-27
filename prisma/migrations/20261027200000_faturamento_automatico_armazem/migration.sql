-- Faturamento automático da armazenagem: a tarifa fatura sozinha no dia seguinte ao fim do período (padrão: ligado).
ALTER TABLE "tarifas_armazem" ADD COLUMN "faturarAutomatico" BOOLEAN NOT NULL DEFAULT true;
