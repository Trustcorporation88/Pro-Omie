"use client";

import { useId } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/** Ícone oficial do Pro Omie (arte original, cantos arredondados transparentes). */
export function MarcaIcone({ className, tamanho = 32 }: { className?: string; tamanho?: number }) {
  return (
    <Image
      src="/marca/pro-omie-icone.webp"
      alt=""
      width={tamanho}
      height={tamanho}
      unoptimized
      priority
      draggable={false}
      className={cn("shrink-0 select-none", className)}
    />
  );
}

type Tom = "claro" | "escuro";

/** Degradê do "O" e do anel, do azul (embaixo, à esquerda) ao verde-menta, como no logotipo.
 *  Sobre fundo escuro os tons sobem de luminosidade para manter o contraste. */
const CORES: Record<Tom, { texto: string; anel: [string, string, string] }> = {
  claro: { texto: "from-[#2f47a3] via-[#3f7fc0] to-[#3aa57f]", anel: ["#3554b8", "#3f86c4", "#3fb08a"] },
  escuro: { texto: "from-[#5a86ea] via-[#6fb6dc] to-[#9eedbb]", anel: ["#5a86ea", "#6fb6dc", "#9eedbb"] },
};

/** Metade do anel: a de trás fica atrás do "O", a da frente passa por cima dele. */
function Anel({ parte, id, tom }: { parte: "tras" | "frente"; id: string; tom: Tom }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 40 14"
      className={cn(
        "pointer-events-none absolute left-1/2 top-[57%] h-[0.42em] w-[1.12em] -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] overflow-visible",
        parte === "frente" && "z-10",
      )}
    >
      {parte === "tras" && (
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={CORES[tom].anel[0]} />
            <stop offset="0.5" stopColor={CORES[tom].anel[1]} />
            <stop offset="1" stopColor={CORES[tom].anel[2]} />
          </linearGradient>
        </defs>
      )}
      <path
        d={parte === "tras" ? "M1 7 A19 5.4 0 0 1 39 7" : "M1 7 A19 5.4 0 0 0 39 7"}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={parte === "frente" ? 2.4 : 2}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** "O" de Omie com a órbita do logotipo. */
function OComOrbita({ tom }: { tom: Tom }) {
  const id = `orbita-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <span className="relative mx-[0.06em] inline-block">
      <Anel parte="tras" id={id} tom={tom} />
      <span className={cn("relative bg-gradient-to-tr bg-clip-text text-transparent", CORES[tom].texto)}>
        O
      </span>
      <Anel parte="frente" id={id} tom={tom} />
    </span>
  );
}

/** Nome "Pro Omie" no estilo do logotipo, em texto (nítido em tamanho pequeno). Herda cor e tamanho. */
export function NomeMarca({ className, tom = "claro" }: { className?: string; tom?: Tom }) {
  return (
    <span className={cn("inline-flex items-baseline whitespace-nowrap font-semibold tracking-tight", className)}>
      <span>Pro</span>
      <span className="w-[0.26em]" />
      <OComOrbita tom={tom} />
      <span>mie</span>
    </span>
  );
}

/**
 * Marca completa. `grande` (painel escuro das telas de acesso) usa a arte original do nome,
 * com "ERP Trustcorp" e as linhas de circuito; o modo compacto usa o nome em texto.
 */
export function Marca({
  className,
  subtitulo = "ERP Trustcorp",
  grande = false,
}: {
  className?: string;
  subtitulo?: string | false;
  grande?: boolean;
}) {
  if (grande) {
    return (
      <div className={cn("flex items-center gap-4", className)}>
        <MarcaIcone tamanho={72} className="size-[72px]" />
        <Image
          src="/marca/pro-omie-nome.webp"
          alt="Pro Omie · ERP Trustcorp"
          width={450}
          height={185}
          unoptimized
          priority
          draggable={false}
          className="h-[76px] w-auto select-none"
        />
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <MarcaIcone tamanho={40} className="size-10" />
      <div className="leading-tight">
        <NomeMarca className="text-lg" />
        {subtitulo && <div className="text-xs opacity-70">{subtitulo}</div>}
      </div>
    </div>
  );
}
