# Pro Omie

ERP interno da Trustcorp. Objetivo: igualar e superar o Omie em financeiro, vendas, estoque, fiscal, contratos e contabilidade, sem digitar nada duas vezes.

## O que já funciona (Fases 0 e 1)

**Fundação**
- Login próprio com perfis (Administrador, Financeiro, Vendas, Estoque, Contador somente leitura), bloqueio após 5 tentativas, troca obrigatória da senha provisória e sessões revogáveis.
- Configuração inicial protegida por token (`/setup?token=...`): cria a empresa matriz (dados puxados da Receita pelo CNPJ), o administrador e os cadastros padrão (plano de categorias com grupos da DRE, formas e condições de pagamento, centros de custo, conta Caixa).
- Cadastros: clientes e fornecedores (consulta de CNPJ na Receita e CEP no ViaCEP), produtos e serviços com dados fiscais (NCM, CEST, origem, item da LC 116), categorias financeiras, centros de custo, contas bancárias com saldo, formas e condições de pagamento.
- Administração: empresa e filiais, usuários (senha provisória exibida uma única vez) e trilha de auditoria com diferenças antes/depois.
- Busca global (Ctrl+K), tema claro e escuro.

**Financeiro**
- Contas a receber e a pagar: lançamentos únicos, parcelados (por intervalo ou condição de pagamento) e recorrentes, rateio por categoria e centro de custo, baixa total ou parcial com juros, multa e desconto, baixa em lote, estorno, cancelamento, duplicação e anexos.
- Movimentações por conta com saldo acumulado, transferências entre contas e ajustes.
- Conciliação bancária por OFX (SGML e XML, Windows-1252/UTF-8): sugestões automáticas de movimento e de título, criação de lançamento a partir do extrato, regras por descrição e conciliação automática em lote.
- Fluxo de caixa realizado e previsto (dia, semana ou mês) com exportação CSV.
- DRE gerencial por competência ou caixa, mês a mês, com margens.
- Painel com saldos, vencimentos, atrasados e gráficos.

## Stack

- Next.js 16 (App Router, Server Actions) + React 19 + TypeScript
- Prisma 7 com `@prisma/adapter-pg` → Postgres no Supabase (schema `erp`, fora da Data API)
- Tailwind CSS 4 + shadcn/ui + Recharts
- Deploy na Vercel, região São Paulo (`gru1`); migrations aplicadas no build de produção

## Estrutura

```
prisma/                 schema e migrations
src/app/(auth)          login, configuração inicial, troca de senha
src/app/(app)           telas do ERP (painel, financeiro, cadastros, configurações)
src/modules/<domínio>   regras de negócio, server actions e consultas
src/components          componentes de interface
src/lib                 banco, sessão, permissões, auditoria, datas e formatação BR
scripts/vercel-build.mjs  build da Vercel (migrations só em produção)
```

Regras de negócio do financeiro ficam em `src/modules/financeiro/servicos.ts` e são reutilizadas pela conciliação e, nas próximas fases, por vendas, compras, notas e contratos.

## Desenvolvimento

```bash
cp .env.example .env.local   # preencha as variáveis
npm install
npx prisma migrate deploy
npm run dev
```

Verificações: `npm run lint`, `npm run typecheck`, `npm run build`.

## Deploy (Vercel)

- `vercel.json` fixa a região `gru1` (São Paulo, perto do Supabase `sa-east-1`) e usa `scripts/vercel-build.mjs` como comando de build.
- O build aplica `prisma migrate deploy` apenas quando `VERCEL_ENV=production`; previews nunca alteram o banco.
- Commits em branches diferentes de `main` não geram build (Ignored Build Step).
- Variáveis de ambiente ficam só no ambiente Production da Vercel.
- Anexos: até 4 MB (as funções da Vercel aceitam até 4,5 MB por requisição).
- Uso comercial (caso deste ERP) exige o plano Pro da Vercel; o Hobby é só para uso pessoal.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Pooler do Supabase em modo transação (porta 6543), usado pelo app |
| `DIRECT_URL` | Pooler em modo sessão (porta 5432) com `?schema=erp`, usado nas migrations |
| `AUTH_SECRET` | Segredo da sessão (mínimo 32 caracteres) |
| `DATABASE_POOL_MAX` | Opcional. Conexões por instância (padrão 3 na Vercel, 8 fora dela) |
| `SETUP_TOKEN` | Token da configuração inicial |

## Roteiro

- Fase 2: Vendas e CRM (funil, propostas, pedidos, faturamento)
- Fase 3: Estoque e compras (custo médio, curva ABC, entrada por XML)
- Fase 4: Fiscal e cobrança (NF-e, NFS-e, boletos e PIX via provedores homologados)
- Fase 5: Contratos recorrentes e ordens de serviço
- Fase 6: Painel do contador e exportação contábil
- Fase 7: IA sobre os dados, alertas, API pública e app mobile
