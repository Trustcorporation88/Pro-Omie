// Certificado digital A1 (.pfx / .p12): leitura, validação e guarda cifrada. Só servidor.
//
// O arquivo e a senha são cifrados com AES-256-GCM antes de chegar ao banco. A chave (CERTIFICADOS_CHAVE,
// 32 bytes em base64) existe só nas variáveis de ambiente do servidor; o id da empresa entra como dado
// autenticado, então um certificado cifrado não abre se for copiado para outra empresa.
// A leitura usa node-forge porque o OpenSSL 3 do Node recusa o formato RC2-40 de muitos A1 exportados
// pelo Windows ("Unsupported PKCS12 PFX data").
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import forge from "node-forge";
import { prisma } from "@/lib/db";
import { ErroAcao } from "@/lib/auth/sessao";
import { fmtDocumento } from "@/lib/format";
import { diaSP, type CertificadoResumo } from "./certificado-tipos";

export const LIMITE_CERTIFICADO_BYTES = 100 * 1024;
/** ICP-Brasil: otherName com o CNPJ da pessoa jurídica titular. */
const OID_CNPJ = "2.16.76.1.3.3";

// ───────────────────────── cifragem ─────────────────────────

const VERSAO = 1;

function chave(): Buffer {
  const b64 = process.env.CERTIFICADOS_CHAVE?.trim();
  if (!b64) throw new ErroAcao("O servidor ainda não tem a chave para guardar certificados com segurança. Avise o responsável pelo sistema.");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new ErroAcao("A chave de certificados do servidor está em formato inválido. Avise o responsável pelo sistema.");
  return k;
}

/** [versão 1 byte][iv 12][tag 16][dados cifrados]. `contexto` é autenticado junto (não pode ser trocado). */
export function cifrar(dados: Buffer, contexto: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  c.setAAD(Buffer.from(contexto, "utf8"));
  const corpo = Buffer.concat([c.update(dados), c.final()]);
  return Buffer.concat([Buffer.from([VERSAO]), iv, c.getAuthTag(), corpo]);
}

export function decifrar(pacote: Buffer, contexto: string): Buffer {
  const k = chave();
  if (pacote.length < 29 || pacote[0] !== VERSAO) throw new Error("pacote cifrado em formato desconhecido");
  const d = createDecipheriv("aes-256-gcm", k, pacote.subarray(1, 13));
  d.setAAD(Buffer.from(contexto, "utf8"));
  d.setAuthTag(pacote.subarray(13, 29));
  return Buffer.concat([d.update(pacote.subarray(29)), d.final()]);
}

const contextoArquivo = (empresaId: string) => `pro-omie:certificado:${empresaId}:arquivo`;
const contextoSenha = (empresaId: string) => `pro-omie:certificado:${empresaId}:senha`;

// ───────────────────────── leitura ─────────────────────────

export type DadosCertificado = {
  titular: string;
  cnpj: string | null;
  emissor: string | null;
  numeroSerie: string;
  impressaoDigital: string;
  validoDe: Date;
  validoAte: Date;
};

const textoDe = (n: forge.asn1.Asn1 | undefined): string =>
  !n ? "" : typeof n.value === "string" ? n.value : Array.isArray(n.value) ? n.value.map((x) => textoDe(x)).join("") : "";

/** CNPJ do certificado: otherName 2.16.76.1.3.3 ou, na falta, o final do CN ("RAZÃO SOCIAL:12345678000199"). */
function cnpjDoCertificado(cert: forge.pki.Certificate): string | null {
  const san = cert.getExtension("subjectAltName") as { altNames?: { type: number; value: unknown }[] } | undefined;
  for (const a of san?.altNames ?? []) {
    if (a.type !== 0 || !Array.isArray(a.value)) continue;
    const [oid, valor] = a.value as forge.asn1.Asn1[];
    if (oid?.type !== forge.asn1.Type.OID || typeof oid.value !== "string") continue;
    if (forge.asn1.derToOid(oid.value) !== OID_CNPJ) continue;
    const digitos = textoDe(valor).replace(/\D/g, "");
    if (digitos.length >= 14) return digitos.slice(0, 14);
  }
  const cn = String(cert.subject.getField("CN")?.value ?? "");
  return /:(\d{14})\s*$/.exec(cn)?.[1] ?? null;
}

