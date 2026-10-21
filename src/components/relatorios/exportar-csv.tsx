"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CelulaCsv = string | number | null | undefined;

/** Número no padrão brasileiro para planilhas: sem separador de milhar, vírgula decimal. */
function numeroCsv(v: number): string {
  if (!Number.isFinite(v)) return "";
  const s = (Math.round(v * 100) / 100).toFixed(2);
  return (s === "-0.00" ? "0.00" : s).replace(".", ",");
}

function celulaCsv(v: CelulaCsv): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return numeroCsv(v);
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function gerarCsv(cabecalho: string[], linhas: CelulaCsv[][]): string {
  return [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(";")).join("\r\n");
}

/** Botão que gera o CSV no navegador (separador ";", decimais com vírgula, UTF-8 com BOM para o Excel). */
export function BotaoExportarCsv({
  arquivo,
  cabecalho,
  linhas,
  desabilitado,
}: {
  arquivo: string;
  cabecalho: string[];
  linhas: CelulaCsv[][];
  desabilitado?: boolean;
}) {
  const exportar = () => {
    const blob = new Blob([`\uFEFF${gerarCsv(cabecalho, linhas)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = arquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return (
    <Button variant="outline" size="sm" onClick={exportar} disabled={desabilitado || !linhas.length}>
      <Download /> Exportar CSV
    </Button>
  );
}
