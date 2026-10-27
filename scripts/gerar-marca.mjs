// Logotipo, ícones e imagens do Manual do usuário.
//
// As imagens ficam versionadas em base64 (marca/*.b64 e manual-imagens/*.png.b64), porque a integração usada
// para publicar no GitHub só envia arquivos de texto. Este script recria os arquivos binários antes de
// `npm run dev`, `npm run build` e do build da Vercel (scripts/vercel-build.mjs).
//
//   node scripts/gerar-marca.mjs              *.b64 → arquivos binários (public/marca, src/app, public/manual)
//   node scripts/gerar-marca.mjs --codificar  arquivos binários → *.b64 (ao trocar o logotipo ou recapturar o manual)
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Nome em marca/ (sem .b64) → destino no projeto. */
const ARQUIVOS = {
  "pro-omie-icone.webp": "public/marca/pro-omie-icone.webp", // ícone do app (menu e telas de acesso)
  "pro-omie-nome.webp": "public/marca/pro-omie-nome.webp", // nome com "ERP Trustcorp" (fundo escuro)
  "icon.png": "src/app/icon.png", // aba do navegador
  "apple-icon.png": "src/app/apple-icon.png", // tela inicial do iPhone e iPad
  "favicon.ico": "src/app/favicon.ico", // navegadores antigos e buscadores
};

/** Assinatura de cada formato, para não publicar imagem corrompida. */
const ASSINATURAS = {
  ".png": (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ".webp": (b) => b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP",
  ".ico": (b) => b.readUInt32LE(0) === 0x00010000,
};

const formatoValido = (nome, dados) => {
  const ext = nome.slice(nome.lastIndexOf("."));
  return dados.length > 16 && (ASSINATURAS[ext]?.(dados) ?? true);
};

/** Imagens do manual: manual-imagens/<id>.png.b64 ↔ public/manual/<id>.png (capturadas por qa-e2e/capturas-manual.mjs). */
const PASTA_B64 = join(raiz, "manual-imagens");
const PASTA_PNG = join(raiz, "public", "manual");
const base64EmLinhas = (dados) => `${dados.toString("base64").match(/.{1,76}/g).join("\n")}\n`;

if (process.argv.includes("--codificar")) {
  if (existsSync(PASTA_PNG)) {
    mkdirSync(PASTA_B64, { recursive: true });
    const pngs = readdirSync(PASTA_PNG).filter((f) => f.endsWith(".png"));
    for (const f of pngs) {
      const dados = readFileSync(join(PASTA_PNG, f));
      if (!formatoValido(f, dados)) throw new Error(`public/manual/${f} não é um png válido`);
      writeFileSync(join(PASTA_B64, `${f}.b64`), base64EmLinhas(dados));
    }
    for (const f of readdirSync(PASTA_B64)) if (f.endsWith(".png.b64") && !pngs.includes(f.slice(0, -4))) rmSync(join(PASTA_B64, f)); // imagem que saiu do manual
    console.log(`✓ manual: ${pngs.length} imagens codificadas em manual-imagens/*.png.b64`);
  }
  for (const [nome, destino] of Object.entries(ARQUIVOS)) {
    const dados = readFileSync(join(raiz, destino));
    if (!formatoValido(nome, dados)) throw new Error(`${destino} não é um ${nome.split(".").pop()} válido`);
    const linhas = dados.toString("base64").match(/.{1,76}/g).join("\n");
    writeFileSync(join(raiz, "marca", `${nome}.b64`), `${linhas}\n`);
  }
  console.log(`✓ marca: ${Object.keys(ARQUIVOS).length} arquivos codificados em marca/*.b64`);
} else {
  let gravados = 0;
  for (const [nome, destino] of Object.entries(ARQUIVOS)) {
    const texto = readFileSync(join(raiz, "marca", `${nome}.b64`), "utf8");
    const dados = Buffer.from(texto.replace(/\s+/g, ""), "base64");
    if (!formatoValido(nome, dados)) throw new Error(`marca/${nome}.b64 não decodifica para um ${nome.split(".").pop()} válido`);
    const alvo = join(raiz, destino);
    if (existsSync(alvo) && readFileSync(alvo).equals(dados)) continue; // sem mudança: não mexe no arquivo
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, dados);
    gravados++;
  }
  console.log(`✓ marca: ${Object.keys(ARQUIVOS).length} arquivos conferidos, ${gravados} gravados`);
  if (existsSync(PASTA_B64)) {
    const nomes = readdirSync(PASTA_B64).filter((f) => f.endsWith(".png.b64")).map((f) => f.slice(0, -4));
    let novos = 0;
    mkdirSync(PASTA_PNG, { recursive: true });
    for (const nome of nomes) {
      const dados = Buffer.from(readFileSync(join(PASTA_B64, `${nome}.b64`), "utf8").replace(/\s+/g, ""), "base64");
      if (!formatoValido(nome, dados)) throw new Error(`manual-imagens/${nome}.b64 não decodifica para um png válido`);
      const alvo = join(PASTA_PNG, nome);
      if (existsSync(alvo) && readFileSync(alvo).equals(dados)) continue;
      writeFileSync(alvo, dados);
      novos++;
    }
    for (const f of readdirSync(PASTA_PNG)) if (f.endsWith(".png") && !nomes.includes(f)) rmSync(join(PASTA_PNG, f)); // sem .b64: saiu do manual
    console.log(`✓ manual: ${nomes.length} imagens conferidas, ${novos} gravadas`);
  }
}
