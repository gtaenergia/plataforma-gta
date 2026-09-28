import { describe, expect, it } from "vitest";
import { equipeComercial, responsavelPadrao } from "@/lib/users/equipe";

const u = (email: string, name: string, extra: { active?: boolean; comercial?: boolean } = {}) => ({
  email,
  name,
  active: extra.active ?? true,
  comercial: extra.comercial,
});

describe("equipeComercial", () => {
  it("com gente marcada, só o comercial entra na lista", () => {
    const r = equipeComercial([
      u("eng@gta.com", "Engenheiro"),
      u("vend@gta.com", "Vendedora", { comercial: true }),
    ]);
    expect(r.marcada).toBe(true);
    expect(r.usuarios.map((x) => x.email)).toEqual(["vend@gta.com"]);
  });

  it("sem ninguém marcado, volta para todos os ativos — seletor vazio travaria o CRM", () => {
    const r = equipeComercial([u("a@gta.com", "Ana"), u("b@gta.com", "Beto")]);
    expect(r.marcada).toBe(false);
    expect(r.usuarios).toHaveLength(2);
  });

  it("inativo não entra, nem marcado como comercial", () => {
    const r = equipeComercial([
      u("saiu@gta.com", "Saiu", { comercial: true, active: false }),
      u("fica@gta.com", "Fica", { comercial: true }),
    ]);
    expect(r.usuarios.map((x) => x.email)).toEqual(["fica@gta.com"]);
  });

  it("um comercial inativo não conta como equipe marcada", () => {
    // Senão a lista cairia para vazia: o único marcado está fora.
    const r = equipeComercial([u("saiu@gta.com", "Saiu", { comercial: true, active: false }), u("a@gta.com", "Ana")]);
    expect(r.marcada).toBe(false);
    expect(r.usuarios.map((x) => x.email)).toEqual(["a@gta.com"]);
  });

  it("ordena por nome, como a pessoa procura", () => {
    const r = equipeComercial([u("z@gta.com", "Zélia", { comercial: true }), u("a@gta.com", "Álvaro", { comercial: true })]);
    expect(r.usuarios.map((x) => x.name)).toEqual(["Álvaro", "Zélia"]);
  });
});

describe("responsavelPadrao", () => {
  const opcoes = [
    { email: "vend@gta.com", name: "Vendedora" },
    { email: "outro@gta.com", name: "Outro" },
  ];

  it("quem está criando, quando é do comercial", () => {
    expect(responsavelPadrao(opcoes, "OUTRO@gta.com")).toBe("outro@gta.com");
  });

  it("fora do comercial, o primeiro da lista — o select mostra o mesmo que será gravado", () => {
    expect(responsavelPadrao(opcoes, "eng@gta.com")).toBe("vend@gta.com");
  });

  it("lista vazia devolve quem está criando (o servidor completa)", () => {
    expect(responsavelPadrao([], "eng@gta.com")).toBe("eng@gta.com");
  });
});
