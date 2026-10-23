# Pro Omie

ERP interno da Trustcorp. Objetivo: igualar e superar o Omie em financeiro, vendas, estoque, fiscal, contratos e contabilidade, sem digitar nada duas vezes.

## O que já funciona (Fases 0 a 3)

**Fundação**
- Login próprio com perfis (Administrador, Financeiro, Vendas, Estoque, Contador somente leitura), bloqueio após 5 tentativas, troca obrigatória da senha provisória e sessões revogáveis.
- Configuração inicial protegida por token (`/setup?token=...`): cria a empresa matriz (dados puxados da Receita pelo CNPJ), o administrador e os cadastros padrão (plano de categorias com grupos da DRE, formas e condições de pagamento, centros de custo, conta Caixa).
- Cadastros: clientes e fornecedores (consulta de CNPJ na Receita e CEP no ViaCEP), produtos e serviços com dados fiscais (NCM, CEST, origem, item da LC 116), categorias financeiras, centros de custo, contas bancárias com saldo, formas e condições de pagamento.
- Multiempresa: várias empresas do grupo, cada uma com CNPJ, filiais, contas bancárias, cadastros (clientes e fornecedores, produtos, categorias, centros de custo, formas e condições de pagamento, regras de conciliação), lançamentos e relatórios próprios. Seletor de empresa no menu; empresa nova nasce com o plano de contas padrão e a conta Caixa.
- Administração: empresas e filiais (com logotipo próprio, que sai no cabeçalho dos PDFs da empresa e das filiais, e certificado digital A1 por CNPJ), usuários (senha provisória exibida uma única vez) e trilha de auditoria com diferenças antes/depois. Administrador do grupo (todas as empresas) cria empresas e libera qualquer acesso; administrador de empresa administra só as empresas liberadas a ele (dados, filiais, usuários restritos a elas e auditoria delas).
- Busca global (Ctrl+K), tema claro e escuro.

**Financeiro**
- Contas a receber e a pagar: lançamentos únicos, parcelados (por intervalo ou condição de pagamento) e recorrentes, rateio por categoria e centro de custo, baixa total ou parcial com juros, multa e desconto, baixa em lote, estorno, cancelamento, duplicação e anexos.
- Movimentações por conta com saldo acumulado, transferências entre contas e ajustes.
- Conciliação bancária por OFX (SGML e XML, Windows-1252/UTF-8): sugestões automáticas de movimento e de título, criação de lançamento a partir do extrato, regras por descrição e conciliação automática em lote.
- Fluxo de caixa realizado e previsto (dia, semana ou mês) com exportação CSV.
- DRE gerencial por competência ou caixa, mês a mês, com margens.
- Painel com saldos, vencimentos, atrasados e gráficos.

**CRM (Fase 2)**
- Funil de vendas em colunas (Descoberta, Proposta, Negociação): arraste o cartão para mudar de etapa ou solte em Ganhou / Perdeu; no celular, menu Mover para. Chance por etapa (20%, 50%, 80%) e previsão ponderada.
- Oportunidade com cliente (cadastro rápido na hora, com busca do CNPJ na Receita), contato, valor estimado, previsão de fechamento, responsável e origem do contato. Perda exige motivo; reabrir volta à etapa em que estava. Histórico de cada mudança.
- Atividades (ligação, WhatsApp, e-mail, reunião, visita, tarefa) com data e hora, ligadas à oportunidade ou ao cliente. Agenda com atrasadas, hoje e próximos 7 dias, selo no menu com as pendências do dia e "agendar próxima" ao concluir. Cartão sem próxima atividade fica sinalizado.
- Indicadores: em aberto, previsão ponderada, ganho e conversão em 90 dias, ticket médio e motivos de perda.
- Proposta criada a partir da oportunidade já vem com cliente e responsável, avança a etapa para Proposta e, ao ser aprovada, marca a oportunidade como ganha com o valor da proposta.

