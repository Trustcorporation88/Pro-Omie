-- Cadastros por empresa.
-- Clientes e fornecedores, produtos, categorias, centros de custo, formas e condições de pagamento
-- e regras de conciliação passam a pertencer a uma empresa (a matriz; as filiais usam os da matriz).
-- A auditoria ganha a empresa de cada evento (nulo = evento do grupo).
--
-- Dados existentes:
--   1. Tudo vai para a empresa mais antiga (em produção, a única existente).
--   2. Se houver outras empresas, cada uma recebe uma cópia do plano (categorias, centros de custo,
--      formas e condições de pagamento) e os títulos, rateios e baixas dela passam a apontar para as
--      cópias. Clientes e fornecedores usados pelos títulos dela também são copiados para ela.
-- Os ids das cópias são determinísticos (md5 do id original + empresa), então reaplicar dá o mesmo resultado.

-- ───────── 1. colunas (sem obrigatoriedade ainda) ─────────
ALTER TABLE "auditoria" ADD COLUMN "empresaId" TEXT;
ALTER TABLE "pessoas" ADD COLUMN "empresaId" TEXT;
ALTER TABLE "produtos" ADD COLUMN "empresaId" TEXT;
ALTER TABLE "categorias" ADD COLUMN "empresaId" TEXT;
ALTER TABLE "centros_custo" ADD COLUMN "empresaId" TEXT;
ALTER TABLE "formas_pagamento" ADD COLUMN "empresaId" TEXT;
ALTER TABLE "condicoes_pagamento" ADD COLUMN "empresaId" TEXT;
ALTER TABLE "regras_conciliacao" ADD COLUMN "empresaId" TEXT;

-- os índices únicos globais saem antes das cópias (a mesma categoria passa a existir em mais de uma empresa)
DROP INDEX "pessoas_documento_key";
DROP INDEX "pessoas_nome_idx";
DROP INDEX "produtos_codigo_key";
DROP INDEX "produtos_descricao_idx";
DROP INDEX "categorias_tipo_nome_key";
DROP INDEX "centros_custo_nome_key";
DROP INDEX "formas_pagamento_nome_key";
DROP INDEX "condicoes_pagamento_nome_key";

-- ───────── 2. tudo o que existe vai para a empresa mais antiga ─────────
CREATE TEMP TABLE "_mig_base" AS
  SELECT id FROM "empresas" WHERE "matrizId" IS NULL ORDER BY "createdAt", id LIMIT 1;

UPDATE "pessoas" SET "empresaId" = (SELECT id FROM "_mig_base") WHERE "empresaId" IS NULL;
UPDATE "produtos" SET "empresaId" = (SELECT id FROM "_mig_base") WHERE "empresaId" IS NULL;
UPDATE "categorias" SET "empresaId" = (SELECT id FROM "_mig_base") WHERE "empresaId" IS NULL;
UPDATE "centros_custo" SET "empresaId" = (SELECT id FROM "_mig_base") WHERE "empresaId" IS NULL;
UPDATE "formas_pagamento" SET "empresaId" = (SELECT id FROM "_mig_base") WHERE "empresaId" IS NULL;
UPDATE "condicoes_pagamento" SET "empresaId" = (SELECT id FROM "_mig_base") WHERE "empresaId" IS NULL;
UPDATE "regras_conciliacao" SET "empresaId" = (SELECT id FROM "_mig_base") WHERE "empresaId" IS NULL;

-- ───────── 3. demais empresas do grupo: cópia do plano e remapeamento ─────────
CREATE TEMP TABLE "_mig_outras" AS
  SELECT id FROM "empresas" WHERE "matrizId" IS NULL AND id NOT IN (SELECT id FROM "_mig_base");

CREATE TEMP TABLE "_mig_map" (tabela TEXT NOT NULL, antigo TEXT NOT NULL, empresa TEXT NOT NULL, novo TEXT NOT NULL);

-- plano completo para cada outra empresa
INSERT INTO "_mig_map" (tabela, antigo, empresa, novo)
  SELECT 'categorias', c.id, o.id, 'c' || substr(md5(c.id || ':' || o.id || ':categorias'), 1, 24)
  FROM "categorias" c CROSS JOIN "_mig_outras" o WHERE c."empresaId" = (SELECT id FROM "_mig_base");
INSERT INTO "_mig_map" (tabela, antigo, empresa, novo)
  SELECT 'centros_custo', c.id, o.id, 'c' || substr(md5(c.id || ':' || o.id || ':centros_custo'), 1, 24)
  FROM "centros_custo" c CROSS JOIN "_mig_outras" o WHERE c."empresaId" = (SELECT id FROM "_mig_base");
INSERT INTO "_mig_map" (tabela, antigo, empresa, novo)
  SELECT 'formas_pagamento', f.id, o.id, 'c' || substr(md5(f.id || ':' || o.id || ':formas_pagamento'), 1, 24)
  FROM "formas_pagamento" f CROSS JOIN "_mig_outras" o WHERE f."empresaId" = (SELECT id FROM "_mig_base");
