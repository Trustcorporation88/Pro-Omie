// Conteúdo do Manual do usuário (rota /ajuda e PDF). Seguro para client e server.
// Marcação: **negrito** para botões e campos; [[/rota]] para o caminho do menu (o nome vem da navegação);
// [[ajuda:secao#topico|texto]] para outra parte do manual. Os testes conferem que toda referência existe.
import type { IdImagem } from "./imagens";
import type { Bloco, Secao } from "./tipos";

const texto = (t: string): Bloco => ({ tipo: "texto", texto: t });
const passos = (itens: string[], titulo?: string): Bloco => ({ tipo: "passos", itens, titulo });
const lista = (itens: string[], titulo?: string): Bloco => ({ tipo: "lista", itens, titulo });
const dica = (t: string): Bloco => ({ tipo: "dica", texto: t });
const atencao = (t: string): Bloco => ({ tipo: "atencao", texto: t });
const tabela = (colunas: string[], linhas: string[][]): Bloco => ({ tipo: "tabela", colunas, linhas });
/** imagem da tela (public/manual/<id>.png); marcas = o que é cada número laranja, na ordem em que aparecem na imagem */
const imagem = (id: IdImagem, legenda: string, alt: string, marcas?: string[]): Bloco => ({ tipo: "imagem", imagem: id, legenda, alt, marcas });

