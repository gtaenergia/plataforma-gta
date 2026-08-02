import { AppHeader } from "@/components/AppHeader";
import { ChangePasswordForm } from "@/components/users/ChangePasswordForm";
import { AvatarUpload } from "@/components/users/AvatarUpload";
import { PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/users/types";
import { getConfigCapacidade } from "@/lib/capacidade/config";
import { capacidadeDe } from "@/lib/capacidade/motor";
import type { CapacidadePessoa } from "@/lib/capacidade/types";

const DIA_NOME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "8 h por dia, de segunda a sexta" — a frase que responde "quanto posso trabalhar". */
function descreverJornada(c: CapacidadePessoa): string {
  if (c.minutosPorDia === 0 || c.diasUteis.length === 0) return "sem jornada cadastrada";
  const horas = (c.minutosPorDia / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const dias = [...c.diasUteis].sort((a, b) => a - b);
  // Sequência corrida vira "de X a Y"; dias soltos são listados um a um.
  const corrida = dias.every((d, i) => i === 0 || d === dias[i - 1] + 1);
  const quando =
    dias.length === 1
      ? `às ${DIA_NOME[dias[0]]}s`
      : corrida
        ? `de ${DIA_NOME[dias[0]]} a ${DIA_NOME[dias[dias.length - 1]]}`
        : dias.map((d) => DIA_NOME[d]).join(", ");
  return `${horas} h por dia, ${quando}`;
}

/** Página "Minha conta": dados do usuário e troca voluntária de senha. */
export default async function ContaPage() {
  const user = await requirePageUser();
  const minha = capacidadeDe(await getConfigCapacidade(), user.email);

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
            <dt className="mt-2 text-slate-600 sm:mt-0 dark:text-slate-400">Carga horária</dt>
            <dd className="text-slate-700 sm:col-span-2 dark:text-slate-300">
              {descreverJornada(minha)}
              {minha.origem === "padrao" && <span className="hint"> (padrão da equipe)</span>}
            </dd>
          </dl>
          <p className="hint mt-3">
            Jornada considerada pela plataforma no cálculo de prazos e na indicação de responsáveis.
            {user.role === "admin"
              ? " Configurável em Capacidade da equipe, no menu do perfil."
              : " Alterações devem ser solicitadas a um administrador."}
          </p>
        </section>

        <section className="section-card mt-6">
          <h2 className="section-title mb-4">Alterar senha</h2>
          <ChangePasswordForm requireCurrent />
        </section>
      </main>
    </div>
  );
}
