// Consultas das telas de Administração. Uso exclusivo de servidor (Prisma).
import type { Empresa } from "@/generated/prisma/client";
import type { ContextoAdmin } from "@/lib/auth/empresa";
import { prisma, Prisma } from "@/lib/db";
import { dateParaISO, ehISOValido, isoParaDate } from "@/lib/datas";
import { fmtCep, fmtDataHora, fmtDocumento, fmtTelefone } from "@/lib/format";
import { fmtCnae } from "./formatos";
import { limitesCriadoEm } from "./periodo";
import { fmtDataHoraCompleta, ocultarSensiveis, rotuloEntidade } from "./auditoria-util";
import type { FiltrosAuditoria, RegistroAuditoria, ValoresEmpresa } from "./tipos";

// ───────────── Empresa e filiais ─────────────

/** Usuários que o administrador gerencia: todos (grupo) ou só os restritos às empresas dele (administrador de empresa). */
export async function filtroUsuariosAdministrados(ctx: ContextoAdmin): Promise<Prisma.UsuarioWhereInput> {
  if (ctx.adminDoGrupo) return {};
  const outras = (await prisma.empresa.findMany({ where: { matrizId: null, id: { notIn: ctx.matrizes } }, select: { id: true } })).map((e) => e.id);
  return { todasEmpresas: false, empresas: { isEmpty: false }, ...(outras.length ? { NOT: { empresas: { hasSome: outras } } } : {}) };
}

/** Empresas do grupo (matrizes) com suas filiais, ativas primeiro e da mais antiga para a mais nova. Administrador de empresa vê só as dele. */
export function listarEmpresasDoGrupo(ctx: ContextoAdmin) {
  return prisma.empresa.findMany({
    where: { matrizId: null, ...(ctx.adminDoGrupo ? {} : { id: { in: ctx.matrizes } }) },
    orderBy: [{ ativo: "desc" }, { createdAt: "asc" }],
    include: { filiais: { orderBy: [{ ativo: "desc" }, { razaoSocial: "asc" }] } },
  });
}

/** Converte a empresa do banco em valores de formulário (texto formatado, sem Date). */
export function empresaParaValores(e: Empresa): ValoresEmpresa {
  return {
    razaoSocial: e.razaoSocial,
    nomeFantasia: e.nomeFantasia ?? "",
    cnpj: fmtDocumento(e.cnpj),
    inscricaoEstadual: e.inscricaoEstadual ?? "",
    inscricaoMunicipal: e.inscricaoMunicipal ?? "",
    regimeTributario: e.regimeTributario,
    cnae: fmtCnae(e.cnae),
    email: e.email ?? "",
    telefone: fmtTelefone(e.telefone),
    cep: fmtCep(e.cep),
    logradouro: e.logradouro ?? "",
    numero: e.numero ?? "",
    complemento: e.complemento ?? "",
    bairro: e.bairro ?? "",
    cidade: e.cidade ?? "",
    uf: e.uf ?? "",
    codigoMunicipio: e.codigoMunicipio ?? "",
  };
}

// ───────────── Usuários ─────────────

export async function listarUsuarios(ctx: ContextoAdmin) {
  const filtro = await filtroUsuariosAdministrados(ctx);
  const [usuarios, adminsAtivos, matrizes] = await Promise.all([
    prisma.usuario.findMany({
      where: filtro,
      // senhaHash nunca sai do servidor: nada de selecionar o registro inteiro.
      select: {
        id: true,
        nome: true,
        email: true,
        papel: true,
        ativo: true,
        trocarSenha: true,
        ultimoAcesso: true,
        tentativasFalhas: true,
        bloqueadoAte: true,
        todasEmpresas: true,
        empresas: true,
      },
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    }),
    // administradores do grupo ativos (o grupo nunca pode ficar sem nenhum)
    prisma.usuario.count({ where: { papel: "ADMIN", todasEmpresas: true, ativo: true } }),
    prisma.empresa.findMany({
      where: { matrizId: null, ativo: true, ...(ctx.adminDoGrupo ? {} : { id: { in: ctx.matrizes } }) },
      orderBy: { createdAt: "asc" },
      select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true },
    }),
  ]);
  const empresas = matrizes.map((m) => ({ id: m.id, nome: m.nomeFantasia || m.razaoSocial, cnpj: m.cnpj }));
  return { usuarios, adminsAtivos, empresas };
}

// ───────────── Auditoria ─────────────

export const POR_PAGINA_AUDITORIA = 50;

type ParametrosBusca = Record<string, string | string[] | undefined>;

