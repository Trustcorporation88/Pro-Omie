import { escopoEmpresa } from "@/lib/auth/empresa";
import { prisma, Prisma } from "@/lib/db";
import { Selo, SeloAtivo } from "@/components/selos";
import { fmtCep, fmtDocumento, fmtMoeda, fmtNumero, fmtTelefone } from "@/lib/format";
import { ROTULOS, type Opcao } from "@/lib/rotulos";
import { iso, num, numOuNull } from "@/lib/serial";
import type { EntidadeCadastro } from "./campos";

const br = (d: Date) => (iso(d) ?? "").split("-").reverse().join("/");

export type Valores = Record<string, string | number | boolean | null>;
export type LinhaCadastro = { id: string; ativo: boolean; rotulo: string; valores: Valores; celulas: React.ReactNode[] };
export type Coluna = { titulo: string; classe?: string };
export type Listagem = { colunas: Coluna[]; linhas: LinhaCadastro[]; total: number };
export type FiltroCadastro = { q: string; status: string; pagina: number; porPagina: number; extra: Record<string, string | undefined> };

const ins = (q: string) => ({ contains: q, mode: "insensitive" as const });
const statusWhere = (s: string) => (s === "inativos" ? { ativo: false } : s === "todos" ? {} : { ativo: true });
const pag = (f: FiltroCadastro) => ({ skip: (f.pagina - 1) * f.porPagina, take: f.porPagina });
const sub = (texto?: string | null) => (texto ? <div className="text-xs text-muted-foreground">{texto}</div> : null);

