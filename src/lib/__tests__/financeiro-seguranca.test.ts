import { describe, expect, it } from "vitest";
import { INATIVIDADE_SEGUNDOS, TETO_SEGUNDOS, emitirCadeado, lerCadeado, renovarCadeado } from "@/lib/financeiro/cadeado";
import { decidirMudancaDeAcesso, origemConfiavel, temAcessoFinanceiro } from "@/lib/financeiro/acesso-regras";

/**
 * As camadas extras do Financeiro: o cadeado (senha de novo, com prazo), a
 * regra que impede administrador sem acesso de se dar acesso, e a barreira
 * anti-CSRF. Cada caso aqui é uma tentativa de entrar por onde não devia.
 */

const T0 = 1_800_000_000;
const conta = { email: "tito@gta.com", pv: "impressao-da-senha" };
const aberto = (ini = T0, ult = T0) => emitirCadeado({ e: conta.email, pv: conta.pv, ini, ult });

describe("cadeado do Financeiro", () => {
  it("abre com o token certo, da conta certa", () => {
    expect(lerCadeado(aberto(), conta, T0 + 10)).toMatchObject({ ok: true });
  });

  it("fecha sem cookie", () => {
    expect(lerCadeado(undefined, conta, T0)).toEqual({ ok: false, motivo: "ausente" });
  });

  it("recusa token adulterado (mudar o e-mail ou o prazo quebra a assinatura)", () => {
    const [corpo, sig] = aberto().split(".");
    const forjado = Buffer.from(JSON.stringify({ e: conta.email, pv: conta.pv, ini: T0 + 99999, ult: T0 + 99999 })).toString("base64url");
    expect(lerCadeado(`${forjado}.${sig}`, conta, T0)).toEqual({ ok: false, motivo: "invalido" });
    expect(lerCadeado(`${corpo}.${sig.slice(0, -2)}xx`, conta, T0)).toEqual({ ok: false, motivo: "invalido" });
    expect(lerCadeado("lixo", conta, T0)).toEqual({ ok: false, motivo: "invalido" });
  });

  it("token de uma conta não abre o Financeiro de outra", () => {
    expect(lerCadeado(aberto(), { ...conta, email: "gabriel@gta.com" }, T0)).toEqual({ ok: false, motivo: "outra-conta" });
  });

  it("trocar a senha fecha o cadeado em todos os aparelhos", () => {
    expect(lerCadeado(aberto(), { ...conta, pv: "senha-nova" }, T0)).toEqual({ ok: false, motivo: "senha-mudou" });
  });

  it("fecha sozinho depois de 30 minutos sem uso", () => {
    expect(lerCadeado(aberto(), conta, T0 + INATIVIDADE_SEGUNDOS)).toMatchObject({ ok: true });
    expect(lerCadeado(aberto(), conta, T0 + INATIVIDADE_SEGUNDOS + 1)).toEqual({ ok: false, motivo: "inatividade" });
  });

  it("uso contínuo não estica além de 12 horas", () => {
    const usadoAgora = aberto(T0, T0 + TETO_SEGUNDOS);
    expect(lerCadeado(usadoAgora, conta, T0 + TETO_SEGUNDOS + 1)).toEqual({ ok: false, motivo: "teto" });
  });

  it("renovar empurra a inatividade, não o teto", () => {
    const lido = lerCadeado(aberto(), conta, T0 + 600);
    if (!lido.ok) throw new Error("devia abrir");
    const novo = renovarCadeado(lido.token, T0 + 600)!;
    expect(lerCadeado(novo, conta, T0 + 600 + INATIVIDADE_SEGUNDOS)).toMatchObject({ ok: true });
    const relido = lerCadeado(novo, conta, T0 + 600);
    expect(relido.ok && relido.token.ini).toBe(T0);
  });

  it("não reemite o cookie a cada clique", () => {
    const lido = lerCadeado(aberto(), conta, T0 + 5);
    if (!lido.ok) throw new Error("devia abrir");
    expect(renovarCadeado(lido.token, T0 + 5)).toBeNull();
  });

  it("token com relógio no futuro é recusado", () => {
    expect(lerCadeado(aberto(T0 + 3600, T0 + 3600), conta, T0)).toEqual({ ok: false, motivo: "invalido" });
  });
});

