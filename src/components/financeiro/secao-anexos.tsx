"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileImage, FileSpreadsheet, FileText, LoaderCircle, Paperclip, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { anexarArquivoAcao, excluirAnexoAcao } from "@/modules/financeiro/acoes";
import { fmtDataHora } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ANEXO_ACCEPT, ANEXO_TAMANHO_MAX, ANEXO_TIPOS, extensaoArquivo, fmtTamanho, type AnexoResumo } from "./tipos";

const INLINE = /^(application\/pdf|image\/(png|jpeg|webp))$/;

function IconeArquivo({ mime }: { mime: string }) {
  const cls = "size-4 shrink-0 text-muted-foreground";
  if (mime.startsWith("image/")) return <FileImage className={cls} />;
  if (mime.includes("spreadsheet") || mime === "text/csv") return <FileSpreadsheet className={cls} />;
  return <FileText className={cls} />;
}

/** Lista de anexos do título com upload (botão ou arrastar e soltar), download e exclusão. */
export function SecaoAnexos({ tituloId, anexos, podeEditar }: { tituloId: string; anexos: AnexoResumo[]; podeEditar: boolean }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, iniciar] = useTransition();
  const [arrastando, setArrastando] = useState(false);
  const [excluir, setExcluir] = useState<AnexoResumo | null>(null);

  function enviar(arquivos: FileList | File[] | null) {
    const lista = Array.from(arquivos ?? []);
    if (!lista.length) return;
    const validos = lista.filter((f) => {
      if (!ANEXO_TIPOS[extensaoArquivo(f.name)]) {
        toast.error(`${f.name}: formato não aceito. Use PDF, PNG, JPG, WEBP, XML, OFX, CSV, XLSX ou DOCX.`);
        return false;
      }
      if (f.size > ANEXO_TAMANHO_MAX) {
        toast.error(`${f.name}: o arquivo passa de 5 MB.`);
        return false;
      }
      if (f.size === 0) {
        toast.error(`${f.name}: o arquivo está vazio.`);
        return false;
      }
      return true;
    });
    if (entrada.current) entrada.current.value = "";
    if (!validos.length) return;
    iniciar(async () => {
      let ok = 0;
      for (const f of validos) {
        const fd = new FormData();
        fd.set("tituloId", tituloId);
        fd.set("arquivo", f);
        const r = await anexarArquivoAcao(fd);
        if (r.ok) ok++;
        else toast.error(`${f.name}: ${r.erro}`);
      }
      if (ok) {
        toast.success(ok > 1 ? `${ok} arquivos anexados.` : "Arquivo anexado.");
        router.refresh();
      }
    });
  }

  return (
    <Card
      className={cn("gap-4", arrastando && "border-primary ring-2 ring-primary/30")}
      onDragOver={
        podeEditar
          ? (e) => {
              e.preventDefault();
              setArrastando(true);
            }
          : undefined
      }
      onDragLeave={podeEditar ? () => setArrastando(false) : undefined}
      onDrop={
        podeEditar
          ? (e) => {
              e.preventDefault();
              setArrastando(false);
              enviar(e.dataTransfer.files);
            }
          : undefined
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="size-4 text-muted-foreground" /> Anexos
          {anexos.length > 0 && <span className="text-sm font-normal text-muted-foreground">({anexos.length})</span>}
        </CardTitle>
        <CardDescription>PDF, imagens, XML, OFX, CSV, XLSX ou DOCX · até 5 MB</CardDescription>
        {podeEditar && (
          <CardAction>
            <input
              ref={entrada}
              type="file"
              multiple
              accept={ANEXO_ACCEPT}
              className="sr-only"
              aria-label="Selecionar arquivos para anexar"
              onChange={(e) => enviar(e.target.files)}
              tabIndex={-1}
            />
            <Button size="sm" variant="outline" onClick={() => entrada.current?.click()} disabled={enviando}>
              {enviando ? <LoaderCircle className="animate-spin" /> : <Paperclip />} Anexar
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {anexos.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            {podeEditar ? "Nenhum anexo. Arraste arquivos para cá ou use “Anexar”." : "Nenhum anexo."}
          </p>
        ) : (
          <ul className="divide-y">
            {anexos.map((a) => {
              const url = `/api/anexos/${a.id}`;
              const inline = INLINE.test(a.mimeType);
              return (
                <li key={a.id} className="flex items-center gap-2 py-2">
                  <IconeArquivo mime={a.mimeType} />
                  <div className="min-w-0 flex-1">
                    <a
                      href={url}
                      {...(inline ? { target: "_blank", rel: "noopener noreferrer" } : { download: a.nome })}
                      className="block truncate text-sm font-medium hover:underline"
                      title={a.nome}
                    >
                      {a.nome}
                    </a>
                    <p className="truncate text-xs text-muted-foreground">
                      {fmtTamanho(a.tamanho)} · {fmtDataHora(a.createdAt)}
                      {a.criadoPorNome && ` · ${a.criadoPorNome}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="size-8" asChild>
                    <a href={`${url}?download=1`} download={a.nome} aria-label={`Baixar ${a.nome}`}>
                      <Download />
                    </a>
                  </Button>
                  {podeEditar && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setExcluir(a)}
                      aria-label={`Excluir ${a.nome}`}
                    >
                      <Trash />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <ConfirmarAcao
        aberto={!!excluir}
        onAbertoChange={(v) => {
          if (!v) setExcluir(null);
        }}
        titulo="Excluir anexo?"
        descricao={excluir ? <p>“{excluir.nome}” será removido permanentemente.</p> : undefined}
        rotuloConfirmar="Excluir"
        destrutivo
        acao={() => (excluir ? excluirAnexoAcao(excluir.id) : Promise.resolve({ ok: false as const, erro: "Anexo não selecionado." }))}
      />
    </Card>
  );
}
