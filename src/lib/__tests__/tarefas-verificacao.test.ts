import { describe, expect, it } from "vitest";
import { STATUS_ABERTOS, bloqueioDaTransicao, carimbosDaTransicao, ehDevolucao } from "@/lib/tasks/verificacao";
import { STATUS_TAREFA } from "@/lib/tasks/types";
import { podemVerificar } from "@/lib/tasks/verificadores";
import type { User } from "@/lib/users/types";
import type { Cargo } from "@/lib/cargos/types";

/**
 * Regras da verificação de tarefas, sem banco.
 *
 * Decisões do dono (23/11/2026): verifica quem é administrador ou tem a
 * permissão `tarefas.verificar`; quem verifica pode devolver (motivo opcional); o
 * prazo para de correr na entrega.
 */

const AGORA = "2026-11-23T15:00:00.000Z";
const VAZIOS = { entregueEm: "", entreguePor: "", verificadaEm: "", verificadaPor: "" };

describe("carimbosDaTransicao", () => {
  it("entregar grava quem e quando, e apaga uma verificação antiga", () => {
    expect(carimbosDaTransicao("andamento", "entregue", "ana@gta.com", AGORA)).toEqual({
      entregueEm: AGORA,
      entreguePor: "ana@gta.com",
      verificadaEm: "",
      verificadaPor: "",
    });
  });

  it("verificar grava quem e quando, e mantém o registro da entrega", () => {
    expect(carimbosDaTransicao("entregue", "concluida", "chefe@gta.com", AGORA)).toEqual({
      verificadaEm: AGORA,
      verificadaPor: "chefe@gta.com",
    });
  });

  it("voltar a um status aberto apaga os quatro", () => {
    for (const de of ["entregue", "concluida"]) {
      for (const para of ["afazer", "andamento", "atraso", "continuo"]) {
        expect(carimbosDaTransicao(de, para, "x@gta.com", AGORA), `${de}→${para}`).toEqual(VAZIOS);
      }
    }
  });

  it("status igual não carimba nada", () => {
    // Salvar a tarefa não é entregá-la de novo.
    expect(carimbosDaTransicao("entregue", "entregue", "ana@gta.com", AGORA)).toEqual({});
    expect(carimbosDaTransicao("concluida", "concluida", "ana@gta.com", AGORA)).toEqual({});
  });
});

describe("STATUS_ABERTOS", () => {
  it("todo status é aberto, entregue ou verificado — um status novo não fica sem regra", () => {
    // A devolução e a limpeza dos carimbos dependem desta lista. Um status
    // acrescentado em STATUS_TAREFA e esquecido aqui não seria aberto nem
    // fechado: os carimbos ficariam velhos e a devolução não o alcançaria.
    const classificados = [...STATUS_ABERTOS, "entregue", "concluida"].sort();
    expect(classificados).toEqual(STATUS_TAREFA.map((s) => s.value).sort());
  });
});

describe("ehDevolucao", () => {
  it("só de entregue para um status aberto", () => {
    expect(ehDevolucao("entregue", "andamento")).toBe(true);
    expect(ehDevolucao("entregue", "afazer")).toBe(true);
    expect(ehDevolucao("entregue", "concluida")).toBe(false);
    expect(ehDevolucao("concluida", "andamento")).toBe(false);
    expect(ehDevolucao("andamento", "afazer")).toBe(false);
  });
});

describe("bloqueioDaTransicao", () => {
  const tarefa = (status: string) => ({ status: status as never, responsavel: "Ana@GTA.com " });
  const ANA = { email: "ana@gta.com", podeVerificar: false };
  const ANA_CHEFE = { email: "ana@gta.com", podeVerificar: true };
  const CHEFE = { email: "chefe@gta.com", podeVerificar: true };
  const BRUNO = { email: "bruno@gta.com", podeVerificar: false };

  it("verificar exige a permissão — inclusive de quem demandou", () => {
    expect(bloqueioDaTransicao(tarefa("entregue"), "concluida", BRUNO)).toMatch(/administradores/);
    expect(bloqueioDaTransicao(tarefa("entregue"), "concluida", ANA)).toMatch(/administradores/);
    expect(bloqueioDaTransicao(tarefa("entregue"), "concluida", CHEFE)).toBeNull();
  });

  it("com a permissão, o próprio responsável pode verificar", () => {
    // A escolha do dono foi "só administradores e permissão", sem exceção
    // para o responsável: um gestor que executa a própria tarefa a encerra.
    expect(bloqueioDaTransicao(tarefa("entregue"), "concluida", ANA_CHEFE)).toBeNull();
  });

  it("qualquer pessoa marca uma tarefa como entregue", () => {
    expect(bloqueioDaTransicao(tarefa("andamento"), "entregue", BRUNO)).toBeNull();
  });

  it("devolver pelo seletor é recusado: passa pela rota que avisa o responsável", () => {
    expect(bloqueioDaTransicao(tarefa("entregue"), "andamento", CHEFE)).toMatch(/Devolver ao responsável/);
    expect(bloqueioDaTransicao(tarefa("entregue"), "andamento", BRUNO)).toMatch(/Só o responsável/);
  });

  it("o responsável reabre a própria entrega (e-mail sem caixa nem espaço)", () => {
    expect(bloqueioDaTransicao(tarefa("entregue"), "andamento", ANA)).toBeNull();
  });

  it("status igual nunca é bloqueado", () => {
    expect(bloqueioDaTransicao(tarefa("concluida"), "concluida", BRUNO)).toBeNull();
    expect(bloqueioDaTransicao(tarefa("entregue"), "entregue", BRUNO)).toBeNull();
  });

  it("reabrir uma tarefa verificada segue livre", () => {
    // Reabrir só acrescenta trabalho; não há verificação a proteger ali.
    expect(bloqueioDaTransicao(tarefa("concluida"), "andamento", BRUNO)).toBeNull();
  });
});

describe("podemVerificar", () => {
  const usuario = (over: Partial<User>): User => ({
    id: over.email ?? "x",
    email: "x@gta.com",
    name: "X",
    passwordHash: "",
    role: "member",
    mustChangePassword: false,
    active: true,
    criadoEm: "",
    atualizadoEm: "",
    ...over,
  });
  const cargo = (id: string, permissoes: string[]): Cargo => ({
    id,
    nome: id,
    permissoes: permissoes as Cargo["permissoes"],
    builtin: false,
    criadoEm: "",
    atualizadoEm: "",
  });

  it("admin ativo e quem tem o cargo com a chave; o resto não", () => {
    const lista = [
      usuario({ email: "admin@gta.com", role: "admin" }),
      usuario({ email: "admin-inativo@gta.com", role: "admin", active: false }),
      usuario({ email: "gestor@gta.com", cargoId: "gestao" }),
      usuario({ email: "tecnico@gta.com", cargoId: "campo" }),
      usuario({ email: "sem-cargo@gta.com" }),
      usuario({ email: "cargo-apagado@gta.com", cargoId: "nao-existe" }),
    ];
    const cargos = [cargo("gestao", ["tarefas.verificar", "financeiro.ver"]), cargo("campo", ["servicos.editar"])];
    expect(podemVerificar(lista, cargos).map((u) => u.email)).toEqual(["admin@gta.com", "gestor@gta.com"]);
  });
});
