/**
 * Service worker da Plataforma GTA.
 *
 * Existe por um motivo só: receber push com o site fechado. Não faz cache nem
 * funciona offline de propósito — a plataforma lê e escreve dados o tempo
 * todo, e servir uma tela antiga do cache seria pior que não abrir.
 *
 * Mora em `public/` (e não em `src/`) para ser servido da RAIZ do domínio. O
 * escopo de um service worker é limitado à pasta de onde ele vem: em
 * `/_next/sw.js` ele só enxergaria `/_next/`.
 */

// Assume o controle sem esperar a aba antiga fechar. Numa ferramenta interna,
// quem acabou de ligar as notificações espera que já valha.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  // Push sem corpo acontece (alguns serviços "acordam" o worker). Cai num
  // aviso genérico em vez de não mostrar nada: o Android exige que TODO push
  // recebido vire notificação visível, sob pena de revogar a permissão.
  let dados = { titulo: "Plataforma GTA", mensagem: "", link: "", tag: "gta" };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch {
    /* corpo não-JSON: fica o genérico */
  }

  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.mensagem,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // Mesma tag = substitui em vez de empilhar (ver lib/push/politica.ts).
      tag: dados.tag || "gta",
      renotify: true,
      data: { link: dados.link || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = event.notification.data?.link || "/";

  event.waitUntil(
    (async () => {
      const abas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reaproveita uma aba já aberta em vez de abrir outra: quem tem a
      // plataforma aberta no computador não quer uma segunda janela a cada
      // aviso. Navega essa aba para o destino e traz para a frente.
      for (const aba of abas) {
        if (new URL(aba.url).origin === self.location.origin) {
          await aba.focus();
          if ("navigate" in aba) await aba.navigate(destino).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
