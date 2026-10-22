"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { executar, tratarErro, type Resultado } from "@/lib/acoes";
import { auditar } from "@/lib/auditoria";
import { hojeDate } from "@/lib/datas";
import { soDigitos, validarCNPJ } from "@/lib/format";
import { buscarCep, buscarCnpj, type DadosCep, type DadosCnpj } from "@/lib/consultas-externas";
import {
  ErroAcao,
  conferirSenha,
  criarSessao,
  encerrarSessao,
  exigirUsuario,
  hashSenha,
  usuarioAtual,
} from "@/lib/auth/sessao";
import { criarDadosPadrao } from "@/modules/setup/dados-padrao";

const HASH_FALSO = "$2b$11$C6UzMDM.H6dfI/f/IKcEeO4cG9r3bXQe0Lr1yH1x8XcZr3QfQz1aW";
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MIN = 15;

function destinoSeguro(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/login") ? s : "/";
}

export async function entrar(_prev: Resultado | null, formData: FormData): Promise<Resultado> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  if (!email || !senha) return { ok: false, erro: "Informe e-mail e senha." };

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.ativo) {
    await conferirSenha(senha, HASH_FALSO); // tempo de resposta constante
    return { ok: false, erro: "E-mail ou senha incorretos." };
  }
  if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
    const min = Math.ceil((usuario.bloqueadoAte.getTime() - Date.now()) / 60_000);
    return { ok: false, erro: `Acesso bloqueado por excesso de tentativas. Tente novamente em ${min} min.` };
  }
  const confere = await conferirSenha(senha, usuario.senhaHash);
  if (!confere) {
    const tentativas = usuario.tentativasFalhas + 1;
    const bloquear = tentativas >= MAX_TENTATIVAS;
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        tentativasFalhas: bloquear ? 0 : tentativas,
        bloqueadoAte: bloquear ? new Date(Date.now() + BLOQUEIO_MIN * 60_000) : null,
      },
    });
    await auditar("login_falhou", "usuario", usuario.id, bloquear ? "Bloqueado por excesso de tentativas" : undefined, undefined, {
      usuarioId: usuario.id,
    });
    return {
      ok: false,
      erro: bloquear
        ? `Muitas tentativas. Acesso bloqueado por ${BLOQUEIO_MIN} minutos.`
        : "E-mail ou senha incorretos.",
    };
  }
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { tentativasFalhas: 0, bloqueadoAte: null, ultimoAcesso: new Date() },
  });
  await criarSessao(usuario);
  await auditar("login", "usuario", usuario.id, undefined, undefined, { usuarioId: usuario.id });
  redirect(usuario.trocarSenha ? "/trocar-senha" : destinoSeguro(formData.get("voltar")));
}

export async function sair() {
  const u = await usuarioAtual();
  if (u) await auditar("logout", "usuario", u.id);
  await encerrarSessao();
  redirect("/login");
}

// ───────────── Configuração inicial ─────────────