**Estoque e venda de recicláveis (Fase 3)**
- Materiais recicláveis escolhidos numa lista (papel, papelão, plásticos, alumínio, cobre, latão, chumbo, ferro, inox, prata, vidro, eletrônicos): cada um vira um produto vendido por kg, com grupo e NCM sugerido para resíduos e sucatas. Outros produtos com controle de estoque também entram.
- Entrada da produção ou da triagem numa grade com todos os materiais (só o peso do que entrou), com cliente de origem e referência (processo, MTR, lote, ticket de pesagem) para rastrear a origem.
- Saldo por estabelecimento (matriz e filiais), valor estimado a preço de venda, última entrada e vendido em 30 dias. Atualização rápida do preço por kg de todos os materiais.
- Faturar o pedido dá baixa no estoque, material por material, no estabelecimento emissor; falta de saldo recusa o faturamento inteiro (o diálogo mostra antes o que sai, o saldo e o que fica). Desfazer o faturamento devolve o material.
- Ajuste pelo saldo contado (inventário, perda de umidade, correção, destinação sem venda), recusado se o saldo mudou enquanto a pessoa contava. Excluir entrada ou ajuste desfaz o efeito, e é recusado se o material já saiu.
- Extrato por material com saldo acumulado, resumo de 90 dias e vendas dos últimos 6 meses. Relatório de vendas por material (quantidade, receita, preço médio, compradores) com exportação CSV. Botão Vender abre o pedido já com o material, o saldo e o preço.
- O saldo é sempre a soma dos lançamentos e nunca fica negativo (trava também no banco). Perfis: Estoque lança e ajusta; Vendas e Contador consultam.

**Vendas (Fase 2)**
- Propostas comerciais: itens de produto ou serviço (do cadastro ou avulsos), quantidade com até 3 casas (venda por kg), preço com até 4, desconto por item, validade, condição e forma de pagamento, observações para o cliente e internas. Situações: rascunho, enviada, aprovada, recusada (com motivo) e cancelada, com reabertura.
- Pedidos de venda gerados da proposta aprovada ou criados direto. Faturar o pedido gera as contas a receber pela condição de pagamento, com rateio entre as categorias de produtos e de serviços; desfazer o faturamento é possível enquanto não houver recebimento.
- PDF da proposta e do pedido com os dados da empresa emissora. Numeração própria por empresa. Perfil Vendas cria propostas e pedidos; faturar exige também acesso ao financeiro.

## Stack

- Next.js 16 (App Router, Server Actions) + React 19 + TypeScript
- Prisma 7 com `@prisma/adapter-pg` → Postgres no Supabase (schema `erp`, fora da Data API)
- Tailwind CSS 4 + shadcn/ui + Recharts
- Deploy na Vercel, região São Paulo (`gru1`); migrations aplicadas no build de produção

## Estrutura

```
prisma/                 schema e migrations
src/app/(auth)          login, configuração inicial, troca de senha
src/app/(app)           telas do ERP (painel, financeiro, CRM, vendas, estoque, cadastros, configurações)
src/modules/<domínio>   regras de negócio, server actions e consultas
src/components          componentes de interface
src/lib                 banco, sessão, permissões, auditoria, datas e formatação BR
scripts/vercel-build.mjs  build da Vercel (migrations só em produção)
```

Regras de negócio do financeiro ficam em `src/modules/financeiro/servicos.ts` e são reutilizadas pela conciliação e, nas próximas fases, por vendas, compras, notas e contratos.

## Marca

Logotipo e ícones ficam em `marca/` como texto base64, porque a integração usada para publicar no GitHub só envia arquivos de texto. O `scripts/gerar-marca.mjs` recria os arquivos binários (`public/marca/*.webp`, `src/app/icon.png`, `apple-icon.png` e `favicon.ico`) antes de `npm run dev`, `npm run build` e do build da Vercel. Para trocar o logotipo, substitua esses arquivos e rode `npm run marca:codificar`. Os atuais foram recortados da arte de 2400 px (ícone de 256 px, nome de 663 × 260 px).

**Certificado digital A1** (para a Fase 4): enviado por estabelecimento em Configurações › Empresas e filiais (.pfx ou .p12 com a senha). O servidor abre o arquivo com a senha (node-forge, que lê também o formato RC2 antigo que o OpenSSL 3 recusa), recusa vencido, de outro CNPJ (raiz diferente), sem CNPJ (e-CPF) ou sem chave privada, e guarda arquivo e senha cifrados com AES-256-GCM (`CERTIFICADOS_CHAVE`, com o id da empresa autenticado junto). A senha nunca volta para a tela nem vai para a auditoria. Filial sem certificado usa o da matriz. O painel avisa os administradores 30 dias antes do vencimento. Código em `src/modules/configuracoes/certificado.ts` (`certificadoParaEmissao` entrega o certificado aberto para a emissão).

