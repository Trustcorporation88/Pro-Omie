// Logotipo e ícones do Pro Omie.
//
// As imagens ficam versionadas em marca/*.b64 (base64), porque a integração usada para
// publicar no GitHub só envia arquivos de texto. Este script recria os arquivos binários
// antes de `npm run dev`, `npm run build` e do build da Vercel (scripts/vercel-build.mjs).
//
//   node scripts/gerar-marca.mjs              marca/*.b64  → arquivos binários
//   node scripts/gerar-marca.mjs --codificar  arquivos binários → marca/*.b64 (ao trocar o logotipo)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

if (process.argv.includes("--codificar")) {
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
}
