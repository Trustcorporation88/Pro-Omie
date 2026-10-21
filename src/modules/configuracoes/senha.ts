// Geração de senha provisória. Uso exclusivo de servidor (node:crypto).
import { randomInt } from "node:crypto";

// Alfabetos sem caracteres ambíguos: nada de 0/O/o, 1/l/I.
const MAIUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem I e O
const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz"; // sem l e o
const DIGITOS = "23456789"; // sem 0 e 1
const TODOS = MAIUSCULAS + MINUSCULAS + DIGITOS;

export const TAMANHO_SENHA_PROVISORIA = 12;

/**
 * Senha aleatória de 12 caracteres (letras e números, sem ambíguos), gerada com `crypto.randomInt`
 * (sorteio uniforme). Garante ao menos uma maiúscula, uma minúscula e um número.
 * NUNCA registre o resultado em log nem na auditoria.
 */
export function gerarSenhaProvisoria(tamanho = TAMANHO_SENHA_PROVISORIA): string {
  const sortear = (alfabeto: string) => alfabeto.charAt(randomInt(alfabeto.length));
  const caracteres = [sortear(MAIUSCULAS), sortear(MINUSCULAS), sortear(DIGITOS)];
  while (caracteres.length < tamanho) caracteres.push(sortear(TODOS));
  // Embaralha (Fisher–Yates com fonte criptográfica) para não deixar as 3 primeiras posições previsíveis.
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join("");
}
