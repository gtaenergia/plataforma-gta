"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui";
/**
 * Formulário de troca de senha.
 * - `requireCurrent`: pede a senha atual (troca voluntária em /conta).
 * - Sem `requireCurrent`: troca obrigatória (1º acesso), redireciona ao concluir.
 */
export function ChangePasswordForm({
  requireCurrent,
  redirectTo,
}: {
  requireCurrent: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (novaSenha.length < 8) return setErro("A nova senha deve ter ao menos 8 caracteres.");
    if (novaSenha !== confirmar) return setErro("A confirmação não confere.");
    setSalvando(true);
    try {
      const res = await fetch("/api/conta/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requireCurrent ? { senhaAtual, novaSenha } : { novaSenha }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao alterar a senha.");
      setOk(true);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmar("");
      if (redirectTo) {
        router.replace(redirectTo);
        router.refresh();
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao alterar a senha.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {requireCurrent && (
        <div>
          <label className="field-label">Senha atual</label>
          <input type="password" className="field-input" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} autoComplete="current-password" required />
        </div>
      )}
      <div>
        <label className="field-label">Nova senha</label>
        <input type="password" className="field-input" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} autoComplete="new-password" required />
        <p className="mt-1 hint">Mínimo de 8 caracteres.</p>
      </div>
      <div>
        <label className="field-label">Confirmar nova senha</label>
        <input type="password" className="field-input" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" required />
      </div>
      {erro && <Alert tone="red">{erro}</Alert>}
      {ok && !redirectTo && <p className="text-sm font-medium text-green-600 dark:text-green-400">Senha alterada com sucesso.</p>}
      <button type="submit" className="btn-primary" disabled={salvando}>
        {salvando ? "Salvando…" : "Alterar senha"}
      </button>
    </form>
  );
}
