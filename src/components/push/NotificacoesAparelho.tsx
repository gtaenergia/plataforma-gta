"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, BellOff } from "lucide-react";
import { Alert, Loading } from "@/components/ui";

/**
 * Liga e desliga a notificação push NESTE aparelho.
 *
 * A permissão do navegador é por aparelho, não por conta: quem usa celular e
 * computador precisa ligar nos dois, e é por isso que o texto fala em
 * "aparelho" o tempo todo em vez de "conta".
 */

type Estado =
  | "carregando"
  | "sem_suporte"
  | "ios_precisa_instalar"
  | "sem_chave"
  | "sessao_expirada"
  | "bloqueado"
  | "desligado"
  | "ligado";

/**
 * A chave VAPID trafega em base64url; o navegador quer bytes crus.
 *
 * O buffer é criado explicitamente para o tipo sair como `Uint8Array<ArrayBuffer>`:
 * `Uint8Array.from` devolve `ArrayBufferLike`, que abrange `SharedArrayBuffer` e
 * não serve como `BufferSource` para o `pushManager`.
 */
function chaveParaBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bin = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Caminho inverso: as chaves do aparelho saem como ArrayBuffer. */
function bytesParaBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** "Chrome no Android" — só para a pessoa reconhecer o aparelho depois. */
function descreverAparelho(): string {
  const ua = navigator.userAgent;
  const navegador = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const sistema = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iPhone" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : "";
  return sistema ? `${navegador} no ${sistema}` : navegador;
}

export function NotificacoesAparelho() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [chave, setChave] = useState("");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const sincronizar = useCallback(async () => {
    const suportado = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!suportado) {
      // No iPhone o suporte só aparece depois de "Adicionar à Tela de Início",
      // e só pelo Safari. Vale distinguir: senão a pessoa lê "não suportado" e
      // desiste, quando faltava um passo.
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      setEstado(ios ? "ios_precisa_instalar" : "sem_suporte");
      return;
    }

    const r = await fetch("/api/push");
    const d = await r.json().catch(() => null);
    // Sessão vencida não devolve JSON: o middleware redireciona para o login e
    // a resposta vem como HTML. Sem separar este caso, "faça login de novo"
    // aparecia como "o servidor não está configurado" — e a pessoa ia procurar
    // erro em variável de ambiente.
    if (r.status === 401 || d === null) {
      setEstado("sessao_expirada");
      return;
    }
    if (!d.disponivel || !d.chavePublica) {
      setMotivo(typeof d.motivo === "string" ? d.motivo : "");
      setEstado("sem_chave");
      return;
    }
    setChave(d.chavePublica);

    if (Notification.permission === "denied") {
      setEstado("bloqueado");
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const inscricao = await reg?.pushManager.getSubscription();
    setEstado(inscricao ? "ligado" : "desligado");
  }, []);

  useEffect(() => {
    sincronizar().catch(() => setEstado("sem_suporte"));
  }, [sincronizar]);

  async function ligar() {
    setOcupado(true);
    setErro(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      // `userVisibleOnly` é obrigatório no Chrome: o navegador exige que todo
      // push recebido vire notificação visível, e não aceita inscrição sem
      // essa promessa.
      const inscricao = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(chave),
      });
      const r = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: inscricao.endpoint,
          p256dh: bytesParaBase64(inscricao.getKey("p256dh")),
          auth: bytesParaBase64(inscricao.getKey("auth")),
          aparelho: descreverAparelho(),
        }),
      });
      if (!r.ok) {
        // Inscrição que o servidor não guardou é inscrição que nunca receberá
        // nada — desfaz para não deixar o aparelho achando que está ligado.
        await inscricao.unsubscribe().catch(() => {});
        throw new Error((await r.json().catch(() => ({}))).error ?? "Falha ao registrar o aparelho.");
      }
      setEstado("ligado");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível ativar.";
      // "push service error" é o navegador avisando que NÃO conseguiu falar
      // com o serviço de push do Google. Não é a plataforma: costuma ser rede
      // corporativa, VPN ou notificação desligada no sistema operacional.
      // Sem essa tradução, a frase crua manda a pessoa procurar defeito aqui.
      setErro(
        /push service/i.test(msg)
          ? `${msg}. O navegador não conseguiu falar com o serviço de push do Google — normalmente é a rede (VPN, firewall) ou a notificação desligada no sistema, não a plataforma.`
          : msg,
      );
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    setErro(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const inscricao = await reg?.pushManager.getSubscription();
      if (inscricao) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: inscricao.endpoint }),
        }).catch(() => undefined);
        await inscricao.unsubscribe();
      }
      setEstado("desligado");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível desativar.");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "carregando") return <Loading />;

  return (
    <div>
      {erro && <Alert tone="red" className="mb-3">{erro}</Alert>}

      {estado === "ligado" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <BellRing className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden />
            Ativadas neste aparelho.
          </p>
          <button type="button" className="btn-secondary" onClick={desligar} disabled={ocupado}>
            {ocupado ? "Desativando…" : "Desativar neste aparelho"}
          </button>
        </div>
      )}

      {estado === "desligado" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <BellOff className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden />
            Desativadas neste aparelho.
          </p>
          <button type="button" className="btn-primary" onClick={ligar} disabled={ocupado}>
            {ocupado ? "Ativando…" : "Ativar notificações"}
          </button>
        </div>
      )}

      {estado === "bloqueado" && (
        <Alert tone="amber" titulo="Bloqueadas pelo navegador">
          A permissão foi negada neste aparelho, e só o navegador pode reverter. No Chrome, abra o
          cadeado ao lado do endereço → Notificações → Permitir. Depois volte aqui e ative.
        </Alert>
      )}

      {estado === "ios_precisa_instalar" && (
        <Alert tone="amber" titulo="No iPhone é preciso instalar antes">
          Abra esta página no <strong>Safari</strong>, toque em Compartilhar e escolha
          &ldquo;Adicionar à Tela de Início&rdquo;. Abra a plataforma por esse ícone e volte a esta tela
          para ativar. Pelo Chrome do iPhone não funciona — é limitação do sistema.
        </Alert>
      )}

      {estado === "sem_suporte" && (
        <Alert tone="amber">
          Este navegador não oferece notificações. Chrome, Edge e Firefox oferecem, no computador e
          no Android.
        </Alert>
      )}

      {estado === "sessao_expirada" && (
        <Alert tone="amber" titulo="Sessão expirada">
          Entre novamente e volte a esta tela.
        </Alert>
      )}

      {estado === "sem_chave" && (
        <Alert tone="indigo" titulo="Push ainda não configurado no servidor">
          Fale com um administrador.
          {motivo && (
            <>
              {" "}
              Detalhe técnico: <span className="font-medium">{motivo}</span>
            </>
          )}
        </Alert>
      )}
    </div>
  );
}
