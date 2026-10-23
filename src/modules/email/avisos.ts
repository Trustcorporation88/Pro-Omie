// Avisos automáticos por e-mail (cron): certificado digital vencendo, para os administradores da empresa. Só servidor.
import "server-only";
import { prisma } from "@/lib/db";
import { fmtData, fmtDocumento } from "@/lib/format";
import { enfileirar } from "./fila";
import { modeloCertificadoVencendo } from "./modelos";
import { configuracaoEmail } from "./provedor";

const FAIXAS = [30, 15, 7, 1, 0];

/** Um aviso por faixa (30, 15, 7, 1 dia e vencido), por estabelecimento, para cada administrador com acesso. */
export async function avisarCertificadosVencendo(urlBase: string) {
  if (!configuracaoEmail().configurado) return { avisos: 0 };
  const limite = new Date(Date.now() + 30 * 86_400_000);
  const certs = await prisma.certificadoDigital.findMany({
    where: { validoAte: { lte: limite } },
    select: { empresaId: true, validoAte: true, empresa: { select: { id: true, matrizId: true, razaoSocial: true, nomeFantasia: true, cnpj: true, ativo: true } } },
  });
  let avisos = 0;
  for (const c of certs) {
    if (!c.empresa.ativo) continue;
    const dias = Math.ceil((c.validoAte.getTime() - Date.now()) / 86_400_000);
    const faixa = FAIXAS.find((f) => dias <= f && (f === 0 ? dias <= 0 : dias > (FAIXAS[FAIXAS.indexOf(f) + 1] ?? -Infinity)));
    if (faixa === undefined) continue;
    const origemId = `${c.empresaId}:${faixa}`;
    if (await prisma.email.findFirst({ where: { tipo: "certificado_vencendo", origemId }, select: { id: true } })) continue;
    const matrizId = c.empresa.matrizId ?? c.empresa.id;
    const admins = await prisma.usuario.findMany({ where: { papel: "ADMIN", ativo: true, OR: [{ todasEmpresas: true }, { empresas: { has: matrizId } }] }, select: { email: true } });
    if (!admins.length) continue;
    const empresa = c.empresa.nomeFantasia || c.empresa.razaoSocial;
    await enfileirar({
      empresaId: matrizId,
      tipo: "certificado_vencendo",
      origemId,
      para: admins.map((a) => a.email),
      ...modeloCertificadoVencendo({ empresa, cnpj: fmtDocumento(c.empresa.cnpj), validoAte: fmtData(c.validoAte.toISOString()), dias, url: `${urlBase}/configuracoes/empresa` }),
    });
    avisos++;
  }
  return { avisos };
}
