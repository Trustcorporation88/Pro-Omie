import type { Metadata } from "next";
import { Building } from "lucide-react";
import type { Empresa } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { Selo, SeloAtivo } from "@/components/selos";
import { AcoesFilial, BotaoEditarMatriz, BotaoNovaEmpresa } from "@/components/configuracoes/empresa-controles";
import { exigirUsuario } from "@/lib/auth/sessao";
import { fmtCep, fmtDocumento, fmtTelefone } from "@/lib/format";
import { ROTULOS } from "@/lib/rotulos";
import { empresaParaValores, listarFiliais, obterMatriz } from "@/modules/configuracoes/consultas";
import { fmtCnae } from "@/modules/configuracoes/formatos";

export const metadata: Metadata = { title: "Empresa e filiais" };

/** Endereço em até três linhas: rua, nº e complemento · bairro e cidade/UF · CEP. */
function linhasEndereco(e: Pick<Empresa, "logradouro" | "numero" | "complemento" | "bairro" | "cidade" | "uf" | "cep">): string[] {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const linha1 = [rua, e.complemento].filter(Boolean).join(" — ");
  const linha2 = [e.bairro, [e.cidade, e.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  const linha3 = e.cep ? `CEP ${fmtCep(e.cep)}` : "";
  return [linha1, linha2, linha3].filter(Boolean);
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <dl className="space-y-3">{children}</dl>
    </div>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children || <span className="font-normal text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const plural = (n: number, singular: string, pluralTexto: string) => `${n} ${n === 1 ? singular : pluralTexto}`;

export default async function EmpresaPage() {
  await exigirUsuario("config:admin");
  const matriz = await obterMatriz();

  if (!matriz) {
    return (
      <>
        <PageHeader titulo="Empresa e filiais" descricao="Dados cadastrais da matriz e das filiais." />
        <EstadoVazio titulo="Nenhuma empresa cadastrada" descricao="Cadastre a matriz para depois criar as filiais.">
          <BotaoNovaEmpresa tipo="matriz" />
        </EstadoVazio>
      </>
    );
  }

  const filiais = await listarFiliais(matriz.id);
  const ativas = filiais.filter((f) => f.ativo).length;
  const endereco = linhasEndereco(matriz);

  return (
    <>
      <PageHeader titulo="Empresa e filiais" descricao="Dados cadastrais da matriz e das filiais da empresa." />

      <section aria-labelledby="titulo-matriz">
        <Card className="gap-5">
          <div className="flex flex-col gap-3 px-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="titulo-matriz" className="text-lg leading-tight font-semibold">
                    {matriz.razaoSocial}
                  </h2>
                  <Selo tom="info">Matriz</Selo>
                </div>
                <CardDescription>
                  {matriz.nomeFantasia ? `${matriz.nomeFantasia} · ` : ""}CNPJ {fmtDocumento(matriz.cnpj)}
                </CardDescription>
              </div>
            </div>
            <div className="shrink-0 self-start">
              <BotaoEditarMatriz id={matriz.id} valores={empresaParaValores(matriz)} />
            </div>
          </div>
          <CardContent>
            <div className="grid gap-6 border-t pt-5 md:grid-cols-3">
              <Grupo titulo="Dados fiscais">
                <Dado rotulo="Regime tributário">{ROTULOS.regimeTributario[matriz.regimeTributario]}</Dado>
                <Dado rotulo="Inscrição estadual">{matriz.inscricaoEstadual}</Dado>
                <Dado rotulo="Inscrição municipal">{matriz.inscricaoMunicipal}</Dado>
                <Dado rotulo="CNAE principal">{fmtCnae(matriz.cnae)}</Dado>
              </Grupo>
              <Grupo titulo="Endereço">
                <Dado rotulo="Endereço">
                  {endereco.length > 0 && (
                    <address className="space-y-0.5 not-italic">
                      {endereco.map((linha) => (
                        <div key={linha}>{linha}</div>
                      ))}
                    </address>
                  )}
                </Dado>
                <Dado rotulo="Código do município (IBGE)">{matriz.codigoMunicipio}</Dado>
              </Grupo>
              <Grupo titulo="Contato">
                <Dado rotulo="E-mail">{matriz.email}</Dado>
                <Dado rotulo="Telefone">{fmtTelefone(matriz.telefone)}</Dado>
              </Grupo>
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="titulo-filiais" className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div className="space-y-0.5">
            <h2 id="titulo-filiais" className="text-lg font-semibold tracking-tight">
              Filiais
            </h2>
            <p className="text-sm text-muted-foreground">
              {filiais.length === 0
                ? "Nenhuma filial cadastrada."
                : `${plural(filiais.length, "filial cadastrada", "filiais cadastradas")} · ${plural(ativas, "ativa", "ativas")}`}
            </p>
          </div>
          {filiais.length > 0 && <BotaoNovaEmpresa tipo="filial" regimeInicial={matriz.regimeTributario} />}
        </div>

        {filiais.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma filial cadastrada"
            descricao="Cadastre as unidades da empresa para usá-las em contas bancárias e lançamentos financeiros."
          >
            <BotaoNovaEmpresa tipo="filial" regimeInicial={matriz.regimeTributario} />
          </EstadoVazio>
        ) : (
          <Card className="gap-0 overflow-hidden py-0">
            <Table>
              <TableCaption className="sr-only">Filiais da empresa</TableCaption>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Nome</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filiais.map((f) => {
                  const nome = f.nomeFantasia || f.razaoSocial;
                  return (
                    <TableRow key={f.id} className={f.ativo ? undefined : "opacity-60"}>
                      <TableCell>
                        <div className="font-medium">{nome}</div>
                        {f.nomeFantasia && <div className="text-xs text-muted-foreground">{f.razaoSocial}</div>}
                      </TableCell>
                      <TableCell className="tabular text-sm">{fmtDocumento(f.cnpj)}</TableCell>
                      <TableCell className="text-sm">{[f.cidade, f.uf].filter(Boolean).join("/") || "—"}</TableCell>
                      <TableCell>
                        <SeloAtivo ativo={f.ativo} />
                      </TableCell>
                      <TableCell>
                        <AcoesFilial id={f.id} nome={nome} ativo={f.ativo} valores={empresaParaValores(f)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </>
  );
}
