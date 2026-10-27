-- Apuração mensal de paletes: padrão da tarifa = mês do calendário, paletes no fim do período; reservadas só se marcado.
ALTER TABLE "tarifas_armazem" ALTER COLUMN "periodo" SET DEFAULT 'MES';
ALTER TABLE "tarifas_armazem" ALTER COLUMN "metodo" SET DEFAULT 'FIM_PERIODO';
ALTER TABLE "tarifas_armazem" ALTER COLUMN "cobrarReservadas" SET DEFAULT false;

-- Faturamento: quantidade de paletes apurada no último dia do período
ALTER TABLE "faturamentos_armazem" ADD COLUMN "apurado" INTEGER NOT NULL DEFAULT 0;
