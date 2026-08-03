"use client";

import { useEffect, useState } from "react";
import { ROLE_LABEL, type PublicUser, type Role } from "@/lib/users/types";
import type { Cargo } from "@/lib/cargos/types";
import { Alert, Badge, Loading, type Tone } from "@/components/ui";
import { Campo } from "@/components/Campo";

const ROLE_TONE: Record<Role, Tone> = { admin: "indigo", member: "slate" };

export function UsersAdmin({ currentUserId }: { currentUserId: string }) {
  const [usuarios, setUsuarios] = useState<PublicUser[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // criação
  const [novoAberto, setNovoAberto] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "member" as Role, cargoId: "", senhaProvisoria: "" });
  const [salvando, setSalvando] = useState(false);

  // senha provisória a exibir (após criar ou resetar)
  const [credencial, setCredencial] = useState<{ email: string; senha: string } | null>(null);

  async function carregar() {
    try {
      const [ru, rc] = await Promise.all([fetch("/api/admin/usuarios"), fetch("/api/admin/cargos")]);
      const du = await ru.json();
      if (!ru.ok) throw new Error(du.error ?? "Falha ao carregar usuários.");
      setUsuarios(du.usuarios ?? []);
      const dc = await rc.json();
      if (rc.ok) setCargos(dc.cargos ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch("/api/admin/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, senhaProvisoria: form.senhaProvisoria || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar usuário.");
      setUsuarios((prev) => [...prev, data.user]);
      setCredencial({ email: data.user.email, senha: data.senhaProvisoria });
      setForm({ name: "", email: "", role: "member", cargoId: "", senhaProvisoria: "" });
      setNovoAberto(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar.");
    } finally {
      setSalvando(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setErro(null);
    const res = await fetch(`/api/admin/usuarios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return setErro(data.error ?? "Falha ao atualizar.");
    setUsuarios((prev) => prev.map((u) => (u.id === id ? data.user : u)));
  }

  async function resetar(u: PublicUser) {
    if (!window.confirm(`Gerar uma nova senha provisória para ${u.name}?`)) return;
    const res = await fetch(`/api/admin/usuarios/${u.id}/reset-senha`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) return setErro(data.error ?? "Falha ao resetar.");
    setCredencial({ email: u.email, senha: data.senhaProvisoria });
    setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, mustChangePassword: true } : x)));
  }

  async function excluir(u: PublicUser) {
    if (!window.confirm(`Excluir o usuário ${u.name} (${u.email})?`)) return;
    const res = await fetch(`/api/admin/usuarios/${u.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setErro(data.error ?? "Falha ao excluir.");
    setUsuarios((prev) => prev.filter((x) => x.id !== u.id));
  }

  if (loading) return <Loading>Carregando usuários…</Loading>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={() => setNovoAberto((v) => !v)}>
          {novoAberto ? "Fechar" : "+ Novo usuário"}
        </button>
        <span className="ml-auto hint">{usuarios.length} usuário(s)</span>
      </div>

      {erro && <Alert tone="red">{erro}</Alert>}

      {/* credencial gerada */}
      {credencial && (
        <Alert tone="green">
          <strong>Senha provisória gerada.</strong>
          <p className="mt-1">
            Entregue estes dados a <strong>{credencial.email}</strong>. A pessoa será obrigada a
            definir uma nova senha no primeiro acesso.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="rounded bg-white px-3 py-1 text-base font-bold tracking-wide text-gta-navy shadow-sm dark:bg-slate-800 dark:text-slate-100">
              {credencial.senha}
            </code>
            <button
              className="btn-secondary !py-1 text-xs"
              onClick={() => navigator.clipboard?.writeText(credencial.senha)}
            >
              Copiar
            </button>
            <button className="btn-link !text-xs" onClick={() => setCredencial(null)}>
              Ocultar
            </button>
          </div>
        </Alert>
      )}

      {/* novo usuário */}
      {novoAberto && (
        <form onSubmit={criar} className="section-card-destaque">
          <h2 className="section-title mb-3">Novo usuário</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <Campo className="sm:col-span-3" label="Nome *">
              <input className="field-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Campo>
            <Campo className="sm:col-span-3" label="E-mail *">
              <input type="email" className="field-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </Campo>
            <Campo className="sm:col-span-2" label="Perfil">
              <select className="field-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="member">Membro</option>
                <option value="admin">Administrador</option>
              </select>
            </Campo>
            <Campo className="sm:col-span-2" label="Cargo">
              <select
                className="field-input"
                value={form.cargoId}
                onChange={(e) => setForm({ ...form, cargoId: e.target.value })}
                disabled={form.role === "admin"}
                title={form.role === "admin" ? "Administradores têm todas as permissões" : undefined}
              >
                <option value="">— Sem cargo —</option>
                {cargos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </Campo>
            <Campo className="sm:col-span-2" label="Senha provisória (opcional)">
              <input className="field-input" value={form.senhaProvisoria} onChange={(e) => setForm({ ...form, senhaProvisoria: e.target.value })} placeholder="Gerada automaticamente se vazio" />
            </Campo>
          </div>
          <div className="mt-3">
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? "Criando…" : "Criar usuário"}
            </button>
          </div>
        </form>
      )}

      {/* cartões (mobile) */}
      <div className="space-y-3 md:hidden">
        {usuarios.map((u) => {
          const eu = u.id === currentUserId;
          const acaoCls = "toque justify-center rounded-md border border-slate-200 px-2.5 py-1.5 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700";
          return (
            <div key={u.id} className={`card p-3 ${!u.active ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-gta-navy dark:text-slate-100">
                    {u.name} {eu && <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(você)</span>}
                  </div>
                  <div className="truncate text-sm text-slate-600 dark:text-slate-300">{u.email}</div>
                </div>
                <Badge tone={ROLE_TONE[u.role]} className="shrink-0">{ROLE_LABEL[u.role]}</Badge>
              </div>
              <div className="mt-1.5 text-xs">
                {u.active ? <span className="text-green-700 dark:text-green-400">Ativo</span> : <span className="text-slate-500 dark:text-slate-400">Inativo</span>}
                {u.mustChangePassword && u.active && <span className="ml-1 text-amber-600 dark:text-amber-400">(troca pendente)</span>}
              </div>
              <div className="mt-2 text-xs">
                {u.role === "admin" ? (
                  <span className="text-slate-500 dark:text-slate-400">Cargo: todas as permissões (admin)</span>
                ) : (
                  <label className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                    Cargo:
                    <select
                      className="field-input !w-auto !py-1 !text-xs"
                      value={u.cargoId ?? ""}
                      onChange={(e) => patch(u.id, { cargoId: e.target.value })}
                    >
                      <option value="">— Sem cargo —</option>
                      {cargos.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button className={`text-gta-indigo dark:text-indigo-300 ${acaoCls}`} onClick={() => resetar(u)}>Resetar senha</button>
                <button className={`text-slate-600 dark:text-slate-300 ${acaoCls}`} disabled={eu} onClick={() => patch(u.id, { role: u.role === "admin" ? "member" : "admin" })}>
                  {u.role === "admin" ? "Tornar membro" : "Tornar admin"}
                </button>
                <button className={`text-slate-600 dark:text-slate-300 ${acaoCls}`} disabled={eu} onClick={() => patch(u.id, { active: !u.active })}>
                  {u.active ? "Desativar" : "Ativar"}
                </button>
                <button className={`text-red-600 dark:text-red-400 ${acaoCls}`} disabled={eu} onClick={() => excluir(u)}>Excluir</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* tabela (desktop) */}
      <div className="hidden overflow-x-auto md:block card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Cargo</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const eu = u.id === currentUserId;
              return (
                <tr key={u.id} className={!u.active ? "opacity-50" : ""}>
                  <td className="px-4 py-2 font-medium text-gta-navy dark:text-slate-100">
                    {u.name} {eu && <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(você)</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{u.email}</td>
                  <td className="px-4 py-2">
                    <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    {u.role === "admin" ? (
                      <span className="hint">Todas (admin)</span>
                    ) : (
                      <select
                        className="field-input !w-auto !py-1 !text-xs"
                        value={u.cargoId ?? ""}
                        onChange={(e) => patch(u.id, { cargoId: e.target.value })}
                      >
                        <option value="">— Sem cargo —</option>
                        {cargos.map((c) => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {u.active ? (
                      <span className="text-green-700 dark:text-green-400">Ativo</span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">Inativo</span>
                    )}
                    {u.mustChangePassword && u.active && (
                      <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">(troca pendente)</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button className="text-gta-indigo dark:text-indigo-300 hover:underline" onClick={() => resetar(u)}>
                        Resetar senha
                      </button>
                      <button
                        className="text-slate-500 hover:underline disabled:opacity-40 dark:text-slate-400"
                        disabled={eu}
                        onClick={() => patch(u.id, { role: u.role === "admin" ? "member" : "admin" })}
                      >
                        {u.role === "admin" ? "Tornar membro" : "Tornar admin"}
                      </button>
                      <button
                        className="text-slate-500 hover:underline disabled:opacity-40 dark:text-slate-400"
                        disabled={eu}
                        onClick={() => patch(u.id, { active: !u.active })}
                      >
                        {u.active ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        className="btn-link text-xs !text-red-600 dark:!text-red-400 disabled:opacity-40"
                        disabled={eu}
                        onClick={() => excluir(u)}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
