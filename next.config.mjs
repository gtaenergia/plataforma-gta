/** @type {import('next').NextConfig} */
const nextConfig = {
  // docxtemplater/pizzip precisam ser tratados como externos no servidor
  serverExternalPackages: ["docxtemplater", "pizzip"],
  /**
   * Cabeçalhos de segurança.
   *
   * A Vercel já envia `Strict-Transport-Security`; o resto não vinha ninguém.
   *
   * A CSP aqui é DELIBERADAMENTE parcial. Um `default-src`/`script-src`
   * completo exigiria nonce em cada script embutido — inclusive o que aplica o
   * tema antes da primeira pintura — e uma CSP mal calibrada não avisa: ela
   * quebra a tela em silêncio no navegador de alguém. As diretivas abaixo não
   * dependem de nonce e não têm como quebrar nada:
   *
   * - `frame-ancestors 'none'` impede que a plataforma seja embutida num
   *   iframe invisível para roubar cliques em "Aprovar orçamento";
   * - `base-uri 'self'` bloqueia a reescrita de URLs relativas por um <base>
   *   injetado;
   * - `form-action 'self'` impede que um formulário poste para fora.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          // Redundante com frame-ancestors, para navegador antigo que só
          // entende este.
          { key: "X-Frame-Options", value: "DENY" },
          // Impede que um anexo .txt enviado por alguém seja interpretado como
          // HTML e execute script na nossa origem.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // A aba "Tracker" virou "Apontamentos". A notificação de novidade já
      // saiu com o link antigo, e pode haver favorito salvo — o redirecionamento
      // evita 404 para quem clicar neles.
      { source: "/tracker", destination: "/apontamentos", permanent: true },
      // "Clientes" saiu de Operações e mora no CRM: é dele que nascem as
      // negociações. Mesma tabela, mesma /api/clientes — só o lugar na
      // navegação mudou. O redirecionamento cobre favorito salvo.
      { source: "/clientes", destination: "/crm/clientes", permanent: true },
      // A aba chegou a se chamar "Empresas" (nome do RD Station) por algumas
      // versões — links e favoritos desse período continuam chegando.
      { source: "/crm/empresas", destination: "/crm/clientes", permanent: true },
      { source: "/crm/empresas/:id", destination: "/crm/clientes/:id", permanent: true },
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
