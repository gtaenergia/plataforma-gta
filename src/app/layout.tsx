import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AmbienteBanner } from "@/components/AmbienteBanner";

export const metadata: Metadata = {
  title: "Plataforma GTA",
  description: "Plataforma interna da GTA Energia — criação e histórico de propostas comerciais e gestão de tarefas",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Aplica o tema salvo antes da primeira pintura (evita "flash" de tema claro).
const themeScript = `(function(){try{var t=localStorage.getItem('tema');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <AmbienteBanner />
        {children}
      </body>
    </html>
  );
}
