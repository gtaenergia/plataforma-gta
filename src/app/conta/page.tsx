import { AppHeader } from "@/components/AppHeader";
import { ChangePasswordForm } from "@/components/users/ChangePasswordForm";
import { AvatarUpload } from "@/components/users/AvatarUpload";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/users/types";

/** Página "Minha conta": dados do usuário e troca voluntária de senha. */
export default async function ContaPage() {
  const user = await requirePageUser();

  return (
    <div className="min-h-screen">
      <AppHeader userName={user.name} isAdmin={user.role === "admin"} />
      <main className="app-container-foco py-8">
        <PageHeader title="Minha conta" />

        <section className="section-card mt-6">
          <AvatarUpload avatarUrl={user.avatarUrl ?? ""} name={user.name} />
        </section>

        <section className="section-card mt-6">
          <dl className="grid grid-cols-1 gap-y-1 text-sm sm:grid-cols-3 sm:gap-y-2">
            <dt className="text-slate-600 dark:text-slate-400">Nome</dt>
            <dd className="font-medium text-gta-navy sm:col-span-2 dark:text-slate-100">{user.name}</dd>
            <dt className="mt-2 text-slate-600 sm:mt-0 dark:text-slate-400">E-mail</dt>
            <dd className="break-all text-slate-700 sm:col-span-2 dark:text-slate-300">{user.email}</dd>
            <dt className="mt-2 text-slate-600 sm:mt-0 dark:text-slate-400">Perfil</dt>
            <dd className="text-slate-700 sm:col-span-2 dark:text-slate-300">{ROLE_LABEL[user.role]}</dd>
          </dl>
        </section>

        <section className="section-card mt-6">
          <h2 className="section-title mb-4">Alterar senha</h2>
          <ChangePasswordForm requireCurrent />
        </section>
      </main>
    </div>
  );
}
