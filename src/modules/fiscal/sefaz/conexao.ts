// Conexão mTLS com a SEFAZ e o Ambiente Nacional da NFS-e usando o certificado A1 da empresa. Só servidor.
//
// Base: HUBCLONE (src/lib/sefaz/pfx-tls.ts). O .pfx é lido com node-forge (o OpenSSL 3 do Node recusa o RC2-40 de
// muitos A1) e vira chave + cadeia em PEM. O servidor é validado com as raízes do Node + ICP-Brasil; a verificação
// NUNCA é desligada (rejectUnauthorized: false deixaria qualquer um na rede se passar pela SEFAZ).
import "server-only";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import forge from "node-forge";
import { AC_ICP_BRASIL } from "./ac-icp-brasil";

export type MaterialTls = {
  chavePem: string;
  /** certificado do titular + intermediárias do .pfx (PEM), na ordem certa para o mTLS */
  cadeiaPem: string;
  /** certificado do titular em DER/base64 (vai no KeyInfo da assinatura XML) */
  certificadoBase64: string;
};

export function materialDoPfx(pfx: Buffer, senha: string): MaterialTls {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary"))), false, senha);
  } catch {
    throw new Error("Não foi possível abrir o certificado A1 guardado (senha ou arquivo). Envie o certificado de novo.");
  }
  const sacos = (tipo: string) => p12.getBags({ bagType: tipo })[tipo] ?? [];
  const certs = sacos(forge.pki.oids.certBag)
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);
  const chave = [...sacos(forge.pki.oids.pkcs8ShroudedKeyBag), ...sacos(forge.pki.oids.keyBag)]
    .map((b) => b.key as forge.pki.rsa.PrivateKey | undefined)
    .find((k): k is forge.pki.rsa.PrivateKey => !!k);
  if (!chave || !certs.length) throw new Error("O certificado A1 guardado não tem chave privada ou certificado utilizável.");
  const titular =
    certs.find((c) => {
      const pub = c.publicKey as forge.pki.rsa.PublicKey | undefined;
      return !!pub?.n && pub.n.compareTo(chave.n) === 0 && pub.e.compareTo(chave.e) === 0;
    }) ?? certs[0];
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(titular)).getBytes();
  return {
    chavePem: forge.pki.privateKeyToPem(chave),
    cadeiaPem: [titular, ...certs.filter((c) => c !== titular)].map((c) => forge.pki.certificateToPem(c)).join("\n"),
    certificadoBase64: Buffer.from(der, "binary").toString("base64"),
  };
}

let autoridadesCache: string[] | null = null;
function autoridades(): string[] {
  autoridadesCache ??= AC_ICP_BRASIL.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  return autoridadesCache;
}

/** Agente HTTPS com o A1 do cliente. Destrua com `agente.destroy()` no fim da execução. */
export function criarAgente(m: MaterialTls): https.Agent {
  const secureContext = tls.createSecureContext({ key: m.chavePem, cert: m.cadeiaPem, ca: [...tls.rootCertificates, ...autoridades()] });
  return new https.Agent({ secureContext, rejectUnauthorized: true, keepAlive: true, maxSockets: 2 });
}

export type Resposta = { status: number; texto: string };

const TETO_RESPOSTA = 20 * 1024 * 1024;

/**
 * Simulador local para testes ponta a ponta: com FISCAL_SIMULADOR_URL (só fora da Vercel), as chamadas vão para
 * `${simulador}/${host}${caminho}` em HTTP simples. Em produção a variável é ignorada.
 */
function destinoSimulado(url: string): URL | null {
  const sim = process.env.FISCAL_SIMULADOR_URL?.trim();
  if (!sim || process.env.VERCEL) return null;
  const u = new URL(url);
  return new URL(`${sim.replace(/\/$/, "")}/${u.host}${u.pathname}${u.search}`);
}

export async function requisitar(
  agente: https.Agent | undefined,
  url: string,
  opcoes: { metodo: "GET" | "POST"; corpo?: string; cabecalhos?: Record<string, string>; timeoutMs?: number },
): Promise<Resposta> {
  const simulado = destinoSimulado(url);
  const alvo = simulado ?? new URL(url);
  const corpo = opcoes.corpo !== undefined ? Buffer.from(opcoes.corpo, "utf8") : undefined;
  const modulo = simulado ? http : https;
  return new Promise((resolve, reject) => {
    const req = modulo.request(
      {
        protocol: alvo.protocol,
        hostname: alvo.hostname,
        port: alvo.port || (simulado ? 80 : 443),
        path: alvo.pathname + alvo.search,
        method: opcoes.metodo,
        agent: simulado ? undefined : agente,
        headers: { ...(opcoes.cabecalhos ?? {}), ...(corpo ? { "Content-Length": corpo.length } : {}) },
        timeout: opcoes.timeoutMs ?? 60_000,
      },
      (res) => {
        const partes: Buffer[] = [];
        let tamanho = 0;
        res.on("data", (c: Buffer) => {
          tamanho += c.length;
          if (tamanho > TETO_RESPOSTA) {
            req.destroy(new Error("Resposta grande demais do servidor fiscal"));
            return;
          }
          partes.push(c);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, texto: Buffer.concat(partes).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado na chamada ao servidor fiscal")));
    if (corpo) req.write(corpo);
    req.end();
  });
}

/** Mensagem em português para falhas de rede e TLS (sem expor detalhes do certificado). */
export function mensagemDeErro(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/unable to get local issuer certificate|self.signed|unable to verify/i.test(msg))
    return "Falha ao validar o certificado do servidor da SEFAZ. A rede pode estar interceptando a conexão. Tente de novo mais tarde.";
  if (/certificate has expired|cert.*expir/i.test(msg)) return "Certificado A1 vencido. Envie o certificado renovado em Configurações › Empresas e filiais.";
  if (/bad certificate|certificate unknown|handshake failure|alert number 42|sslv3 alert/i.test(msg))
    return "A SEFAZ recusou o certificado A1. Confira se é o e-CNPJ da empresa e se está válido.";
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket hang up|Tempo esgotado/i.test(msg))
    return "SEFAZ indisponível ou rede instável. A próxima busca tenta de novo.";
  return msg.slice(0, 300);
}

/** Código IBGE da UF (cUFAutor do DistDFe só aceita UF real). */
export const CODIGO_UF: Record<string, string> = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29",
  MG: "31", ES: "32", RJ: "33", SP: "35",
  PR: "41", SC: "42", RS: "43",
  MS: "50", MT: "51", GO: "52", DF: "53",
};
