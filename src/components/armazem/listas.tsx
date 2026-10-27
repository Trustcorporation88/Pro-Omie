"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, MapPin, PackageSearch, Printer, ScanLine, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Selo } from "@/components/selos";
import { fmtData } from "@/lib/format";
import { localizarNoArmazem, enderecarVolumes } from "@/modules/armazem/acoes";
import { fmtQuantidade, lerCodigoVolume, numeroRecebimento, situacaoVolume, type StatusVolume, type TipoVolume } from "@/modules/armazem/tipos";
import { DialogoEnderecar, DialogoSaida } from "./dialogos-volume";

export type LinhaVolume = {
  id: string;
  empresaId: string;
  codigo: string;
  tipo: TipoVolume;
  status: StatusVolume;
  depositanteId: string;
  depositante: string;
  endereco: { id: string; codigo: string } | null;
  recebimento: { id: string; numero: number } | null;
  referenciaDepositante: string | null;
  itens: number;
  quantidade: number;
  unidade: string | null;
  expedidoEm: string | null;
  documentoSaida: string | null;
};

/** Tabela de caixas e pallets com seleção para endereçar, imprimir etiquetas e dar saída de vários de uma vez. */
export function TabelaVolumes({ linhas, podeEditar }: { linhas: LinhaVolume[]; podeEditar: boolean }) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [dialogo, setDialogo] = useState<null | "enderecar" | "saida">(null);
  const escolhidos = linhas.filter((l) => selecionados.has(l.id));
  const estabs = [...new Set(escolhidos.map((l) => l.empresaId))];
  const deps = [...new Set(escolhidos.map((l) => l.depositanteId))];
  const enderecaveis = escolhidos.length > 0 && escolhidos.every((l) => l.status !== "EXPEDIDO") && estabs.length === 1;
  const saiveis = escolhidos.length > 0 && escolhidos.every((l) => l.status === "FECHADO" && l.itens > 0);
  const todos = linhas.length > 0 && linhas.every((l) => selecionados.has(l.id));
  const rotulo = escolhidos.length === 1 ? escolhidos[0].codigo : `${escolhidos.length} volumes`;
  const alternar = (id: string, v: boolean) =>
    setSelecionados((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <>
      {podeEditar && (
        <div className="mb-3 flex min-h-9 flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{escolhidos.length ? `${escolhidos.length} selecionado${escolhidos.length === 1 ? "" : "s"}` : "Marque os volumes para agir em vários de uma vez"}</span>
          {escolhidos.length > 0 && (
            <>
              <Button size="sm" variant="outline" disabled={!enderecaveis} onClick={() => setDialogo("enderecar")} title={estabs.length > 1 ? "Volumes de estabelecimentos diferentes" : undefined}>
                <MapPin /> Endereçar
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={`/api/armazem/etiquetas?tipo=volumes&ids=${escolhidos.map((l) => l.id).join(",")}`} target="_blank" rel="noopener">
                  <Printer /> Etiquetas
                </a>
              </Button>
              <Button size="sm" variant="outline" disabled={!saiveis} onClick={() => setDialogo("saida")} title={saiveis ? undefined : "Só volumes armazenados e com itens"}>
                <Truck /> Dar saída
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>
                Limpar
              </Button>
            </>
          )}
        </div>
      )}
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {podeEditar && (
                <TableHead className="w-10 pl-3">
                  <Checkbox aria-label="Marcar todos" checked={todos} onCheckedChange={(v) => setSelecionados(v === true ? new Set(linhas.map((l) => l.id)) : new Set())} />
                </TableHead>
              )}
              <TableHead className={podeEditar ? undefined : "pl-3"}>Volume</TableHead>
              <TableHead>Depositante</TableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="pr-3">Recebimento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => {
              const s = situacaoVolume(l.status, !!l.endereco);
              return (
                <TableRow key={l.id} data-state={selecionados.has(l.id) ? "selected" : undefined}>
                  {podeEditar && (
                    <TableCell className="pl-3">
                      <Checkbox aria-label={`Marcar ${l.codigo}`} checked={selecionados.has(l.id)} onCheckedChange={(v) => alternar(l.id, v === true)} />
                    </TableCell>
                  )}
                  <TableCell className={podeEditar ? undefined : "pl-3"}>
                    <Link href={`/servicos/armazem/volumes/${l.id}`} className="font-medium hover:underline">
                      {l.codigo}
                    </Link>
                    {l.referenciaDepositante && <span className="block text-xs text-muted-foreground">ref. {l.referenciaDepositante}</span>}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-sm">{l.depositante}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {l.itens}
                    {l.itens > 0 && <span className="block text-xs text-muted-foreground">{fmtQuantidade(l.quantidade, l.unidade)}</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {l.endereco ? (
                      <Link href={`/servicos/armazem/enderecos/${l.endereco.id}`} className="font-medium hover:underline">
                        {l.endereco.codigo}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Selo tom={s.tom}>{s.rotulo}</Selo>
                    {l.status === "EXPEDIDO" && (
                      <span className="block text-xs text-muted-foreground">
                        {l.expedidoEm ? fmtData(l.expedidoEm) : ""} {l.documentoSaida ? `· ${l.documentoSaida}` : ""}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="pr-3 text-sm">
                    {l.recebimento ? (
                      <Link href={`/servicos/armazem/recebimentos/${l.recebimento.id}`} className="hover:underline">
                        {numeroRecebimento(l.recebimento.numero)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      {escolhidos.length > 0 && (
        <>
          <DialogoEnderecar
            aberto={dialogo === "enderecar"}
            onAbertoChange={(v) => !v && setDialogo(null)}
            volumeIds={escolhidos.map((l) => l.id)}
            rotulo={rotulo}
            estabelecimentoId={estabs[0]}
            depositanteId={deps.length === 1 ? deps[0] : null}
            aoConcluir={() => setSelecionados(new Set())}
          />
          <DialogoSaida aberto={dialogo === "saida"} onAbertoChange={(v) => !v && setDialogo(null)} volumeIds={escolhidos.map((l) => l.id)} rotulo={rotulo} aoConcluir={() => setSelecionados(new Set())} />
        </>
      )}
    </>
  );
}

/** Campo "Localizar": código da caixa (CX-12), do pallet (PL-3), do endereço (A-01-02), do recebimento ou o QR lido. */
export function Localizar({ className }: { className?: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [buscando, iniciar] = useTransition();
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (!texto.trim()) return;
        iniciar(async () => {
          const r = await localizarNoArmazem(texto);
          if (!r.ok) return void toast.error(r.erro);
          setTexto("");
          router.push(r.data!.url);
        });
      }}
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Localizar: CX-0012, PL-3, A-01-02 ou leia o QR" className="pl-8" aria-label="Localizar caixa, pallet ou endereço" />
        </div>
        <Button type="submit" variant="outline" disabled={buscando}>
          {buscando ? <LoaderCircle className="animate-spin" /> : <PackageSearch />} Localizar
        </Button>
      </div>
    </form>
  );
}

/** Na tela do endereço: digita (ou lê) o código da caixa ou pallet e põe aqui. */
export function ColocarNoEndereco({ enderecoId, codigo }: { enderecoId: string; codigo: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [enviando, iniciar] = useTransition();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        const t = texto.trim();
        if (!t) return;
        iniciar(async () => {
          const alvo = await localizarNoArmazem(t);
          const id = alvo.ok ? alvo.data!.url.match(/\/volumes\/([a-z0-9]+)$/i)?.[1] : null;
          if (!id) return void toast.error(lerCodigoVolume(t) ? (alvo.ok ? "Volume não encontrado." : alvo.erro) : "Digite o código da caixa ou do pallet (ex.: CX-0012).");
          const r = await enderecarVolumes({ volumeIds: [id], enderecoId });
          if (!r.ok) return void toast.error(r.erro);
          toast.success(`Colocado em ${codigo}.`);
          setTexto("");
          router.refresh();
        });
      }}
    >
      <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="CX-0012 ou PL-3" className="uppercase placeholder:normal-case sm:max-w-56" aria-label="Volume para colocar aqui" />
      <Button type="submit" disabled={enviando}>
        {enviando ? <LoaderCircle className="animate-spin" /> : <MapPin />} Colocar aqui
      </Button>
    </form>
  );
}
