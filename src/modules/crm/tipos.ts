// Tipos e listas fixas do CRM (seguro para client e server).

export type Etapa = "DESCOBERTA" | "PROPOSTA" | "NEGOCIACAO" | "GANHA" | "PERDIDA";
export type EtapaAberta = "DESCOBERTA" | "PROPOSTA" | "NEGOCIACAO";
export type TipoAtividadeT = "LIGACAO" | "WHATSAPP" | "EMAIL" | "REUNIAO" | "VISITA" | "TAREFA";

export const ETAPAS: Etapa[] = ["DESCOBERTA", "PROPOSTA", "NEGOCIACAO", "GANHA", "PERDIDA"];
export const ETAPAS_ABERTAS: EtapaAberta[] = ["DESCOBERTA", "PROPOSTA", "NEGOCIACAO"];
export const ehAberta = (e: Etapa): e is EtapaAberta => (ETAPAS_ABERTAS as Etapa[]).includes(e);

export const ROTULO_ETAPA: Record<Etapa, string> = {
  DESCOBERTA: "Descoberta",
  PROPOSTA: "Proposta",
  NEGOCIACAO: "Negociação",
  GANHA: "Ganha",
  PERDIDA: "Perdida",
};

export const AJUDA_ETAPA: Record<Etapa, string> = {
  DESCOBERTA: "Primeiro contato e entendimento da necessidade.",
  PROPOSTA: "Proposta montada ou enviada ao cliente.",
  NEGOCIACAO: "Ajustes de preço, prazo e condições.",
  GANHA: "Fechou negócio.",
  PERDIDA: "Não fechou.",
};

/** Chance de fechar por etapa, em %: base da previsão ponderada (valor × chance). */
export const PROBABILIDADE: Record<Etapa, number> = { DESCOBERTA: 20, PROPOSTA: 50, NEGOCIACAO: 80, GANHA: 100, PERDIDA: 0 };

export const TOM_ETAPA: Record<Etapa, "neutro" | "info" | "sucesso" | "alerta" | "perigo"> = {
  DESCOBERTA: "neutro",
  PROPOSTA: "info",
  NEGOCIACAO: "alerta",
  GANHA: "sucesso",
  PERDIDA: "perigo",
};

export const ORIGENS = {
  INDICACAO: "Indicação",
  BASE: "Cliente da base",
  SITE: "Site",
  WHATSAPP: "WhatsApp",
  REDES_SOCIAIS: "Redes sociais",
  ANUNCIOS: "Google ou anúncios",
  PROSPECCAO: "Prospecção ativa",
  EVENTO: "Evento ou feira",
  OUTRO: "Outro",
} as const;
export type Origem = keyof typeof ORIGENS;

export const MOTIVOS_PERDA = {
  PRECO: "Preço",
  CONCORRENTE: "Fechou com concorrente",
  PRAZO: "Prazo",
  SEM_ORCAMENTO: "Sem orçamento",
  ADIOU: "Adiou a decisão",
  SEM_RESPOSTA: "Parou de responder",
  NAO_QUALIFICADO: "Fora do perfil",
  OUTRO: "Outro",
} as const;
export type MotivoPerda = keyof typeof MOTIVOS_PERDA;

export const ROTULO_ATIVIDADE: Record<TipoAtividadeT, string> = {
  LIGACAO: "Ligação",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  REUNIAO: "Reunião",
  VISITA: "Visita",
  TAREFA: "Tarefa",
};

export const opcoesDe = (o: Record<string, string>) => Object.entries(o).map(([valor, rotulo]) => ({ valor, rotulo }));

export type ProximaAtividade = { id: string; data: string; hora: string | null; tipo: TipoAtividadeT; assunto: string };

/** Cartão do funil. */
export type CartaoOportunidade = {
  id: string;
  titulo: string;
  pessoaNome: string;
  valor: number;
  etapa: Etapa;
  diasNaEtapa: number;
  previsaoFechamento: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  proxima: ProximaAtividade | null;
  /** quando foi ganha ou perdida (só para as fechadas) */
  fechadaEm: string | null;
  motivoPerda: string | null;
};

export type TotaisEtapa = { quantidade: number; valor: number; ponderado: number };

export type Funil = {
  colunas: Record<Etapa, CartaoOportunidade[]>;
  totais: Record<Etapa, TotaisEtapa>;
  abertas: TotaisEtapa;
  /** últimos 90 dias */
  resultado: { ganhas: number; perdidas: number; valorGanho: number; conversao: number | null; ticketMedio: number | null; motivos: { motivo: string; quantidade: number }[] };
};

export type AtividadeItem = {
  id: string;
  tipo: TipoAtividadeT;
  assunto: string;
  descricao: string | null;
  data: string;
  hora: string | null;
  concluidaEm: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  oportunidade: { id: string; titulo: string } | null;
  pessoa: { id: string; nome: string } | null;
};

export type PropostaDaOportunidade = { id: string; numero: number; status: string; emissao: string; total: number };

export type HistoricoItem = { id: string; acao: string; resumo: string | null; usuarioNome: string | null; quando: string };

export type OportunidadeDetalhe = {
  id: string;
  titulo: string;
  pessoaId: string;
  pessoaNome: string;
  pessoaDocumento: string | null;
  pessoaTelefone: string | null;
  pessoaEmail: string | null;
  contato: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  etapa: Etapa;
  etapaDesde: string;
  diasNaEtapa: number;
  etapaAntesFechar: Etapa | null;
  valor: number;
  previsaoFechamento: string | null;
  origem: string | null;
  motivoPerda: string | null;
  detalhePerda: string | null;
  observacoes: string | null;
  ganhaEm: string | null;
  perdidaEm: string | null;
  criadaEm: string;
  atividades: AtividadeItem[];
  propostas: PropostaDaOportunidade[];
  historico: HistoricoItem[];
};

export type Opcao = { valor: string; rotulo: string };
export type OpcoesCrm = { responsaveis: Opcao[] };

/** Valores do formulário de oportunidade (client). */
export type ValoresOportunidade = {
  titulo: string;
  pessoaId: string | null;
  pessoaNome: string | null;
  contato: string;
  responsavelId: string;
  etapa: EtapaAberta;
  valor: number;
  previsaoFechamento: string;
  origem: string;
  observacoes: string;
};

/** Valores do formulário de atividade (client). */
export type ValoresAtividade = {
  tipo: TipoAtividadeT;
  assunto: string;
  descricao: string;
  data: string;
  hora: string;
  responsavelId: string;
  oportunidadeId: string | null;
  pessoaId: string | null;
  pessoaNome: string | null;
};
