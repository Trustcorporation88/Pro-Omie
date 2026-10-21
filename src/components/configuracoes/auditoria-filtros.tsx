"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Opcao = { valor: string; rotulo: string };

const CHAVES = ["q", "entidade", "usuario", "de", "ate"] as const;
type Estado = Record<(typeof CHAVES)[number], string>;

const VAZIO: Estado = { q: "", entidade: "", usuario: "", de: "", ate: "" };

const CLASSE_SELECT =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>option]:bg-popover [&>option]:text-popover-foreground sm:w-56";

/** Lê os filtros dos parâmetros da URL. */
function doUrl(params: { get(nome: string): string | null }): Estado {
  return {
    q: params.get("q") ?? "",
    entidade: params.get("entidade") ?? "",
    usuario: params.get("usuario") ?? "",
    de: params.get("de") ?? "",
    ate: params.get("ate") ?? "",
  };
}

/** Query string canônica dos filtros (ordem fixa, sem valores vazios, sem `pagina`). */
function paraQs(e: Estado): string {
  const p = new URLSearchParams();
  for (const k of CHAVES) if (e[k]) p.set(k, e[k]);
  return p.toString();
}

/** Garante que o valor vindo da URL apareça no select mesmo que não esteja na lista (link antigo, por exemplo). */
function comAtual(opcoes: Opcao[], atual: string): Opcao[] {
  return atual && !opcoes.some((o) => o.valor === atual) ? [...opcoes, { valor: atual, rotulo: atual }] : opcoes;
}

/**
 * Filtros da auditoria gravados na URL (q, entidade, usuario, de, ate).
 *
 * - Os campos têm estado próprio e a URL é sempre montada a partir dele; assim, mudanças rápidas em vários filtros
 *   (ou texto digitado enquanto a página recarrega) nunca desfazem umas às outras.
 * - Mudanças externas da URL (botão voltar/avançar, links) são refletidas nos campos; navegações iniciadas aqui,
 *   ao chegarem, são reconhecidas e ignoradas.
 * - Qualquer mudança de filtro volta a listagem para a primeira página.
 */
export function FiltrosAuditoria({ entidades, usuarios }: { entidades: Opcao[]; usuarios: Opcao[] }) {
  const uid = useId();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [f, setF] = useState<Estado>(() => doUrl(params));
  const estadoAtual = useRef(f);
  /** filtros da última URL observada */
  const urlConhecida = useRef(paraQs(f));
  /** navegações iniciadas aqui que a URL ainda não confirmou */
  const pendentes = useRef<string[]>([]);
  const filtrando = Object.values(f).some(Boolean);

  useEffect(() => {
    estadoAtual.current = f;
  });

  // URL → campos: só reage a mudanças que não partiram deste componente.
  useEffect(() => {
    const naUrl = doUrl(params);
    const qs = paraQs(naUrl);
    const confirmada = pendentes.current.indexOf(qs);
    if (confirmada >= 0) {
      pendentes.current.splice(0, confirmada + 1);
      urlConhecida.current = qs;
      return;
    }
    if (qs === urlConhecida.current) return; // mudou só a página (ou nada relacionado aos filtros)
    const antes = doUrl(new URLSearchParams(urlConhecida.current));
    pendentes.current = [];
    urlConhecida.current = qs;
    // atualiza apenas os campos que mudaram na URL (não atropela o que está sendo digitado nos demais)
    setF((s) => {
      const novo = { ...s };
      for (const k of CHAVES) if (antes[k] !== naUrl[k]) novo[k] = naUrl[k];
      return novo;
    });
  }, [params]);

  function empurrar(novo: Estado) {
    const qs = paraQs(novo);
    if (qs === (pendentes.current.at(-1) ?? urlConhecida.current)) return; // nada novo para enviar
    pendentes.current.push(qs);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  /** Selects e datas aplicam na hora (levando junto o que já foi digitado na busca). */
  function mudar(parcial: Partial<Estado>) {
    const novo = { ...f, ...parcial };
    setF(novo);
    empurrar(novo);
  }

  // A busca por texto espera 350 ms sem digitação, como o campo de busca padrão do sistema.
  useEffect(() => {
    const t = setTimeout(() => empurrar(estadoAtual.current), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.q]);

  function limpar() {
    setF(VAZIO);
    empurrar(VAZIO);
  }

  return (
    <div role="search" aria-label="Filtros da auditoria" className="mb-4 flex flex-wrap items-end gap-3">
      <div className="relative w-full sm:w-72">
        <Label htmlFor={`${uid}-q`} className="sr-only">
          Buscar por resumo, entidade ou ID
        </Label>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={`${uid}-q`}
          type="search"
          value={f.q}
          onChange={(e) => setF((s) => ({ ...s, q: e.target.value }))}
          placeholder="Buscar em resumo, entidade ou ID…"
          autoComplete="off"
          className="bg-card pl-8"
        />
      </div>

      <div className="grid w-full gap-1 sm:w-auto">
        <Label htmlFor={`${uid}-entidade`} className="text-xs font-normal text-muted-foreground">
          Entidade
        </Label>
        <select id={`${uid}-entidade`} value={f.entidade} onChange={(e) => mudar({ entidade: e.target.value })} className={CLASSE_SELECT}>
          <option value="">Todas</option>
          {comAtual(entidades, f.entidade).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </div>

      <div className="grid w-full gap-1 sm:w-auto">
        <Label htmlFor={`${uid}-usuario`} className="text-xs font-normal text-muted-foreground">
          Usuário
        </Label>
        <select id={`${uid}-usuario`} value={f.usuario} onChange={(e) => mudar({ usuario: e.target.value })} className={CLASSE_SELECT}>
          <option value="">Todos</option>
          {comAtual(usuarios, f.usuario).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </div>

      <div className="grid w-full gap-1 sm:w-auto">
        <Label htmlFor={`${uid}-de`} className="text-xs font-normal text-muted-foreground">
          De
        </Label>
        <Input
          id={`${uid}-de`}
          type="date"
          value={f.de}
          max={f.ate || undefined}
          onChange={(e) => mudar({ de: e.target.value })}
          className="w-[150px] bg-card"
        />
      </div>

      <div className="grid w-full gap-1 sm:w-auto">
        <Label htmlFor={`${uid}-ate`} className="text-xs font-normal text-muted-foreground">
          Até
        </Label>
        <Input
          id={`${uid}-ate`}
          type="date"
          value={f.ate}
          min={f.de || undefined}
          onChange={(e) => mudar({ ate: e.target.value })}
          className="w-[150px] bg-card"
        />
      </div>

      {filtrando && (
        <Button type="button" variant="ghost" size="sm" onClick={limpar} className="self-end">
          <X /> Limpar filtros
        </Button>
      )}
    </div>
  );
}
