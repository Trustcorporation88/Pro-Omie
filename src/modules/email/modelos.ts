// Modelos dos e-mails transacionais (HTML simples, com texto puro equivalente). Seguro para client e server.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type Modelo = { assunto: string; html: string; texto: string };

export function layout(p: { titulo: string; paragrafos: string[]; botao?: { texto: string; url: string } | null; rodape: string; aviso?: string | null }): { html: string; texto: string } {
  const html =
    `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6fb;font-family:Helvetica,Arial,sans-serif;color:#1f2937">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px"><tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb">` +
    `<tr><td style="padding:28px 28px 8px"><h1 style="margin:0;font-size:20px;line-height:1.3">${esc(p.titulo)}</h1></td></tr>` +
    p.paragrafos.map((t) => `<tr><td style="padding:6px 28px;font-size:15px;line-height:1.55">${esc(t)}</td></tr>`).join("") +
    (p.botao ? `<tr><td style="padding:18px 28px"><a href="${esc(p.botao.url)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${esc(p.botao.texto)}</a><p style="margin:12px 0 0;font-size:12px;color:#6b7280">Se o botão não abrir, copie este endereço: ${esc(p.botao.url)}</p></td></tr>` : "") +
    (p.aviso ? `<tr><td style="padding:6px 28px 0;font-size:13px;color:#6b7280">${esc(p.aviso)}</td></tr>` : "") +
    `<tr><td style="padding:22px 28px 26px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">${esc(p.rodape)}</td></tr>` +
    `</table></td></tr></table></body></html>`;
  const texto = [p.titulo, "", ...p.paragrafos, ...(p.botao ? ["", `${p.botao.texto}: ${p.botao.url}`] : []), ...(p.aviso ? ["", p.aviso] : []), "", p.rodape].join("\n");
  return { html, texto };
}

const rodapeEmpresa = (empresa: string) => `Enviado por ${empresa} pelo Pro Omie. Este endereço não recebe respostas; use o "responder" para falar com a empresa.`;

export function modeloDocumento(p: { tipo: "proposta" | "pedido"; numero: string; empresa: string; cliente: string; total: string; validade?: string | null; mensagem?: string | null }): Modelo {
  const nome = p.tipo === "proposta" ? "Proposta comercial" : "Pedido de venda";
  const paragrafos = [
    `Olá, ${p.cliente}.`,
    `Segue em anexo ${p.tipo === "proposta" ? "a proposta" : "o pedido"} nº ${p.numero} de ${p.empresa}, no valor de ${p.total}.${p.validade ? ` A proposta vale até ${p.validade}.` : ""}`,
    ...(p.mensagem ? [p.mensagem] : []),
    "Qualquer dúvida, é só responder este e-mail.",
  ];
  return { assunto: `${nome} nº ${p.numero} - ${p.empresa}`, ...layout({ titulo: `${nome} nº ${p.numero}`, paragrafos, rodape: rodapeEmpresa(p.empresa) }) };
}

export function modeloNota(p: { tipo: "nfe" | "nfse"; numero: string; empresa: string; cliente: string; total: string; chave: string | null; homologacao: boolean; mensagem?: string | null }): Modelo {
  const nome = p.tipo === "nfe" ? "Nota fiscal eletrônica (NF-e)" : "Nota fiscal de serviço (NFS-e)";
  const paragrafos = [
    `Olá, ${p.cliente}.`,
    `Segue em anexo a ${p.tipo === "nfe" ? "NF-e" : "NFS-e"} nº ${p.numero} de ${p.empresa}, no valor de ${p.total}, com o ${p.tipo === "nfe" ? "DANFE" : "DANFSe"} em PDF e o XML.`,
    ...(p.chave ? [`Chave de acesso: ${p.chave}`] : []),
    ...(p.mensagem ? [p.mensagem] : []),
  ];
  return {
    assunto: `${p.homologacao ? "[TESTE] " : ""}${p.tipo === "nfe" ? "NF-e" : "NFS-e"} nº ${p.numero} - ${p.empresa}`,
    ...layout({ titulo: `${nome} nº ${p.numero}`, paragrafos, aviso: p.homologacao ? "Nota emitida em ambiente de teste, sem valor fiscal." : null, rodape: rodapeEmpresa(p.empresa) }),
  };
}

export function modeloSenhaProvisoria(p: { nome: string; email: string; senha: string; url: string; empresa: string }): Modelo {
  return {
    assunto: "Seu acesso ao Pro Omie",
    ...layout({
      titulo: `Bem-vindo(a), ${p.nome.split(" ")[0]}`,
      paragrafos: [`Seu acesso ao Pro Omie de ${p.empresa} foi criado.`, `E-mail: ${p.email}`, `Senha provisória: ${p.senha}`, "No primeiro acesso você define uma senha nova."],
      botao: { texto: "Entrar no Pro Omie", url: p.url },
      aviso: "Se você não esperava este e-mail, avise o administrador da empresa.",
      rodape: "Pro Omie · acesso ao sistema",
    }),
  };
}

export function modeloRedefinirSenha(p: { nome: string; url: string }): Modelo {
  return {
    assunto: "Redefinição de senha do Pro Omie",
    ...layout({
      titulo: "Redefinir a senha",
      paragrafos: [`Olá, ${p.nome.split(" ")[0]}.`, "Recebemos um pedido para redefinir a sua senha do Pro Omie. O link abaixo vale por 1 hora e só pode ser usado uma vez."],
      botao: { texto: "Definir nova senha", url: p.url },
      aviso: "Se não foi você, ignore este e-mail: a senha atual continua valendo.",
      rodape: "Pro Omie · acesso ao sistema",
    }),
  };
}

export function modeloCertificadoVencendo(p: { empresa: string; cnpj: string; validoAte: string; dias: number; url: string }): Modelo {
  const quando = p.dias <= 0 ? "venceu" : p.dias === 1 ? "vence amanhã" : `vence em ${p.dias} dias`;
  return {
    assunto: `Certificado digital de ${p.empresa} ${quando}`,
    ...layout({
      titulo: `Certificado A1 ${quando}`,
      paragrafos: [`O certificado digital A1 de ${p.empresa} (CNPJ ${p.cnpj}) ${quando} (${p.validoAte}).`, "Sem certificado válido, a emissão de NF-e e NFS-e e a busca de notas recebidas param. Peça o renovado à certificadora e envie em Configurações › Empresas e filiais."],
      botao: { texto: "Abrir configurações", url: p.url },
      rodape: "Pro Omie · aviso automático para administradores",
    }),
  };
}

export function modeloTeste(p: { nome: string; empresa: string }): Modelo {
  return {
    assunto: "E-mail de teste do Pro Omie",
    ...layout({ titulo: "Está tudo certo", paragrafos: [`Olá, ${p.nome.split(" ")[0]}. Este é um e-mail de teste enviado pelo Pro Omie de ${p.empresa}.`, "Se ele chegou, os registros DNS estão certos e os e-mails ao cliente vão sair normalmente."], rodape: rodapeEmpresa(p.empresa) }),
  };
}
