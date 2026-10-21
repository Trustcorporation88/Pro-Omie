// Períodos (dia, semana, mês) usados nos relatórios. Funções puras: seguras para client e server.
import { addDias, addMeses, dateParaISO, inicioMes, inicioSemana, isoParaDate } from "@/lib/datas";
import { fmtData, fmtMesAno } from "@/lib/format";

export type Agrupamento = "dia" | "semana" | "mes";
export const AGRUPAMENTOS: readonly Agrupamento[] = ["dia", "semana", "mes"];

export type Periodo = {
  /** Início natural do período (o dia, a segunda-feira ou o dia 1). Chave única. */
  chave: string;
  /** Primeiro e último dia do período dentro do intervalo pedido. */
  inicio: string;
  fim: string;
  rotulo: string;
  rotuloCurto: string;
  /** O período foi cortado pelo intervalo pedido (semana/mês incompleto). */
  parcial: boolean;
};

export function chavePeriodo(iso: string, ag: Agrupamento): string {
  if (ag === "dia") return iso.slice(0, 10);
  return ag === "semana" ? inicioSemana(iso) : inicioMes(iso);
}

function proximaChave(chave: string, ag: Agrupamento): string {
  if (ag === "dia") return addDias(chave, 1);
  return ag === "semana" ? addDias(chave, 7) : addMeses(chave, 1);
}

const ddmm = (iso: string) => fmtData(iso).slice(0, 5);

/** Lista os períodos que cobrem [de, ate] (inclusive), na ordem. */
export function gerarPeriodos(de: string, ate: string, ag: Agrupamento): Periodo[] {
  const out: Periodo[] = [];
  if (de > ate) return out;
  for (let chave = chavePeriodo(de, ag); chave <= ate; chave = proximaChave(chave, ag)) {
    const fimNatural = addDias(proximaChave(chave, ag), -1);
    const inicio = chave < de ? de : chave;
    const fim = fimNatural > ate ? ate : fimNatural;
    let rotulo: string;
    let rotuloCurto: string;
    if (ag === "dia") {
      rotulo = fmtData(chave);
      rotuloCurto = ddmm(chave);
    } else if (ag === "semana") {
      rotulo = inicio === fim ? fmtData(inicio) : `${ddmm(inicio)} a ${fmtData(fim)}`;
      rotuloCurto = ddmm(inicio);
    } else {
      rotulo = fmtMesAno(chave);
      rotuloCurto = fmtMesAno(chave);
    }
    out.push({ chave, inicio, fim, rotulo, rotuloCurto, parcial: inicio !== chave || fim !== fimNatural });
  }
  return out;
}

/** 'YYYY-MM-DD' válido (inclusive dia do mês) e dentro de uma faixa razoável de anos. */
export function dataValida(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = isoParaDate(s);
  if (Number.isNaN(d.getTime()) || dateParaISO(d) !== s) return false;
  const ano = Number(s.slice(0, 4));
  return ano >= 2000 && ano <= 2100;
}

/** Primeiro valor de um parâmetro de URL (Next entrega string ou string[]). */
export function param(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