const ehAc = (c: forge.pki.Certificate) => (c.getExtension("basicConstraints") as { cA?: boolean } | undefined)?.cA === true;

/** Abre o .pfx com a senha e devolve os dados do certificado do titular (o que tem a chave privada). */
export function lerCertificado(pfx: Buffer, senha: string): DadosCertificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary")));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/MAC could not be verified|Invalid password/i.test(msg)) throw new ErroAcao("Senha do certificado incorreta.", { senha: "Senha incorreta." });
    throw new ErroAcao("Arquivo inválido: envie o certificado A1 em .pfx ou .p12, exportado com a chave privada.", { arquivo: "Arquivo inválido." });
  }
  const sacos = (tipo: string) => p12.getBags({ bagType: tipo })[tipo] ?? [];
  const certs = sacos(forge.pki.oids.certBag)
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);
  const chaves = [...sacos(forge.pki.oids.pkcs8ShroudedKeyBag), ...sacos(forge.pki.oids.keyBag)]
    .map((b) => b.key as forge.pki.rsa.PrivateKey | undefined)
    .filter((k): k is forge.pki.rsa.PrivateKey => !!k);
  if (!chaves.length) {
    throw new ErroAcao("O arquivo não tem a chave privada. Exporte o certificado de novo marcando a opção de incluir a chave privada.", { arquivo: "Sem chave privada." });
  }
  const chaveN = chaves[0].n;
  const cert =
    certs.find((c) => {
      const n = (c.publicKey as forge.pki.rsa.PublicKey | undefined)?.n;
      return !!n && !!chaveN && n.compareTo(chaveN) === 0;
    }) ?? certs.find((c) => !ehAc(c));
  if (!cert) throw new ErroAcao("O arquivo não tem o certificado do titular.", { arquivo: "Sem certificado." });
  const der = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), "binary");
  const cn = String(cert.subject.getField("CN")?.value ?? "");
  return {
    titular: cn.replace(/:\d{11,14}\s*$/, "").trim() || cn || "Sem nome",
    cnpj: cnpjDoCertificado(cert),
    emissor: (cert.issuer.getField("CN")?.value as string | undefined) ?? null,
    numeroSerie: cert.serialNumber.toUpperCase(),
    impressaoDigital: createHash("sha256").update(der).digest("hex").toUpperCase(),
    validoDe: cert.validity.notBefore,
    validoAte: cert.validity.notAfter,
  };
}

/**
 * Regras da SEFAZ/prefeituras: e-CNPJ dentro da validade e da mesma empresa (raiz do CNPJ, 8 primeiros dígitos).
 * O certificado da matriz serve para as filiais (mesma raiz); devolve se é de outro estabelecimento.
 */
export function conferirComEmpresa(d: DadosCertificado, empresa: { cnpj: string }, agora = new Date()) {
  if (d.validoAte.getTime() <= agora.getTime()) {
    throw new ErroAcao(`Certificado vencido em ${diaSP(d.validoAte)}. Envie o certificado renovado.`, { arquivo: "Certificado vencido." });
  }
  if (d.validoDe.getTime() > agora.getTime()) {
    throw new ErroAcao(`Este certificado só passa a valer em ${diaSP(d.validoDe)}.`, { arquivo: "Ainda não vale." });
  }
  if (!d.cnpj) {
    throw new ErroAcao("Este certificado não tem CNPJ (parece um e-CPF). Para emitir notas, use o certificado e-CNPJ da empresa.", { arquivo: "Sem CNPJ." });
  }
  if (d.cnpj.slice(0, 8) !== empresa.cnpj.slice(0, 8)) {
    throw new ErroAcao(`Este certificado é do CNPJ ${fmtDocumento(d.cnpj)}, de outra empresa. O estabelecimento é ${fmtDocumento(empresa.cnpj)}.`, { arquivo: "Outra empresa." });
  }
  return { outroEstabelecimento: d.cnpj !== empresa.cnpj };
}