type U = { id: string; email: string; role: "admin" | "member"; active: boolean; financeiro?: boolean };
const u = (id: string, p: Partial<U> = {}): U => ({ id, email: `${id}@gta.com`, role: "member", active: true, ...p });

describe("quem pode mexer na porta do Financeiro", () => {
  const tito = u("tito", { role: "admin", financeiro: true });
  const gabriel = u("gabriel", { financeiro: true });
  const adminTi = u("ti", { role: "admin" });
  const todos = [tito, gabriel, adminTi, u("matheus")];

  it("sócio administrador com acesso pode dar acesso", () => {
    expect(decidirMudancaDeAcesso(tito, todos, u("matheus"), "conceder")).toEqual({ ok: true });
  });

  it("administrador SEM acesso não se dá acesso", () => {
    expect(decidirMudancaDeAcesso(adminTi, todos, adminTi, "conceder").ok).toBe(false);
  });

  it("administrador sem acesso não redefine a senha de um sócio (para entrar como ele)", () => {
    expect(decidirMudancaDeAcesso(adminTi, todos, gabriel, "senha").ok).toBe(false);
  });

  it("administrador sem acesso não desativa nem exclui os sócios", () => {
    expect(decidirMudancaDeAcesso(adminTi, todos, gabriel, "desativar").ok).toBe(false);
    expect(decidirMudancaDeAcesso(adminTi, todos, gabriel, "excluir").ok).toBe(false);
  });

  it("desativar os sócios não reabre a instalação para o primeiro acesso", () => {
    const desativados = [u("tito", { role: "admin", financeiro: true, active: false }), adminTi];
    expect(decidirMudancaDeAcesso(adminTi, desativados, adminTi, "conceder").ok).toBe(false);
  });

  it("numa instalação nova, um administrador dá o primeiro acesso", () => {
    expect(decidirMudancaDeAcesso(adminTi, [adminTi, u("matheus")], adminTi, "conceder")).toEqual({ ok: true });
  });

  it("nunca fica sem ninguém com acesso", () => {
    const so = [tito, adminTi];
    expect(decidirMudancaDeAcesso(tito, so, tito, "revogar").ok).toBe(false);
    expect(decidirMudancaDeAcesso(tito, todos, gabriel, "revogar")).toEqual({ ok: true });
  });

  it("membro comum não mexe em nada", () => {
    expect(decidirMudancaDeAcesso(gabriel, todos, u("matheus"), "conceder").ok).toBe(false);
  });

  it("conta desativada perde o acesso mesmo com a marca", () => {
    expect(temAcessoFinanceiro({ active: false, financeiro: true })).toBe(false);
    expect(temAcessoFinanceiro({ active: true, financeiro: true })).toBe(true);
    expect(temAcessoFinanceiro({ active: true })).toBe(false);
  });
});

describe("origem da requisição (anti-CSRF)", () => {
  const req = (h: Record<string, string>) => ({ url: "https://plataforma.gta.com/api/financeiro/lancamentos", headers: new Headers(h) });

  it("aceita a própria plataforma", () => {
    expect(origemConfiavel(req({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(origemConfiavel(req({ origin: "https://plataforma.gta.com" }))).toBe(true);
  });

  it("recusa outro site, mesmo subdomínio irmão", () => {
    expect(origemConfiavel(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(origemConfiavel(req({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(origemConfiavel(req({ origin: "https://site-malicioso.com" }))).toBe(false);
    expect(origemConfiavel(req({ origin: "null" }))).toBe(false);
  });
});