export const MANUAL: Secao[] = [
  {
    id: "primeiros-passos",
    titulo: "Primeiros passos",
    resumo: "Entrar no sistema, escolher a empresa, encontrar as telas e entender o que cada perfil pode fazer.",
    icone: "Rocket",
    quem: "Todos os usuários.",
    caminhos: ["/sem-permissao"],
    topicos: [
      {
        id: "acesso",
        titulo: "Entrar no sistema",
        blocos: [
          texto("O Pro Omie fica em **erp.trustcorp.com.br**. Entre com o seu e-mail e a sua senha."),
          passos(
            [
              "Abra o e-mail **Seu acesso ao Pro Omie**: ele traz a senha provisória e o link de entrada.",
              "Entre com o seu e-mail e a senha provisória.",
              "O sistema pede para você criar a sua senha, com pelo menos 10 caracteres. Use uma senha só sua.",
            ],
            "No primeiro acesso",
          ),
          passos(
            [
              "Na tela de entrada, clique em **Esqueci minha senha** e informe o seu e-mail.",
              "Abra o link que chega por e-mail (vale por 1 hora e uma vez só) e crie a nova senha.",
            ],
            "Esqueceu a senha?",
          ),
          atencao("Depois de 5 tentativas erradas seguidas, o acesso fica bloqueado por 15 minutos. Um administrador pode liberar antes, em [[/configuracoes/usuarios]] › **Desbloquear**."),
          texto("Para trocar a senha ou sair, use o menu com o seu nome, no canto superior direito: **Trocar senha** ou **Sair**."),
        ],
      },
      {
        id: "empresa",
        titulo: "Escolher a empresa",
        blocos: [
          texto("Cada empresa do grupo tem as próprias contas, cadastros, lançamentos, notas e relatórios. A empresa ativa aparece no topo do menu lateral."),
          passos(["Clique no nome da empresa, no topo do menu.", "Escolha a outra empresa. Todas as telas passam a mostrar só os dados dela e das filiais dela."]),
          dica("Você só vê as empresas liberadas para o seu usuário. Se faltar alguma, peça a um administrador."),
        ],
      },
      {
        id: "navegar",
        titulo: "Encontrar as telas",
        blocos: [
          lista([
            "**Menu lateral**: as telas ficam agrupadas por assunto (Financeiro, CRM, Vendas, Estoque, Serviços, Fiscal, Cadastros e Administração). O botão ao lado da busca recolhe ou abre o menu; no celular, ele abre o menu por cima da tela.",
            "**Busca rápida**: clique em **Buscar clientes, títulos, produtos…**, no topo, ou aperte **Ctrl K**. Digite um nome, um CNPJ, o número de um título ou o nome de uma tela.",
            "**Painel**: a primeira tela, com o resumo do dia (veja [[ajuda:painel|Painel]]).",
            "**Manual**: o botão **Manual**, no topo de todas as telas, abre a parte deste manual sobre a tela em que você está.",
            "No menu com o seu nome, no canto de cima: **Trocar senha**, **Tema escuro** (ou **Tema claro**, para voltar às cores normais) e **Sair**.",
          ]),
          imagem(
            "navegar",
            "O painel, a primeira tela depois de entrar.",
            "Tela do Pro Omie com o menu lateral à esquerda, a busca e o botão Manual no topo e o painel ao centro.",
            ["Empresa ativa: clique para trocar de empresa ou de filial.", "**Menu lateral**: as telas, agrupadas por assunto.", "**Busca rápida** (ou **Ctrl K**).", "**Manual**: a ajuda da tela em que você está.", "Seu nome: **Trocar senha**, **Tema escuro** e **Sair**."],
          ),
        ],
      },
      {
        id: "perfis",
        titulo: "Perfis de acesso",
        blocos: [
          texto("Cada usuário tem um perfil e uma lista de empresas liberadas. O menu mostra só o que o seu perfil pode abrir; um link fora do seu perfil mostra **Acesso restrito**."),
          tabela(
            ["Perfil", "O que pode fazer"],
            [
              ["Administrador", "Tudo, inclusive empresas, certificado digital, emissão de notas, cobrança, usuários, e-mails e auditoria. O administrador do grupo vê todas as empresas; o administrador de uma empresa vê e gerencia só a dele."],
              ["Financeiro", "Contas a receber e a pagar, cobranças, bancos e conciliação, relatórios, faturamento de pedidos, estoque, armazém geral (com tarifas e faturamento da armazenagem), emissão de NF-e e NFS-e e notas recebidas. Não mexe em configurações nem em usuários."],
              ["Vendas", "CRM, propostas e pedidos e os cadastros de clientes e produtos; consulta o estoque e o armazém geral. Para faturar um pedido, precisa de alguém do Financeiro."],
              ["Estoque", "Saldos, entradas, ajustes, importação de planilha, entrada no estoque pela nota de compra e o armazém geral (recebimento, conferência, endereços e saída; consulta o faturamento da armazenagem); consulta pedidos, cadastros e notas."],
              ["Contador (somente leitura)", "Consulta o financeiro, os relatórios, as vendas, o estoque, o armazém geral e as notas e baixa o fechamento mensal. Não altera nada."],
            ],
          ),
        ],
      },
      {
        id: "manual",
        titulo: "Manual em PDF",
        blocos: [texto("Na primeira página do manual ([[/ajuda]]), **Baixar PDF** gera o manual completo das partes que o seu perfil usa, para imprimir ou mandar a quem vai usar o sistema.")],
      },
    ],
  },

  {
    id: "painel",
    titulo: "Painel",
    resumo: "O resumo do dia: dinheiro em conta, o que vence, o que atrasou e os próximos vencimentos.",
    icone: "LayoutDashboard",
    quem: "Todos; os números do financeiro aparecem para quem tem acesso a ele.",
    caminhos: ["/"],
    topicos: [
      {
        id: "indicadores",
        titulo: "O que o painel mostra",
        blocos: [
          lista([
            "**Saldo em contas**: a soma das contas bancárias e do caixa da empresa ativa.",
            "**A receber · hoje e 7 dias** e **A pagar · hoje e 7 dias**: o que vence agora e na semana.",
            "**Em atraso**: o que venceu e ainda não foi baixado.",
            "**Entradas × saídas — últimos 6 meses**: o realizado nas contas, sem as transferências entre contas.",
            "**Despesas do mês por categoria**.",
            "**Próximos vencimentos**: os 10 próximos títulos em aberto, a receber e a pagar.",
          ]),
          imagem(
            "painel",
            "Os cartões do painel levam à lista correspondente.",
            "Painel com os cartões de saldo em contas, a receber, a pagar e em atraso, e o gráfico de entradas e saídas dos últimos seis meses.",
            ["**Saldo em contas**: bancos e caixa.", "**A receber · hoje e 7 dias** (ao lado, o mesmo para pagar).", "**Em atraso**: o que venceu e não foi baixado."],
          ),
          dica("Os cartões levam à lista correspondente: por exemplo, **Em atraso** abre as contas a receber vencidas."),
        ],
      },
      {
        id: "avisos",
        titulo: "Primeiros passos e avisos",
        blocos: [
          texto("Enquanto a empresa ainda não tem lançamentos, o painel mostra a lista **Primeiros passos**, com o link de cada item a configurar. Avisos importantes, como o certificado digital perto de vencer, aparecem no topo com o botão para resolver (**Enviar o renovado**)."),
        ],
      },
    ],
  },

  {
    id: "financeiro",
    titulo: "Financeiro",
    resumo: "Contas a receber e a pagar, recebimentos e pagamentos, boleto e Pix, extratos, conciliação bancária, fluxo de caixa e DRE.",
    icone: "Wallet",
    permissao: "financeiro:ver",
    quem: "Financeiro e administradores; o Contador só consulta.",
    caminhos: ["/financeiro"],
    topicos: [
      {
        id: "contas",
        titulo: "Contas a receber e a pagar",
        caminhos: ["/financeiro/receber", "/financeiro/pagar", "/financeiro/titulos"],
        blocos: [
          texto("Cada conta é um **título**: valor, vencimento, cliente ou fornecedor, categoria e situação (em aberto, parcial, quitado, vencido ou cancelado). Elas ficam em [[/financeiro/receber]] e [[/financeiro/pagar]], com busca e filtro por vencimento e situação. Os cartões do topo (**Em aberto**, **Vencido**, **Vence hoje**, **Próximos 7 dias** e **Quitado no mês**) somam os títulos; clique num cartão para filtrar a lista."),
          imagem(
            "contas-receber",
            "A tela de contas a receber; a de pagar é igual.",
            "Tela Contas a receber com o botão Nova conta a receber, os cartões de resumo, as abas por situação e a lista de títulos.",
            ["**Nova conta a receber**.", "Os cartões do topo: clique num deles para filtrar a lista.", "Abas por situação; ao lado, a busca e os filtros.", "O menu da linha: **Receber**, **Editar**, **Duplicar** e mais."],
          ),
          passos(
            [
              "Clique em **Nova conta a receber** (ou **Nova conta a pagar**).",
              "Preencha a **Descrição**, o cliente ou fornecedor, o **Valor** e o vencimento. O **Documento** é o número da nota ou do boleto.",
              "Em **Classificação**, escolha a **Categoria** (é ela que leva o valor para a DRE) e, se usar, o **Centro de custo**. Para dividir o valor, marque **Ratear entre categorias e centros de custo**.",
              "Em **Repetição**, escolha **Única**, **Parcelada** (número de parcelas e intervalo, ou uma condição de pagamento como 30/60/90) ou **Recorrente** (o mesmo valor todo mês, como um aluguel).",
              "Se já foi recebido ou pago, marque **Já foi recebido** (ou **Já foi pago**) e informe a data e a conta.",
              "Salve. Cada parcela vira um título.",
            ],
            "Lançar uma conta",
          ),
          imagem(
            "nova-conta",
            "O formulário de **Nova conta a receber** (o de pagar é igual).",
            "Formulário de nova conta a receber com cliente, descrição, valor, vencimento, classificação, repetição e recebimento.",
            ["**Categoria**: é ela que leva o valor para a DRE.", "**Ratear entre categorias e centros de custo**, para dividir o valor.", "**Repetição**: **Única**, **Parcelada** ou **Recorrente**.", "**Já foi recebido**: registra o recebimento junto."],
          ),
          dica("Anexe a nota, o boleto ou o comprovante no título: PDF, imagem, XML, planilha ou documento, até 4 MB por arquivo."),
        ],
      },
      {
        id: "baixas",
        titulo: "Receber e pagar (baixa)",
        blocos: [
          passos([
            "Na lista, clique em **Receber** (ou **Pagar**) na linha do título, ou abra o título.",
            "Confira a **Data**, a **Conta** onde o dinheiro entrou ou saiu e a **Forma de pagamento**.",
            "Informe **Juros**, **Multa** ou **Desconto**, se houver. Para receber só uma parte, mude o valor: o título fica **Parcial**, com o saldo em aberto.",
            "Confirme. O movimento aparece na conta, no fluxo de caixa e no painel.",
          ]),
          texto("Para vários títulos de uma vez, marque as caixas na lista e use **Receber selecionados** (ou **Pagar selecionados**): o saldo de cada um é quitado na data e na conta escolhidas."),
          atencao("Errou uma baixa? Abra o título e, em **Baixas**, use **Estornar**. Se o movimento já estava conciliado com o extrato, a conciliação é desfeita."),
        ],
      },
      {
        id: "editar",
        titulo: "Editar, duplicar, cancelar e excluir",
        blocos: [
          lista([
            "**Editar**: altera os dados do título. Um título cancelado precisa ser reaberto antes (**Reabrir**).",
            "**Duplicar**: cria um título igual, para você ajustar o que mudou.",
            "**Cancelar**: o título sai dos saldos em aberto, mas continua no histórico; pode ser reaberto depois.",
            "**Excluir**: só para título que nunca teve baixa (nem estornada). Se já teve, cancele.",
          ]),
          texto("O **Histórico** do título mostra quem criou, alterou, baixou ou anexou, e quando."),
        ],
      },
      {
        id: "cobrancas",
        titulo: "Boleto e Pix (cobrança)",
        caminhos: ["/financeiro/cobrancas"],
        blocos: [
          texto("Com a cobrança ligada (veja [[ajuda:administracao#cobranca|Cobrança pelo Asaas]]), qualquer conta a receber pode virar boleto ou Pix. Quando o cliente paga, o título é baixado sozinho na conta configurada."),
          imagem(
            "cobranca",
            "O bloco **Cobrança (boleto e Pix)** na tela da conta.",
            "Bloco de cobrança de uma conta a receber com a linha digitável do boleto, o Pix copia e cola e os botões Fatura, Boleto PDF, Conferir, E-mail e Cancelar.",
            ["**copiar** a linha digitável (embaixo, o Pix copia e cola).", "**Conferir**: consulta o Asaas na hora.", "**E-mail**: reenvia a cobrança ao cliente."],
          ),
          passos([
            "Abra a conta a receber.",
            "No bloco **Cobrança (boleto e Pix)**, clique em **Gerar boleto ou Pix**.",
            "Escolha a **Forma** e deixe marcado **Mandar por e-mail ao cliente**: ele recebe o link da fatura, a linha digitável e o Pix copia e cola.",
            "O bloco passa a mostrar **Fatura**, **Boleto PDF**, a **Linha digitável** e o **Pix copia e cola**, com o botão de copiar.",
          ]),
          lista(
            ["**Conferir**: consulta a situação no Asaas na hora.", "**E-mail**: manda de novo ao cliente ou a outro e-mail.", "**Cancelar**: cancela o boleto ou Pix que ainda não foi pago."],
            "No bloco da cobrança",
          ),
          texto("Todas as cobranças ficam em [[/financeiro/cobrancas]], com vencimento, cliente, valor, situação e data do pagamento."),
          atencao("O cliente precisa de CPF ou CNPJ no cadastro, e o Asaas aceita cobranças a partir de R$ 5,00. Se o cliente pagar de outro jeito e você der a baixa manual, o sistema avisa o Asaas e a cobrança deixa de valer."),
        ],
      },
      {
        id: "movimentacoes",
        titulo: "Contas e movimentações",
        caminhos: ["/financeiro/movimentacoes"],
        blocos: [
          texto("[[/financeiro/movimentacoes]] é o extrato de cada conta do sistema: baixas, transferências e ajustes, com o saldo acumulado. Escolha a conta e o período."),
          imagem(
            "movimentacoes",
            "O extrato do caixa no mês, com uma transferência e um ajuste.",
            "Tela de movimentações com os botões Ajuste de saldo e Transferência entre contas, os cartões das contas, o período e o extrato com o saldo acumulado.",
            ["**Ajuste de saldo**.", "**Transferência entre contas**.", "As contas: clique numa delas para ver o extrato.", "O período: **Este mês**, **Mês anterior** ou **Últimos 30 dias** (ou as datas).", "O menu da linha: **Excluir transferência** ou **Excluir ajuste**."],
          ),
          lista([
            "**Transferência entre contas**: gera a saída numa conta e a entrada na outra, na mesma data (por exemplo, do banco para o caixa).",
            "**Ajuste de saldo**: para tarifas, rendimentos ou correções que não vêm de um título.",
            "Para desfazer uma transferência ou um ajuste, use o menu da linha: **Excluir transferência** ou **Excluir ajuste**.",
          ]),
          dica("O saldo de cada conta parte do **Saldo inicial** e da **Data do saldo inicial** do cadastro da conta, em [[/cadastros/contas-bancarias]]."),
        ],
      },
      {
        id: "conciliacao",
        titulo: "Conciliação bancária",
        caminhos: ["/financeiro/conciliacao"],
        blocos: [
          texto("A conciliação compara o extrato do banco com o que foi lançado no sistema, para o saldo bater."),
          imagem(
            "conciliacao",
            "A conciliação de uma conta, com o extrato importado.",
            "Tela de conciliação bancária com a conta escolhida, os saldos do sistema e do extrato, a diferença e os lançamentos pendentes do extrato.",
            ["Escolha a conta e clique em **Importar OFX**.", "A **Diferença** entre o extrato e o sistema precisa chegar a zero.", "Lançamento do extrato sem sugestão: **Criar lançamento** (com sugestão, **Conciliar**).", "**Regras**: sugestões automáticas para descrições parecidas.", "**Conciliar automaticamente** aceita todas as sugestões."],
          ),
          passos([
            "No internet banking, exporte o extrato no formato **OFX**.",
            "Em [[/financeiro/conciliacao]], escolha a conta e clique em **Importar OFX** (até 2 MB). Lançamentos já importados não duplicam.",
            "Para cada lançamento do extrato, o sistema sugere o título ou movimento correspondente. Confira e clique em **Conciliar**, ou use **Conciliar automaticamente** para aceitar todas as sugestões. Quando a sugestão é um título ainda em aberto, o botão é **Baixar e conciliar**: registra o recebimento ou o pagamento com a data e o valor do extrato e já concilia.",
            "Sem sugestão? **Criar lançamento** registra a tarifa, o rendimento ou a despesa e já concilia; **Outro movimento…** vincula a um movimento que você escolhe; **Ignorar** tira da lista o que não precisa de registro (aplicações e resgates automáticos).",
            "Confira no topo o **Saldo no sistema**, o **Saldo do extrato** e a **Diferença**.",
          ]),
          texto("Na lista de conciliados, **Desfazer** volta o lançamento para pendente; os ignorados podem ser restaurados."),
          dica("**Regras de conciliação** poupam trabalho: ao criar um lançamento, marque **Criar regra para descrições parecidas** (ou use **Nova regra**). Por exemplo: quando a descrição contiver TAR PACOTE, sugerir a categoria de tarifas bancárias."),
        ],
      },
      {
        id: "fluxo",
        titulo: "Fluxo de caixa",
        caminhos: ["/financeiro/fluxo-de-caixa"],
        blocos: [
          texto("Mostra entradas, saídas e saldo acumulado: o **Realizado** (baixas feitas) e o **Previsto** (títulos em aberto, pelo vencimento)."),
          imagem(
            "fluxo",
            "O fluxo de caixa: o realizado e o previsto, com o saldo projetado.",
            "Tela de fluxo de caixa com os filtros de período, agrupamento, conta e atrasados, os cartões de saldo e o gráfico de entradas, saídas e saldo acumulado.",
            ["O **Período**: de e até.", "**Agrupar por** dia, semana ou mês.", "A **Conta** (ou todas).", "**Atrasados na projeção**: **Incluir** ou **Excluir** o que venceu.", "**Exportar CSV**."],
          ),
          lista([
            "Escolha o **Período**, **Agrupar por** (dia, semana ou mês) e a **Conta** (ou todas).",
            "**Atrasados na projeção** decide se o que está vencido entra na previsão.",
            "Transferências entre contas não entram na visão de todas as contas, porque são internas.",
            "**Exportar CSV** gera a planilha para o Excel.",
          ]),
        ],
      },
      {
        id: "dre",
        titulo: "DRE gerencial",
        caminhos: ["/financeiro/dre"],
        blocos: [
          texto("O resultado da empresa mês a mês: receita bruta, deduções, lucro bruto, despesas, EBITDA e lucro líquido, com as margens."),
          imagem(
            "dre",
            "A DRE do ano, mês a mês, pelo regime de competência.",
            "Tela da DRE gerencial com o ano, o regime, os filtros de centro de custo e de empresa, os cartões de resultado e a demonstração mês a mês.",
            ["**Regime**: **Competência** ou **Caixa**.", "**Centro de custo**.", "**Empresa**: matriz e filiais, ou uma delas.", "**Exportar CSV**.", "**Expandir categorias**: mostra as categorias dentro de cada grupo."],
          ),
          lista([
            "**Regime**: **Competência** (pelo mês da competência do título) ou **Caixa** (pelo mês do recebimento ou pagamento).",
            "Filtre por **Empresa** (matriz e filiais) e por **Centro de custo**.",
            "Cada valor entra no grupo da DRE da sua categoria. O grupo é definido no cadastro da categoria, em [[/cadastros/categorias]] › **Grupo da DRE**.",
            "**Exportar CSV** gera a planilha para o Excel ou para o contador.",
          ]),
        ],
      },
    ],
  },

  {
    id: "crm",
    titulo: "CRM",
    resumo: "Funil de vendas com as oportunidades por etapa e a agenda de atividades comerciais.",
    icone: "SquareKanban",
    permissao: "crm:ver",
    quem: "Vendas, Financeiro e administradores.",
    caminhos: ["/crm"],
    topicos: [
      {
        id: "funil",
        titulo: "Funil de vendas",
        caminhos: ["/crm/funil", "/crm/oportunidades"],
        blocos: [
          texto("Cada **oportunidade** é um negócio em andamento com um cliente. O funil tem as etapas **Descoberta** (20%), **Proposta** (50%) e **Negociação** (80%); a previsão soma o valor de cada oportunidade multiplicado pela chance da etapa."),
          imagem(
            "funil",
            "O funil, com as oportunidades em cada etapa.",
            "Funil de vendas com os indicadores no topo e as colunas Descoberta, Proposta e Negociação com os cartões das oportunidades.",
            ["**Nova oportunidade**.", "Indicadores: em aberto, previsão ponderada, ganho e conversão em 90 dias.", "**Minhas** ou **Todas**.", "Cada cartão é uma oportunidade: arraste para mudar de etapa."],
          ),
          passos(
            [
              "Em [[/crm/funil]], clique em **Nova oportunidade**.",
              "Escolha o **Cliente**, ou use **Cliente novo? Cadastre aqui** (o CNPJ busca os dados na Receita).",
              "Informe o **Título** (por exemplo, Coleta mensal de resíduos · Fábrica X), o **Valor estimado**, a **Previsão de fechamento**, a **Etapa**, o **Responsável** e a **Origem do contato**.",
              "Salve. O cartão aparece na coluna da etapa.",
            ],
            "Nova oportunidade",
          ),
          texto("Arraste o cartão para mudar de etapa; no celular, use o menu do cartão › **Mover para**. O aviso **Sem próxima atividade** lembra de agendar o próximo contato."),
          lista(
            [
              "No topo: **Em aberto** (valor e número de oportunidades), **Previsão ponderada** (valor × chance de cada etapa), **Ganho em 90 dias** (com o ticket médio) e **Conversão em 90 dias** (ganhas sobre as fechadas no período).",
              "**Minhas** mostra só as oportunidades de que você é o responsável; **Todas**, as da equipe. A busca acha pela oportunidade ou pelo cliente.",
              "Embaixo, **Fechadas nos últimos 30 dias**: as **Ganhas**, as **Perdidas** e o quadro **Por que perdemos (90 dias)**, com os motivos de perda mais comuns.",
            ],
            "Indicadores e filtros",
          ),
        ],
      },
      {
        id: "ganhar",
        titulo: "Ganhar, perder e reabrir",
        blocos: [
          lista([
            "Solte o cartão em **Ganhou** quando o cliente fechar. Aprovar uma proposta ligada à oportunidade marca como ganha sozinho, com o valor da proposta.",
            "Solte em **Perdeu** (ou use **Perdeu** na oportunidade): o sistema pede o **Motivo** e um **Detalhe**, que ficam no histórico.",
            "**Reabrir** devolve a oportunidade fechada à etapa em que ela estava.",
            "**Excluir** apaga a oportunidade e as atividades dela. Para guardar o histórico, prefira marcar como perdida.",
          ]),
        ],
      },
      {
        id: "proposta",
        titulo: "Proposta a partir da oportunidade",
        blocos: [texto("Na oportunidade, **Nova proposta** abre a proposta já com o cliente. A oportunidade passa de Descoberta para Proposta, e a proposta fica ligada a ela. Veja [[ajuda:vendas#propostas|Propostas]].")],
      },
      {
        id: "atividades",
        titulo: "Atividades (agenda)",
        caminhos: ["/crm/atividades"],
        blocos: [
          texto("[[/crm/atividades]] é a agenda comercial: **Atrasadas**, **Hoje**, **Próximos 7 dias** e **Concluídas hoje**. A tela abre em **Minhas** (as suas atividades); **De todos** mostra as da equipe. O número ao lado do item no menu mostra as suas atividades atrasadas ou de hoje."),
          imagem(
            "atividades",
            "A agenda: atrasadas, de hoje, dos próximos 7 dias e concluídas hoje.",
            "Tela de atividades com as listas de atrasadas, de hoje, dos próximos sete dias e concluídas hoje.",
            ["**Nova atividade**.", "**Minhas** ou **De todos**.", "Marque a caixa para concluir."],
          ),
          passos([
            "Clique em **Nova atividade**.",
            "Escolha o **Tipo** (ligação, WhatsApp, e-mail, reunião, visita ou tarefa), escreva **O que fazer** e informe a **Data**, a **Hora** (opcional), o **Responsável** e, se quiser, o **Cliente**. Os atalhos **Hoje**, **Amanhã**, **Em 3 dias** e **Em 1 semana** preenchem a data.",
            "Clique em **Agendar**.",
          ]),
          texto("Para concluir, marque a caixa ao lado da atividade. Ao concluir uma atividade de oportunidade, **Agendar próxima** já abre a seguinte."),
        ],
      },
    ],
  },

  {
    id: "vendas",
    titulo: "Vendas",
    resumo: "Propostas comerciais em PDF, pedidos de venda e o faturamento, que gera as contas a receber e dá baixa no estoque.",
    icone: "ShoppingCart",
    permissao: "vendas:ver",
    quem: "Vendas, Financeiro e administradores; para faturar, é preciso o Financeiro.",
    caminhos: ["/vendas"],
    topicos: [
      {
        id: "propostas",
        titulo: "Propostas",
        caminhos: ["/vendas/propostas"],
        blocos: [
          passos([
            "Em [[/vendas/propostas]], clique em **Nova proposta**.",
            "Escolha o **Cliente** e confira a **Emissão**, a validade (**Válida até**), o **Responsável**, a **Empresa emissora** e, se já souber, a **Condição de pagamento** e a **Forma de pagamento**.",
            "Em **Itens**, use **Adicionar item**: busque o produto ou serviço do cadastro (ou escreva uma descrição livre) e informe a **Quantidade** (até 3 casas, para kg), o **Preço unitário** (até 4 casas) e o desconto (**Desc. %**), se houver.",
            "Escreva as observações: **Para o cliente** sai no PDF; **Internas** fica só no sistema.",
            "Salve. A proposta recebe o próximo número da empresa e fica como rascunho.",
          ]),
          imagem(
            "proposta",
            "Uma proposta em rascunho, com os botões de cada etapa.",
            "Tela de uma proposta com os itens, os dados do cliente e os botões Editar, Marcar como enviada, Aprovar, Recusar, Cancelar, PDF e Enviar por e-mail.",
            ["**Marcar como enviada**, depois de mandar ao cliente.", "**Aprovar** (ou **Recusar**), com a resposta do cliente.", "**PDF** da proposta.", "**Enviar por e-mail**, com o PDF anexo."],
          ),
        ],
      },
      {
        id: "enviar",
        titulo: "Enviar ao cliente",
        blocos: [
          lista([
            "**PDF**: baixa a proposta com o logotipo da empresa (veja [[ajuda:administracao#empresa|Empresa e filiais]]).",
            "**Enviar por e-mail**: até 5 e-mails e uma mensagem opcional; o PDF vai anexo, e a resposta do cliente chega no e-mail da empresa.",
            "**Marcar como enviada**: depois de mandar o PDF por outro meio, como o WhatsApp.",
          ]),
        ],
      },
      {
        id: "aprovar",
        titulo: "Aprovar, recusar e gerar o pedido",
        blocos: [
          lista([
            "**Aprovar**: o cliente aceitou. Em seguida, **Gerar pedido** cria o pedido de venda com os mesmos itens.",
            "**Recusar**: informe o motivo (preço, prazo, concorrente…); ele fica no histórico.",
            "**Cancelar**: a proposta sai das listas de abertas, e o histórico fica.",
            "**Reabrir**: a proposta volta a ser rascunho editável, com o mesmo número.",
          ]),
        ],
      },
      {
        id: "pedidos",
        titulo: "Pedidos de venda",
        caminhos: ["/vendas/pedidos"],
        blocos: [
          texto("O pedido nasce da proposta aprovada (**Gerar pedido**) ou direto em [[/vendas/pedidos]] › **Novo pedido**, por exemplo numa venda de recicláveis sem proposta. Enquanto está em aberto, pode ser editado. **Cancelar pedido** impede o faturamento e guarda o histórico."),
          imagem(
            "pedido",
            "Um pedido em aberto.",
            "Tela de um pedido de venda em aberto com os itens e os botões Editar, Faturar, Cancelar, PDF e Enviar por e-mail.",
            ["**Faturar**: gera as contas a receber.", "**PDF** do pedido.", "**Enviar por e-mail**."],
          ),
          dica("Na tela de saldos do estoque, o botão **Vender** abre um pedido já com o material."),
        ],
      },
      {
        id: "faturar",
        titulo: "Faturar o pedido",
        blocos: [
          passos([
            "No pedido, clique em **Faturar**.",
            "Confira a **Data do faturamento**, a **Condição de pagamento** (as parcelas), a **Forma de pagamento**, a **Conta prevista**, a **Categoria dos produtos**, a **Categoria dos serviços** e o **Centro de custo**.",
            "Confirme. O sistema cria as contas a receber (uma por parcela) e dá baixa no estoque dos materiais do pedido.",
          ]),
          imagem(
            "faturar",
            "Ao **Faturar**, confira a data, a condição e a forma de pagamento, a categoria e a conta: as parcelas aparecem antes de confirmar.",
            "Janela Faturar pedido com a data do faturamento, a condição de pagamento, a categoria dos serviços, a forma de pagamento, a conta prevista, o centro de custo e as parcelas.",
          ),
          atencao("Se faltar saldo de algum material, o faturamento é recusado com a lista do que falta: lance a entrada no estoque antes. Faturar gera contas a receber, então só os perfis Financeiro e Administrador faturam; o perfil Vendas pede a alguém do Financeiro."),
          texto("**Desfazer faturamento** exclui as contas a receber do pedido e devolve o estoque; só é possível se nenhuma parcela tiver recebimento. Depois de faturado, o pedido mostra os blocos da NF-e (produtos) e da NFS-e (serviços): veja [[ajuda:fiscal#nfe|Emitir NF-e]] e [[ajuda:fiscal#nfse|Emitir NFS-e]]."),
        ],
      },
    ],
  },

  {
    id: "estoque",
    titulo: "Estoque",
    resumo: "Saldos dos materiais, entradas da produção, ajustes de inventário, compras, vendas por material e importação por planilha.",
    icone: "Boxes",
    permissao: "estoque:ver",
    quem: "Estoque, Financeiro e administradores; Vendas e Contador consultam.",
    caminhos: ["/estoque"],
    topicos: [
      {
        id: "saldos",
        titulo: "Saldos dos materiais",
        caminhos: ["/estoque/materiais"],
        blocos: [
          texto("Em [[/estoque]] ficam os materiais (papel, papelão, plásticos, metais…) com o saldo em cada estabelecimento, o preço de venda, o valor estimado (saldo × preço), o custo médio, a última entrada e o vendido em 30 dias. Filtre por estabelecimento, grupo ou nome."),
          imagem(
            "estoque",
            "Os saldos dos materiais, por grupo.",
            "Tela de estoque com os botões Atualizar preços, Importar planilha, Ajustar e Nova entrada, os cartões de resumo e a lista de materiais com o botão Vender.",
            ["**Nova entrada**: a produção que chega.", "**Ajustar**: inventário e perdas.", "**Atualizar preços** de venda de vários materiais.", "**Vender**: abre um pedido com o material."],
          ),
          passos(
            [
              "Sem materiais ainda? Clique em **Escolher materiais** e marque os recicláveis que a empresa vende (cada um vira um produto vendido por kg), ou importe uma planilha ([[ajuda:estoque#importar|Importar planilha]]).",
              "Use **Atualizar preços** para informar o preço de venda por kg de vários materiais de uma vez (exige permissão de cadastros).",
              "Clique no material para ver o saldo e o histórico dele.",
            ],
            "Começar",
          ),
          dica("O botão **Vender**, na linha do material, abre um pedido de venda já com ele."),
        ],
      },
      {
        id: "entradas",
        titulo: "Entrada da produção",
        caminhos: ["/estoque/entradas"],
        blocos: [
          passos([
            "Em [[/estoque]], clique em **Nova entrada**.",
            "Informe a **Data**, o **Estabelecimento** (onde está o material) e, se quiser, o **Cliente de origem** e a **Referência** (MTR, lote, processo de destruição ou ticket de pesagem).",
            "Preencha a quantidade só dos materiais que entraram, com vírgula para os decimais (por exemplo, 1.240,5).",
            "Salve. O saldo é atualizado na hora.",
          ]),
        ],
      },
      {
        id: "ajuste",
        titulo: "Ajustar (inventário e perdas)",
        caminhos: ["/estoque/ajuste"],
        blocos: [
          texto("Use **Ajustar** quando o saldo do sistema não bate com o pátio: contagem física, perda de peso (umidade), quebra, correção de lançamento ou destinação sem venda."),
          passos(["Em [[/estoque]], clique em **Ajustar**.", "Escolha o **Motivo** e o **Estabelecimento**.", "Em **Saldo contado**, informe só os materiais que mudaram.", "Salve. O sistema lança a diferença, para mais ou para menos."]),
          atencao("Se alguém mexer no saldo enquanto você conta (uma venda faturada, por exemplo), o ajuste é recusado: atualize a página e confira."),
        ],
      },
      {
        id: "saidas",
        titulo: "Saída por venda",
        blocos: [texto("A saída é automática: ao faturar o pedido, o estoque baixa sozinho, e desfazer o faturamento devolve o material. Não é preciso lançar a saída à mão.")],
      },
      {
        id: "movimentacoes",
        titulo: "Movimentações",
        caminhos: ["/estoque/movimentacoes"],
        blocos: [
          texto("[[/estoque/movimentacoes]] lista as entradas, as vendas e os ajustes, com data, materiais, peso e origem ou destino. Filtre por tipo, material, estabelecimento e período."),
          lista([
            "Excluir uma entrada ou um ajuste desfaz o efeito no saldo. Se o material já saiu, faça um ajuste em vez de excluir.",
            "A saída de uma venda só sai desfazendo o faturamento do pedido.",
            "A entrada que veio de uma nota de compra não pode ser excluída: corrija com um ajuste.",
          ]),
        ],
      },
      {
        id: "vendas-material",
        titulo: "Vendas por material",
        caminhos: ["/estoque/vendas"],
        blocos: [texto("[[/estoque/vendas]] mostra, no período escolhido, quanto de cada material foi vendido: quantidade, receita, preço médio, número de vendas e compradores. As vendas entram quando o pedido é faturado. **Exportar CSV** baixa a tabela para o Excel.")],
      },
      {
        id: "compras",
        titulo: "Compras (notas dos fornecedores)",
        caminhos: ["/estoque/compras"],
        blocos: [
          texto("[[/estoque/compras]] lista, mês a mês, as NF-e de compra emitidas contra o CNPJ (elas chegam sozinhas pela busca de notas) e o que falta fazer em cada uma: **Contas a pagar** (Lançada ou Pendente) e **Estoque** (Entrada nº…, Pendente ou Aguardando XML). Os cartões do topo filtram as pendências."),
          imagem(
            "compras",
            "As compras do mês e o que falta fazer em cada nota.",
            "Tela de compras com os cartões de pendências, as abas e a lista de notas dos fornecedores com o botão Abrir.",
            ["Notas **Sem entrada no estoque**.", "Notas **Sem conta a pagar**.", "**Abrir** a nota para lançar."],
          ),
          passos(
            [
              "Clique em **Abrir** na nota.",
              "No bloco **Entrada no estoque**, escolha o material do cadastro para cada item. O sistema sugere: o código já usado com esse fornecedor, o mesmo código de barras ou o mesmo NCM.",
              "Confira a quantidade que entra, na unidade do estoque (por exemplo, a nota em toneladas e o estoque em kg).",
              "Clique em **Lançar entrada no estoque**. O custo de cada item entra no custo médio do material, e o sistema guarda o de-para para as próximas notas do mesmo fornecedor.",
            ],
            "Dar entrada no estoque pela nota",
          ),
          dica("Itens sem material (serviços, material de consumo) não entram no estoque. Na mesma nota, **Lançar no contas a pagar** cria os títulos pelas duplicatas: veja [[ajuda:fiscal#recebidas|Notas recebidas]]."),
        ],
      },
      {
        id: "importar",
        titulo: "Importar planilha do Excel",
        caminhos: ["/estoque/importar"],
        blocos: [
          texto("Em [[/estoque/importar]] você cadastra materiais e lança quantidades de uma vez, a partir de uma planilha."),
          imagem(
            "importar",
            "Os dois passos: **Baixar modelo (.xlsx)** e enviar a planilha preenchida.",
            "Tela de importar planilha com o passo 1, baixar o modelo, e o passo 2, enviar a planilha com o estabelecimento, o tipo de lançamento e a data.",
          ),
          passos([
            "Clique em **Baixar modelo (.xlsx)**. Ele vem com os materiais cadastrados e o saldo atual do estabelecimento (ou com os recicláveis mais comuns, se ainda não houver materiais). A aba **Instruções** explica cada coluna.",
            "Preencha a planilha: **Código**, **Descrição**, **Unidade**, **Grupo**, **NCM**, **Preço de venda**, **Quantidade** e **Custo unitário**. A coluna **Saldo atual** é só para conferência.",
            "Na tela, escolha o estabelecimento e o que a coluna Quantidade é: **Entrada (soma ao saldo)**, para produção, triagem ou compra; ou **Inventário (saldo contado)**, em que o saldo passa a ser o contado e o sistema lança a diferença.",
            "Informe a **Data do lançamento** e escolha o arquivo. O sistema confere e mostra a prévia de cada linha: material novo, o que muda no cadastro, o efeito no saldo e os erros.",
            "Sem erros, clique em **Importar planilha**.",
          ]),
          lista(
            [
              "Tudo ou nada: se uma linha tiver erro, nada é gravado. Corrija a planilha e envie de novo.",
              "Material novo sem código ganha um código automático (MAT-0001…). A planilha não troca a unidade de um material que já existe.",
              "No inventário, os materiais fora da planilha não mudam, a quantidade 0 zera o saldo e a linha sem quantidade só mexe no cadastro.",
              "Aceita .xlsx e .csv, até 1.000 linhas e 2 MB. Arquivo .xls antigo: no Excel, salve como .xlsx.",
              "Se uma planilha com o mesmo nome já foi importada nos últimos 30 dias, a prévia avisa, para a mesma entrada não ser lançada duas vezes.",
            ],
            "Regras",
          ),
          atencao("Cadastrar material ou mudar preço pela planilha exige permissão de cadastros (os perfis Estoque, Financeiro e Administrador têm)."),
        ],
      },
    ],
  },

  {
    id: "servicos",
    titulo: "Serviços",
    resumo: "Contratos recorrentes que geram pedido, conta a receber e cobrança a cada competência, e ordens de serviço que viram pedido ao terminar.",
    icone: "Repeat",
    permissao: "cadastros:ver",
    quem: "Quem cuida dos clientes de serviço; gerar as competências fica com o Financeiro ou um administrador.",
    caminhos: ["/cadastros/contratos", "/cadastros/ordens"],
    topicos: [
      {
        id: "contratos",
        titulo: "Contratos recorrentes",
        caminhos: ["/cadastros/contratos"],
        blocos: [
          texto("Para planos e mensalidades: o contrato gera sozinho, a cada competência, o pedido já faturado, a conta a receber e, se marcado, o boleto ou Pix."),
          imagem(
            "contratos",
            "Os contratos recorrentes, com o menu da linha aberto.",
            "Tela de contratos recorrentes com os botões Gerar competências pendentes e Novo contrato e o menu da linha aberto com a opção Gerar próxima competência agora.",
            ["**Novo contrato**.", "**Gerar competências pendentes**: gera agora as que estão no prazo.", "**Gerar próxima competência agora**, no menu da linha."],
          ),
          passos([
            "Em [[/cadastros/contratos]], clique em **Novo contrato**.",
            "Informe o **Cliente**, o **Serviço do cadastro**, a **Descrição** (sai no pedido e na nota), o **Valor de cada competência**, a **Periodicidade** (de mensal a anual) e o **Dia do vencimento** (1 a 28).",
            "Informe o **Início**, o **Fim** (opcional), **Gerar com antecedência (dias)**, a **Categoria da receita**, a **Conta prevista** e a **Forma de pagamento**.",
            "Marque **Gerar boleto/Pix (Asaas)** para a cobrança sair junto (com a cobrança configurada).",
            "Salve. O contrato recebe um número e fica ativo.",
          ]),
          texto("Todo dia, às 6h15, o sistema gera as competências cujo vencimento está dentro da antecedência. Para não esperar, use **Gerar competências pendentes** (na lista) ou **Gerar próxima competência agora** (no menu da linha). Depois do fim, o contrato é encerrado."),
          dica("A NFS-e da mensalidade é emitida pelo pedido gerado (veja [[ajuda:fiscal#nfse|Emitir NFS-e]])."),
        ],
      },
      {
        id: "os",
        titulo: "Ordens de serviço",
        caminhos: ["/cadastros/ordens"],
        blocos: [
          passos([
            "Em [[/cadastros/ordens]], clique em **Nova ordem de serviço** e informe o **Cliente**, o **Serviço**, os **Detalhes para a equipe**, o **Serviço do cadastro**, a **Quantidade**, o **Valor unitário**, o **Responsável**, a **Abertura** e a **Previsão**.",
            "Acompanhe pela **Situação**: aberta, em andamento, concluída ou cancelada.",
            "Ao terminar, use **Gerar pedido da OS**, no menu da linha: o pedido de venda é criado e a OS fica concluída. **Abrir pedido** leva até ele, para faturar e emitir a nota.",
          ]),
          imagem(
            "os",
            "As ordens de serviço, com o menu da linha aberto.",
            "Tela de ordens de serviço com o botão Nova ordem de serviço, o filtro de situação e o menu da linha aberto com a opção Gerar pedido da OS.",
            ["**Nova ordem de serviço**.", "Filtro pela **Situação**.", "**Gerar pedido da OS**, no menu da linha."],
          ),
          dica("As **Observações** da OS saem no pedido."),
        ],
      },
    ],
  },

  {
    id: "armazem",
    titulo: "Armazém geral",
    resumo: "Mercadorias dos depositantes: recebimento pela NF-e ou CT-e, conferência em caixas e pallets numerados com código e lote, endereços do armazém, localização, transferência, saída, etiquetas com QR e cobrança mensal por palete.",
    icone: "Warehouse",
    permissao: "armazem:ver",
    quem: "Estoque, Financeiro e administradores operam; tarifas e faturamento ficam com o Financeiro e os administradores; Vendas e Contador consultam.",
    caminhos: ["/servicos/armazem"],
    topicos: [
      {
        id: "como-funciona",
        titulo: "Como funciona",
        caminhos: ["/servicos/armazem"],
        blocos: [
          texto("O armazém guarda mercadorias de **depositantes** (os clientes donos da mercadoria). Cada entrada é um **recebimento**. Na conferência, o que chegou é separado em **caixas** e **pallets** numerados (CX-0001, PL-0001), com o código, o lote e a quantidade de cada item, e cada volume vai para um **endereço** do armazém (ex.: A-01-02)."),
          imagem(
            "armazem",
            "Os itens armazenados, por depositante.",
            "Tela de itens armazenados com o campo de localizar, o botão Novo recebimento, os cartões de resumo, a tabela por depositante e as abas por volume e por código e lote.",
            ["**Localizar**: digite ou leia o QR de uma caixa, pallet ou endereço.", "**Novo recebimento**.", "**Por código e lote**: onde está cada item."],
          ),
          passos(
            [
              "Cadastre as posições em [[/servicos/armazem/enderecos]] (uma vez só).",
              "Crie o recebimento com o XML da NF-e de remessa e/ou do CT-e em [[/servicos/armazem/recebimentos]].",
              "Na conferência, crie as caixas e os pallets e lance o que vai dentro de cada um.",
              "Confira o quadro **Esperado × conferido** e clique em **Concluir conferência**.",
              "Endereçe os volumes, um por um ou vários de uma vez.",
              "Consulte em [[/servicos/armazem]] onde está cada código e lote.",
            ],
            "O caminho de uma carga",
          ),
          dica("Os itens chegaram misturados, com vários códigos e lotes na mesma caixa? Monte as caixas do jeito que elas vão ficar guardadas (por exemplo, a caixa 01 com os códigos X, Y e Z). O sistema soma por código e lote e compara com a nota."),
        ],
      },
      {
        id: "enderecos",
        titulo: "Endereços do armazém",
        caminhos: ["/servicos/armazem/enderecos"],
        blocos: [
          texto("Endereço é a posição predeterminada onde ficam os volumes: rua, módulo e nível (A-01-02), com etiqueta própria."),
          passos([
            "Em [[/servicos/armazem/enderecos]], clique em **Gerar endereços**.",
            "Informe as **Ruas** (A-C, A,B,D ou 1-3), os **Módulos** e os **Níveis** (e as **Posições**, se houver). A prévia mostra quantos endereços serão criados.",
            "Escolha o **Tipo** e, se quiser limitar quantos volumes cabem em cada posição, a **Capacidade (volumes)**. Clique em **Gerar**.",
          ]),
          lista([
            "**Novo endereço** cria uma posição avulsa.",
            "**Reservado para**: só volumes daquele depositante entram na posição.",
            "**Etiquetas** imprime as etiquetas das posições, com QR, dez por folha A4 (da rua escolhida no filtro). A etiqueta de uma posição só sai no menu da linha.",
            "Posição com volumes não pode ser inativada nem excluída.",
            "Tipo **Doca / área de passagem**: aceita volumes de vários depositantes ao mesmo tempo (recebimento e expedição), não pode ser reservada e não entra na cobrança.",
          ]),
        ],
      },
      {
        id: "recebimento",
        titulo: "Recebimento pela NF-e ou CT-e",
        caminhos: ["/servicos/armazem/recebimentos"],
        blocos: [
          passos([
            "Em [[/servicos/armazem/recebimentos]], clique em **Novo recebimento**.",
            "Em **Pela NF-e ou CT-e (XML)**, escolha os arquivos (podem ir a NF-e e o CT-e juntos), confira a **Chegada** e clique em **Criar recebimento**.",
            "O depositante (o emitente da NF-e ou, sem NF-e, o remetente do CT-e) é achado pelo CNPJ e cadastrado se for novo. Os itens da nota viram os **itens esperados**, com o lote quando a nota traz.",
          ]),
          lista([
            "**Sem documento**: escolha o **Depositante**. Serve para o inventário do que já está no armazém ou para mercadoria cuja nota ainda não chegou.",
            "**Notas de remessa aguardando recebimento**: as NF-e de remessa para armazenagem (CFOP 5.905/6.905) que a busca de notas trouxe aparecem no topo da lista, com o botão **Receber**. Na tela da nota, o botão é **Receber no armazém**.",
            "CT-e cujas NF-e a busca já trouxe: as notas entram junto, com os itens.",
            "**Juntar NF-e ou CT-e** (em **Mais**) acrescenta outra nota do mesmo depositante, ou o CT-e, a um recebimento em conferência.",
            "A mesma nota não entra duas vezes no armazém.",
          ]),
          atencao("Remessa para armazenagem não é compra: essas notas não aparecem em [[/estoque/compras]] e não pedem lançamento no contas a pagar nem entrada no estoque próprio."),
        ],
      },
      {
        id: "conferencia",
        titulo: "Conferência em caixas e pallets",
        blocos: [
          passos([
            "No recebimento, clique em **Nova caixa** ou **Novo pallet** (dá para criar vários de uma vez). Cada volume ganha o número da etiqueta: CX-0001, PL-0001.",
            "No volume, clique em **Lançar itens** (depois, **Conteúdo**) e preencha uma linha por item: **Código**, **Lote** e **Quantidade**. **Enter** na quantidade abre a linha seguinte.",
            "Código que não é do depositante pede a **Descrição** e vira produto dele.",
            "**Colocar o que falta** põe no volume tudo o que ainda não está em nenhuma caixa ou pallet (quando a nota inteira vai para um pallet, por exemplo).",
            "Acompanhe o quadro **Esperado × conferido**: **Confere**, **Falta**, **Sobra** ou **Fora da nota**, por código e lote (nota sem lote: pelo total do código).",
            "Clique em **Concluir conferência**. Com divergência, o sistema mostra o resumo e pede uma explicação, que fica no histórico.",
          ]),
          imagem(
            "conferencia",
            "Um recebimento conferido.",
            "Tela de um recebimento com os botões Nova caixa, Novo pallet e Mais, a lista de documentos e o quadro esperado e conferido.",
            ["**Nova caixa**.", "**Novo pallet**.", "**Mais**: etiquetas, juntar nota, reabrir ou excluir.", "**Esperado × conferido**: o que falta ou sobra."],
          ),
          lista([
            "Itens com o mesmo código e lote no mesmo volume são somados.",
            "Depois da conferência, mudar o conteúdo de um volume é **ajuste**: pede o motivo e fica no histórico.",
            "**Reabrir conferência** (em **Mais**) volta os volumes do recebimento para em conferência.",
            "**Etiquetas dos volumes** (em **Mais**) imprime as etiquetas de todos os volumes do recebimento.",
            "**Excluir recebimento** (em **Mais**) apaga um recebimento criado por engano. Antes, tire os itens dele das caixas e pallets.",
          ]),
        ],
      },
      {
        id: "enderecamento",
        titulo: "Endereçar caixas e pallets",
        caminhos: ["/servicos/armazem/volumes"],
        blocos: [
          passos(
            [
              "Em [[/servicos/armazem/volumes]], na aba **Sem endereço**, marque os volumes.",
              "Clique em **Endereçar**, digite o código da posição e escolha. A lista mostra quantos volumes já estão em cada posição, com as reservadas para o depositante primeiro.",
              "Clique em **Colocar em …**.",
            ],
            "Vários de uma vez",
          ),
          imagem(
            "volumes",
            "Endereçar vários volumes de uma vez.",
            "Tela de caixas e pallets com as abas por situação, um volume marcado e a barra com os botões Endereçar, Etiquetas e Dar saída.",
            ["Aba **Sem endereço**.", "Marque os volumes.", "**Endereçar** os marcados."],
          ),
          lista([
            "Um volume só: **Endereçar** (ou **Mudar endereço**) no próprio volume. **Tirar do endereço** volta para sem endereço.",
            "Na tela de um endereço (o QR da etiqueta da posição abre ela), **Colocar aqui** endereça a caixa ou o pallet digitado ou lido.",
            "O sistema não deixa passar da **capacidade** nem pôr volume de outro depositante em posição reservada.",
            "Cada posição guarda volumes de um só depositante: assim, a posição só com caixas conta como um palete dele na cobrança. Só a doca aceita vários.",
          ]),
        ],
      },
      {
        id: "consulta",
        titulo: "Onde está cada item",
        blocos: [
          texto("Em [[/servicos/armazem]], a lista mostra cada item guardado com o volume, o endereço e o recebimento (e a NF-e) de origem."),
          lista([
            "Busque por código, descrição, lote, caixa (CX-0012) ou endereço.",
            "**Por código e lote** junta as quantidades e mostra em quais volumes e endereços o item está.",
            "**Por depositante** resume as caixas, os pallets e o valor declarado (o das notas) de cada cliente.",
            "**CSV** exporta a lista do filtro para o Excel.",
            "**Localizar**: digite (ou leia com o leitor) o código da caixa, do pallet, do endereço ou do recebimento (REC-0001), ou o QR da etiqueta, e vá direto para a tela.",
          ]),
          dica("No celular, o QR da etiqueta abre a tela da caixa ou da posição (depois de entrar no sistema)."),
        ],
      },
      {
        id: "transferencia-saida",
        titulo: "Transferir itens e dar saída",
        blocos: [
          passos(
            [
              "No volume, em **Mais**, clique em **Transferir itens**.",
              "Marque o que vai passar e ajuste as quantidades.",
              "Escolha **Volume novo** (caixa ou pallet) ou **Volume existente** do mesmo depositante e clique em **Transferir**.",
            ],
            "Transferir",
          ),
          passos(
            [
              "Marque os volumes em [[/servicos/armazem/volumes]] (ou abra o volume) e clique em **Dar saída**.",
              "Informe a **Data** e o **Documento da saída** (ex.: NF-e de retorno nº 123) e clique em **Registrar saída**. O volume sai inteiro e libera o endereço.",
            ],
            "Saída",
          ),
          lista([
            "Para tirar só parte de um volume, transfira antes esses itens para um volume novo e dê saída nele.",
            "Cada item guarda o recebimento e a NF-e de origem, que servem para a nota de retorno.",
            "**Desfazer saída** (com motivo) traz o volume de volta ao armazém, sem endereço.",
            "**Excluir volume vazio** (em **Mais**) apaga a caixa ou o pallet criado a mais. Volume com itens ou que já saiu não pode ser excluído.",
            "O **Histórico** do volume mostra conferência, ajustes, endereços, transferências e saída, com data e usuário.",
          ]),
          atencao("A NF-e de retorno da mercadoria ao depositante (CFOP 5.906/6.906) ainda é emitida fora deste módulo. Confirme a tributação com o contador."),
        ],
      },
      {
        id: "cobranca",
        titulo: "Cobrança por palete",
        caminhos: ["/servicos/armazem/faturamento"],
        blocos: [
          texto("A armazenagem é cobrada por palete, todo mês e vencida: no fim de cada mês o sistema faz a **apuração** da quantidade de paletes armazenados de cada depositante, e a tarifa transforma essa quantidade no valor a cobrar. A fotografia dos paletes é feita de hora em hora (vale a última do dia); a apuração usa a do último dia do mês."),
          imagem(
            "faturamento-armazem",
            "O faturamento da armazenagem, com um mês vencido a faturar.",
            "Tela de faturamento da armazenagem com os cartões de resumo, as abas e a linha de um cliente com a apuração, o valor e o botão Faturar.",
            ["Abas: **A faturar**, **Em andamento**, **Faturados** e **Sem tarifa**.", "**Apuração**: os paletes do último dia do mês.", "**Faturar** o mês do cliente.", "**Atualizar fotografia de hoje**."],
          ),
          texto("A apuração olha só o último dia do mês: quem entra no fim do mês paga o **mês cheio** pelos paletes que estão no armazém nesse dia, e o palete que **entra e sai dentro do mesmo mês não é cobrado**. No primeiro mês, a nota sai com o mês por extenso (por exemplo, outubro de 2026), mesmo que a mercadoria tenha chegado no dia 27."),
          lista(
            [
              "Cada **pallet** conferido do depositante conta como um palete, esteja numa posição, sem endereço ou na doca.",
              "Uma posição só com **caixas** do depositante conta como **um palete**.",
              "Caixas conferidas **sem endereço** (ou na doca) não contam: a tela avisa quantas caixas-dia ficaram fora de posição. Endereçe-as.",
              "Volumes ainda em conferência só contam se já estiverem numa posição.",
              "Posições **reservadas** para o depositante só contam, mesmo vazias, se a tarifa mandar.",
              "Dia sem fotografia (sistema fora do ar) repete o último dia fotografado e aparece marcado.",
            ],
            "O que conta como palete",
          ),
          passos(
            [
              "Em [[/servicos/armazem/faturamento]], clique em **Nova tarifa**.",
              "Escolha o **Depositante**. O **Início da cobrança** vem com a data da primeira entrada dele.",
              "Em **Período de cobrança**, deixe **Mês do calendário (vencido)**. **A cada 30 dias (vencido)** conta períodos de 30 dias a partir do início da cobrança.",
              "Informe o **Valor por palete por mês** e, em **Como contar os paletes**, deixe **Paletes no fim do mês** (a apuração). **Por dia (palete-dia)** e **Maior quantidade do período** ficam para contratos diferentes.",
              "Se houver paletes contratados, informe o **Mínimo de paletes por período**.",
              "Escolha o **Serviço do cadastro** (dá o código da NFS-e), o **Prazo para pagamento** em dias depois do fim do mês e, se quiser, **Gerar boleto/Pix (Asaas)**. Clique em **Salvar tarifa**.",
            ],
            "Tarifa do depositante",
          ),
          tabela(
            ["Exemplo (R$ 45,00 por palete por mês)", "Paletes no fim do mês", "Por dia", "Maior quantidade"],
            [
              ["Novembro: 10 paletes de 1 a 15/11 e 12 de 16 a 30/11", "12 paletes em 30/11: R$ 540,00", "330 paletes-dia ÷ 30 = 11: R$ 495,00", "12 paletes: R$ 540,00"],
              ["Novembro: 12 paletes até 28/11 e 4 a partir de 29/11", "4 paletes em 30/11: R$ 180,00", "344 paletes-dia ÷ 30: R$ 516,00", "12 paletes: R$ 540,00"],
              ["Primeira entrada em 27/10: 8 paletes de 27 a 31/10", "8 paletes em 31/10: R$ 360,00 (mês cheio)", "40 paletes-dia ÷ 31: R$ 58,06", "8 paletes, 5 de 31 dias: R$ 58,06"],
              ["O 1º exemplo, com mínimo de 15 paletes", "15 paletes: R$ 675,00", "15 paletes: R$ 675,00", "15 paletes: R$ 675,00"],
            ],
          ),
          passos(
            [
              "Abra [[/servicos/armazem/faturamento]]. A aba **A faturar** mostra os meses que já terminaram e ainda não foram cobrados, com a **Apuração** (os paletes do último dia).",
              "Confira o valor de cada um. Em **Ver dia a dia** (no menu da linha), veja os paletes de cada dia e os endereços.",
              "Clique em **Faturar** na linha, ou no botão do topo para faturar todos de uma vez (**Faturar o pendente**, ou **Faturar os 3** quando são três). O sistema gera o pedido já faturado, a conta a receber e, se a tarifa pedir, o boleto ou Pix.",
              "Abra o pedido (menu da linha) e emita a NFS-e, como em qualquer pedido de serviço.",
            ],
            "Faturar o mês",
          ),
          lista([
            "**Em andamento** mostra o mês que está correndo, com os paletes de hoje, o valor parcial e a data da apuração.",
            "**Atualizar fotografia de hoje** conta os paletes na hora, sem esperar a próxima hora cheia (por exemplo, logo depois de um recebimento ou de uma saída).",
            "Um mês só pode ser faturado depois que termina (cobrança vencida): outubro, a partir de 01/11.",
            "Vencimento: o prazo da tarifa, contado do fim do mês (com 10 dias, outubro vence em 10/11). Se essa data já passou quando o mês é faturado, o vencimento fica 5 dias depois do faturamento.",
            "**Faturados** guarda o histórico, com a apuração, o pedido e a situação da conta a receber.",
            "**Sem tarifa** lista quem teve paletes nos últimos 30 dias sem preço cadastrado.",
            "**Desfazer faturamento** cancela o pedido, exclui a conta a receber e cancela o boleto ou Pix em aberto. Não é possível desfazer com recebimento registrado ou nota emitida.",
            "**Exportar CSV** baixa a lista da aba (cliente, período, paletes apurados, valor e vencimento). **Extrato (CSV)**, no menu da linha, traz os paletes dia a dia do período para mandar ao depositante.",
            "O faturamento guarda a tarifa usada. Depois do primeiro faturamento, o início da tarifa só pode mudar para depois do último período faturado.",
          ]),
          atencao("Confirme com o contador o código do serviço de armazenagem na NFS-e (item 11.04 da lista do ISS) e a alíquota."),
        ],
      },
      {
        id: "etiquetas",
        titulo: "Etiquetas",
        blocos: [
          lista([
            "Caixa ou pallet: **Etiqueta 10 × 15 cm** (impressora térmica) ou **Etiqueta em folha A4** (duas por folha), no menu **Mais** do volume. Várias de uma vez: marque os volumes em [[/servicos/armazem/volumes]] e clique em **Etiquetas**, ou use **Etiquetas dos volumes** no recebimento.",
            "A etiqueta do volume traz o número grande (CX-0001), o depositante, o recebimento e as NF-e, o endereço, o conteúdo (código, lote e quantidade) e o QR.",
            "Endereço: **Etiqueta** na tela do endereço ou **Etiquetas** na lista de endereços, dez por folha A4.",
          ]),
        ],
      },
    ],
  },

  {
    id: "fiscal",
    titulo: "Fiscal",
    resumo: "Emissão de NF-e e NFS-e pelos pedidos, notas recebidas dos fornecedores e o fechamento mensal para o contador.",
    icone: "ReceiptText",
    permissao: "fiscal:ver",
    quem: "Financeiro e administradores emitem e manifestam; Estoque e Contador consultam.",
    caminhos: ["/fiscal", "/contador"],
    topicos: [
      {
        id: "antes",
        titulo: "Antes de emitir",
        blocos: [
          lista([
            "Um administrador envia o **certificado digital A1** e liga a emissão (veja [[ajuda:administracao#certificado|Certificado digital]] e [[ajuda:administracao#emissao|Emissão de NF-e e NFS-e]]).",
            "Comece em **homologação** (NF-e) e **produção restrita** (NFS-e): as notas são de teste, sem valor fiscal. Mande a primeira ao contador antes de passar para produção.",
            "Produtos com **NCM**, **CFOP** e **CSOSN** e serviços com o **código de tributação nacional**, no cadastro e confirmados pelo contador.",
            "Cliente com endereço completo (com o código IBGE) e o indicador de IE.",
          ]),
        ],
      },
      {
        id: "nfe",
        titulo: "Emitir NF-e (produtos)",
        caminhos: ["/fiscal/emitidas"],
        blocos: [
          passos([
            "Fature o pedido ([[ajuda:vendas#faturar|Faturar o pedido]]).",
            "No pedido, bloco **Nota fiscal (NF-e)**: a lista **Antes de emitir** mostra o que falta, com o link **Corrigir** em cada item.",
            "Clique em **Emitir NF-e**. O aviso mostra o ambiente: HOMOLOGAÇÃO (teste) ou PRODUÇÃO (com valor fiscal).",
            "Autorizada, baixe o **DANFE** e o XML ou use **Enviar por e-mail**: o cliente recebe os dois.",
          ]),
          imagem(
            "nfe",
            "O bloco **Nota fiscal (NF-e)** no pedido, com a nota autorizada.",
            "Bloco Nota fiscal no pedido com a NF-e autorizada e os botões DANFE e abrir a nota.",
            ["**DANFE** da nota; ao lado, o botão que abre a nota."],
          ),
          lista(
            [
              "**Rejeitada**: a mensagem da SEFAZ diz o motivo. Corrija o cadastro (cliente, produto, empresa) e emita de novo: o reenvio usa o mesmo número.",
              "**SEFAZ-SP fora do ar**: use **Emitir em contingência (SVC-AN)** e escreva o motivo; a nota sai por outro autorizador, com outro número.",
              "**Em processamento**, sem resposta: clique em **Consultar situação** (no pedido) ou **Consultar na SEFAZ** (na nota) antes de emitir de novo, para não sair nota em duplicidade.",
            ],
            "Se algo der errado",
          ),
        ],
      },
      {
        id: "nfe-depois",
        titulo: "Carta de correção, cancelamento e inutilização",
        blocos: [
          texto("Em [[/fiscal/emitidas]], abra a nota:"),
          lista([
            "**Carta de correção**: corrige dados que não mudam valor, imposto nem destinatário (por exemplo, endereço de entrega, peso ou transportadora).",
            "**Cancelar**: vai para a SEFAZ e não tem volta. Vale até 24 horas depois da autorização e só se a mercadoria não saiu.",
            "**Inutilizar números**: para números que foram pulados e não serão usados (veja [[ajuda:administracao#emissao|Emissão de NF-e e NFS-e]]).",
          ]),
        ],
      },
      {
        id: "nfse",
        titulo: "Emitir NFS-e (serviços)",
        caminhos: ["/fiscal/servicos"],
        blocos: [
          texto("A NFS-e sai pelo **Emissor Nacional**, obrigatório para as empresas do Simples Nacional a partir de 01/11/2026."),
          passos([
            "Fature o pedido com os serviços.",
            "No bloco **Nota fiscal de serviço (NFS-e)**, confira o **Tomador**, o **Código de tributação nacional** e o **Valor do serviço**.",
            "Clique em **Emitir NFS-e**. Serviços com códigos de tributação diferentes saem em notas separadas.",
            "Gerada, baixe a **DANFSe** e o XML ou envie por e-mail.",
          ]),
          imagem(
            "nfse",
            "O bloco **Nota fiscal de serviço (NFS-e)** no pedido.",
            "Bloco Nota fiscal de serviço no pedido com a NFS-e gerada e os botões DANFSe e abrir a nota.",
            ["**DANFSe** da nota gerada."],
          ),
          lista([
            "**Cancelar**: escolha o motivo (erro na emissão, serviço não prestado ou outro) e escreva a justificativa. O prazo para cancelar é definido pelo município.",
            "Recusada: corrija o que a mensagem indicar e use **Corrigir e reenviar a NFS-e**.",
            "Sem resposta do emissor: **Consultar situação** (no pedido) ou **Consultar no emissor nacional** (na nota) traz o resultado. Consulte antes de emitir de novo.",
          ]),
        ],
      },
      {
        id: "recebidas",
        titulo: "Notas recebidas (dos fornecedores)",
        caminhos: ["/fiscal/recebidas"],
        blocos: [
          texto("Com a busca ligada, o sistema procura a cada hora, direto na SEFAZ e no Ambiente Nacional, as NF-e, CT-e e NFS-e emitidas contra o CNPJ (a primeira busca traz os últimos 90 dias). O número ao lado do item no menu mostra as NF-e sem manifestação final. Quem pode editar o fiscal tem o botão **Buscar agora**, para não esperar a próxima hora."),
          imagem(
            "recebidas",
            "As notas que chegaram contra o CNPJ da empresa.",
            "Tela de notas recebidas com o botão Buscar agora, as abas por situação da manifestação e a lista de notas com a coluna Contas a pagar.",
            ["**Buscar agora**.", "Aba **Sem manifestação**: falta confirmar ou recusar.", "Coluna **Contas a pagar**: se a nota já foi lançada."],
          ),
          passos([
            "Em [[/fiscal/recebidas]], veja as notas nas abas **Sem manifestação**, **Com ciência**, **Confirmadas**, **Recusadas**, **Canceladas** e **Todas**.",
            "A **ciência** (automática, se ligada) libera o XML completo da NF-e, que chega na busca seguinte.",
            "Depois de conferir a mercadoria, abra a nota e registre **Confirmar operação**, **Desconhecer a operação** (você não reconhece a compra) ou **Operação não realizada** (com justificativa de pelo menos 15 caracteres).",
            "**Lançar no contas a pagar**: as parcelas vêm das duplicatas da nota; escolha a **Categoria** e o **Centro de custo**.",
            "Para compras de material, dê a entrada no estoque pela própria nota (veja [[ajuda:estoque#compras|Compras]]).",
          ]),
          atencao("A SEFAZ não garante a entrega de 100% das notas: o fornecedor continua obrigado a mandar o XML. Não ligue a busca se outro sistema já busca para o mesmo CNPJ: a SEFAZ bloqueia consultas em duplicidade."),
        ],
      },
      {
        id: "fechamento",
        titulo: "Fechamento mensal (contador)",
        caminhos: ["/contador"],
        blocos: [
          texto("[[/contador]] reúne o que o contador precisa do mês (competência), das empresas que você acessa: o resumo das notas emitidas e recebidas e do que foi recebido e pago."),
          imagem(
            "contador",
            "O fechamento do mês para o contador.",
            "Tela de fechamento mensal com o mês escolhido, os totais de notas e recebimentos, o botão para baixar o XML da competência e os relatórios em CSV.",
            ["Escolha o mês.", "**Baixar XML** da competência (um arquivo ZIP).", "**Relatórios em CSV**."],
          ),
          lista([
            "**XML da competência**: um arquivo ZIP com as NF-e e NFS-e emitidas (com cancelamentos e cartas de correção) e as notas recebidas, separado por CNPJ.",
            "**Relatórios em CSV**, que abrem no Excel: NF-e emitidas, NFS-e emitidas, notas recebidas, recebimentos, pagamentos e DRE do ano.",
          ]),
          dica("Todo começo de mês, baixe o ZIP e os relatórios do mês anterior e mande ao contador. Ele também pode ter acesso próprio, com o perfil Contador (somente leitura)."),
        ],
      },
    ],
  },

  {
    id: "cadastros",
    titulo: "Cadastros",
    resumo: "Clientes e fornecedores, produtos e serviços e os cadastros financeiros: categorias, centros de custo, contas, formas e condições de pagamento.",
    icone: "Users",
    permissao: "cadastros:ver",
    quem: "Todos os perfis consultam; Vendas, Estoque, Financeiro e administradores editam.",
    caminhos: ["/cadastros"],
    topicos: [
      {
        id: "pessoas",
        titulo: "Clientes e fornecedores",
        caminhos: ["/cadastros/pessoas"],
        blocos: [
          passos([
            "Em [[/cadastros/pessoas]], clique em **Novo cliente/fornecedor**.",
            "Escolha o **Tipo** (pessoa jurídica ou física) e informe o **CNPJ / CPF**: a busca na Receita preenche a razão social, o endereço e, quando disponível, a inscrição estadual, o e-mail e o telefone.",
            "Marque **É cliente** e/ou **É fornecedor**.",
            "Confira o **Indicador de IE** (contribuinte, isento ou não contribuinte) e o endereço com o **Código IBGE** (vem pelo CEP): a NF-e precisa dos dois.",
            "Salve.",
          ]),
          imagem(
            "cliente",
            "O cadastro de cliente ou fornecedor: comece pelo CNPJ.",
            "Formulário de novo cliente ou fornecedor com o tipo, o CNPJ com o botão de busca, o nome, o nome fantasia e as opções é cliente e é fornecedor.",
            ["A lupa (**Buscar na Receita**) preenche os dados pelo CNPJ.", "**É cliente**.", "**É fornecedor** (pode ser os dois)."],
          ),
          dica("Cada empresa do grupo tem os próprios clientes e fornecedores; o mesmo CNPJ pode estar cadastrado nas duas."),
        ],
      },
      {
        id: "produtos",
        titulo: "Produtos e serviços",
        caminhos: ["/cadastros/produtos"],
        blocos: [
          texto("Tudo o que a empresa vende: materiais e produtos (com estoque) e serviços. Use **Novo produto/serviço**."),
          lista([
            "**Tipo**, **Código (SKU)**, **Unidade** (KG, UN, HR…), **Descrição**, **Preço de venda** e **Preço de custo**.",
            "NF-e (produtos): **NCM**, **CEST**, **GTIN/EAN**, **Origem da mercadoria**, o CFOP e o CSOSN dentro e fora do estado e o texto legal (por exemplo, o diferimento do ICMS).",
            "NFS-e (serviços): **Item LC 116**, os códigos de tributação nacional e municipal e o **Código NBS**.",
            "Reforma tributária: **CST IBS/CBS** e **Classificação tributária IBS/CBS** (vazios = tributação integral).",
            "**Controla estoque**, **Estoque mínimo** e **Estoque máximo**.",
          ]),
          atencao("Os códigos fiscais (NCM, CFOP, CSOSN e código de serviço) definem os impostos da nota: confirme com o contador antes de emitir em produção."),
        ],
      },
      {
        id: "financeiros",
        titulo: "Cadastros financeiros",
        caminhos: ["/cadastros/categorias", "/cadastros/centros-de-custo", "/cadastros/contas-bancarias", "/cadastros/formas-de-pagamento", "/cadastros/condicoes-de-pagamento"],
        blocos: [
          lista([
            "[[/cadastros/categorias]]: receitas e despesas, cada uma com o **Grupo da DRE**. A empresa já nasce com um plano de categorias.",
            "[[/cadastros/centros-de-custo]]: para separar resultados por área, obra ou contrato (opcional).",
            "[[/cadastros/contas-bancarias]]: contas correntes e caixa, com **Banco**, **Agência**, **Conta**, **Saldo inicial** e **Data do saldo inicial** (o saldo do sistema parte daí).",
            "[[/cadastros/formas-de-pagamento]]: Pix, boleto, transferência, dinheiro… O **Meio** define o código da forma de pagamento na NF-e.",
            "[[/cadastros/condicoes-de-pagamento]]: os prazos das parcelas em dias (por exemplo, 30/60/90), usados em propostas, pedidos e lançamentos.",
          ]),
        ],
      },
      {
        id: "inativar",
        titulo: "Editar, inativar e excluir",
        blocos: [texto("Use **Editar** na linha. Para tirar um cadastro de uso sem perder o histórico, use **Inativar** (e **Reativar** para voltar). **Excluir** é permanente e só vale para registro sem lançamentos vinculados; se já tiver, inative. Os inativos aparecem no filtro **Inativos** da lista. Em [[/cadastros/pessoas]], **Só clientes** e **Só fornecedores** separam os dois.")],
      },
    ],
  },

  {
    id: "administracao",
    titulo: "Administração",
    resumo: "Empresas e filiais, certificado digital, busca de notas, emissão de NF-e e NFS-e, cobrança, usuários, e-mails e auditoria.",
    icone: "Building",
    permissao: "config:admin",
    quem: "Administradores; algumas partes, só o administrador do grupo.",
    caminhos: ["/configuracoes"],
    topicos: [
      {
        id: "empresa",
        titulo: "Empresa e filiais",
        caminhos: ["/configuracoes/empresa"],
        blocos: [
          texto("Em [[/configuracoes/empresa]] ficam as empresas do grupo, com as filiais, e os blocos de configuração de cada estabelecimento (CNPJ)."),
          imagem(
            "empresa",
            "A empresa com os dados e o logotipo; embaixo vêm os blocos de configuração de cada estabelecimento e as filiais.",
            "Tela de empresas e filiais com o botão Nova empresa e o cartão da empresa com os dados fiscais, o endereço, o contato e o bloco do logotipo.",
            ["**Nova empresa** (só o administrador do grupo).", "**Editar** os dados da empresa.", "**Enviar logotipo**."],
          ),
          lista([
            "**Editar** os dados: CNPJ (**Buscar na Receita** preenche), **Regime tributário**, **Inscrição estadual** e **Inscrição municipal**, endereço com o **Código do município (IBGE)** e contato. O e-mail da empresa é o que recebe as respostas dos clientes.",
            "**Nova filial**: cadastra um estabelecimento ligado à matriz. Inativar e reativar mantém o histórico.",
            "**Nova empresa**: só o administrador do grupo. A empresa já nasce com plano de categorias, caixa e cadastros próprios.",
            "**Logotipo**: sai no cabeçalho das propostas e pedidos em PDF (PNG, JPG, WebP ou SVG).",
          ]),
        ],
      },
      {
        id: "certificado",
        titulo: "Certificado digital A1",
        blocos: [
          passos([
            "No bloco **Certificado digital** do estabelecimento, clique em **Enviar certificado**.",
            "Escolha o arquivo **.pfx** (ou .p12) e digite a senha do certificado.",
            "Clique em **Guardar certificado**. O sistema confere a validade e se o certificado é do mesmo CNPJ (raiz) da empresa.",
          ]),
          lista([
            "A filial sem certificado próprio usa o da matriz.",
            "**Testar certificado** confere se ele continua válido.",
            "Na renovação, use **Trocar**. Os administradores recebem aviso por e-mail 30, 15, 7 e 1 dia antes do vencimento, e o painel mostra o alerta.",
            "**Remover** apaga o certificado do sistema. Sem ele, a empresa não emite notas; numa filial, passa a valer o certificado da matriz, se houver.",
            "O arquivo e a senha ficam guardados cifrados: ninguém consegue baixar o certificado pelo sistema.",
          ]),
          imagem(
            "certificado",
            "O bloco **Certificado digital**: a matriz com o certificado e a filial usando o da matriz.",
            "Bloco do certificado digital com a matriz e o certificado válido, os botões Trocar e mais ações, e a filial com o botão Enviar certificado.",
            ["**Trocar**, na renovação.", "Menu: **Testar certificado** e **Remover**.", "**Enviar certificado** próprio da filial."],
          ),
        ],
      },
      {
        id: "busca-notas",
        titulo: "Busca de notas recebidas",
        blocos: [
          passos([
            "No bloco **Notas recebidas**, clique em **Configurar**.",
            "Ligue **Buscar notas contra este CNPJ**, escolha **O que buscar** (NF-e, CT-e e NFS-e) e deixe ligado **Dar ciência automaticamente nas NF-e**. Em **Motor**, deixe **SEFAZ direto** (sem custo); a **Focus NFe** fica de reserva.",
            "Clique em **Salvar**. A primeira busca traz as notas dos últimos 90 dias; depois, ela roda a cada hora.",
          ]),
          imagem(
            "busca-notas",
            "O bloco **Notas recebidas**, com a última busca de cada tipo de nota.",
            "Bloco de notas recebidas com a matriz com a busca ligada, a data da última consulta de NF-e, CT-e e NFS-e, e o botão Configurar.",
            ["**Configurar** a busca do estabelecimento."],
          ),
          atencao("Se outro sistema já busca as notas do mesmo CNPJ, não ligue aqui: a SEFAZ bloqueia consultas em duplicidade."),
        ],
      },
      {
        id: "emissao",
        titulo: "Emissão de NF-e e NFS-e",
        blocos: [
          imagem(
            "emissao",
            "Os blocos **Emissão de NF-e** e **Emissão de NFS-e (emissor nacional)**, um por estabelecimento.",
            "Blocos de emissão de NF-e e de NFS-e com a matriz ligada em produção, a filial desligada e os botões Configurar, Inutilizar números e Conferir município.",
            ["**Configurar** a emissão de NF-e.", "**Inutilizar números**.", "**Configurar** a emissão de NFS-e.", "**Conferir município**."],
          ),
          lista(
            [
              "No bloco **Emissão de NF-e**, **Configurar**: ligue **Emitir NF-e por este estabelecimento**, escolha o **Ambiente** (comece em homologação), a série, o próximo número (se a empresa já emitia em outro sistema, continue a numeração dele) e as informações complementares padrão.",
              "**Grupo IBS/CBS (reforma tributária)**: para o Simples Nacional, use só em homologação até a Receita publicar as regras (a obrigação começa em 2027).",
              "**Inutilizar números**: para faixas de números que não serão usadas.",
            ],
            "NF-e",
          ),
          lista(
            [
              "No bloco **Emissão de NFS-e (emissor nacional)**, **Configurar**: ligue **Emitir NFS-e por este estabelecimento** e escolha o ambiente (produção restrita para testes), a série, o número da DPS e a alíquota do Simples informada pelo contador.",
              "**Conferir município**: mostra se o município está habilitado no Emissor Nacional.",
              "**Enviar a inscrição municipal na DPS**: só se o município exigir.",
            ],
            "NFS-e",
          ),
          texto("Em **Motor**, deixe a emissão direta: **SEFAZ direto** na NF-e e **Emissor nacional** na NFS-e, com o certificado A1 e sem custo. A **Focus NFe** é a reserva, para usar só se a emissão direta não for possível."),
        ],
      },
      {
        id: "cobranca",
        titulo: "Cobrança pelo Asaas",
        blocos: [
          passos([
            "Crie a conta da empresa no Asaas (uma por CNPJ) e copie a chave da API.",
            "No bloco **Cobrança (boleto e Pix pelo Asaas)**, clique em **Configurar** e ligue **Gerar cobranças por este estabelecimento**.",
            "Escolha o **Ambiente** (sandbox para testes), cole a chave e informe a **Conta onde o dinheiro entra**, a **Forma padrão**, a **Multa por atraso (%)** e os **Juros ao mês (%)**.",
            "Deixe ligado **Mandar o e-mail da cobrança ao cliente automaticamente**. **Deixar o Asaas notificar o cliente também** custa por cobrança e vem desligado.",
            "Salve. O sistema registra o aviso de pagamento do Asaas (**Webhook ok**).",
          ]),
          imagem(
            "cobranca-asaas",
            "O bloco **Cobrança (boleto e Pix pelo Asaas)**.",
            "Bloco de cobrança pelo Asaas com a matriz ligada em produção e o webhook registrado, os botões Testar, Atualizar webhook e Configurar, e a filial desligada.",
            ["**Configurar**.", "**Testar** a chave da API.", "**Webhook ok**: o aviso de pagamento do Asaas está registrado."],
          ),
          dica("A chave fica guardada cifrada e não aparece de novo na tela."),
        ],
      },
      {
        id: "usuarios",
        titulo: "Usuários",
        caminhos: ["/configuracoes/usuarios"],
        blocos: [
          passos([
            "Em [[/configuracoes/usuarios]], clique em **Novo usuário**.",
            "Informe o **Nome**, o e-mail (é o login) e o **Papel** (veja [[ajuda:primeiros-passos#perfis|Perfis de acesso]]).",
            "Em **Empresas**, marque as empresas liberadas, ou **Todas as empresas do grupo** (inclui as que forem cadastradas depois).",
            "Salve. A senha provisória vai por e-mail ao usuário (e aparece na tela uma vez); no primeiro acesso, ele cria a dele.",
          ]),
          lista([
            "**Editar**: muda o papel e as empresas.",
            "**Redefinir senha**: gera uma nova senha provisória.",
            "**Inativar** e **Reativar**: o usuário inativo não entra, e o histórico dele fica.",
            "**Desbloquear**: libera o login bloqueado por tentativas erradas.",
          ]),
          imagem(
            "usuarios",
            "Os usuários, com o menu da linha aberto numa usuária bloqueada por tentativas erradas.",
            "Tela de usuários com o botão Novo usuário, a lista com papel, empresas e situação, e o menu da linha aberto com as opções Editar, Redefinir senha, Desbloquear e Inativar.",
            ["**Novo usuário**.", "A situação: ativo, troca de senha pendente ou bloqueado.", "**Redefinir senha**: gera uma nova senha provisória.", "**Desbloquear**: libera o login."],
          ),
          atencao("O administrador de uma empresa vê e gerencia só os usuários das empresas dele. Ninguém altera o próprio acesso, e sempre sobra um administrador do grupo ativo."),
        ],
      },
      {
        id: "emails",
        titulo: "E-mails",
        caminhos: ["/configuracoes/email"],
        blocos: [
          texto("[[/configuracoes/email]] (só o administrador do grupo) mostra se o envio está **Configurado**, o remetente e os últimos e-mails enviados, com a situação de cada um."),
          lista([
            "**E-mail de teste**: confere se o envio funciona.",
            "**Reenviar**: manda de novo um e-mail que falhou (o sistema também tenta sozinho, até 5 vezes).",
            "**Mostrar registros DNS** e **Verificar**: cadastram o domínio do remetente, para os e-mails não caírem no spam.",
          ]),
        ],
      },
      {
        id: "auditoria",
        titulo: "Auditoria",
        caminhos: ["/configuracoes/auditoria"],
        blocos: [
          texto("[[/configuracoes/auditoria]] é a trilha de quem fez o quê e quando: criações, alterações, exclusões, acessos, emissões e importações, com os detalhes de cada ação. Filtre por período, **Usuário** e **Entidade** (o tipo de registro), ou busque no resumo. O administrador de uma empresa vê só a auditoria dela."),
        ],
      },
    ],
  },

  {
    id: "rotinas",
    titulo: "Rotinas automáticas",
    resumo: "O que o sistema faz sozinho, e quando.",
    icone: "CalendarClock",
    quem: "Todos, para saber o que esperar.",
    caminhos: [],
    topicos: [
      {
        id: "o-que-roda",
        titulo: "O que roda sozinho",
        blocos: [
          tabela(
            ["O quê", "Quando", "Onde ver"],
            [
              ["Busca de notas recebidas (NF-e, CT-e e NFS-e)", "A cada hora, se a busca estiver ligada", "[[/fiscal/recebidas]]"],
              ["Baixa das cobranças pagas (boleto e Pix)", "Na hora, pelo aviso do Asaas, com conferência a cada hora", "[[/financeiro/cobrancas]]"],
              ["Contratos recorrentes: pedido, conta a receber e cobrança", "Todo dia, às 6h15", "[[/cadastros/contratos]]"],
              ["Reenvio dos e-mails que falharam", "A cada 30 minutos, até 5 tentativas", "[[/configuracoes/email]]"],
              ["Aviso de certificado digital vencendo", "30, 15, 7 e 1 dia antes e no vencimento", "E-mail dos administradores e painel"],
              ["Baixa e devolução do estoque", "Ao faturar e ao desfazer o faturamento", "[[/estoque/movimentacoes]]"],
              ["Fotografia dos paletes do armazém (base da apuração mensal da armazenagem)", "De hora em hora; vale a última de cada dia", "[[/servicos/armazem/faturamento]]"],
            ],
          ),
        ],
      },
    ],
  },

  {
    id: "duvidas",
    titulo: "Dúvidas comuns",
    resumo: "Respostas rápidas para os problemas mais frequentes.",
    icone: "CircleHelp",
    quem: "Todos.",
    caminhos: [],
    topicos: [
      { id: "armazenagem-valor", titulo: "Como é calculada a armazenagem?", blocos: [texto("Todo mês, depois que ele termina: a quantidade de paletes armazenados no último dia (a apuração) × o valor por palete da tarifa do depositante. Veja [[ajuda:armazem#cobranca|Cobrança por palete]]. O dia a dia de cada depositante fica em **Ver dia a dia**, no faturamento.")] },
      { id: "onde-esta", titulo: "Onde está o código X, lote Y, no armazém?", blocos: [texto("Em [[/servicos/armazem]], busque pelo código ou pelo lote e escolha **Por código e lote**: a lista mostra a quantidade e cada caixa ou pallet com o endereço.")] },
      { id: "senha", titulo: "Esqueci a senha ou o acesso foi bloqueado", blocos: [texto("Use **Esqueci minha senha** na tela de entrada. Depois de 5 tentativas erradas, o acesso fica bloqueado por 15 minutos; um administrador pode liberar antes, em [[/configuracoes/usuarios]].")] },
      { id: "nao-vejo", titulo: "Não vejo uma empresa, um menu ou um botão", blocos: [texto("O menu mostra só o que o seu perfil pode usar, e cada usuário só vê as empresas liberadas para ele. Confira a empresa ativa no topo do menu e peça a um administrador para ajustar o seu acesso.")] },
      { id: "faturar", titulo: "O pedido não fatura", blocos: [texto("Ou faltou saldo de algum material (a mensagem lista o que falta: lance a entrada antes), ou o seu perfil não inclui o Financeiro: peça a alguém do Financeiro para faturar.")] },
      { id: "rejeitada", titulo: "A NF-e foi rejeitada", blocos: [texto("Leia o motivo da SEFAZ no pedido, corrija o cadastro (cliente, produto ou empresa) pelo link **Corrigir** e emita de novo: o reenvio usa o mesmo número.")] },
      { id: "sefaz", titulo: "A SEFAZ está fora do ar", blocos: [texto("No pedido, use **Emitir em contingência (SVC-AN)** e escreva o motivo. Se a nota anterior ficou sem resposta, o sistema orienta como resolver: consultar a situação e, se for o caso, inutilizar o número.")] },
      { id: "nota-errada", titulo: "Emiti uma nota com erro", blocos: [texto("Se o erro não muda valor, imposto nem destinatário, faça uma **Carta de correção**. Se muda, cancele em até 24 horas (com a mercadoria ainda no estabelecimento) e emita de novo.")] },
      { id: "email", titulo: "O e-mail não chegou", blocos: [texto("Peça para a pessoa olhar a caixa de spam e marcar como não spam. Em [[/configuracoes/email]], o administrador vê se o e-mail saiu e pode usar **Reenviar**.")] },
      { id: "cobranca", titulo: "O cliente pagou, mas o título não baixou", blocos: [texto("A baixa chega pelo aviso do Asaas, em geral na hora, e o sistema confere a cada hora. Para conferir já, abra o título e use **Conferir** no bloco da cobrança. O boleto depende da compensação do banco e pode levar até o dia útil seguinte.")] },
      { id: "saldo", titulo: "O saldo do sistema não bate com o banco", blocos: [texto("Importe o extrato OFX em [[/financeiro/conciliacao]] e concilie: a diferença entre o saldo do extrato e o do sistema aparece no topo, e os pendentes mostram o que falta lançar.")] },
      { id: "contador", titulo: "Como mando os documentos ao contador", blocos: [texto("Em [[/contador]], baixe o ZIP com os XML e os relatórios em CSV do mês. Ou crie um usuário com o perfil Contador (somente leitura) para ele mesmo baixar.")] },
      { id: "planilha", titulo: "Importei a planilha errada", blocos: [texto("Em [[/estoque/movimentacoes]], exclua a entrada ou o ajuste criado pela planilha (a referência é o nome do arquivo) e importe de novo. Material cadastrado errado pode ser editado ou inativado em [[/cadastros/produtos]].")] },
    ],
  },
];
