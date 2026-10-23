"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, FileKey2, LoaderCircle, MoreHorizontal, RefreshCw, ShieldCheck, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { Campo } from "@/components/financeiro/campos";
import { Selo } from "@/components/selos";
import { fmtDocumento } from "@/lib/format";
import { enviarCertificado, removerCertificado, testarCertificado } from "@/modules/configuracoes/acoes";
import { diaSP, impressaoCurta, situacaoCertificado, type CertificadoResumo } from "@/modules/configuracoes/certificado-tipos";
import { cn } from "@/lib/utils";

export type EstabelecimentoCertificado = { id: string; nome: string; cnpj: string; matriz: boolean; ativo: boolean };

const dia = diaSP;

/** Certificados A1 da empresa e das filiais: situação, envio, teste e remoção. */
export function CertificadosEmpresa({
  estabelecimentos,
  certificados,
}: {
  estabelecimentos: EstabelecimentoCertificado[];
  certificados: Record<string, CertificadoResumo>;
}) {
  const matriz = estabelecimentos.find((e) => e.matriz);
  const certMatriz = matriz ? certificados[matriz.id] : undefined;
  return (
    <div className="mt-6 border-t pt-5">
      <div className="mb-3 space-y-0.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <FileKey2 className="size-4 text-muted-foreground" aria-hidden /> Certificado digital
        </h3>
        <p className="text-xs text-muted-foreground">
          Certificado A1 (arquivo .pfx ou .p12) para emitir NF-e e NFS-e. Fica guardado cifrado e a senha nunca é exibida. Filial sem certificado próprio usa o da
          empresa.
        </p>
      </div>
      <ul className="divide-y rounded-lg border">
        {estabelecimentos.map((e) => (
          <LinhaCertificado key={e.id} estabelecimento={e} certificado={certificados[e.id]} herdado={!e.matriz && !certificados[e.id] ? certMatriz : undefined} />
        ))}
      </ul>
    </div>
  );
}

