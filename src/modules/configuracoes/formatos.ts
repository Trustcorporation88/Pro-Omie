// Formatações específicas das telas de Administração. Seguro para client e server.
import { soDigitos } from "@/lib/format";

/** CNAE no padrão 0000-0/00 (7 dígitos). Valores incompletos voltam como foram digitados. */
export function fmtCnae(v: string | null | undefined): string {
  const d = soDigitos(v);
  return d.length === 7 ? `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}` : (v ?? "");
}
