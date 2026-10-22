"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImageUp, LoaderCircle, Scissors, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { prepararLogotipo, type LogoPreparado } from "./preparar-logotipo";
import { removerLogoEmpresa, salvarLogoEmpresa } from "@/modules/configuracoes/acoes";

export type LogoAtual = { src: string; largura: number; altura: number; bytes: number };

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Mesma conta do PDF: cabe em 170 x 56 pt. Aqui em px de tela, 1,5x maior para a prévia ficar legível. */
function tamanhoNoPdf(largura: number, altura: number, fator = 1.5) {
  const escala = Math.min(170 / largura, 56 / altura);
  return { width: Math.round(largura * escala * fator), height: Math.round(altura * escala * fator) };
}

/** Logotipo da empresa (matriz): prévia, envio com tratamento no navegador, troca e remoção. */
export function LogotipoEmpresa({
  empresaId,
  nome,
  razaoSocial,
  cnpj,
  logo,
}: {
  empresaId: string;
  nome: string;
  razaoSocial: string;
  cnpj: string;
  logo: LogoAtual | null;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<LogoPreparado | null>(null);
  const [remover, setRemover] = useState(false);
  const [preparando, iniciarPreparo] = useTransition();
  const [salvando, iniciarSalvar] = useTransition();

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    iniciarPreparo(async () => {
      try {
        setPrevia(await prepararLogotipo(arquivo));
      } catch (erro) {
        toast.error(erro instanceof Error ? erro.message : "Não foi possível abrir a imagem.");
      }
    });
  }

  function salvar() {
    if (!previa) return;
    iniciarSalvar(async () => {
      const r = await salvarLogoEmpresa(empresaId, previa.dataUrl);
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem ?? "Logotipo salvo.");
      setPrevia(null);
      router.refresh();
    });
  }

  const tamPrevia = previa ? tamanhoNoPdf(previa.largura, previa.altura) : null;

  return (
    <div className="mt-6 border-t pt-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">Logotipo</h3>
          <p className="text-xs text-muted-foreground">Sai no cabeçalho das propostas e pedidos em PDF desta empresa e das filiais.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => entrada.current?.click()} disabled={preparando}>
            {preparando ? <LoaderCircle className="animate-spin" /> : <ImageUp />} {logo ? "Trocar logotipo" : "Enviar logotipo"}
          </Button>
          {logo && (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setRemover(true)}>
              <Trash2 /> Remover
            </Button>
          )}
        </div>
      </div>

      {logo ? (
        <figure className="inline-flex flex-col gap-1.5">
          <div className="flex h-24 w-72 max-w-full items-center justify-center rounded-lg border bg-white p-3">
            <Image
              src={logo.src}
              alt={`Logotipo de ${nome}`}
              width={logo.largura}
              height={logo.altura}
              unoptimized
              className="max-h-full w-auto max-w-full object-contain"
            />
          </div>
          <figcaption className="text-xs text-muted-foreground tabular-nums">
            {logo.largura} × {logo.altura} px · {kb(logo.bytes)}
          </figcaption>
        </figure>
      ) : (
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={preparando}
          className="flex h-24 w-72 max-w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <ImageUp className="size-5" aria-hidden />
          Sem logotipo
          <span className="text-xs">Os PDFs saem só com o nome. Envie PNG, JPG, WebP ou SVG.</span>
        </button>
      )}

      <input
        ref={entrada}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Arquivo do logotipo de ${nome}`}
        onChange={escolher}
      />

      <Dialog open={!!previa} onOpenChange={(v) => !v && !salvando && setPrevia(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Prévia do logotipo</DialogTitle>
            <DialogDescription>Assim fica o cabeçalho das propostas e pedidos de {nome}.</DialogDescription>
          </DialogHeader>
          {previa && tamPrevia && (
            <>
              <div className="overflow-hidden rounded-lg border bg-white p-5 text-slate-900 shadow-xs">
                <div className="flex items-start justify-between gap-4 border-b-2 border-[#1e3a8a] pb-3">
                  <div className="min-w-0">
                    <Image src={previa.dataUrl} alt="" width={tamPrevia.width} height={tamPrevia.height} unoptimized className="mb-2 object-contain" />
                    <p className="truncate text-[13px] font-semibold">{razaoSocial}</p>
                    <p className="text-[11px] text-slate-500">CNPJ {cnpj}</p>
                  </div>
                  <div className="shrink-0 rounded border border-[#1e3a8a] px-3 py-2 text-right">
                    <p className="text-[11px] font-bold tracking-wide text-[#1e3a8a]">PROPOSTA COMERCIAL</p>
                    <p className="text-lg font-bold">Nº 0001</p>
                  </div>
                </div>
              </div>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
                <span>
                  {previa.formato.toUpperCase()} · {previa.largura} × {previa.altura} px · {kb(previa.bytes)}
                </span>
                {previa.cortouMargem && (
                  <span className="inline-flex items-center gap-1">
                    <Scissors className="size-3.5" aria-hidden /> margens vazias cortadas
                  </span>
                )}
              </p>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrevia(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <LoaderCircle className="animate-spin" />} Salvar logotipo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {remover && (
        <ConfirmarAcao
          aberto
          onAbertoChange={(v) => !v && setRemover(false)}
          titulo="Remover o logotipo?"
          descricao={`As propostas e pedidos de ${nome} voltam a sair só com o nome da empresa.`}
          rotuloConfirmar="Remover"
          destrutivo
          acao={() => removerLogoEmpresa(empresaId)}
          aoConcluir={() => setRemover(false)}
        />
      )}
    </div>
  );
}