INSERT INTO "_mig_map" (tabela, antigo, empresa, novo)
  SELECT 'condicoes_pagamento', c.id, o.id, 'c' || substr(md5(c.id || ':' || o.id || ':condicoes_pagamento'), 1, 24)
  FROM "condicoes_pagamento" c CROSS JOIN "_mig_outras" o WHERE c."empresaId" = (SELECT id FROM "_mig_base");
-- clientes e fornecedores usados pelos títulos de cada outra empresa
INSERT INTO "_mig_map" (tabela, antigo, empresa, novo)
  SELECT DISTINCT 'pessoas', t."pessoaId", COALESCE(e."matrizId", e.id),
         'c' || substr(md5(t."pessoaId" || ':' || COALESCE(e."matrizId", e.id) || ':pessoas'), 1, 24)
  FROM "titulos" t JOIN "empresas" e ON e.id = t."empresaId"
  WHERE t."pessoaId" IS NOT NULL AND COALESCE(e."matrizId", e.id) IN (SELECT id FROM "_mig_outras");

INSERT INTO "categorias" (id, "empresaId", codigo, nome, tipo, "grupoDre", ativo, "createdAt", "updatedAt")
  SELECT m.novo, m.empresa, c.codigo, c.nome, c.tipo, c."grupoDre", c.ativo, c."createdAt", CURRENT_TIMESTAMP
  FROM "categorias" c JOIN "_mig_map" m ON m.tabela = 'categorias' AND m.antigo = c.id;
INSERT INTO "centros_custo" (id, "empresaId", codigo, nome, ativo, "createdAt", "updatedAt")
  SELECT m.novo, m.empresa, c.codigo, c.nome, c.ativo, c."createdAt", CURRENT_TIMESTAMP
  FROM "centros_custo" c JOIN "_mig_map" m ON m.tabela = 'centros_custo' AND m.antigo = c.id;
INSERT INTO "formas_pagamento" (id, "empresaId", nome, meio, ativo, "createdAt", "updatedAt")
  SELECT m.novo, m.empresa, f.nome, f.meio, f.ativo, f."createdAt", CURRENT_TIMESTAMP
  FROM "formas_pagamento" f JOIN "_mig_map" m ON m.tabela = 'formas_pagamento' AND m.antigo = f.id;
INSERT INTO "condicoes_pagamento" (id, "empresaId", nome, dias, ativo, "createdAt", "updatedAt")
  SELECT m.novo, m.empresa, c.nome, c.dias, c.ativo, c."createdAt", CURRENT_TIMESTAMP
  FROM "condicoes_pagamento" c JOIN "_mig_map" m ON m.tabela = 'condicoes_pagamento' AND m.antigo = c.id;
INSERT INTO "pessoas" (id, "empresaId", "tipoPessoa", documento, nome, "nomeFantasia", cliente, fornecedor, "indicadorIE",
                       "inscricaoEstadual", "inscricaoMunicipal", email, telefone, contato, cep, logradouro, numero, complemento,
                       bairro, cidade, uf, "codigoMunicipio", "limiteCredito", observacoes, ativo, "createdAt", "updatedAt")
  SELECT m.novo, m.empresa, p."tipoPessoa", p.documento, p.nome, p."nomeFantasia", p.cliente, p.fornecedor, p."indicadorIE",
         p."inscricaoEstadual", p."inscricaoMunicipal", p.email, p.telefone, p.contato, p.cep, p.logradouro, p.numero, p.complemento,
         p.bairro, p.cidade, p.uf, p."codigoMunicipio", p."limiteCredito", p.observacoes, p.ativo, p."createdAt", CURRENT_TIMESTAMP
  FROM "pessoas" p JOIN "_mig_map" m ON m.tabela = 'pessoas' AND m.antigo = p.id;

-- títulos, rateios e baixas das outras empresas passam a apontar para as cópias
UPDATE "titulos" t SET "categoriaId" = m.novo FROM "empresas" e, "_mig_map" m
  WHERE e.id = t."empresaId" AND m.tabela = 'categorias' AND m.antigo = t."categoriaId" AND m.empresa = COALESCE(e."matrizId", e.id);
UPDATE "titulos" t SET "centroCustoId" = m.novo FROM "empresas" e, "_mig_map" m
  WHERE e.id = t."empresaId" AND m.tabela = 'centros_custo' AND m.antigo = t."centroCustoId" AND m.empresa = COALESCE(e."matrizId", e.id);
UPDATE "titulos" t SET "formaPagamentoId" = m.novo FROM "empresas" e, "_mig_map" m
  WHERE e.id = t."empresaId" AND m.tabela = 'formas_pagamento' AND m.antigo = t."formaPagamentoId" AND m.empresa = COALESCE(e."matrizId", e.id);
UPDATE "titulos" t SET "pessoaId" = m.novo FROM "empresas" e, "_mig_map" m
  WHERE e.id = t."empresaId" AND m.tabela = 'pessoas' AND m.antigo = t."pessoaId" AND m.empresa = COALESCE(e."matrizId", e.id);
