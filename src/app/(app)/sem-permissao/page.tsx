import Link from "next/link";
import { EstadoVazio } from "@/components/page-header";

export default function SemPermissaoPage() {
  return (
    <EstadoVazio titulo="Acesso restrito" descricao="Seu perfil não tem permissão para abrir esta página. Fale com um administrador.">
      <Link href="/" className="text-sm font-medium text-primary underline">Voltar ao painel</Link>
    </EstadoVazio>
  );
}
