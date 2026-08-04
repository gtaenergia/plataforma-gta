import type { MetadataRoute } from "next";

/**
 * Manifesto do app instalável (PWA).
 *
 * No Android a notificação push NÃO depende de instalar — basta a permissão.
 * O manifesto serve para o resto: ícone próprio na gaveta de aplicativos,
 * abrir sem a barra do navegador, e uma entrada própria nas configurações de
 * notificação do sistema, separada do Chrome.
 *
 * No iPhone é diferente: o Safari 16.4+ só entrega push quando a pessoa
 * adicionou à Tela de Início, e só pelo próprio Safari — pelo Chrome do iPhone
 * não funciona. Lá o manifesto é pré-requisito, não conveniência.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plataforma GTA",
    short_name: "GTA",
    description: "Plataforma interna da GTA Energia — propostas, orçamentos, tarefas e apontamentos",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5F6F8",
    theme_color: "#1A2F4A",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Sem um ícone "maskable", o Android recorta o desenho num círculo e come
      // as bordas do logo. Este já vem com margem e fundo sólido.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
