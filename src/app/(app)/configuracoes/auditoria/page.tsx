import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { Paginacao } from "@/components/filtros";
import { Selo } from "@/components/selos";
import { FiltrosAuditoria } from "@/components/configuracoes/auditoria-filtros";
import { BotaoDetalheAuditoria } from "@/components/configuracoes/auditoria-detalhe";
import { exigirUsuario } from "@/lib/auth/sessao";
import { POR_PAGINA_AUDITORIA, lerFiltrosAuditoria, listarAuditoria, opcoesFiltroAuditoria } from "@/modules/configuracoes/consultas";
import { rotuloAcao, rotuloEntidade, tomAcao } from "@/modules/configuracoes/auditoria-util";

export const metadata: Metadata = { title: "Auditoria" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AuditoriaPage({ searchParams }: Props) {
  await exigirUsuario("config:admin");
  const filtros = lerFiltrosAuditoria(await searchParams);
  const [{ registros, total, pagina }, opcoes] = await Promise.all([listarAuditoria(filtros), opcoesFiltroAuditoria()]);
  const filtrando = Boolean(filtros.q || filtros.entidade || filtros.usuario || filtros.de || filtros.ate);

  return (
    <>
      <PageHeader titulo="Auditoria" descricao="Trilha de quem fez o quê e quando: criações, alterações, exclusões e acessos." />

      <FiltrosAuditoria entidades={opcoes.entidades} usuarios={opcoes.usuarios} />

      {registros.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum registro encontrado"
          descricao={
            filtrando
              ? "Nenhum registro corresponde aos filtros atuais. Ajuste a busca, o período ou use “Limpar filtros”."
              : "As ações realizadas no sistema aparecerão aqui."
          }
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableCaption className="sr-only">Registros de auditoria, do mais recente para o mais antigo</TableCaption>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Data/hora</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>Resumo</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Detalhes</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registros.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular text-sm">{r.dataHora}</TableCell>
                  <TableCell className="text-sm">
                    {r.usuario ? (
                      <span title={r.usuario.email}>{r.usuario.nome}</span>
                    ) : (
                      <span className="text-muted-foreground">Sistema</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Selo tom={tomAcao(r.acao)}>{rotuloAcao(r.acao)}</Selo>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{rotuloEntidade(r.entidade)}</div>
                    {r.entidadeId && (
                      <div className="max-w-[9rem] truncate font-mono text-[11px] text-muted-foreground" title={r.entidadeId}>
                        {r.entidadeId}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.resumo ? (
                      <div className="max-w-md truncate" title={r.resumo}>
                        {r.resumo}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.ip ?? "—"}</TableCell>
                  <TableCell>
                    <BotaoDetalheAuditoria registro={r} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Paginacao pagina={pagina} total={total} porPagina={POR_PAGINA_AUDITORIA} />
    </>
  );
}
