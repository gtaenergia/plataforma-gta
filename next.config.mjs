/** @type {import('next').NextConfig} */
const nextConfig = {
  // docxtemplater/pizzip precisam ser tratados como externos no servidor
  serverExternalPackages: ["docxtemplater", "pizzip"],
  async redirects() {
    return [
      // A aba "Tracker" virou "Apontamentos". A notificação de novidade já
      // saiu com o link antigo, e pode haver favorito salvo — o redirecionamento
      // evita 404 para quem clicar neles.
      { source: "/tracker", destination: "/apontamentos", permanent: true },
    ];
  },
  // Garante que os moldes .docx sejam empacotados na build de produção (Vercel)
  outputFileTracingIncludes: {
    "/api/gerar": ["./src/services/**/*.docx"],
    // A rota que regenera o .docx (Rev 00 da esteira) lê os moldes por caminho
    // dinâmico — precisa empacotá-los no bundle serverless dela também.
    "/api/orcamentos/[id]/gerar-docx": ["./src/services/**/*.docx"],
  },
};

export default nextConfig;
