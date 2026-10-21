// Utilitários puros da conciliação (seguros para client e server).
import type { ContaConciliacao } from "./tipos";

/** Minúsculas, sem acentos e com espaços normalizados — base das comparações de regras. */
export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** O termo está contido na descrição (sem diferenciar maiúsculas/acentos)? */
export function contemTermo(descricao: string, termo: string): boolean {
  const t = normalizarTexto(termo);
  return t.length > 0 && normalizarTexto(descricao).includes(t);
}

const STOP = new Set([
  "a", "o", "as", "os", "e", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "ao", "aos",
  "para", "pra", "p", "por", "pelo", "pela", "com", "sem", "um", "uma", "via", "ref",
]);

const GENERICAS = new Set([
  "pix", "ted", "doc", "tev", "transf", "transferencia", "transferencias", "trans", "pagto", "pagamento", "pagamentos",
  "pgto", "pag", "deb", "debito", "cred", "credito", "receb", "recebido", "recebida", "recebimento", "enviado",
  "enviada", "envio", "eletron", "eletronico", "eletronica", "cobranca", "boleto", "bloqueto", "titulo", "tit", "tar",
  "tarifa", "tarifas", "compra", "compras", "saque", "deposito", "dep", "aplicacao", "aplic", "resgate", "estorno",
  "sispag", "autom", "automatico", "aut", "autor", "autorizado", "conta", "cc", "int", "internet", "cartao", "mensal",
  "servico", "servicos", "pacote", "rem", "dest", "favorecido", "fav", "cpf", "cnpj", "ltda", "me", "epp", "sa",
  "cia", "banco", "agencia", "lancamento", "operacao", "pessoa", "fisica", "juridica", "fornecedor", "fornecedores",
]);

function semPontaDePontuacao(s: string): string {
  return s.replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}]+$/u, "");
}

/**
 * Sugere um termo de regra a partir da descrição do extrato: 2–3 palavras significativas e
 * consecutivas (para que o termo continue contido na descrição), evitando números, datas e códigos.
 */
export function sugerirTermo(descricao: string): string {
  const tokens = descricao.split(/\s+/).filter(Boolean);
  type Info = { ok: boolean; peso: number; stop: boolean };
  const info: Info[] = tokens.map((t) => {
    const limpo = semPontaDePontuacao(t);
    const n = normalizarTexto(limpo);
    const letras = (n.match(/\p{L}/gu) ?? []).length;
    if (!limpo || /\d/.test(limpo) || letras < 2 || letras < n.length - 1) return { ok: false, peso: 0, stop: false };
    if (STOP.has(n)) return { ok: true, peso: 0, stop: true };
    if (GENERICAS.has(n) || n.length < 3) return { ok: true, peso: 1, stop: false };
    return { ok: true, peso: 3, stop: false };
  });

  let melhor: { ini: number; fim: number; peso: number } | null = null;
  for (let ini = 0; ini < tokens.length; ini++) {
    if (!info[ini].ok || info[ini].stop) continue;
    let peso = 0;
    for (let fim = ini; fim < Math.min(tokens.length, ini + 3); fim++) {
      if (!info[fim].ok) break;
      peso += info[fim].peso;
      if (fim === ini || info[fim].stop) continue; // janelas de 2–3 palavras que não terminam em conectivo
      const tam = fim - ini + 1;
      const melhorTam = melhor ? melhor.fim - melhor.ini + 1 : 0;
      if (!melhor || peso > melhor.peso || (peso === melhor.peso && tam >= melhorTam)) melhor = { ini, fim, peso };
    }
  }
  if (melhor && melhor.peso > 1) {
    const partes = tokens.slice(melhor.ini, melhor.fim + 1);
    partes[0] = semPontaDePontuacao(partes[0]);
    partes[partes.length - 1] = semPontaDePontuacao(partes[partes.length - 1]);
    return partes.join(" ");
  }
  // Sem janela boa: a palavra mais significativa isolada; senão o começo da descrição.
  let idx = -1;
  for (let i = 0; i < tokens.length; i++) if (info[i].ok && !info[i].stop && (idx === -1 || info[i].peso > info[idx].peso)) idx = i;
  if (idx >= 0) return semPontaDePontuacao(tokens[idx]);
  return descricao.trim().slice(0, 40).trim();
}

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^0+/, "");

/**
 * O ACCTID do arquivo parece o número da conta cadastrada? Tolera dígito verificador, zeros à
 * esquerda e agência/operação no início. Retorna null quando não há como comparar.
 */
export function contaConfere(acctId: string | null | undefined, numeroCadastro: string | null | undefined): boolean | null {
  const a = digitos(acctId);
  const b = digitos(numeroCadastro);
  if (!a || !b) return null;
  if (a === b) return true;
  const aSemDv = a.slice(0, -1);
  const bSemDv = b.slice(0, -1);
  if (b.length >= 4 && a.endsWith(b)) return true;
  if (a.length >= 4 && b.endsWith(a)) return true;
  if (bSemDv.length >= 4 && (a === bSemDv || a.endsWith(bSemDv))) return true;
  if (aSemDv.length >= 4 && (b === aSemDv || b.endsWith(aSemDv))) return true;
  if (b.length >= 5 && a.includes(b)) return true;
  if (a.length >= 5 && b.includes(a)) return true;
  return false;
}

/** Código do banco do arquivo (BANKID) confere com o cadastrado? null quando não há como comparar. */
export function bancoConfere(bankId: string | null | undefined, codigoCadastro: string | null | undefined): boolean | null {
  const a = digitos(bankId);
  const b = digitos(codigoCadastro);
  if (!a || !b || a.length > 4 || b.length > 4) return null;
  return a === b;
}

export function rotuloDistancia(dias: number): string {
  if (dias === 0) return "mesma data";
  return dias === 1 ? "1 dia de diferença" : `${dias} dias de diferença`;
}

export function rotuloConta(c: Pick<ContaConciliacao, "nome" | "agencia" | "numero">): string {
  const detalhe = [c.agencia && `ag. ${c.agencia}`, c.numero && `cc ${c.numero}`].filter(Boolean).join(" · ");
  return detalhe ? `${c.nome} (${detalhe})` : c.nome;
}
