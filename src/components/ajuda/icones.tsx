import { BookOpen, Boxes, Building, CalendarClock, CircleHelp, LayoutDashboard, ReceiptText, Repeat, Rocket, ShoppingCart, SquareKanban, Users, Wallet, type LucideIcon } from "lucide-react";

const ICONES: Record<string, LucideIcon> = { BookOpen, Boxes, Building, CalendarClock, CircleHelp, LayoutDashboard, ReceiptText, Repeat, Rocket, ShoppingCart, SquareKanban, Users, Wallet };

/** Ícone de uma seção do manual (nome do lucide). */
export function IconeSecao({ nome, className }: { nome: string; className?: string }) {
  const Icone = ICONES[nome] ?? BookOpen;
  return <Icone className={className} aria-hidden />;
}
