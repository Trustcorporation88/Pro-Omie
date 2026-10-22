import { CircleCheckBig, Mail, MapPin, MessageCircle, Phone, Users, type LucideIcon } from "lucide-react";
import { addDias, diffDias } from "@/lib/datas";
import { fmtData } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TipoAtividadeT } from "@/modules/crm/tipos";

const ICONE: Record<TipoAtividadeT, LucideIcon> = {
  LIGACAO: Phone,
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  REUNIAO: Users,
  VISITA: MapPin,
  TAREFA: CircleCheckBig,
};

export function IconeAtividade({ tipo, className }: { tipo: TipoAtividadeT; className?: string }) {
  const I = ICONE[tipo] ?? CircleCheckBig;
  return <I className={cn("size-4 shrink-0", className)} aria-hidden />;
}

const DIA_SEMANA = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];

/** "Hoje 14:30", "Amanhã", "Ontem", "qui., 30/10" ou a data completa; e se já passou. */
export function quando(data: string, hora: string | null, hoje: string): { texto: string; atrasada: boolean; ehHoje: boolean } {
  const d = diffDias(hoje, data);
  let texto: string;
  if (d === 0) texto = "Hoje";
  else if (d === 1) texto = "Amanhã";
  else if (d === -1) texto = "Ontem";
  else if (d > 1 && d < 7) texto = `${DIA_SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()]}, ${fmtData(data).slice(0, 5)}`;
  else if (d < 0 && d > -7) texto = `há ${-d} dias`;
  else texto = data.slice(0, 4) === hoje.slice(0, 4) ? fmtData(data).slice(0, 5) : fmtData(data);
  return { texto: hora ? `${texto} ${hora}` : texto, atrasada: d < 0, ehHoje: d === 0 };
}

/** Atalhos de data para agendar atividades. */
export const atalhosData = (hoje: string) => [
  { rotulo: "Hoje", valor: hoje },
  { rotulo: "Amanhã", valor: addDias(hoje, 1) },
  { rotulo: "Em 3 dias", valor: addDias(hoje, 3) },
  { rotulo: "Em 1 semana", valor: addDias(hoje, 7) },
];

export const iniciais = (nome: string | null) =>
  (nome ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";
