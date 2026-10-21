// Montagem do fluxo de caixa (realizado + previsto) a partir de valores já agregados por dia.
// Função pura (sem banco): as somas são feitas em centavos para não acumular erro de ponto flutuante.
import { chavePeriodo, gerarPeriodos, type Agrupamento, type Periodo } from "./periodos";

export type ValorDia = { data: string; valor: number };

export type Atrasados = { receber: number; qtdReceber: number; pagar: number; qtdPagar: number };

export type EntradaFluxo = {
  de: string;
  ate: string;
  hoje: string;
  agrupamento: Agrupamento;
  /** Títulos vencidos (ainda em aberto) entram na projeção como previstos de hoje. */
  incluirVencidos: boolean;
  /** Soma dos saldos das contas no dia anterior a "de". */
  saldoInicial: number;
  /** Saldos iniciais de contas cuja data de saldo inicial cai dentro do período. */
  aberturas: ValorDia[];
  /** Movimentos (CREDITO / DEBITO) por dia. */
  entradasRealizadas: ValorDia[];
  saidasRealizadas: ValorDia[];
  /** Saldo em aberto dos títulos (RECEBER / PAGAR) por vencimento, somente vencimento >= hoje. */
  entradasPrevistas: ValorDia[];
  saidasPrevistas: ValorDia[];
  /** Títulos em aberto com vencimento < hoje. */
  atrasados: Atrasados;
};

export type LinhaFluxo = Periodo & {
  entradasRealizadas: number;
  saidasRealizadas: number;
  entradasPrevistas: number;
  saidasPrevistas: number;
  /** Saldo de abertura de contas cadastradas dentro do período (não é entrada nem saída). */
  aberturas: number;
  resultado: number;
  /** Saldo acumulado ao fim do período. */
  saldo: number;
  contemHoje: boolean;
  passado: boolean;
};

export type TotaisFluxo = {
  entradasRealizadas: number;
  saidasRealizadas: number;
  entradasPrevistas: number;
  saidasPrevistas: number;
  aberturas: number;
  resultado: number;
};

export type ResultadoFluxo = {
  linhas: LinhaFluxo[];
  /** Saldo considerado no início do período (projetado quando "de" é futuro). */
  saldoInicial: number;
  saldoInicialProjetado: boolean;
  totais: TotaisFluxo;
  saldoFinal: number;
  /** Onde os atrasados entraram na projeção (null = não entraram). */
  atrasadosProjetados: null | { onde: "hoje" | "saldoInicial"; receber: number; pagar: number };
  /** Menor saldo acumulado de hoje em diante. */
  menorSaldo: null | { valor: number; rotulo: string; chave: string };
};

const cent = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;

export function calcularFluxo(e: EntradaFluxo): ResultadoFluxo {
  const periodos = gerarPeriodos(e.de, e.ate, e.agrupamento);
  const indice = new Map(periodos.map((p, i) => [p.chave, i] as const));
  const acc = periodos.map(() => ({ er: 0, sr: 0, ep: 0, sp: 0, ab: 0 }));
  type Campo = keyof (typeof acc)[number];
  const dentro = (d: string) => d >= e.de && d <= e.ate;
  const posicao = (d: string) => indice.get(chavePeriodo(d, e.agrupamento));

  // Previsões entre hoje e "de" (só acontece quando o período começa no futuro) vão para o saldo inicial projetado.
  let ajusteInicial = 0;
  const somar = (lista: ValorDia[], campo: Campo, sinalAntes = 0) => {
    for (const { data, valor } of lista) {
      if (dentro(data)) {
        const i = posicao(data);
        if (i !== undefined) acc[i][campo] += cent(valor);
      } else if (sinalAntes && data < e.de && data >= e.hoje) {
        ajusteInicial += sinalAntes * cent(valor);
      }
    }
  };
  somar(e.entradasRealizadas, "er");
  somar(e.saidasRealizadas, "sr");
  somar(e.aberturas, "ab");
  somar(e.entradasPrevistas, "ep", 1);
  somar(e.saidasPrevistas, "sp", -1);

  let atrasadosProjetados: ResultadoFluxo["atrasadosProjetados"] = null;
  const { receber, pagar } = e.atrasados;
  if (e.incluirVencidos && (receber || pagar)) {
    if (dentro(e.hoje)) {
      const i = posicao(e.hoje);
      if (i !== undefined) {
        acc[i].ep += cent(receber);
        acc[i].sp += cent(pagar);
        atrasadosProjetados = { onde: "hoje", receber, pagar };
      }
    } else if (e.hoje < e.de) {
      ajusteInicial += cent(receber) - cent(pagar);
      atrasadosProjetados = { onde: "saldoInicial", receber, pagar };
    }
    // Período inteiro no passado: atrasados não entram (aparecem só nos cartões).
  }

  const inicial = cent(e.saldoInicial) + ajusteInicial;
  let saldo = inicial;
  const tot = { er: 0, sr: 0, ep: 0, sp: 0, ab: 0 };
  let menor: ResultadoFluxo["menorSaldo"] = null;
  const linhas: LinhaFluxo[] = periodos.map((p, i) => {
    const a = acc[i];
    const resultado = a.er - a.sr + a.ep - a.sp;
    saldo += resultado + a.ab;
    tot.er += a.er;
    tot.sr += a.sr;
    tot.ep += a.ep;
    tot.sp += a.sp;
    tot.ab += a.ab;
    const passado = p.fim < e.hoje;
    if (!passado && (!menor || reais(saldo) < menor.valor)) menor = { valor: reais(saldo), rotulo: p.rotulo, chave: p.chave };
    return {
      ...p,
      entradasRealizadas: reais(a.er),
      saidasRealizadas: reais(a.sr),
      entradasPrevistas: reais(a.ep),
      saidasPrevistas: reais(a.sp),
      aberturas: reais(a.ab),
      resultado: reais(resultado),
      saldo: reais(saldo),
      contemHoje: p.inicio <= e.hoje && e.hoje <= p.fim,
      passado,
    };
  });

  return {
    linhas,
    saldoInicial: reais(inicial),
    saldoInicialProjetado: e.de > e.hoje,
    totais: {
      entradasRealizadas: reais(tot.er),
      saidasRealizadas: reais(tot.sr),
      entradasPrevistas: reais(tot.ep),
      saidasPrevistas: reais(tot.sp),
      aberturas: reais(tot.ab),
      resultado: reais(tot.er - tot.sr + tot.ep - tot.sp),
    },
    saldoFinal: reais(saldo),
    atrasadosProjetados,
    menorSaldo: menor,
  };
}
