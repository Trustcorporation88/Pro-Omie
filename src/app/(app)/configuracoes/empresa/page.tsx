import type { Metadata } from "next";
import { Building } from "lucide-react";
import type { Empresa } from "@/generated/prisma/client";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { Selo, SeloAtivo } from "@/components/selos";
import { contextoAdmin, escopoEmpresa } from "@/lib/auth/empresa";
import { AcoesFilial, BotaoEditarMatriz, BotaoNovaEmpresa } from "@/components/configuracoes/empresa-controles";
import { LogotipoEmpresa, type LogoAtual } from "@/components/configuracoes/logotipo-empresa";
import { CertificadosEmpresa } from "@/components/configuracoes/certificado-empresa";
import type { CertificadoResumo } from "@/modules/configuracoes/certificado-tipos";
import { exigirUsuario } from "@/lib/auth/sessao";
import { fmtCep, fmtDocumento, fmtTelefone } from "@/lib/format";
import { ROTULOS } from "@/lib/rotulos";
import { empresaParaValores, listarEmpresasDoGrupo } from "@/modules/configuracoes/consultas";
import { fmtCnae } from "@/modules/configuracoes/formatos";
import { logosComoDataUrl } from "@/modules/configuracoes/logotipo";
import { resumosCertificados } from "@/modules/configuracoes/certificado";
import { CaptacaoEmpresa } from "@/components/fiscal/captacao-empresa";
import { EmissaoEmpresa } from "@/components/fiscal/emissao-empresa";
import { EmissaoServicosEmpresa } from "@/components/fiscal/emissao-servicos-empresa";
import { CobrancaEmpresa, type ContaOpcao } from "@/components/cobranca/cobranca-empresa";
import { estadoCobranca, type EstadoCobranca } from "@/modules/cobranca/consultas";
import { prisma } from "@/lib/db";
import { estadoEmissao, type EstadoEmissao } from "@/modules/fiscal/nfe/consultas";
import { estadoEmissaoNfse, type EstadoEmissaoNfse } from "@/modules/fiscal/nfse/consultas";
import { estadoCaptacao } from "@/modules/fiscal/consultas";
import type { EstadoCaptacao } from "@/modules/fiscal/tipos";

export const metadata: Metadata = { title: "Empresas e filiais" };

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

type EmpresaComFiliais = Empresa & { filiais: Empresa[] };