UPDATE "titulo_rateios" r SET "categoriaId" = m.novo FROM "titulos" t, "empresas" e, "_mig_map" m
  WHERE t.id = r."tituloId" AND e.id = t."empresaId" AND m.tabela = 'categorias' AND m.antigo = r."categoriaId" AND m.empresa = COALESCE(e."matrizId", e.id);
UPDATE "titulo_rateios" r SET "centroCustoId" = m.novo FROM "titulos" t, "empresas" e, "_mig_map" m
  WHERE t.id = r."tituloId" AND e.id = t."empresaId" AND m.tabela = 'centros_custo' AND m.antigo = r."centroCustoId" AND m.empresa = COALESCE(e."matrizId", e.id);
UPDATE "baixas" b SET "formaPagamentoId" = m.novo FROM "titulos" t, "empresas" e, "_mig_map" m
  WHERE t.id = b."tituloId" AND e.id = t."empresaId" AND m.tabela = 'formas_pagamento' AND m.antigo = b."formaPagamentoId" AND m.empresa = COALESCE(e."matrizId", e.id);

-- ───────── 4. empresa de cada evento da auditoria ─────────
UPDATE "auditoria" a SET "empresaId" = COALESCE(e."matrizId", e.id) FROM "titulos" t, "empresas" e
  WHERE a.entidade = 'titulo' AND a."entidadeId" = t.id AND e.id = t."empresaId";
UPDATE "auditoria" a SET "empresaId" = COALESCE(e."matrizId", e.id) FROM "baixas" b, "titulos" t, "empresas" e
  WHERE a.entidade = 'baixa' AND a."entidadeId" = b.id AND t.id = b."tituloId" AND e.id = t."empresaId";
UPDATE "auditoria" a SET "empresaId" = COALESCE(e."matrizId", e.id) FROM "contas_bancarias" c, "empresas" e
  WHERE a.entidade = 'conta_bancaria' AND a."entidadeId" = c.id AND e.id = c."empresaId";
UPDATE "auditoria" a SET "empresaId" = COALESCE(e."matrizId", e.id) FROM "extrato_itens" i, "contas_bancarias" c, "empresas" e
  WHERE a.entidade = 'conciliacao' AND a."entidadeId" = i.id AND c.id = i."contaBancariaId" AND e.id = c."empresaId";
UPDATE "auditoria" a SET "empresaId" = COALESCE(e."matrizId", e.id) FROM "empresas" e
  WHERE a.entidade = 'empresa' AND a."entidadeId" = e.id;
-- o restante (cadastros, regras, transferências…) era da empresa mais antiga; eventos de usuário ficam como do grupo
UPDATE "auditoria" SET "empresaId" = (SELECT id FROM "_mig_base") WHERE "empresaId" IS NULL AND entidade <> 'usuario';

DROP TABLE "_mig_map";
DROP TABLE "_mig_outras";
DROP TABLE "_mig_base";

-- ───────── 5. obrigatoriedade, índices e chaves ─────────
ALTER TABLE "pessoas" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "produtos" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "categorias" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "centros_custo" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "formas_pagamento" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "condicoes_pagamento" ALTER COLUMN "empresaId" SET NOT NULL;
ALTER TABLE "regras_conciliacao" ALTER COLUMN "empresaId" SET NOT NULL;

CREATE INDEX "auditoria_empresaId_createdAt_idx" ON "auditoria"("empresaId", "createdAt");
CREATE INDEX "pessoas_empresaId_nome_idx" ON "pessoas"("empresaId", "nome");
CREATE UNIQUE INDEX "pessoas_empresaId_documento_key" ON "pessoas"("empresaId", "documento");
CREATE INDEX "produtos_empresaId_descricao_idx" ON "produtos"("empresaId", "descricao");
CREATE UNIQUE INDEX "produtos_empresaId_codigo_key" ON "produtos"("empresaId", "codigo");
CREATE UNIQUE INDEX "categorias_empresaId_tipo_nome_key" ON "categorias"("empresaId", "tipo", "nome");
CREATE UNIQUE INDEX "centros_custo_empresaId_nome_key" ON "centros_custo"("empresaId", "nome");
CREATE UNIQUE INDEX "formas_pagamento_empresaId_nome_key" ON "formas_pagamento"("empresaId", "nome");
CREATE UNIQUE INDEX "condicoes_pagamento_empresaId_nome_key" ON "condicoes_pagamento"("empresaId", "nome");
CREATE INDEX "regras_conciliacao_empresaId_idx" ON "regras_conciliacao"("empresaId");

ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "centros_custo" ADD CONSTRAINT "centros_custo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "formas_pagamento" ADD CONSTRAINT "formas_pagamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "condicoes_pagamento" ADD CONSTRAINT "condicoes_pagamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "regras_conciliacao" ADD CONSTRAINT "regras_conciliacao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