function tokenConfere(token: string): boolean {
  const esperado = process.env.SETUP_TOKEN;
  if (!esperado || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function setupDisponivel(token: string): Promise<"ok" | "concluido" | "token"> {
  if ((await prisma.usuario.count()) > 0) return "concluido";
  return tokenConfere(token) ? "ok" : "token";
}

const senhaForte = z
  .string()
  .min(10, "A senha precisa ter pelo menos 10 caracteres.")
  .regex(/[A-Za-z]/, "A senha precisa ter letras.")
  .regex(/\d/, "A senha precisa ter números.");

const esquemaSetup = z
  .object({
    cnpj: z.string().refine((v) => validarCNPJ(v), "CNPJ inválido."),
    razaoSocial: z.string().trim().min(2, "Informe a razão social."),
    nomeFantasia: z.string().trim().optional(),
    regimeTributario: z.enum(["MEI", "SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"]),
    inscricaoEstadual: z.string().trim().optional(),
    inscricaoMunicipal: z.string().trim().optional(),
    cep: z.string().trim().optional(),
    logradouro: z.string().trim().optional(),
    numero: z.string().trim().optional(),
    complemento: z.string().trim().optional(),
    bairro: z.string().trim().optional(),
    cidade: z.string().trim().optional(),
    uf: z.string().trim().max(2).optional(),
    codigoMunicipio: z.string().trim().optional(),
    cnae: z.string().trim().optional(),
    emailEmpresa: z.string().trim().optional(),
    telefone: z.string().trim().optional(),
    nome: z.string().trim().min(2, "Informe seu nome."),
    email: z.email("E-mail inválido.").transform((v) => v.toLowerCase()),
    senha: senhaForte,
    confirmar: z.string(),
  })
  .refine((d) => d.senha === d.confirmar, { message: "As senhas não conferem.", path: ["confirmar"] });

export async function configurarInicial(_prev: Resultado | null, formData: FormData): Promise<Resultado> {
  const token = String(formData.get("token") ?? "");
  const status = await setupDisponivel(token);
  if (status === "concluido") return { ok: false, erro: "A configuração inicial já foi concluída. Faça login." };
  if (status === "token") return { ok: false, erro: "Link de configuração inválido." };

  let usuarioId = "";
  try {
    const d = esquemaSetup.parse(Object.fromEntries(formData));
    const hoje = hojeDate();
    const senhaHash = await hashSenha(d.senha);
    const vazio = (s?: string) => (s && s.length ? s : null);
    const u = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          cnpj: soDigitos(d.cnpj),
          razaoSocial: d.razaoSocial,
          nomeFantasia: vazio(d.nomeFantasia),
          regimeTributario: d.regimeTributario,
          inscricaoEstadual: vazio(d.inscricaoEstadual),
          inscricaoMunicipal: vazio(d.inscricaoMunicipal),
          cep: vazio(soDigitos(d.cep)),
          logradouro: vazio(d.logradouro),
          numero: vazio(d.numero),
          complemento: vazio(d.complemento),
          bairro: vazio(d.bairro),
          cidade: vazio(d.cidade),
          uf: vazio(d.uf?.toUpperCase()),
          codigoMunicipio: vazio(d.codigoMunicipio),
          cnae: vazio(d.cnae),
          email: vazio(d.emailEmpresa),
          telefone: vazio(soDigitos(d.telefone)),
        },
      });
      const usuario = await tx.usuario.create({
        data: { nome: d.nome, email: d.email, senhaHash, papel: "ADMIN" },
      });
      await criarDadosPadrao(tx, empresa.id, hoje);
      return usuario;
    });
    usuarioId = u.id;
    await criarSessao(u);
    await auditar("configuracao_inicial", "empresa", null, "Empresa, administrador e cadastros padrão criados", undefined, {
      usuarioId: u.id,
    });
  } catch (e) {
    return tratarErro(e);
  }
  if (usuarioId) redirect("/");
  return { ok: false, erro: "Não foi possível concluir." };
}

/** Consulta CNPJ/CEP: exige sessão, ou token de configuração válido enquanto não houver usuários. */
async function autorizarConsulta(tokenSetup?: string) {
  if (await usuarioAtual()) return;
  if (tokenSetup && (await setupDisponivel(tokenSetup)) === "ok") return;
  throw new ErroAcao("Não autorizado.");
}

export async function consultarCnpj(cnpj: string, tokenSetup?: string): Promise<Resultado<DadosCnpj>> {
  return executar(async () => {
    await autorizarConsulta(tokenSetup);
    if (!validarCNPJ(cnpj)) throw new ErroAcao("CNPJ inválido.");
    const r = await buscarCnpj(cnpj);
    if (!r.ok) throw new ErroAcao(r.motivo);
    return r.dados;
  });
}

export async function consultarCep(cep: string, tokenSetup?: string): Promise<Resultado<DadosCep>> {
  return executar(async () => {
    await autorizarConsulta(tokenSetup);
    const dados = await buscarCep(cep);
    if (!dados) throw new ErroAcao("CEP não encontrado.");
    return dados;
  });
}

// ───────────── Troca de senha ─────────────

const esquemaTroca = z
  .object({ atual: z.string().min(1, "Informe a senha atual."), nova: senhaForte, confirmar: z.string() })
  .refine((d) => d.nova === d.confirmar, { message: "As senhas não conferem.", path: ["confirmar"] })
  .refine((d) => d.nova !== d.atual, { message: "A nova senha deve ser diferente da atual.", path: ["nova"] });

export async function trocarSenha(_prev: Resultado | null, formData: FormData): Promise<Resultado> {
  const sessao = await exigirUsuario(undefined, { permitirTrocaSenha: true });
  try {
    const d = esquemaTroca.parse(Object.fromEntries(formData));
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id: sessao.id } });
    if (!(await conferirSenha(d.atual, u.senhaHash))) throw new ErroAcao("Senha atual incorreta.", { atual: "Senha atual incorreta." });
    const atualizado = await prisma.usuario.update({
      where: { id: u.id },
      data: { senhaHash: await hashSenha(d.nova), trocarSenha: false, versaoSessao: { increment: 1 } },
    });
    await criarSessao(atualizado);
    await auditar("trocar_senha", "usuario", u.id);
  } catch (e) {
    return tratarErro(e);
  }
  redirect("/");
}
