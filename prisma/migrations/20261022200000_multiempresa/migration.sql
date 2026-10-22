-- Multiempresa: acesso do usuário por empresa.
-- Quem já existe continua vendo tudo (todasEmpresas = true), então ninguém perde acesso.
ALTER TABLE "usuarios"
  ADD COLUMN "todasEmpresas" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "empresas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