/** Dia real do calendário: rejeita, por exemplo, 2025-02-30 (que `Date` aceitaria e "rolaria" para março). */
const diaValido = (s: string) => ehISOValido(s) && dateParaISO(isoParaDate(s)) === s;

/** Primeiro valor do parâmetro, sem bytes nulos (o Postgres rejeita \0 em texto). */
const primeiro = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").replaceAll("\0", "");

/** Lê e saneia os filtros da URL (q, entidade, usuario, de, ate, pagina). */
export function lerFiltrosAuditoria(sp: ParametrosBusca): FiltrosAuditoria {
  const de = primeiro(sp.de).trim();
  const ate = primeiro(sp.ate).trim();
  const numeroPagina = Math.floor(Number(primeiro(sp.pagina)));
  return {
    q: primeiro(sp.q).trim().slice(0, 200),
    entidade: primeiro(sp.entidade).trim().slice(0, 100),
    usuario: primeiro(sp.usuario).trim().slice(0, 100),
    de: diaValido(de) ? de : "",
    ate: diaValido(ate) ? ate : "",
    pagina: Number.isFinite(numeroPagina) ? Math.min(Math.max(numeroPagina, 1), 1_000_000) : 1,
  };
}

const contem = (q: string) => ({ contains: q, mode: "insensitive" as const });

export async function listarAuditoria(filtros: FiltrosAuditoria, ctx: ContextoAdmin) {
  const { q, entidade, usuario, de, ate } = filtros;
  const criadoEm = limitesCriadoEm(de, ate);
  const where: Prisma.AuditoriaWhereInput = {
    // administrador de empresa vê só os eventos das empresas dele; os do grupo (nulos) ficam com o administrador do grupo
    ...(ctx.adminDoGrupo ? {} : { empresaId: { in: ctx.matrizes } }),
    ...(q ? { OR: [{ resumo: contem(q) }, { entidade: contem(q) }, { entidadeId: contem(q) }] } : {}),
    ...(entidade ? { entidade } : {}),
    ...(usuario === "sistema" ? { usuarioId: null } : usuario ? { usuarioId: usuario } : {}),
    ...(criadoEm ? { createdAt: criadoEm } : {}),
  };

  const buscar = (pagina: number) =>
    prisma.auditoria.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (pagina - 1) * POR_PAGINA_AUDITORIA,
      take: POR_PAGINA_AUDITORIA,
      include: { usuario: { select: { nome: true, email: true } } },
    });

  let pagina = filtros.pagina;
  const [primeiraLeitura, total] = await Promise.all([buscar(pagina), prisma.auditoria.count({ where })]);
  let linhas = primeiraLeitura;
  const ultimaPagina = Math.max(1, Math.ceil(total / POR_PAGINA_AUDITORIA));
  if (pagina > ultimaPagina) {
    // página fora do intervalo (ex.: link antigo): mostra a última
    pagina = ultimaPagina;
    linhas = await buscar(pagina);
  }

  const registros: RegistroAuditoria[] = linhas.map((l) => ({
    id: l.id,
    dataHora: fmtDataHora(l.createdAt),
    dataHoraCompleta: fmtDataHoraCompleta(l.createdAt),
    usuario: l.usuario ? { nome: l.usuario.nome, email: l.usuario.email } : null,
    acao: l.acao,
    entidade: l.entidade,
    entidadeId: l.entidadeId,
    resumo: l.resumo,
    ip: l.ip,
    // Defesa em profundidade: hashes e senhas nunca chegam ao navegador, mesmo que algum módulo os tenha gravado.
    dados: l.dados === null ? null : ocultarSensiveis(l.dados),
  }));

  return { registros, total, pagina };
}

/** Opções dos selects de filtro: entidades distintas existentes e usuários. */
export async function opcoesFiltroAuditoria(ctx: ContextoAdmin) {
  const [entidades, usuarios] = await Promise.all([
    prisma.auditoria.groupBy({
      by: ["entidade"],
      where: ctx.adminDoGrupo ? {} : { empresaId: { in: ctx.matrizes } },
      orderBy: { entidade: "asc" },
    }),
    prisma.usuario.findMany({
      where: await filtroUsuariosAdministrados(ctx),
      select: { id: true, nome: true, email: true, ativo: true },
      orderBy: { nome: "asc" },
    }),
  ]);
  return {
    entidades: entidades.map((e) => ({ valor: e.entidade, rotulo: rotuloEntidade(e.entidade) })),
    usuarios: [
      { valor: "sistema", rotulo: "Sistema (sem usuário)" },
      ...usuarios.map((u) => ({ valor: u.id, rotulo: `${u.nome} (${u.email})${u.ativo ? "" : " · inativo"}` })),
    ],
  };
}
