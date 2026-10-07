#!/usr/bin/env node
/**
 * Gera o token da integração "proposta do chat → CRM".
 *
 *   node scripts/integracao-gerar-token.mjs https://SEU-DOMINIO.vercel.app
 *
 * - O token PURO vai só para ~/.gta/integracao.json, neste computador. Ele
 *   nunca é impresso na tela — assim não aparece em log, histórico do
 *   terminal nem na conversa com o Claude.
 * - Na tela sai apenas o HASH (SHA-256), que é o que vai para a Vercel em
 *   INTEGRACAO_TOKEN_SHA256. O hash sozinho não abre a porta.
 *
 * Rodar de novo gera um token NOVO e invalida o anterior assim que o hash
 * novo for salvo na Vercel (é assim que se troca o token em caso de suspeita).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const url = (process.argv[2] ?? "").trim().replace(/\/+$/, "");
if (!url) {
  console.error("Uso: node scripts/integracao-gerar-token.mjs https://SEU-DOMINIO.vercel.app");
  process.exit(1);
}
const u = new URL(url);
const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
if (u.protocol !== "https:" && !local) {
  console.error("A URL precisa ser https:// — o token não pode trafegar sem criptografia.");
  process.exit(1);
}

const token = `gta_int_${crypto.randomBytes(32).toString("base64url")}`;
const hash = crypto.createHash("sha256").update(token, "utf8").digest("hex");

// GTA_INTEGRACAO_CONFIG: outro arquivo, para um token de teste local não
// sobrescrever o de produção.
const arquivo = process.env.GTA_INTEGRACAO_CONFIG || path.join(os.homedir(), ".gta", "integracao.json");
fs.mkdirSync(path.dirname(arquivo), { recursive: true, mode: 0o700 });
fs.writeFileSync(arquivo, JSON.stringify({ url: u.origin, token }, null, 2), { encoding: "utf8", mode: 0o600 });

console.log("Token gerado e salvo em:", arquivo);
console.log("");
console.log("Na Vercel (Settings → Environment Variables → Production), defina:");
console.log("");
console.log(`  INTEGRACAO_TOKEN_SHA256 = ${hash}`);
console.log("  INTEGRACAO_USUARIO_EMAIL = <seu e-mail de login na plataforma>");
console.log("");
console.log("Depois faça um novo deploy para as variáveis valerem.");