function LinhaCertificado({
  estabelecimento: e,
  certificado: c,
  herdado,
}: {
  estabelecimento: EstabelecimentoCertificado;
  certificado?: CertificadoResumo;
  herdado?: CertificadoResumo;
}) {
  const router = useRouter();
  const [enviar, setEnviar] = useState(false);
  const [remover, setRemover] = useState(false);
  const [testando, iniciarTeste] = useTransition();
  const sit = c ? situacaoCertificado(c.validoAte) : null;

  function testar() {
    iniciarTeste(async () => {
      const r = await testarCertificado(e.id);
      if (!r.ok) return void toast.error(r.erro);
      toast.success(r.mensagem ?? "Certificado OK.");
      router.refresh();
    });
  }

  return (
    <li className={cn("flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center", !e.ativo && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
          <span className="truncate">{e.nome}</span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{`${e.matriz ? "Matriz" : "Filial"} · ${fmtDocumento(e.cnpj)}`}</span>
          {c && sit && <Selo tom={sit.tom}>{sit.rotulo}</Selo>}
          {!c && herdado && <Selo tom="neutro">usa o da matriz</Selo>}
          {!c && !herdado && <Selo tom="neutro">sem certificado</Selo>}
        </p>
        {c ? (
          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            <p className="text-foreground">
              {c.titular}
              {c.cnpj && c.cnpj !== e.cnpj && <span className="text-muted-foreground">{` · CNPJ ${fmtDocumento(c.cnpj)}`}</span>}
            </p>
            <p className="tabular-nums">{`Válido de ${dia(c.validoDe)} até ${dia(c.validoAte)}${c.emissor ? ` · ${c.emissor}` : ""}`}</p>
            <p className="tabular-nums">{`Enviado em ${dia(c.enviadoEm)}${c.enviadoPor ? ` por ${c.enviadoPor}` : ""} · impressão ${impressaoCurta(c.impressaoDigital)}`}</p>
          </div>
        ) : herdado ? (
          <p className="mt-1 text-xs text-muted-foreground">{`Emite com o certificado da matriz (${herdado.titular}, até ${dia(herdado.validoAte)}). Envie um próprio só se a filial tiver o dela.`}</p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Envie quando for emitir notas por este CNPJ.</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant={c ? "outline" : "default"} size="sm" onClick={() => setEnviar(true)}>
          {c ? <RefreshCw /> : <Upload />} {c ? "Trocar" : "Enviar certificado"}
        </Button>
        {c && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label={`Mais ações do certificado de ${e.nome}`}>
                {testando ? <LoaderCircle className="animate-spin" /> : <MoreHorizontal />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={testar}>
                <ShieldCheck /> Testar certificado
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setRemover(true)}>
                <Trash2 /> Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {enviar && <DialogoEnviar estabelecimento={e} trocando={!!c} onFechar={() => setEnviar(false)} />}
      {remover && (
        <ConfirmarAcao
          aberto
          onAbertoChange={(v) => !v && setRemover(false)}
          titulo="Remover o certificado?"
          descricao={`O certificado de ${e.nome} é apagado do sistema. ${e.matriz ? "Sem ele, a empresa e as filiais sem certificado próprio não emitem notas." : "A filial passa a usar o certificado da matriz, se houver."}`}
          rotuloConfirmar="Remover"
          destrutivo
          acao={() => removerCertificado(e.id)}
          aoConcluir={() => setRemover(false)}
        />
      )}
    </li>
  );
}

function DialogoEnviar({ estabelecimento: e, trocando, onFechar }: { estabelecimento: EstabelecimentoCertificado; trocando: boolean; onFechar: () => void }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, iniciar] = useTransition();

  function confirmar(ev: React.FormEvent) {
    ev.preventDefault();
    const faltas: Record<string, string> = {};
    if (!arquivo) faltas.arquivo = "Escolha o arquivo.";
    if (!senha) faltas.senha = "Informe a senha.";
    if (Object.keys(faltas).length) return setErros(faltas);
    const fd = new FormData();
    fd.set("empresaId", e.id);
    fd.set("arquivo", arquivo!);
    fd.set("senha", senha);
    iniciar(async () => {
      const r = await enviarCertificado(fd);
      if (!r.ok) {
        setErros(r.campos ?? {});
        if (r.campos?.senha) setSenha("");
        return void toast.error(r.erro);
      }
      setSenha("");
      toast.success(r.mensagem ?? "Certificado guardado.", { duration: 8000 });
      onFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !enviando && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={confirmar} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{trocando ? "Trocar certificado" : "Enviar certificado"}</DialogTitle>
            <DialogDescription>{`${e.nome} · ${fmtDocumento(e.cnpj)}. Use o certificado A1 e-CNPJ (.pfx ou .p12). O A3, em cartão ou token, não funciona em sistema na nuvem.`}</DialogDescription>
          </DialogHeader>
          <Campo id="cert-arquivo" rotulo="Arquivo do certificado" obrigatorio erro={erros.arquivo}>
            <button
              type="button"
              id="cert-arquivo"
              onClick={() => entrada.current?.click()}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border border-dashed px-3 py-3 text-left text-sm transition-colors hover:border-primary",
                arquivo && "border-solid",
                erros.arquivo && "border-destructive",
              )}
            >
              <FileKey2 className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{arquivo ? arquivo.name : "Escolher arquivo .pfx ou .p12"}</span>
                <span className="block text-xs text-muted-foreground">{arquivo ? `${Math.max(1, Math.round(arquivo.size / 1024))} KB` : "Até 100 KB"}</span>
              </span>
            </button>
            <input
              ref={entrada}
              type="file"
              accept=".pfx,.p12,application/x-pkcs12"
              className="sr-only"
              tabIndex={-1}
              aria-label="Arquivo do certificado"
              onChange={(ev) => {
                setArquivo(ev.target.files?.[0] ?? null);
                setErros((x) => ({ ...x, arquivo: "" }));
                ev.target.value = "";
              }}
            />
          </Campo>
          <Campo id="cert-senha" rotulo="Senha do certificado" obrigatorio erro={erros.senha} ajuda="A mesma usada para instalar o certificado. Ela fica cifrada.">
            <div className="relative">
              <Input
                id="cert-senha"
                type={mostrar ? "text" : "password"}
                autoComplete="new-password"
                value={senha}
                maxLength={200}
                onChange={(ev) => {
                  setSenha(ev.target.value);
                  setErros((x) => ({ ...x, senha: "" }));
                }}
                aria-invalid={!!erros.senha}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-1/2 right-0.5 size-8 -translate-y-1/2"
                onClick={() => setMostrar((m) => !m)}
                aria-label={mostrar ? "Esconder a senha" : "Mostrar a senha"}
              >
                {mostrar ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando && <LoaderCircle className="animate-spin" />} {trocando ? "Trocar certificado" : "Guardar certificado"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
