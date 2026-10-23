// Assinatura digital XMLDSig no padrão da NF-e (envelopada, RSA-SHA1, C14N inclusiva). Só servidor.
//
// Assina XML que o próprio sistema monta. Por isso o XML já sai na forma canônica: sem declaração, sem espaço entre
// tags, sem tag autofechada, atributos na ordem certa e texto escapado como na C14N (& < > e \r). A forma canônica do
// elemento assinado é ele mesmo com a declaração de namespace herdada do pai (C14N inclusiva renderiza no ápice os
// namespaces em escopo). A verificação nos testes usa uma implementação independente (xml-crypto).
import "server-only";
import { createHash, createSign } from "node:crypto";
import { escaparAtributo } from "../xml";

const DSIG = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

/** Forma canônica do elemento `<tag Id="...">…</tag>` com o namespace herdado no ápice. */
export function canonicoDoElemento(xml: string, tag: string, id: string, namespaceHerdado: string): string {
  const abertura = `<${tag} Id="${escaparAtributo(id)}">`;
  const inicio = xml.indexOf(abertura);
  const fechamento = `</${tag}>`;
  const fim = xml.indexOf(fechamento, inicio);
  if (inicio < 0 || fim < 0) throw new Error(`Elemento ${tag} com Id ${id} não encontrado para assinar`);
  const elemento = xml.slice(inicio, fim + fechamento.length);
  return `<${tag} xmlns="${escaparAtributo(namespaceHerdado)}" Id="${escaparAtributo(id)}">` + elemento.slice(abertura.length);
}

function signedInfo(id: string, digest: string, comNamespace: boolean): string {
  return (
    `<SignedInfo${comNamespace ? ` xmlns="${DSIG}"` : ""}>` +
    `<CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${DSIG}rsa-sha1"></SignatureMethod>` +
    `<Reference URI="#${escaparAtributo(id)}">` +
    `<Transforms><Transform Algorithm="${DSIG}enveloped-signature"></Transform><Transform Algorithm="${C14N}"></Transform></Transforms>` +
    `<DigestMethod Algorithm="${DSIG}sha1"></DigestMethod><DigestValue>${digest}</DigestValue>` +
    `</Reference></SignedInfo>`
  );
}

/**
 * Assina o elemento `tag` (com atributo Id) e insere a `<Signature>` logo depois dele, como irmã — o lugar que os
 * schemas da NF-e, do CT-e e dos eventos exigem.
 */
export function assinarElemento(
  xml: string,
  opcoes: { tag: string; id: string; namespaceHerdado: string; chavePem: string; certificadoBase64: string },
): string {
  const canonico = canonicoDoElemento(xml, opcoes.tag, opcoes.id, opcoes.namespaceHerdado);
  const digest = createHash("sha1").update(canonico, "utf8").digest("base64");
  const assinante = createSign("RSA-SHA1");
  assinante.update(signedInfo(opcoes.id, digest, true), "utf8");
  const valor = assinante.sign(opcoes.chavePem, "base64");
  const assinatura =
    `<Signature xmlns="${DSIG}">${signedInfo(opcoes.id, digest, false)}` +
    `<SignatureValue>${valor}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${opcoes.certificadoBase64}</X509Certificate></X509Data></KeyInfo></Signature>`;
  const fechamento = `</${opcoes.tag}>`;
  const posicao = xml.indexOf(fechamento, xml.indexOf(`<${opcoes.tag} Id="`)) + fechamento.length;
  return xml.slice(0, posicao) + assinatura + xml.slice(posicao);
}
