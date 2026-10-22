// Logotipo da empresa: leitura e validação no servidor. O navegador já entrega a imagem tratada
// (margens cortadas, até 1200 x 600 px, PNG ou JPEG); aqui só conferimos que é isso mesmo.
import "server-only";
import { prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";

export type FormatoLogo = "png" | "jpeg";
export type ImagemLogo = { dados: Buffer; formato: FormatoLogo; largura: number; altura: number };

/**
 * 700 KB depois de decodificado. O teto vem do React: os argumentos de uma server action somam no máximo
 * 1.000.000 de caracteres, e 700 KB em base64 dão ~956 mil. O navegador mira 600 KB (logotipos costumam ter menos de 200).
 */
export const LIMITE_LOGO_BYTES = 700 * 1024;
const MIN_LARGURA = 50;
const MIN_ALTURA = 20;
const MAX_LADO = 3000;

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Largura e altura do cabeçalho IHDR do PNG. */
export function dimensoesPng(b: Buffer): { largura: number; altura: number } | null {
  if (b.length < 33 || !b.subarray(0, 8).equals(ASSINATURA_PNG) || b.toString("latin1", 12, 16) !== "IHDR") return null;
  return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) };
}

/** Largura e altura do primeiro marcador SOF do JPEG. */
export function dimensoesJpeg(b: Buffer): { largura: number; altura: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) {
      i++; // preenchimento
      continue;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2; // marcadores sem tamanho
      continue;
    }
    if (m === 0xd9 || m === 0xda) return null; // fim da imagem ou início dos dados antes do SOF
    const tamanho = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7) };
    }
    i += 2 + tamanho;
  }
  return null;
}

/** Converte o data URL enviado pelo navegador em imagem conferida (formato, tamanho e dimensões). */
export function lerImagemLogo(dataUrl: unknown): ImagemLogo {
  if (typeof dataUrl !== "string") throw new ErroAcao("Envie o logotipo em PNG ou JPG.");
  if (dataUrl.length > Math.ceil((LIMITE_LOGO_BYTES * 4) / 3) + 64) throw new ErroAcao("Imagem grande demais. O limite é 700 KB.");
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl.replace(/\s+/g, ""));
  if (!m) throw new ErroAcao("Envie o logotipo em PNG ou JPG.");
  const formato = m[1] as FormatoLogo;
  const dados = Buffer.from(m[2], "base64");
  if (!dados.length) throw new ErroAcao("A imagem está vazia.");
  if (dados.length > LIMITE_LOGO_BYTES) throw new ErroAcao("Imagem grande demais. O limite é 700 KB.");
  const dim = formato === "png" ? dimensoesPng(dados) : dimensoesJpeg(dados);
  if (!dim) throw new ErroAcao(`O arquivo não é um ${formato === "png" ? "PNG" : "JPG"} válido.`);
  if (dim.largura < MIN_LARGURA || dim.altura < MIN_ALTURA) {
    throw new ErroAcao(`Imagem pequena demais (${dim.largura} × ${dim.altura} px). Use pelo menos ${MIN_LARGURA} × ${MIN_ALTURA} px.`);
  }
  if (dim.largura > MAX_LADO || dim.altura > MAX_LADO) throw new ErroAcao(`Imagem grande demais. Use no máximo ${MAX_LADO} px de lado.`);
  return { dados, formato, ...dim };
}

/** Prova real: gera um PDF mínimo com a imagem e confere que ela foi embutida (é o mesmo motor dos PDFs). */
export async function imagemSaiNoPdf(img: ImagemLogo): Promise<boolean> {
  const React = await import("react");
  const { Document, Image, Page, renderToBuffer } = await import("@react-pdf/renderer");
  const h = React.createElement;
  try {
    const pdf = await renderToBuffer(
      h(Document, null, h(Page, { size: [200, 100] }, h(Image, { src: { data: img.dados, format: img.formato === "jpeg" ? "jpg" : "png" }, style: { width: 160, height: 60 } }))),
    );
    return /\/Subtype\s*\/Image/.test(pdf.toString("latin1"));
  } catch {
    return false;
  }
}

/** Logotipo da empresa (a matriz responde pelas filiais) pronto para o PDF, ou null. */
export async function logoParaPdf(empresa: { id: string; matrizId: string | null }) {
  const logo = await prisma.logoEmpresa.findUnique({ where: { empresaId: empresa.matrizId ?? empresa.id } });
  if (!logo) return null;
  return { dados: Buffer.from(logo.imagem), formato: logo.formato as FormatoLogo, largura: logo.largura, altura: logo.altura };
}

/** Logotipos das empresas informadas como data URL (para mostrar na tela). */
export async function logosComoDataUrl(empresaIds: string[]) {
  if (!empresaIds.length) return {};
  const logos = await prisma.logoEmpresa.findMany({ where: { empresaId: { in: empresaIds } } });
  return Object.fromEntries(
    logos.map((l) => [
      l.empresaId,
      { src: `data:image/${l.formato};base64,${Buffer.from(l.imagem).toString("base64")}`, largura: l.largura, altura: l.altura, bytes: l.imagem.length },
    ]),
  ) as Record<string, { src: string; largura: number; altura: number; bytes: number }>;
}