**Notas recebidas** (Fase 4, etapa 1): busca as NF-e, CT-e e NFS-e emitidas contra o CNPJ de cada estabelecimento com o certificado A1. A NF-e e o CT-e vêm do DistDFe do Ambiente Nacional da SEFAZ; a NFS-e, do Ambiente de Dados Nacional (ADN). Há dois motores com a mesma interface (`src/modules/fiscal/motor.ts`):

- **SEFAZ direto** (padrão, sem custo, `src/modules/fiscal/sefaz/`). O mTLS usa o A1 e valida o servidor com as raízes do Node mais as ACs ICP-Brasil (`ac-icp-brasil.ts`).
- **Focus NFe** (reserva, desligado, `src/modules/fiscal/focus/`). Para ativar: crie `FOCUS_NFE_TOKEN_MASTER` na Vercel; em Configurações › Empresas e filiais › Notas recebidas, use "Ativar na Focus" (cadastra o estabelecimento lá com o certificado do ERP e liga a busca de notas) e escolha o motor Focus.

Regras (vindas do HUBCLONE/ProContador Office, que já roda isso em produção):

- Uma execução por CNPJ (trava no banco).
- Depois de "nenhum documento" ou do fim do acervo, e depois do erro 656, a próxima consulta de NF-e e CT-e só acontece 1 hora depois. A guarda é local: o sistema nem chama a SEFAZ antes disso.
- O cursor é salvo página a página, e só quando todos os documentos da página foram gravados.
- O resumo nunca substitui o XML completo, e o cancelamento marca a nota.

A ciência automática (opcional) libera o XML completo. A confirmação, o desconhecimento e a "operação não realizada" são feitos na tela, assinados com XMLDSig (`sefaz/assinatura.ts`) e enviados ao NFeRecepcaoEvento4 do AN. A nota recebida vai para o contas a pagar com as parcelas das duplicatas, e o fornecedor é cadastrado pelo CNPJ.

A busca nasce desligada por estabelecimento. Dois sistemas consultando a SEFAZ para o mesmo CNPJ (por exemplo, o ProContador) levam a SEFAZ a bloquear o CNPJ com o erro 656. O Cron da Vercel (`vercel.json`) chama `/api/cron/fiscal` de hora em hora com `CRON_SECRET`.

O logotipo de cada empresa (o que sai nas propostas e pedidos) é outra coisa: o administrador envia em Configurações › Empresas e filiais. O navegador corta as margens vazias, reduz para até 1200 × 600 px e converte para PNG (ou JPEG, se ficar pesado); o servidor aceita até 700 KB, confere o formato e gera um PDF de teste antes de gravar (`src/modules/configuracoes/logotipo.ts`).

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
| `CNPJ_API_KEY` | Chave do CNPJ Trust ou da CNPJá: consulta de CNPJ com Simples/MEI e inscrição estadual (sem ela, fontes gratuitas) |
| `CERTIFICADOS_CHAVE` | 32 bytes em base64 (`openssl rand -base64 32`). Cifra o arquivo e a senha dos certificados A1 (e os tokens da Focus). Não troque: os certificados já enviados deixam de abrir e precisam ser reenviados |
| `CRON_SECRET` | Segredo que a Vercel manda no cron de hora em hora (`/api/cron/fiscal`). Sem ele o cron responde 401 |
| `FOCUS_NFE_TOKEN_MASTER` | Opcional. Token Master da conta Focus NFe; só para o motor reserva (cadastra os estabelecimentos lá). Sensível |

## Roteiro

- Fase 2: Vendas e CRM ✔ (funil, atividades, propostas, pedidos e faturamento)
- Fase 3: Estoque ✔ (recicláveis, entradas, baixa na venda, ajustes, relatório por material); falta compras (custo médio, entrada por XML)
- Fase 4: Fiscal e cobrança: notas recebidas ✔ (NF-e, CT-e e NFS-e direto na SEFAZ e no ADN, manifestação e contas a pagar; Focus NFe pronta como reserva); falta emissão de NF-e e NFS-e (direto na SEFAZ, com a Focus como reserva), boletos e PIX
- Fase 5: Contratos recorrentes e ordens de serviço
- Fase 6: Painel do contador e exportação contábil
- Fase 7: IA sobre os dados, alertas, API pública e app mobile
