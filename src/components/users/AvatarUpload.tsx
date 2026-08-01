"use client";

import { useRef, useState } from "react";
import { Avatar } from "../ui";

import { Alert } from "@/components/ui";
/** Upload/remoção da foto de perfil do usuário logado (usado em /conta). */
export function AvatarUpload({ avatarUrl: inicial, name }: { avatarUrl: string; name: string }) {
  const [avatarUrl, setAvatarUrl] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErro(null);
    setEnviando(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/conta/avatar", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao enviar a foto.");
      setAvatarUrl(data.avatarUrl ?? "");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao enviar a foto.");
    } finally {
      setEnviando(false);
    }
  }

  async function onRemover() {
    if (!confirm("Remover a foto de perfil?")) return;
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/conta/avatar", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao remover a foto.");
      setAvatarUrl("");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao remover a foto.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar src={avatarUrl || undefined} name={name} size={64} tone="solid" />
      <div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={enviando} onClick={() => inputRef.current?.click()}>
            {enviando ? "Enviando…" : "Escolher foto"}
          </button>
          {avatarUrl && (
            <button type="button" className="btn-secondary" disabled={enviando} onClick={onRemover}>
              Remover foto
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onFileChange} />
        <p className="mt-1 hint">PNG, JPEG, WEBP ou GIF, até 3 MB.</p>
        {erro && <Alert tone="red">{erro}</Alert>}
      </div>
    </div>
  );
}
