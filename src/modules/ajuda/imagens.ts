// Gerado por qa-e2e/capturas-manual.mjs (não edite à mão). Cada imagem fica em public/manual/<id>.png, capturada em 2x.
// marcas = quantos números laranja a imagem tem: a legenda do bloco de imagem precisa ter um item para cada um.
export const IMAGENS_MANUAL = {
  armazem: { largura: 1536, altura: 900, marcas: 3 },
  atividades: { largura: 1536, altura: 960, marcas: 3 },
  cliente: { largura: 1344, altura: 1000, marcas: 3 },
  cobranca: { largura: 1365, altura: 720, marcas: 3 },
  compras: { largura: 1536, altura: 780, marcas: 3 },
  conciliacao: { largura: 1536, altura: 645, marcas: 5 },
  conferencia: { largura: 1536, altura: 1050, marcas: 4 },
  contador: { largura: 1536, altura: 870, marcas: 3 },
  "contas-receber": { largura: 1536, altura: 840, marcas: 4 },
  estoque: { largura: 1536, altura: 840, marcas: 4 },
  "faturamento-armazem": { largura: 1536, altura: 840, marcas: 4 },
  faturar: { largura: 1232, altura: 1172, marcas: 0 },
  funil: { largura: 1536, altura: 960, marcas: 4 },
  importar: { largura: 1536, altura: 705, marcas: 0 },
  navegar: { largura: 1536, altura: 984, marcas: 5 },
  nfe: { largura: 1344, altura: 384, marcas: 1 },
  nfse: { largura: 1344, altura: 440, marcas: 1 },
  "nova-conta": { largura: 1344, altura: 1520, marcas: 4 },
  painel: { largura: 1536, altura: 1050, marcas: 3 },
  pedido: { largura: 1536, altura: 398, marcas: 3 },
  proposta: { largura: 1536, altura: 630, marcas: 4 },
  recebidas: { largura: 1536, altura: 840, marcas: 3 },
  volumes: { largura: 1536, altura: 840, marcas: 3 },
} as const satisfies Record<string, { largura: number; altura: number; marcas: number }>;

export type IdImagem = keyof typeof IMAGENS_MANUAL;