export async function listarCadastro(entidade: EntidadeCadastro, f: FiltroCadastro): Promise<Listagem> {
  // Cadastros pertencem à empresa (matriz) ativa; as filiais usam os da matriz.
  const escopo = await escopoEmpresa();
  const daEmpresa = { empresaId: escopo.ativa.id };
  switch (entidade) {
    case "pessoas": {
      const digitos = f.q.replace(/\D/g, "");
      const where: Prisma.PessoaWhereInput = {
        ...daEmpresa,
        ...statusWhere(f.status),
        ...(f.extra.papel === "clientes" ? { cliente: true } : f.extra.papel === "fornecedores" ? { fornecedor: true } : {}),
        ...(f.q
          ? { OR: [{ nome: ins(f.q) }, { nomeFantasia: ins(f.q) }, { email: ins(f.q) }, ...(digitos.length >= 3 ? [{ documento: { contains: digitos } }] : [])] }
          : {}),
      };
      const [rows, total] = await Promise.all([prisma.pessoa.findMany({ where, orderBy: { nome: "asc" }, ...pag(f) }), prisma.pessoa.count({ where })]);
      return {
        total,
        colunas: [{ titulo: "Nome" }, { titulo: "CNPJ/CPF" }, { titulo: "Tipo" }, { titulo: "Cidade" }, { titulo: "Contato" }, { titulo: "Situação" }],
        linhas: rows.map((p) => ({
          id: p.id,
          ativo: p.ativo,
          rotulo: p.nome,
          valores: {
            tipoPessoa: p.tipoPessoa,
            documento: fmtDocumento(p.documento),
            nome: p.nome,
            nomeFantasia: p.nomeFantasia,
            cliente: p.cliente,
            fornecedor: p.fornecedor,
            indicadorIE: p.indicadorIE,
            inscricaoEstadual: p.inscricaoEstadual,
            inscricaoMunicipal: p.inscricaoMunicipal,
            email: p.email,
            telefone: fmtTelefone(p.telefone),
            contato: p.contato,
            cep: fmtCep(p.cep),
            logradouro: p.logradouro,
            numero: p.numero,
            complemento: p.complemento,
            bairro: p.bairro,
            cidade: p.cidade,
            uf: p.uf,
            codigoMunicipio: p.codigoMunicipio,
            limiteCredito: numOuNull(p.limiteCredito),
            observacoes: p.observacoes,
          },
          celulas: [
            <div key="n">
              <div className="font-medium">{p.nome}</div>
              {sub(p.nomeFantasia)}
            </div>,
            <span key="d" className="tabular text-sm">{fmtDocumento(p.documento) || "—"}</span>,
            <div key="t" className="flex gap-1">
              {p.cliente && <Selo tom="info">Cliente</Selo>}
              {p.fornecedor && <Selo tom="roxo">Fornecedor</Selo>}
            </div>,
            <span key="c" className="text-sm">{p.cidade ? `${p.cidade}/${p.uf ?? ""}` : "—"}</span>,
            <div key="ct" className="text-sm">
              {p.email ?? "—"}
              {sub(fmtTelefone(p.telefone))}
            </div>,
            <SeloAtivo key="s" ativo={p.ativo} />,
          ],
        })),
      };
    }
    case "produtos": {
      const where: Prisma.ProdutoWhereInput = {
        ...daEmpresa,
        ...statusWhere(f.status),
        ...(f.extra.tipo === "PRODUTO" || f.extra.tipo === "SERVICO" ? { tipo: f.extra.tipo } : {}),
        ...(f.q ? { OR: [{ descricao: ins(f.q) }, { codigo: ins(f.q) }, { ncm: { contains: f.q } }] } : {}),
      };
      const [rows, total] = await Promise.all([prisma.produto.findMany({ where, orderBy: { descricao: "asc" }, ...pag(f) }), prisma.produto.count({ where })]);
      return {
        total,
        colunas: [{ titulo: "Código" }, { titulo: "Descrição" }, { titulo: "Un." }, { titulo: "NCM / LC 116" }, { titulo: "Preço de venda", classe: "text-right" }, { titulo: "Custo", classe: "text-right" }, { titulo: "Situação" }],
        linhas: rows.map((p) => ({
          id: p.id,
          ativo: p.ativo,
          rotulo: p.descricao,
          valores: {
            tipo: p.tipo,
            codigo: p.codigo,
            descricao: p.descricao,
            unidade: p.unidade,
            gtin: p.gtin,
            ncm: p.ncm,
            cest: p.cest,
            origem: String(p.origem),
            codigoServico: p.codigoServico,
            precoVenda: num(p.precoVenda),
            precoCusto: num(p.precoCusto),
            controlaEstoque: p.controlaEstoque,
            grupoMaterial: p.grupoMaterial,
            estoqueMinimo: numOuNull(p.estoqueMinimo),
            estoqueMaximo: numOuNull(p.estoqueMaximo),
            observacoes: p.observacoes,
            cfopInterno: p.cfopInterno,
            cfopInterestadual: p.cfopInterestadual,
            csosnInterno: p.csosnInterno,
            csosnInterestadual: p.csosnInterestadual,
            textoFiscal: p.textoFiscal,
            codigoTributacaoNacional: p.codigoTributacaoNacional,
            codigoTributacaoMunicipal: p.codigoTributacaoMunicipal,
            codigoNbs: p.codigoNbs,
          },
          celulas: [
            <span key="c" className="font-mono text-xs">{p.codigo}</span>,
            <div key="d">
              <div className="font-medium">{p.descricao}</div>
              {sub(
                p.grupoMaterial && p.grupoMaterial in ROTULOS.grupoMaterial
                  ? `${ROTULOS.tipoProduto[p.tipo]} · ${ROTULOS.grupoMaterial[p.grupoMaterial as keyof typeof ROTULOS.grupoMaterial]}`
                  : ROTULOS.tipoProduto[p.tipo],
              )}
            </div>,
            p.unidade,
            <span key="n" className="tabular text-sm">{p.tipo === "SERVICO" ? p.codigoServico ?? "—" : p.ncm ?? "—"}</span>,
            <span key="pv" className="tabular">{fmtMoeda(num(p.precoVenda))}</span>,
            <span key="pc" className="tabular text-muted-foreground">{fmtNumero(num(p.precoCusto))}</span>,
            <SeloAtivo key="s" ativo={p.ativo} />,
          ],
        })),
      };
    }
    case "categorias": {
      const where: Prisma.CategoriaWhereInput = {
        ...daEmpresa,
        ...statusWhere(f.status),
        ...(f.extra.tipo === "RECEITA" || f.extra.tipo === "DESPESA" ? { tipo: f.extra.tipo } : {}),
        ...(f.q ? { OR: [{ nome: ins(f.q) }, { codigo: { contains: f.q } }] } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.categoria.findMany({ where, orderBy: [{ tipo: "desc" }, { codigo: "asc" }, { nome: "asc" }], ...pag(f) }),
        prisma.categoria.count({ where }),
      ]);
      return {
        total,
        colunas: [{ titulo: "Código" }, { titulo: "Nome" }, { titulo: "Tipo" }, { titulo: "Grupo da DRE" }, { titulo: "Situação" }],
        linhas: rows.map((c) => ({
          id: c.id,
          ativo: c.ativo,
          rotulo: c.nome,
          valores: { nome: c.nome, codigo: c.codigo, tipo: c.tipo, grupoDre: c.grupoDre },
          celulas: [
            <span key="c" className="font-mono text-xs">{c.codigo ?? "—"}</span>,
            <span key="n" className="font-medium">{c.nome}</span>,
            <Selo key="t" tom={c.tipo === "RECEITA" ? "sucesso" : "perigo"}>{ROTULOS.tipoCategoria[c.tipo]}</Selo>,
            <span key="g" className="text-sm text-muted-foreground">{ROTULOS.grupoDre[c.grupoDre]}</span>,
            <SeloAtivo key="s" ativo={c.ativo} />,
          ],
        })),
      };
    }
    case "centros-de-custo": {
      const where: Prisma.CentroCustoWhereInput = { ...daEmpresa, ...statusWhere(f.status), ...(f.q ? { OR: [{ nome: ins(f.q) }, { codigo: { contains: f.q } }] } : {}) };
      const [rows, total] = await Promise.all([prisma.centroCusto.findMany({ where, orderBy: [{ codigo: "asc" }, { nome: "asc" }], ...pag(f) }), prisma.centroCusto.count({ where })]);
      return {
        total,
        colunas: [{ titulo: "Código" }, { titulo: "Nome" }, { titulo: "Situação" }],
        linhas: rows.map((c) => ({
          id: c.id,
          ativo: c.ativo,
          rotulo: c.nome,
          valores: { nome: c.nome, codigo: c.codigo },
          celulas: [<span key="c" className="font-mono text-xs">{c.codigo ?? "—"}</span>, <span key="n" className="font-medium">{c.nome}</span>, <SeloAtivo key="s" ativo={c.ativo} />],
        })),
      };
    }
    case "contas-bancarias": {
      const where: Prisma.ContaBancariaWhereInput = {
        empresaId: { in: escopo.ids },
        ...statusWhere(f.status),
        ...(f.q ? { OR: [{ nome: ins(f.q) }, { bancoNome: ins(f.q) }] } : {}),
      };
      const [rows, total, somas] = await Promise.all([
        prisma.contaBancaria.findMany({ where, orderBy: { nome: "asc" }, include: { empresa: { select: { razaoSocial: true, nomeFantasia: true, cnpj: true } } }, ...pag(f) }),
        prisma.contaBancaria.count({ where }),
        prisma.movimento.groupBy({ by: ["contaBancariaId", "tipo"], where: { contaBancaria: { empresaId: { in: escopo.ids } } }, _sum: { valor: true } }),
      ]);
      const saldo = (id: string, inicial: number) =>
        somas.reduce((acc, s) => (s.contaBancariaId !== id ? acc : acc + (s.tipo === "CREDITO" ? 1 : -1) * num(s._sum.valor)), inicial);
      return {
        total,
        colunas: [{ titulo: "Conta" }, { titulo: "Banco / agência / conta" }, { titulo: "Empresa" }, { titulo: "Saldo atual", classe: "text-right" }, { titulo: "Situação" }],
        linhas: rows.map((c) => {
          const s = saldo(c.id, num(c.saldoInicial));
          return {
            id: c.id,
            ativo: c.ativo,
            rotulo: c.nome,
            valores: {
              nome: c.nome,
              tipo: c.tipo,
              empresaId: c.empresaId,
              bancoCodigo: c.bancoCodigo,
              bancoNome: c.bancoNome,
              agencia: c.agencia,
              numero: c.numero,
              saldoInicial: num(c.saldoInicial),
              dataSaldoInicial: iso(c.dataSaldoInicial),
            },
            celulas: [
              <div key="n">
                <div className="font-medium">{c.nome}</div>
                {sub(ROTULOS.tipoConta[c.tipo])}
              </div>,
              <span key="b" className="text-sm">{[c.bancoCodigo && `${c.bancoCodigo} ${c.bancoNome ?? ""}`, c.agencia && `ag. ${c.agencia}`, c.numero && `cc ${c.numero}`].filter(Boolean).join(" · ") || "—"}</span>,
              <div key="e" className="text-sm">
                {c.empresa.nomeFantasia || c.empresa.razaoSocial}
                {sub(fmtDocumento(c.empresa.cnpj))}
              </div>,
              <span key="s" className={`tabular font-medium ${s < 0 ? "text-destructive" : ""}`}>{fmtMoeda(s)}</span>,
              <SeloAtivo key="a" ativo={c.ativo} />,
            ],
          };
        }),
      };
    }
    case "formas-de-pagamento": {
      const where: Prisma.FormaPagamentoWhereInput = { ...daEmpresa, ...statusWhere(f.status), ...(f.q ? { nome: ins(f.q) } : {}) };
      const [rows, total] = await Promise.all([prisma.formaPagamento.findMany({ where, orderBy: { nome: "asc" }, ...pag(f) }), prisma.formaPagamento.count({ where })]);
      return {
        total,
        colunas: [{ titulo: "Nome" }, { titulo: "Meio" }, { titulo: "Situação" }],
        linhas: rows.map((x) => ({
          id: x.id,
          ativo: x.ativo,
          rotulo: x.nome,
          valores: { nome: x.nome, meio: x.meio },
          celulas: [<span key="n" className="font-medium">{x.nome}</span>, ROTULOS.meioPagamento[x.meio], <SeloAtivo key="s" ativo={x.ativo} />],
        })),
      };
    }
    case "condicoes-de-pagamento": {
      const where: Prisma.CondicaoPagamentoWhereInput = { ...daEmpresa, ...statusWhere(f.status), ...(f.q ? { nome: ins(f.q) } : {}) };
      const [rows, total] = await Promise.all([prisma.condicaoPagamento.findMany({ where, orderBy: { nome: "asc" }, ...pag(f) }), prisma.condicaoPagamento.count({ where })]);
      return {
        total,
        colunas: [{ titulo: "Nome" }, { titulo: "Prazos (dias)" }, { titulo: "Parcelas" }, { titulo: "Situação" }],
        linhas: rows.map((x) => ({
          id: x.id,
          ativo: x.ativo,
          rotulo: x.nome,
          valores: { nome: x.nome, dias: x.dias },
          celulas: [
            <span key="n" className="font-medium">{x.nome}</span>,
            <span key="d" className="font-mono text-xs">{x.dias}</span>,
            String(x.dias.split(",").length),
            <SeloAtivo key="s" ativo={x.ativo} />,
          ],
        })),
      };
    }
    case "contratos": {
      const where: Prisma.ContratoWhereInput = { ...daEmpresa, ...statusWhere(f.status), ...(f.q ? { OR: [{ descricao: ins(f.q) }, { pessoa: { is: { nome: ins(f.q) } } }, ...(/^\d+$/.test(f.q) ? [{ numero: Number(f.q) }] : [])] } : {}) };
      const [rows, total] = await Promise.all([
        prisma.contrato.findMany({ where, orderBy: { numero: "desc" }, ...pag(f), include: { pessoa: { select: { nome: true, nomeFantasia: true } }, _count: { select: { geracoes: true } } } }),
        prisma.contrato.count({ where }),
      ]);
      const PER: Record<string, string> = { MENSAL: "Mensal", BIMESTRAL: "Bimestral", TRIMESTRAL: "Trimestral", SEMESTRAL: "Semestral", ANUAL: "Anual" };
      return {
        total,
        colunas: [{ titulo: "Nº" }, { titulo: "Cliente" }, { titulo: "Descrição" }, { titulo: "Valor" }, { titulo: "Periodicidade" }, { titulo: "Próxima competência" }, { titulo: "Situação" }],
        linhas: rows.map((c) => ({
          id: c.id,
          ativo: c.ativo,
          rotulo: `Contrato ${c.numero} · ${c.pessoa.nomeFantasia || c.pessoa.nome}`,
          valores: {
            pessoaId: c.pessoaId,
            produtoId: c.produtoId,
            descricao: c.descricao,
            valor: num(c.valor),
            periodicidade: c.periodicidade,
            diaVencimento: String(c.diaVencimento),
            inicio: iso(c.inicio),
            fim: c.fim ? iso(c.fim) : null,
            antecedenciaDias: String(c.antecedenciaDias),
            categoriaId: c.categoriaId,
            contaBancariaId: c.contaBancariaId,
            formaPagamentoId: c.formaPagamentoId,
            gerarCobranca: c.gerarCobranca,
            observacoes: c.observacoes,
          },
          celulas: [
            <span key="n" className="tabular font-medium">{String(c.numero).padStart(4, "0")}</span>,
            <span key="c" className="font-medium">{c.pessoa.nomeFantasia || c.pessoa.nome}</span>,
            <span key="d" className="text-sm">{c.descricao}</span>,
            <span key="v" className="tabular">{fmtMoeda(num(c.valor))}</span>,
            <span key="p">{`${PER[c.periodicidade] ?? c.periodicidade} · dia ${c.diaVencimento}`}</span>,
            <span key="x" className="tabular text-sm">{`${(iso(c.proximaCompetencia) ?? "").slice(5, 7)}/${(iso(c.proximaCompetencia) ?? "").slice(0, 4)} · ${c._count.geracoes} gerada(s)`}</span>,
            <Selo key="s" tom={c.ativo ? "sucesso" : "neutro"}>{c.ativo ? "Ativo" : "Suspenso"}</Selo>,
          ],
        })),
      };
    }
    case "ordens": {
      const st = f.extra.situacao;
      const where: Prisma.OrdemServicoWhereInput = {
        ...daEmpresa,
        ...(st === "abertas" ? { status: { in: ["ABERTA", "EM_ANDAMENTO"] } } : st === "concluidas" ? { status: "CONCLUIDA" } : st === "canceladas" ? { status: "CANCELADA" } : {}),
        ...(f.q ? { OR: [{ descricao: ins(f.q) }, { pessoa: { is: { nome: ins(f.q) } } }, ...(/^\d+$/.test(f.q) ? [{ numero: Number(f.q) }] : [])] } : {}),
      };
      const [rows, total] = await Promise.all([prisma.ordemServico.findMany({ where, orderBy: { numero: "desc" }, ...pag(f), include: { pessoa: { select: { nome: true, nomeFantasia: true } } } }), prisma.ordemServico.count({ where })]);
      const usuarios = await prisma.usuario.findMany({ where: { id: { in: rows.map((o) => o.responsavelId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } });
      const ST: Record<string, { rotulo: string; tom: "neutro" | "sucesso" | "alerta" | "perigo" | "info" }> = { ABERTA: { rotulo: "Aberta", tom: "info" }, EM_ANDAMENTO: { rotulo: "Em andamento", tom: "alerta" }, CONCLUIDA: { rotulo: "Concluída", tom: "sucesso" }, CANCELADA: { rotulo: "Cancelada", tom: "neutro" } };
      return {
        total,
        colunas: [{ titulo: "Nº" }, { titulo: "Cliente" }, { titulo: "Serviço" }, { titulo: "Responsável" }, { titulo: "Prazos" }, { titulo: "Valor" }, { titulo: "Situação" }],
        linhas: rows.map((o) => ({
          id: o.id,
          ativo: o.ativo,
          rotulo: `OS ${o.numero} · ${o.pessoa.nomeFantasia || o.pessoa.nome}`,
          valores: {
            pessoaId: o.pessoaId,
            status: o.status,
            descricao: o.descricao,
            detalhes: o.detalhes,
            produtoId: o.produtoId,
            quantidade: num(o.quantidade),
            valorUnitario: num(o.valorUnitario),
            responsavelId: o.responsavelId,
            abertura: iso(o.abertura),
            previsao: o.previsao ? iso(o.previsao) : null,
            conclusao: o.conclusao ? iso(o.conclusao) : null,
            observacoes: o.observacoes,
            pedidoId: o.pedidoId,
          },
          celulas: [
            <span key="n" className="tabular font-medium">{String(o.numero).padStart(4, "0")}</span>,
            <span key="c" className="font-medium">{o.pessoa.nomeFantasia || o.pessoa.nome}</span>,
            <span key="d" className="text-sm">{o.descricao}</span>,
            <span key="r" className="text-sm">{usuarios.find((u) => u.id === o.responsavelId)?.nome ?? "—"}</span>,
            <span key="p" className="tabular text-xs">{`${br(o.abertura)}${o.previsao ? ` → ${br(o.previsao)}` : ""}${o.conclusao ? ` ✓ ${br(o.conclusao)}` : ""}`}</span>,
            <span key="v" className="tabular">{fmtMoeda(num(o.quantidade) * num(o.valorUnitario))}</span>,
            <span key="s" className="flex flex-wrap gap-1"><Selo tom={ST[o.status]?.tom ?? "neutro"}>{ST[o.status]?.rotulo ?? o.status}</Selo>{o.pedidoId && <Selo tom="sucesso">Pedido gerado</Selo>}</span>,
          ],
        })),
      };
    }
  }
}

/** Opções carregadas do banco para selects dos formulários. */
export async function opcoesCadastro(entidade: EntidadeCadastro): Promise<Record<string, Opcao[]>> {
  const escopo = await escopoEmpresa();
  if (entidade === "contas-bancarias") {
    // Só a empresa ativa e as filiais dela: outra empresa do grupo troca-se no menu.
    return { empresas: [escopo.ativa, ...escopo.filiais].map((e, i) => ({ valor: e.id, rotulo: `${e.nome} · ${fmtDocumento(e.cnpj)}${i === 0 ? " (matriz)" : ""}` })) };
  }
  if (entidade === "contratos" || entidade === "ordens") {
    const matriz = escopo.ativa.id;
    const [clientes, servicos, categorias, contas, formas, usuarios] = await Promise.all([
      prisma.pessoa.findMany({ where: { empresaId: matriz, cliente: true, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, nomeFantasia: true, documento: true } }),
      prisma.produto.findMany({ where: { empresaId: matriz, tipo: "SERVICO", ativo: true }, orderBy: { descricao: "asc" }, select: { id: true, codigo: true, descricao: true } }),
      prisma.categoria.findMany({ where: { empresaId: matriz, tipo: "RECEITA", ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
      prisma.contaBancaria.findMany({ where: { empresaId: { in: escopo.ids }, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
      prisma.formaPagamento.findMany({ where: { empresaId: matriz, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
      prisma.usuario.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    ]);
    return {
      clientes: clientes.map((c) => ({ valor: c.id, rotulo: `${c.nomeFantasia || c.nome}${c.documento ? ` · ${fmtDocumento(c.documento)}` : ""}` })),
      servicos: servicos.map((p) => ({ valor: p.id, rotulo: `${p.codigo} · ${p.descricao}` })),
      categoriasReceita: categorias.map((c) => ({ valor: c.id, rotulo: `${c.codigo ?? ""} ${c.nome}`.trim() })),
      contas: contas.map((c) => ({ valor: c.id, rotulo: c.nome })),
      formas: formas.map((f) => ({ valor: f.id, rotulo: f.nome })),
      usuarios: usuarios.map((u) => ({ valor: u.id, rotulo: u.nome })),
    };
  }
  return {};
}