/** Cifra arquivo e senha para gravar. */
export function cifrarCertificado(empresaId: string, pfx: Buffer, senha: string) {
  return {
    arquivoCifrado: new Uint8Array(cifrar(pfx, contextoArquivo(empresaId))),
    senhaCifrada: new Uint8Array(cifrar(Buffer.from(senha, "utf8"), contextoSenha(empresaId))),
  };
}

/** Abre o certificado guardado (para testar ou, na Fase 4, assinar e enviar notas). Nunca devolva isto ao navegador. */
export async function abrirCertificadoGuardado(empresaId: string) {
  const c = await prisma.certificadoDigital.findUnique({ where: { empresaId } });
  if (!c) return null;
  try {
    const pfx = decifrar(Buffer.from(c.arquivoCifrado), contextoArquivo(empresaId));
    const senha = decifrar(Buffer.from(c.senhaCifrada), contextoSenha(empresaId)).toString("utf8");
    return { pfx, senha, registro: c };
  } catch (e) {
    if (e instanceof ErroAcao) throw e;
    throw new ErroAcao("Não foi possível abrir o certificado guardado (a chave do servidor mudou ou o registro foi alterado). Envie o certificado de novo.");
  }
}

/**
 * Certificado que vale para o estabelecimento: o dele ou, se não tiver, o da matriz (mesma raiz de CNPJ).
 * Para a Fase 4 (emissão de NF-e/NFS-e).
 */
export async function certificadoParaEmissao(empresaId: string) {
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true, matrizId: true } });
  if (!empresa) return null;
  return (await abrirCertificadoGuardado(empresa.id)) ?? (empresa.matrizId ? await abrirCertificadoGuardado(empresa.matrizId) : null);
}

/** Resumo (sem arquivo e sem senha) dos certificados dos estabelecimentos informados. */
export async function resumosCertificados(empresaIds: string[]): Promise<Record<string, CertificadoResumo>> {
  if (!empresaIds.length) return {};
  const lista = await prisma.certificadoDigital.findMany({
    where: { empresaId: { in: empresaIds } },
    select: { empresaId: true, titular: true, cnpj: true, emissor: true, numeroSerie: true, impressaoDigital: true, validoDe: true, validoAte: true, updatedAt: true, enviadoPorId: true },
  });
  const ids = [...new Set(lista.map((c) => c.enviadoPorId).filter((x): x is string => !!x))];
  const usuarios = ids.length ? await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } }) : [];
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  return Object.fromEntries(
    lista.map((c) => [
      c.empresaId,
      {
        empresaId: c.empresaId,
        titular: c.titular,
        cnpj: c.cnpj,
        emissor: c.emissor,
        numeroSerie: c.numeroSerie,
        impressaoDigital: c.impressaoDigital,
        validoDe: c.validoDe.toISOString(),
        validoAte: c.validoAte.toISOString(),
        enviadoEm: c.updatedAt.toISOString(),
        enviadoPor: c.enviadoPorId ? (nomes.get(c.enviadoPorId) ?? null) : null,
      },
    ]),
  );
}

/** Certificados vencidos ou que vencem em até `dias` dias, nos estabelecimentos informados (aviso no painel). */
export async function certificadosVencendo(empresaIds: string[], dias = 30) {
  if (!empresaIds.length) return [];
  const limite = new Date(Date.now() + dias * 86_400_000);
  const lista = await prisma.certificadoDigital.findMany({
    where: { empresaId: { in: empresaIds }, validoAte: { lte: limite } },
    select: { validoAte: true, empresa: { select: { razaoSocial: true, nomeFantasia: true } } },
    orderBy: { validoAte: "asc" },
  });
  return lista.map((c) => ({ empresa: c.empresa.nomeFantasia || c.empresa.razaoSocial, validoAte: c.validoAte.toISOString() }));
}
