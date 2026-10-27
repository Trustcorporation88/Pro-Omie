"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight, ListPlus, LoaderCircle, MapPin, MoreHorizontal, PackageOpen, Printer, Trash2, Truck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { colocarRestantes, excluirVolume } from "@/modules/armazem/acoes";
import type { StatusVolume } from "@/modules/armazem/tipos";
import { EditorConteudo, type LinhaConteudoTela, type ProdutoOpcao } from "./editor-conteudo";
import { DialogoDesfazerSaida, DialogoEnderecar, DialogoSaida, DialogoTransferir } from "./dialogos-volume";

export type VolumeAcoes = {
  id: string;
  codigo: string;
  status: StatusVolume;
  empresaId: string;
  depositanteId: string;
  endereco: { id: string; codigo: string } | null;
};

/** Ações de uma caixa ou pallet: conteúdo, completar com o que falta, endereçar, transferir, etiqueta, saída e excluir. */
export function AcoesVolume({
  volume,
  conteudo,
  produtos,
  lotesPorCodigo,
  restantes = 0,
  compacto = false,
  aposExcluir,
}: {
  volume: VolumeAcoes;
  conteudo: (LinhaConteudoTela & { id: string })[];
  produtos: ProdutoOpcao[];
  lotesPorCodigo?: Record<string, string[]>;
  restantes?: number;
  compacto?: boolean;
  /** para onde ir depois de excluir (na tela do próprio volume) */
  aposExcluir?: string;
}) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<null | "conteudo" | "enderecar" | "transferir" | "saida" | "desfazer" | "excluir">(null);
  const [completando, iniciar] = useTransition();
  const ativo = volume.status !== "EXPEDIDO";
  const tamanho = compacto ? "sm" : "default";
  const abrir = (d: typeof dialogo) => () => setDialogo(d);
  const fechar = (v: boolean) => !v && setDialogo(null);

  function completar() {
    iniciar(async () => {
      const r = await colocarRestantes(volume.id);
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem ?? "Pronto.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ativo && (
        <Button size={tamanho} variant={conteudo.length ? "outline" : "default"} onClick={abrir("conteudo")}>
          <PackageOpen /> {conteudo.length ? "Conteúdo" : "Lançar itens"}
        </Button>
      )}
      {volume.status === "ABERTO" && restantes > 0 && (
        <Button size={tamanho} variant="outline" onClick={completar} disabled={completando} title="Põe neste volume tudo o que ainda não está em nenhuma caixa ou pallet">
          {completando ? <LoaderCircle className="animate-spin" /> : <ListPlus />} Colocar o que falta
        </Button>
      )}
      {ativo && (
        <Button size={tamanho} variant="outline" onClick={abrir("enderecar")}>
          <MapPin /> {volume.endereco ? "Mudar endereço" : "Endereçar"}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={compacto ? "icon" : "default"} variant="ghost" aria-label={`Mais ações de ${volume.codigo}`} className={compacto ? "size-8" : undefined}>
            <MoreHorizontal />
            {!compacto && "Mais"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={`/api/armazem/etiquetas?tipo=volumes&ids=${volume.id}`} target="_blank" rel="noopener">
              <Printer /> Etiqueta 10 × 15 cm
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/api/armazem/etiquetas?tipo=volumes&ids=${volume.id}&formato=a4`} target="_blank" rel="noopener">
              <Printer /> Etiqueta em folha A4
            </a>
          </DropdownMenuItem>
          {ativo && conteudo.length > 0 && (
            <DropdownMenuItem onSelect={abrir("transferir")}>
              <ArrowLeftRight /> Transferir itens
            </DropdownMenuItem>
          )}
          {volume.status === "FECHADO" && conteudo.length > 0 && (
            <DropdownMenuItem onSelect={abrir("saida")}>
              <Truck /> Dar saída
            </DropdownMenuItem>
          )}
          {volume.status === "EXPEDIDO" && (
            <DropdownMenuItem onSelect={abrir("desfazer")}>
              <Undo2 /> Desfazer saída
            </DropdownMenuItem>
          )}
          {ativo && !conteudo.length && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={abrir("excluir")}>
                <Trash2 /> Excluir volume vazio
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditorConteudo aberto={dialogo === "conteudo"} onAbertoChange={fechar} volume={volume} conteudo={conteudo} produtos={produtos} lotesPorCodigo={lotesPorCodigo} />
      <DialogoEnderecar
        aberto={dialogo === "enderecar"}
        onAbertoChange={fechar}
        volumeIds={[volume.id]}
        rotulo={volume.codigo}
        estabelecimentoId={volume.empresaId}
        depositanteId={volume.depositanteId}
        enderecoAtual={volume.endereco?.codigo ?? null}
      />
      <DialogoTransferir aberto={dialogo === "transferir"} onAbertoChange={fechar} origem={volume} conteudo={conteudo} />
      <DialogoSaida aberto={dialogo === "saida"} onAbertoChange={fechar} volumeIds={[volume.id]} rotulo={volume.codigo} />
      <DialogoDesfazerSaida aberto={dialogo === "desfazer"} onAbertoChange={fechar} volumeId={volume.id} codigo={volume.codigo} />
      <ConfirmarAcao
        aberto={dialogo === "excluir"}
        onAbertoChange={fechar}
        titulo={`Excluir ${volume.codigo}?`}
        descricao="O volume está vazio. O número não é reaproveitado."
        rotuloConfirmar="Excluir"
        destrutivo
        acao={() => excluirVolume(volume.id)}
        aoConcluir={aposExcluir ? () => router.push(aposExcluir) : undefined}
      />
    </div>
  );
}
