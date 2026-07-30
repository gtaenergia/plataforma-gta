"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Marcado por padrão: o uso normal é o próprio celular/computador de trabalho.
  // Quem estiver num equipamento compartilhado desmarca e a sessão dura 12h.
  const [lembrar, setLembrar] = useState(true);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, lembrar }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Falha ao entrar.");
      }
      // Primeiro acesso (ou senha resetada): força a definição de nova senha.
      router.replace(data.mustChangePassword ? "/trocar-senha" : params.get("next") || "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gta-navy to-gta-navy2 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl dark:bg-slate-800">
        <div className="h-1.5 w-full bg-gta-orange" />
        <div className="p-8">
          <div className="mb-6 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/gta-icon.png" alt="GTA Energia" className="mx-auto h-24 w-auto" />
            <div className="mt-2 text-xl font-bold tracking-tight text-gta-navy dark:text-slate-100">GTA Energia</div>
          </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="field-label">E-mail</label>
            <input
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="field-label">Senha</label>
            <input
              type="password"
              className="field-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-gta-indigo focus:ring-gta-indigo dark:border-slate-600 dark:bg-slate-700"
              checked={lembrar}
              onChange={(e) => setLembrar(e.target.checked)}
            />
            Continuar conectado
          </label>
          {error && <p className="field-error">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
        </div>
      </div>
    </main>
  );
}
