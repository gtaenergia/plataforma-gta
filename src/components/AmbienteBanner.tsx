/**
 * Aviso visual de "isto não é produção". A Vercel injeta VERCEL_ENV
 * automaticamente (production/preview/development) — sem precisar configurar
 * nada. Existe para reduzir o risco de confundir o branch de testes com a
 * plataforma real (dados de teste, link parecido, etc.).
 */
export function AmbienteBanner() {
  const env = process.env.VERCEL_ENV;
  if (env === "production") return null;

  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  return (
    <div className="bg-amber-500 px-3 py-1 text-center text-xs font-semibold text-amber-950">
      ⚠ Ambiente de testes{branch ? ` (${branch})` : ""} — não é a plataforma em produção. Dados daqui podem ser apagados a qualquer momento.
    </div>
  );
}
