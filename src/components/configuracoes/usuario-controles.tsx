"use client";

import { useRef, useState } from "react";
import { Ellipsis, KeyRound, LockOpen, Pencil, Plus, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmarAcao } from "@/components/confirmar-acao";
import { FormularioUsuario } from "./usuario-form";
import { SenhaProvisoriaDialog } from "./senha-provisoria-dialog";
import { definirAtivoUsuario, desbloquearUsuario, redefinirSenhaUsuario } from "@/modules/configuracoes/acoes";
import type { EmpresaOpcao, SegredoExibido, UsuarioAcao } from "@/modules/configuracoes/tipos";

/** "Novo usuário": abre o formulário e, depois de criar, mostra a senha provisória uma única vez. */
/** Novo usuário nasce com acesso só à empresa ativa (o admin marca "todas" se quiser). */
export function BotaoNovoUsuario({
  empresas,
  empresaPadraoId,
  podeLiberarTodas,
}: {
  empresas: EmpresaOpcao[];
  empresaPadraoId?: string;
  /** só o administrador do grupo libera "todas as empresas" */
  podeLiberarTodas: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [chave, setChave] = useState(0);
  const [segredo, setSegredo] = useState<SegredoExibido | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const voltarFoco = () => botao.current?.focus();
  return (
    <>
      <Button
        ref={botao}
        onClick={() => {
          setChave((k) => k + 1); // formulário limpo a cada abertura
          setAberto(true);
        }}
      >
        <Plus /> Novo usuário
      </Button>
      {aberto && (
        <FormularioUsuario
          key={chave}
          id={null}
          iniciais={{
            nome: "",
            email: "",
            papel: "FINANCEIRO",
            todasEmpresas: !empresaPadraoId,
            empresas: empresaPadraoId ? [empresaPadraoId] : [],
          }}
          empresasDisponiveis={empresas}
          podeLiberarTodas={podeLiberarTodas}
          aberto={aberto}
          onAbertoChange={setAberto}
          aoCriar={setSegredo}
          retornarFoco={voltarFoco}
        />
      )}
      {segredo && <SenhaProvisoriaDialog segredo={segredo} onFechar={() => setSegredo(null)} retornarFoco={voltarFoco} />}
    </>
  );
}

function Dica({ children }: { children: React.ReactNode }) {
  return <span className="ml-auto pl-3 text-xs font-normal text-muted-foreground">{children}</span>;
}

/** Menu de ações da linha: editar, redefinir senha, desbloquear e inativar/reativar. */
export function AcoesUsuario({ usuario: u, empresas, podeLiberarTodas }: { usuario: UsuarioAcao; empresas: EmpresaOpcao[]; podeLiberarTodas: boolean }) {
  const [editar, setEditar] = useState(false);
  const [redefinir, setRedefinir] = useState(false);
  const [desbloquear, setDesbloquear] = useState(false);
  const [alternar, setAlternar] = useState(false);
  const [segredo, setSegredo] = useState<SegredoExibido | null>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const voltarFoco = () => gatilho.current?.focus();

  const podeDesbloquear = u.bloqueado || u.tentativasFalhas > 0;
  // O servidor aplica as mesmas regras; aqui só evitamos oferecer ações que seriam recusadas.
  const motivoNaoInativar = u.ativo ? (u.souEu ? "você" : u.ultimoAdminAtivo ? "único admin do grupo" : null) : null;
  const papelTravado = u.souEu
    ? "Você não pode alterar o seu próprio papel."
    : u.ultimoAdminAtivo
      ? "É o único administrador do grupo ativo. Promova outro usuário a administrador do grupo antes de alterar este papel."
      : undefined;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={gatilho} variant="ghost" size="icon" className="size-8" aria-label={`Ações de ${u.nome}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onSelect={() => setEditar(true)}>
            <Pencil /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem disabled={u.souEu} onSelect={() => setRedefinir(true)}>
            <KeyRound /> Redefinir senha {u.souEu && <Dica>use “Trocar senha”</Dica>}
          </DropdownMenuItem>
          {podeDesbloquear && (
            <DropdownMenuItem onSelect={() => setDesbloquear(true)}>
              <LockOpen /> Desbloquear
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={motivoNaoInativar !== null} onSelect={() => setAlternar(true)}>
            <Power /> {u.ativo ? "Inativar" : "Reativar"} {motivoNaoInativar && <Dica>{motivoNaoInativar}</Dica>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editar && (
        <FormularioUsuario
          id={u.id}
          iniciais={{ nome: u.nome, email: u.email, papel: u.papel, todasEmpresas: u.todasEmpresas, empresas: u.empresas }}
          empresasDisponiveis={empresas}
          podeLiberarTodas={podeLiberarTodas}
          papelTravado={papelTravado}
          aberto={editar}
          onAbertoChange={setEditar}
          retornarFoco={voltarFoco}
        />
      )}

      <ConfirmarAcao
        aberto={redefinir}
        onAbertoChange={setRedefinir}
        titulo={`Redefinir a senha de ${u.nome}?`}
        descricao="Será gerada uma nova senha provisória, exibida uma única vez. As sessões abertas deste usuário serão encerradas e ele precisará criar uma nova senha no próximo acesso."
        rotuloConfirmar="Redefinir senha"
        acao={async () => {
          const r = await redefinirSenhaUsuario(u.id);
          if (r.ok && r.data) setSegredo({ tipo: "redefinida", nome: r.data.nome, email: r.data.email, senha: r.data.senhaProvisoria });
          return r;
        }}
      />

      <ConfirmarAcao
        aberto={desbloquear}
        onAbertoChange={setDesbloquear}
        titulo={`Desbloquear ${u.nome}?`}
        descricao="Zera as tentativas de acesso malsucedidas e libera o login imediatamente."
        rotuloConfirmar="Desbloquear"
        acao={() => desbloquearUsuario(u.id)}
      />

      <ConfirmarAcao
        aberto={alternar}
        onAbertoChange={setAlternar}
        titulo={u.ativo ? `Inativar ${u.nome}?` : `Reativar ${u.nome}?`}
        descricao={
          u.ativo
            ? "O acesso é bloqueado agora e as sessões abertas são encerradas. O histórico do usuário é mantido."
            : "O usuário volta a poder entrar com a senha atual. Se preferir, redefina a senha em seguida."
        }
        rotuloConfirmar={u.ativo ? "Inativar" : "Reativar"}
        acao={() => definirAtivoUsuario(u.id, !u.ativo)}
      />

      {segredo && <SenhaProvisoriaDialog segredo={segredo} onFechar={() => setSegredo(null)} retornarFoco={voltarFoco} />}
    </>
  );
}
