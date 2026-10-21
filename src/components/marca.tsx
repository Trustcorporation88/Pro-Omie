import { cn } from "@/lib/utils";

export function MarcaIcone({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8 shrink-0", className)} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#1d3fbf" />
      <path
        d="M18 44V20h14.5c6.4 0 10.5 3.7 10.5 9.3S38.9 38.6 32.5 38.6H25V44h-7zm7-11.6h7c2.6 0 4.2-1.2 4.2-3.1s-1.6-3.1-4.2-3.1h-7v6.2z"
        fill="#fff"
      />
      <circle cx="46" cy="42" r="4" fill="#5eead4" />
    </svg>
  );
}

export function Marca({ className, subtitulo = true }: { className?: string; subtitulo?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <MarcaIcone />
      <div className="leading-tight">
        <div className="font-semibold tracking-tight">Pro Omie</div>
        {subtitulo && <div className="text-xs opacity-70">ERP Trustcorp</div>}
      </div>
    </div>
  );
}