function CartaoEmpresa({
  empresa,
  ativa,
  adminDoGrupo,
  logo,
  certificados,
  captacao,
  emissao,
  servicos,
  cobranca,
  contas,
}: {
  empresa: EmpresaComFiliais;
  ativa: boolean;
  adminDoGrupo: boolean;
  logo: LogoAtual | null;
  certificados: Record<string, CertificadoResumo>;
  captacao: EstadoCaptacao[];
  emissao: EstadoEmissao[];
  servicos: EstadoEmissaoNfse[];
  cobranca: EstadoCobranca[];
  contas: ContaOpcao[];
}) {
  const filiais = empresa.filiais;
  const ativas = filiais.filter((f) => f.ativo).length;
  const endereco = linhasEndereco(empresa);
  const idTitulo = `empresa-${empresa.id}`;
  return (
    <section aria-labelledby={idTitulo} className={empresa.ativo ? undefined : "opacity-70"}>
      <Card className="gap-5">
        <div className="flex flex-col gap-3 px-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={idTitulo} className="text-lg leading-tight font-semibold">
                  {empresa.razaoSocial}
                </h2>
                <Selo tom="info">Matriz</Selo>
                {ativa && <Selo tom="sucesso">Ativa no menu</Selo>}
                {!empresa.ativo && <SeloAtivo ativo={false} />}
              </div>
              <CardDescription>
                {empresa.nomeFantasia ? `${empresa.nomeFantasia} · ` : ""}CNPJ {fmtDocumento(empresa.cnpj)}
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start">
            <BotaoEditarMatriz id={empresa.id} valores={empresaParaValores(empresa)} />
            {adminDoGrupo && (
              <AcoesFilial tipo="matriz" id={empresa.id} nome={empresa.nomeFantasia || empresa.razaoSocial} ativo={empresa.ativo} valores={empresaParaValores(empresa)} />
            )}
          </div>
        </div>
        <CardContent>
          <div className="grid gap-6 border-t pt-5 md:grid-cols-3">
            <Grupo titulo="Dados fiscais">
              <Dado rotulo="Regime tributário">{ROTULOS.regimeTributario[empresa.regimeTributario]}</Dado>
              <Dado rotulo="Inscrição estadual">{empresa.inscricaoEstadual}</Dado>
              <Dado rotulo="Inscrição municipal">{empresa.inscricaoMunicipal}</Dado>
              <Dado rotulo="CNAE principal">{fmtCnae(empresa.cnae)}</Dado>
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
              <Dado rotulo="Código do município (IBGE)">{empresa.codigoMunicipio}</Dado>
            </Grupo>
            <Grupo titulo="Contato">
              <Dado rotulo="E-mail">{empresa.email}</Dado>
              <Dado rotulo="Telefone">{fmtTelefone(empresa.telefone)}</Dado>
            </Grupo>
          </div>

          <LogotipoEmpresa
            empresaId={empresa.id}
            nome={empresa.nomeFantasia || empresa.razaoSocial}
            razaoSocial={empresa.razaoSocial}
            cnpj={fmtDocumento(empresa.cnpj)}
            logo={logo}
          />

          <CertificadosEmpresa
            estabelecimentos={[empresa, ...filiais].map((x) => ({
              id: x.id,
              nome: x.nomeFantasia || x.razaoSocial,
              cnpj: x.cnpj,
              matriz: x.id === empresa.id,
              ativo: x.ativo,
            }))}
            certificados={certificados}
          />

          <EmissaoEmpresa estados={emissao} />

          <EmissaoServicosEmpresa estados={servicos} />

          <CobrancaEmpresa estados={cobranca} contas={contas} />

          <CaptacaoEmpresa estados={captacao} />

          <div className="mt-6 border-t pt-5">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold">Filiais</h3>
                <p className="text-xs text-muted-foreground">
                  {filiais.length === 0
                    ? "Nenhuma filial cadastrada."
                    : `${plural(filiais.length, "filial cadastrada", "filiais cadastradas")} · ${plural(ativas, "ativa", "ativas")}`}
                </p>
              </div>
              <BotaoNovaEmpresa tipo="filial" matrizId={empresa.id} regimeInicial={empresa.regimeTributario} variante="outline" />
            </div>
            {filiais.length > 0 && (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableCaption className="sr-only">Filiais de {empresa.razaoSocial}</TableCaption>
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
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export default async function EmpresaPage() {
  const u = await exigirUsuario("config:admin");
  const ctx = await contextoAdmin(u.id);
  const empresas = await listarEmpresasDoGrupo(ctx);

  if (empresas.length === 0) {
    return (
      <>
        <PageHeader titulo="Empresas e filiais" descricao="Empresas do grupo, cada uma com CNPJ, contas, cadastros e lançamentos próprios." />
        <EstadoVazio titulo="Nenhuma empresa cadastrada" descricao={ctx.adminDoGrupo ? "Cadastre a primeira empresa para começar." : "Nenhuma empresa liberada para você administrar."}>
          {ctx.adminDoGrupo && <BotaoNovaEmpresa tipo="matriz" rotulo="Cadastrar empresa" />}
        </EstadoVazio>
      </>
    );
  }

  const estabsAtivos = empresas.flatMap((e) => [
    { id: e.id, nome: e.nomeFantasia || e.razaoSocial, cnpj: e.cnpj },
    ...e.filiais.filter((f) => f.ativo).map((f) => ({ id: f.id, nome: f.nomeFantasia || f.razaoSocial, cnpj: f.cnpj })),
  ]);
  const [escopo, logos, certificados, captacao, emissao, servicos, cobranca, contas] = await Promise.all([
    escopoEmpresa().catch(() => null),
    logosComoDataUrl(empresas.map((e) => e.id)),
    resumosCertificados(empresas.flatMap((e) => [e.id, ...e.filiais.map((f) => f.id)])),
    estadoCaptacao(
      empresas.flatMap((e) => [
        { id: e.id, nome: e.nomeFantasia || e.razaoSocial, cnpj: e.cnpj, matriz: true },
        ...e.filiais.filter((f) => f.ativo).map((f) => ({ id: f.id, nome: f.nomeFantasia || f.razaoSocial, cnpj: f.cnpj, matriz: false })),
      ]),
    ),
    estadoEmissao(estabsAtivos),
    estadoEmissaoNfse(estabsAtivos),
    estadoCobranca(estabsAtivos),
    prisma.contaBancaria.findMany({ where: { empresaId: { in: estabsAtivos.map((e) => e.id) }, ativo: true }, select: { id: true, nome: true, empresaId: true }, orderBy: { nome: "asc" } }),
  ]);
  const ativasNoGrupo = empresas.filter((e) => e.ativo).length;

  return (
    <>
      <PageHeader
        titulo="Empresas e filiais"
        descricao={
          ctx.adminDoGrupo
            ? `${plural(ativasNoGrupo, "empresa ativa", "empresas ativas")} no grupo. Cada empresa tem CNPJ, contas bancárias, cadastros e lançamentos próprios; a troca entre elas é feita no seletor do menu.`
            : "Empresas que você administra, com as filiais delas."
        }
      >
        {ctx.adminDoGrupo && <BotaoNovaEmpresa tipo="matriz" />}
      </PageHeader>

      <div className="space-y-6">
        {empresas.map((e) => (
          <CartaoEmpresa key={e.id} empresa={e} ativa={escopo?.ativa.id === e.id} adminDoGrupo={ctx.adminDoGrupo} logo={logos[e.id] ?? null}
            certificados={certificados}
            captacao={captacao.filter((c) => c.empresaId === e.id || e.filiais.some((f) => f.id === c.empresaId))}
            emissao={emissao.filter((c) => c.empresaId === e.id || e.filiais.some((f) => f.id === c.empresaId))}
            servicos={servicos.filter((c) => c.empresaId === e.id || e.filiais.some((f) => f.id === c.empresaId))}
            cobranca={cobranca.filter((c) => c.empresaId === e.id || e.filiais.some((f) => f.id === c.empresaId))}
            contas={contas.filter((c) => c.empresaId === e.id || e.filiais.some((f) => f.id === c.empresaId))}
          />
        ))}
      </div>
    </>
  );
}
