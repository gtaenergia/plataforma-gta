#!/usr/bin/env node
/**
 * Cliente da integração "proposta do chat → CRM". Lê o JSON da entrada padrão.
 *
 *   node scripts/integracao-proposta.mjs verificar-cliente < corpo.json
 *   node scripts/integracao-proposta.mjs simular            < corpo.json
 *   node scripts/integracao-proposta.mjs registrar          < corpo.json
 *
 * O token vem de ~/.gta/integracao.json (gerado por integracao-gerar-token.mjs)
 * e NUNCA é impresso: a saída é só a resposta do servidor. Pela entrada
 * padrão, os dados do cliente não ficam em arquivo temporário no disco.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ACOES = ["verificar-cliente", "simular", "registrar"];
const acao = process.argv[2];
if (!ACOES.includes(acao)) {
  console.error(`Uso: node scripts/integracao-proposta.mjs <${ACOES.join("|")}> < corpo.json`);
  process.exit(2);
}

// GTA_INTEGRACAO_CONFIG aponta outro arquivo — para testar contra o servidor
// local sem tocar na configuração de produção.
const arquivoConfig = process.env.GTA_INTEGRACAO_CONFIG || path.join(os.homedir(), ".gta", "integracao.json");
let config;
try {
  config = JSON.parse(fs.readFileSync(arquivoConfig, "utf8"));
} catch {
  console.error("Integração não configurada: rode antes scripts/integracao-gerar-token.mjs.");
  process.exit(2);
}
const base = new URL(config.url);
const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
if (base.protocol !== "https:" && !local) {
  console.error("URL da integração sem https — recusado.");
  process.exit(2);
}
if (typeof config.token !== "string" || !config.token.startsWith("gta_int_")) {
  console.error("Token ausente ou inválido em ~/.gta/integracao.json.");
  process.exit(2);
}

const entrada = fs.readFileSync(0, "utf8");
let corpo;
try {
  corpo = JSON.parse(entrada);
} catch {
  console.error("A entrada não é um JSON válido.");
  process.exit(2);
}
corpo.acao = acao;

const res = await fetch(new URL("/api/integracoes/proposta", base), {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
  body: JSON.stringify(corpo),
  // Redirecionamento levaria o token para outro endereço — não segue.
  redirect: "error",
});
const texto = await res.text();
let saida;
try {
  saida = JSON.parse(texto);
} catch {
  saida = { error: `Resposta inesperada (HTTP ${res.status}).` };
}
console.log(JSON.stringify({ status: res.status, ...saida }, null, 2));
// exitCode, e não process.exit(): no Windows, sair à força com o fetch ainda
// fechando a conexão derruba o Node com um "Assertion failed" do libuv.
process.exitCode = res.ok ? 0 : 1;
