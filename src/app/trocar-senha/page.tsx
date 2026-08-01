import { requirePageUser } from "@/lib/session";
import { ChangePasswordForm } from "@/components/users/ChangePasswordForm";
import { AuthShell } from "@/components/ui";

/** Troca de senha obrigatória no primeiro acesso (ou após reset pelo admin). */
export default async function TrocarSenhaPage() {
  const user = await requirePageUser({ allowMustChange: true });
  const forcado = user.mustChangePassword;

  return (
    <AuthShell
      titulo="Defina sua senha"
      subtitulo={forcado ? "Por segurança, crie uma nova senha para continuar." : "Atualize a senha da sua conta."}
    >
      {/* Troca obrigatória: não pede a senha atual (já entrou com ela). */}
      <ChangePasswordForm requireCurrent={!forcado} redirectTo="/" />
    </AuthShell>
  );
}
