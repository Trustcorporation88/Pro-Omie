import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoVazio, PageHeader } from "@/components/page-header";
import { Selo, SeloAtivo } from "@/components/selos";
import { AcoesUsuario, BotaoNovoUsuario } from "@/components/configuracoes/usuario-controles";
import { exigirUsuario } from "@/lib/auth/sessao";
import { ROTULO_PAPEL, type PapelUsuario } from "@/lib/auth/permissoes";
import { fmtDataHora } from "@/lib/format";
import { listarUsuarios } from "@/modules/configuracoes/consultas";
import { contextoAdmin, escopoEmpresa } from "@/lib/auth/empresa";

export const metadata: Metadata = { title: "Usuários" };

const TOM_PAPEL: Record<PapelUsuario, "roxo" | "info" | "neutro"> = {
  ADMIN: "roxo",
  FINANCEIRO: "info",
  VENDAS: "neutro",
  ESTOQUE: "neutro",
  CONTADOR: "neutro",
};

export default async function UsuariosPage() {
  const eu = await exigirUsuario("config:admin");
  const ctx = await contextoAdmin(eu.id);
  const [{ usuarios, adminsAtivos, empresas }, escopo] = await Promise.all([listarUsuarios(ctx), escopoEmpresa()]);
  const agora = new Date();

  return (
    <>
      <PageHeader titulo="Usuários" descricao="Quem acessa o Pro Omie, com qual papel, em quais empresas e em que situação.">
        <BotaoNovoUsuario empresas={empresas} empresaPadraoId={escopo.ativa.id} podeLiberarTodas={ctx.adminDoGrupo} />
      </PageHeader>

      {usuarios.length === 0 ? (
        <EstadoVazio titulo="Nenhum usuário cadastrado" descricao="Crie o primeiro usuário para liberar o acesso ao sistema.">
          <BotaoNovoUsuario empresas={empresas} empresaPadraoId={escopo.ativa.id} podeLiberarTodas={ctx.adminDoGrupo} />
        </EstadoVazio>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableCaption className="sr-only">Usuários do sistema</TableCaption>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Empresas</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u) => {
                const bloqueado = !!u.bloqueadoAte && u.bloqueadoAte > agora;
                const souEu = u.id === eu.id;
                return (
                  <TableRow key={u.id} className={u.ativo ? undefined : "opacity-60"}>
                    <TableCell>
                      <span className="font-medium">{u.nome}</span>
                      {souEu && <span className="ml-1.5 text-xs text-muted-foreground">(você)</span>}
                    </TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell>
                      <Selo tom={TOM_PAPEL[u.papel]}>
                        {u.papel === "ADMIN" ? (u.todasEmpresas ? "Administrador do grupo" : "Administrador da empresa") : ROTULO_PAPEL[u.papel]}
                      </Selo>
                    </TableCell>
                    <TableCell className="text-sm">
                      {u.todasEmpresas ? (
                        <span className="text-muted-foreground">Todas</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {u.empresas.map((id) => {
                            const e = empresas.find((x) => x.id === id);
                            return e ? (
                              <Selo key={id} tom="neutro">
                                {e.nome}
                              </Selo>
                            ) : null;
                          })}
                          {u.empresas.length === 0 && <span className="text-destructive">Nenhuma</span>}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <SeloAtivo ativo={u.ativo} />
                        {bloqueado && u.bloqueadoAte && <Selo tom="alerta">Bloqueado até {fmtDataHora(u.bloqueadoAte)}</Selo>}
                        {u.trocarSenha && <Selo tom="info">Troca de senha pendente</Selo>}
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-sm">
                      {u.ultimoAcesso ? fmtDataHora(u.ultimoAcesso) : <span className="text-muted-foreground">Nunca acessou</span>}
                    </TableCell>
                    <TableCell>
                      <AcoesUsuario
                        empresas={empresas}
                        podeLiberarTodas={ctx.adminDoGrupo}
                        usuario={{
                          id: u.id,
                          nome: u.nome,
                          email: u.email,
                          papel: u.papel,
                          ativo: u.ativo,
                          todasEmpresas: u.todasEmpresas,
                          empresas: u.empresas,
                          bloqueado,
                          tentativasFalhas: u.tentativasFalhas,
                          souEu,
                          ultimoAdminAtivo: u.papel === "ADMIN" && u.todasEmpresas && u.ativo && adminsAtivos <= 1,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{usuarios.length} usuário(s)</p>
    </>
  );
}
