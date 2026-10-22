// Tratamento do logotipo no navegador, antes do envio: corta as margens vazias (transparentes ou brancas),
// reduz para caber em 1200 x 600 px e converte para PNG (ou JPEG em fundo branco se o PNG passar de 600 KB).
// Assim chega ao servidor uma imagem pequena, que o motor de PDF entende (PNG ou JPEG). O servidor aceita até
// 700 KB: acima disso o texto em base64 passa do limite do React para argumentos de server action (1 milhão de caracteres).

export type LogoPreparado = {
  dataUrl: string;
  formato: "png" | "jpeg";
  largura: number;
  altura: number;
  bytes: number;
  /** havia margem vazia em volta e ela foi cortada */
  cortouMargem: boolean;
};

const TIPOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];
const MAX_ARQUIVO = 15 * 1024 * 1024;
const MAX_LARGURA = 1200;
const MAX_ALTURA = 600;
/** lado máximo da imagem de trabalho (limita memória em fotos enormes; SVG é desenhado neste tamanho) */
const LADO_TRABALHO = 2400;
const LIMITE_BYTES = 600 * 1024;

/** Proporção do SVG pelo viewBox ou por width/height (SVG sem tamanho próprio não tem naturalWidth). */
async function proporcaoSvg(arquivo: File): Promise<number | null> {
  const texto = await arquivo.text();
  const vb = /viewBox\s*=\s*["']\s*[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+([\d.e]+)/i.exec(texto);
  if (vb && Number(vb[1]) > 0 && Number(vb[2]) > 0) return Number(vb[1]) / Number(vb[2]);
  const w = /<svg[^>]*\swidth\s*=\s*["']\s*([\d.]+)/i.exec(texto);
  const h = /<svg[^>]*\sheight\s*=\s*["']\s*([\d.]+)/i.exec(texto);
  if (w && h && Number(w[1]) > 0 && Number(h[1]) > 0) return Number(w[1]) / Number(h[1]);
  return null;
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob> {
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível converter a imagem."))), tipo, qualidade));
}

function comoDataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, falha) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result));
    leitor.onerror = () => falha(new Error("Não foi possível ler a imagem."));
    leitor.readAsDataURL(blob);
  });
}

/** Retângulo do desenho, sem a margem vazia. O fundo é deduzido pelos quatro cantos. */
export function caixaDoDesenho(dados: { width: number; height: number; data: Uint8ClampedArray }) {
  const { width: W, height: H, data } = dados;
  const pos = (x: number, y: number) => (y * W + x) * 4;
  const cantos = [pos(0, 0), pos(W - 1, 0), pos(0, H - 1), pos(W - 1, H - 1)];
  const transparente = cantos.every((i) => data[i + 3] < 16);
  const branco = !transparente && cantos.every((i) => data[i + 3] > 240 && data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240);
  if (!transparente && !branco) return { x: 0, y: 0, w: W, h: H, cortou: false };
  const fundo = (i: number) => data[i + 3] < 16 || (branco && data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240);
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (fundo(pos(x, y))) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error("A imagem parece vazia.");
  // folga de 1% para não cortar o antisserrilhado da borda do desenho
  const folga = Math.round(Math.max(x1 - x0, y1 - y0) * 0.01);
  const x = Math.max(0, x0 - folga);
  const y = Math.max(0, y0 - folga);
  const w = Math.min(W, x1 + folga + 1) - x;
  const h = Math.min(H, y1 + folga + 1) - y;
  return { x, y, w, h, cortou: x > 0 || y > 0 || w < W || h < H };
}

export async function prepararLogotipo(arquivo: File): Promise<LogoPreparado> {
  if (!TIPOS.includes(arquivo.type)) throw new Error("Use um arquivo PNG, JPG, WebP ou SVG.");
  if (arquivo.size > MAX_ARQUIVO) throw new Error("Arquivo grande demais (máximo 15 MB).");
  const svg = arquivo.type === "image/svg+xml";
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error("Não foi possível abrir a imagem. Confira se o arquivo não está corrompido.");
    }
    let largura = img.naturalWidth;
    let altura = img.naturalHeight;
    if (svg) {
      const p = (await proporcaoSvg(arquivo)) ?? (largura && altura ? largura / altura : null);
      if (!p) throw new Error("Este SVG não informa o tamanho. Exporte o logotipo em PNG.");
      // vetor: desenha grande para ficar nítido depois de cortar a margem
      largura = p >= 1 ? LADO_TRABALHO : Math.round(LADO_TRABALHO * p);
      altura = p >= 1 ? Math.round(LADO_TRABALHO / p) : LADO_TRABALHO;
    }
    if (!largura || !altura) throw new Error("Não foi possível ler o tamanho da imagem.");
    const reduz = Math.min(1, LADO_TRABALHO / Math.max(largura, altura));
    const trabalho = document.createElement("canvas");
    trabalho.width = Math.max(1, Math.round(largura * reduz));
    trabalho.height = Math.max(1, Math.round(altura * reduz));
    const ctxT = trabalho.getContext("2d", { willReadFrequently: true });
    if (!ctxT) throw new Error("O navegador não conseguiu processar a imagem.");
    ctxT.imageSmoothingQuality = "high";
    ctxT.drawImage(img, 0, 0, trabalho.width, trabalho.height);

    const caixa = caixaDoDesenho(ctxT.getImageData(0, 0, trabalho.width, trabalho.height));
    const escala = Math.min(1, MAX_LARGURA / caixa.w, MAX_ALTURA / caixa.h);
    const saida = document.createElement("canvas");
    saida.width = Math.max(1, Math.round(caixa.w * escala));
    saida.height = Math.max(1, Math.round(caixa.h * escala));
    if (saida.width < 50 || saida.height < 20) throw new Error(`Imagem pequena demais (${saida.width} × ${saida.height} px). Use pelo menos 50 × 20 px.`);
    const ctxS = saida.getContext("2d");
    if (!ctxS) throw new Error("O navegador não conseguiu processar a imagem.");
    ctxS.imageSmoothingQuality = "high";
    ctxS.drawImage(trabalho, caixa.x, caixa.y, caixa.w, caixa.h, 0, 0, saida.width, saida.height);

    let blob = await paraBlob(saida, "image/png");
    let formato: LogoPreparado["formato"] = "png";
    let final = saida;
    // imagem com muitos detalhes (foto): JPEG em fundo branco (a cor do papel), reduzindo se ainda passar do limite
    for (const [fator, qualidade] of [
      [1, 0.9],
      [1, 0.8],
      [0.75, 0.85],
      [0.5, 0.85],
    ] as const) {
      if (blob.size <= LIMITE_BYTES) break;
      const branco = document.createElement("canvas");
      branco.width = Math.round(saida.width * fator);
      branco.height = Math.round(saida.height * fator);
      const ctxB = branco.getContext("2d")!;
      ctxB.fillStyle = "#ffffff";
      ctxB.fillRect(0, 0, branco.width, branco.height);
      ctxB.imageSmoothingQuality = "high";
      ctxB.drawImage(saida, 0, 0, branco.width, branco.height);
      blob = await paraBlob(branco, "image/jpeg", qualidade);
      formato = "jpeg";
      final = branco;
    }
    if (blob.size > LIMITE_BYTES) throw new Error("A imagem tem detalhes demais para um logotipo. Exporte uma versão mais simples em PNG.");
    return { dataUrl: await comoDataUrl(blob), formato, largura: final.width, altura: final.height, bytes: blob.size, cortouMargem: caixa.cortou };
  } finally {
    URL.revokeObjectURL(url);
  }
}
