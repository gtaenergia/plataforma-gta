import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Identidade visual GTA (extraída dos documentos oficiais)
        gta: {
          navy: "#1A2F4A", // azul-marinho — base, títulos, faixa do cabeçalho
          navy2: "#243555", // navy mais claro — gradiente da faixa
          indigo: "#5B4FCF", // índigo — destaque (aba do logo, ações)
          orange: "#F26522", // laranja — energia, régua/realce
          // Laranja escurecido para receber TEXTO BRANCO: sobre o laranja da
          // marca o branco dá 3,15:1, abaixo do mínimo de 4,5 da WCAG AA.
          // Use só quando houver texto por cima; áreas sólidas seguem no #F26522.
          orangeTexto: "#C2410C",
          bg: "#F5F6F8", // cinza claro — fundo das páginas
          border: "#CCCCCC", // bordas das tabelas
          ink: "#243555",
        },
      },
      fontFamily: {
        sans: ["Aptos", "Segoe UI", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
