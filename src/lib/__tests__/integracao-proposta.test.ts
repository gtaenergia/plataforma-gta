import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  casarCliente,
  casarContato,
  dataDoFollowUp,
  hashDoToken,
  PREFIXO_TOKEN,
  tokenConfere,
  tokenDoCabecalho,
} from "@/lib/integracao/regras";

/**
 * A integração "proposta do chat → CRM": as regras puras e a rota de verdade.
 *
 * A rota roda contra os stores JSON num diretório temporário (mesmo arranjo do
 * `crm-fluxo.test.ts`). Aqui não há sessão a fingir — a autenticação é o token.
 */

const TOKEN = `${PREFIXO_TOKEN}teste-0123456789abcdefghijklmnopqrstuvwxyz`;
const TITO = { email: "tito@gta.com", name: "Tito" };

// --------------------------------------------------------------- Regras

describe("Data do follow-up", () => {
  it("dois dias depois", () => {
    expect(dataDoFollowUp("2026-10-07")).toBe("2026-10-09"); // qua → sex
  });
  it("caindo no domingo, vai para a segunda", () => {
    expect(dataDoFollowUp("2026-10-09")).toBe("2026-10-12"); // sex → dom → seg
  });
  it("sábado fica no sábado", () => {
    expect(dataDoFollowUp("2026-10-08")).toBe("2026-10-10");
  });
  it("atravessa o mês sem tropeçar", () => {
    expect(dataDoFollowUp("2026-10-30")).toBe("2026-11-02"); // sex → dom 1º → seg 2
  });
});

describe("Token", () => {
  const hash = hashDoToken(TOKEN);
  it("confere só o token certo", () => {
    expect(tokenConfere(TOKEN, hash)).toBe(true);
    expect(tokenConfere(TOKEN + "x", hash)).toBe(false);
    expect(tokenConfere("", hash)).toBe(false);
  });
  it("sem o prefixo, recusa mesmo que o hash bata", () => {
    const semPrefixo = "qualquer-coisa";
    expect(tokenConfere(semPrefixo, hashDoToken(semPrefixo))).toBe(false);
  });
  it("hash mal configurado nunca deixa passar", () => {
    expect(tokenConfere(TOKEN, "")).toBe(false);
    expect(tokenConfere(TOKEN, TOKEN)).toBe(false);
  });
  it("lê só o formato Bearer", () => {
    expect(tokenDoCabecalho(`Bearer ${TOKEN}`)).toBe(TOKEN);
    expect(tokenDoCabecalho(TOKEN)).toBe("");
    expect(tokenDoCabecalho(null)).toBe("");
  });
});

describe("Qual cliente é este", () => {
  const cadastro = [
    { id: "a", nome: "Supermercado Santa Fé", documento: "12.345.678/0001-90" },
    { id: "b", nome: "Padaria Pão Quente", documento: "" },
    { id: "c", nome: "Oficina Central", documento: "" },
    { id: "d", nome: "Oficina  CENTRAL", documento: "" },
  ];
  it("pelo CNPJ, com ou sem pontuação", () => {
    expect(casarCliente({ nome: "Outro nome", documento: "12345678000190" }, cadastro)).toMatchObject({
      tipo: "existente",
      cliente: { id: "a" },
    });
  });
  it("pelo nome, sem acento nem caixa, só entre cadastros sem documento", () => {
    expect(casarCliente({ nome: "padaria pao quente", documento: "" }, cadastro)).toMatchObject({
      tipo: "existente",
      cliente: { id: "b" },
    });
  });
  it("só com o nome, acha também quem já está cadastrado com CNPJ", () => {
    expect(casarCliente({ nome: "supermercado santa fe", documento: "" }, cadastro)).toMatchObject({
      tipo: "existente",
      cliente: { id: "a" },
    });
  });
  it("mesmo nome com CNPJ diferente é outra empresa", () => {
    expect(casarCliente({ nome: "Supermercado Santa Fé", documento: "99.999.999/0001-99" }, cadastro)).toEqual({
      tipo: "novo",
    });
  });
  it("dois homônimos sem documento é ambíguo — não escolhe ao acaso", () => {
    expect(casarCliente({ nome: "Oficina Central", documento: "" }, cadastro)).toEqual({ tipo: "ambiguo", quantos: 2 });
  });
});

describe("Qual contato é este", () => {
  const contatos = [
    { id: "1", nome: "João Silva", email: "joao@x.com", telefone: "(62) 99999-1234", empresaId: "a" },
    { id: "2", nome: "Maria", email: "", telefone: "", empresaId: "b" },
  ];
  it("por e-mail, depois telefone, depois nome — só na mesma empresa", () => {
    expect(casarContato({ nome: "J.", email: "JOAO@x.com", telefone: "" }, "a", contatos)?.id).toBe("1");
    expect(casarContato({ nome: "J.", email: "", telefone: "62999991234" }, "a", contatos)?.id).toBe("1");
    expect(casarContato({ nome: "Maria", email: "", telefone: "" }, "b", contatos)?.id).toBe("2");
    expect(casarContato({ nome: "Maria", email: "", telefone: "" }, "a", contatos)).toBeNull();
  });
});

// ----------------------------------------------------------------- Rota

type Rota = typeof import("@/app/api/integracoes/proposta/route");
let rota: Rota;
let cwdOriginal: string;
let tmp: string;

const chamar = (corpo: unknown, opts: { token?: string | null; ip?: string; tipo?: string } = {}) => {
  const headers: Record<string, string> = {
    "content-type": opts.tipo ?? "application/json",
    "x-forwarded-for": opts.ip ?? "10.0.0.1",
  };
  const token = opts.token === undefined ? TOKEN : opts.token;
  if (token) headers.authorization = `Bearer ${token}`;
  return rota.POST(
    new Request("http://localhost/api/integracoes/proposta", { method: "POST", headers, body: JSON.stringify(corpo) }),
  );
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const corpoDe = async (res: Response) => res.json() as Promise<any>;

const PROPOSTA = {
  acao: "registrar",
  cliente: {
    nome: "Supermercado Santa Fé",
    tipoPessoa: "PJ",
    documento: "12.345.678/0001-90",
    cidade: "Goiânia",
    uf: "GO",
  },
  contato: { nome: "João Silva", cargo: "Gerente", email: "joao@santafe.com", telefone: "(62) 99999-1234" },
  proposta: {
    referencia: "GTA-2026-SANTAFE-PROP-001",
    servico: "Assessoria CBMGO",
    objeto: "Regularização junto ao CBMGO",
    valor: 8500,
    validadeDias: 15,
  },
};

const stores = async () => ({
  clientes: (await import("@/lib/clientes/store")).getClienteStore(),
  contatos: (await import("@/lib/crm/contatos-store")).getContatoStore(),
  negociacoes: (await import("@/lib/crm/negociacoes-store")).getNegociacaoStore(),
  propostas: (await import("@/lib/propostas/store")).getPropostaStore(),
  tarefas: (await import("@/lib/crm/tarefas-store")).getTarefaCrmStore(),
  funis: (await import("@/lib/crm/funis-store")).getFunilStore(),
});

beforeAll(async () => {
  cwdOriginal = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "integracao-"));
  process.chdir(tmp);
  vi.stubEnv("INTEGRACAO_TOKEN_SHA256", hashDoToken(TOKEN));
  vi.stubEnv("INTEGRACAO_USUARIO_EMAIL", TITO.email);

  rota = await import("@/app/api/integracoes/proposta/route");

  const { users } = await import("@/lib/users/store");
  await (await users()).create({
    email: TITO.email, name: TITO.name, passwordHash: "x", role: "admin", comercial: true,
    mustChangePassword: false, active: true,
  });

  // Quarta-feira, 7/10/2026, meio-dia em São Paulo.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T15:00:00Z"));
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  process.chdir(cwdOriginal);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Portaria", () => {
  it("sem hash configurado, a rota não existe", async () => {
    vi.stubEnv("INTEGRACAO_TOKEN_SHA256", "");
    expect((await chamar(PROPOSTA)).status).toBe(404);
    vi.stubEnv("INTEGRACAO_TOKEN_SHA256", hashDoToken(TOKEN));
  });

  it("sem token ou com token errado: 401", async () => {
    expect((await chamar(PROPOSTA, { token: null, ip: "10.9.9.1" })).status).toBe(401);
    expect((await chamar(PROPOSTA, { token: `${PREFIXO_TOKEN}errado`, ip: "10.9.9.1" })).status).toBe(401);
  });

  it("depois de 10 falhas, o IP fica freado — até com o token certo", async () => {
    for (let i = 0; i < 10; i++) await chamar(PROPOSTA, { token: `${PREFIXO_TOKEN}chute${i}`, ip: "10.6.6.6" });
    expect((await chamar({ acao: "verificar-cliente", nome: "x" }, { ip: "10.6.6.6" })).status).toBe(429);
    // Outro IP não paga pelo vizinho.
    expect((await chamar({ acao: "verificar-cliente", nome: "x" }, { ip: "10.6.6.7" })).status).toBe(200);
  });

  it("só aceita JSON", async () => {
    expect((await chamar(PROPOSTA, { tipo: "text/plain" })).status).toBe(415);
  });

  it("campo desconhecido é recusado, não ignorado", async () => {
    const res = await chamar({ ...PROPOSTA, responsavel: "outra@pessoa.com" });
    expect(res.status).toBe(422);
  });

  it("usuário da integração inativo ou ausente: 503, nada gravado", async () => {
    vi.stubEnv("INTEGRACAO_USUARIO_EMAIL", "ninguem@gta.com");
    expect((await chamar(PROPOSTA)).status).toBe(503);
    vi.stubEnv("INTEGRACAO_USUARIO_EMAIL", TITO.email);
    expect(await (await stores()).clientes.list()).toHaveLength(0);
  });
});

describe("Registro de uma proposta", () => {
  it("verificar: cliente novo ainda não está no cadastro", async () => {
    const res = await chamar({ acao: "verificar-cliente", nome: "Supermercado Santa Fé", documento: "12345678000190" });
    expect(await corpoDe(res)).toEqual({ encontrado: false });
  });

  it("simular mostra o plano e não grava nada", async () => {
    const res = await chamar({ ...PROPOSTA, acao: "simular" });
    expect(res.status).toBe(200);
    expect((await corpoDe(res)).simulacao).toEqual({
      cliente: { nome: "Supermercado Santa Fé", situacao: "será cadastrado" },
      contato: { nome: "João Silva", situacao: "será cadastrado" },
      negociacao: { funil: "Funil de vendas", etapa: "Proposta enviada" },
      followUp: "2026-10-09",
    });
    const s = await stores();
    expect(await s.clientes.list()).toHaveLength(0);
    expect(await s.funis.list()).toHaveLength(0);
  });

  it("registrar cria cliente, contato, negociação, proposta e follow-up — no meu nome", async () => {
    const res = await chamar(PROPOSTA);
    expect(res.status).toBe(201);
    const r = (await corpoDe(res)).registrado;
    const s = await stores();

    const cliente = await s.clientes.get(r.clienteId);
    expect(cliente).toMatchObject({ nome: "Supermercado Santa Fé", documento: "12.345.678/0001-90", contatoNome: "João Silva", criadoPor: TITO.email });

    const contato = await s.contatos.get(r.contatoId);
    expect(contato).toMatchObject({ nome: "João Silva", empresaId: r.clienteId, email: "joao@santafe.com" });

    const neg = await s.negociacoes.get(r.negociacaoId);
    const funil = (await s.funis.list())[0];
    expect(funil.etapas.find((e) => e.id === neg!.etapaId)?.nome).toBe("Proposta enviada");
    expect(neg).toMatchObject({
      nome: "Regularização junto ao CBMGO",
      valor: 8500,
      empresaId: r.clienteId,
      contatoIds: [r.contatoId],
      responsavel: TITO.email,
      responsavelNome: TITO.name,
      situacao: "aberta",
    });
    expect(neg!.anotacoes.map((a) => a.texto).join(" | ")).toContain("Tarefa agendada");

    const proposta = await s.propostas.get(r.propostaId);
    expect(proposta).toMatchObject({
      referencia: "GTA-2026-SANTAFE-PROP-001",
      serviceKey: "outro",
      manual: true,
      status: "gerada",
      dados: { negociacaoId: r.negociacaoId, valor: 8500, servicoOutro: "Assessoria CBMGO", dataEmissao: "2026-10-07" },
    });

    const tarefa = await s.tarefas.get(r.tarefaId);
    expect(tarefa).toMatchObject({
      negociacaoId: r.negociacaoId,
      clienteId: r.clienteId,
      data: "2026-10-09",
      responsavel: TITO.email,
      concluida: false,
    });

    // O aviso no sino é também o alarme de uso indevido.
    const { getNotificacaoStore } = await import("@/lib/notificacoes/store");
    expect((await getNotificacaoStore().listPara(TITO.email))[0]).toMatchObject({
      tipo: "integracao_proposta",
      link: `/crm/negociacoes/${r.negociacaoId}`,
    });
  });

  it("verificar agora encontra — e devolve só o nome", async () => {
    const res = await chamar({ acao: "verificar-cliente", documento: "12345678000190" });
    expect(await corpoDe(res)).toEqual({ encontrado: true, nome: "Supermercado Santa Fé" });
  });

  it("a mesma referência de novo é recusada, sem gravar nada", async () => {
    const s = await stores();
    const antes = (await s.negociacoes.list()).length;
    const res = await chamar(PROPOSTA);
    expect(res.status).toBe(409);
    expect(await s.negociacoes.list()).toHaveLength(antes);
  });

  it("segunda proposta do mesmo cliente reaproveita cadastro e contato", async () => {
    const res = await chamar({
      ...PROPOSTA,
      cliente: { nome: "Santa Fe Supermercados", documento: "12345678000190" },
      contato: { nome: "João", email: "JOAO@santafe.com" },
      proposta: { ...PROPOSTA.proposta, referencia: "GTA-2026-SANTAFE-PROP-002", valor: 3200 },
    });
    expect(res.status).toBe(201);
    const s = await stores();
    expect(await s.clientes.list()).toHaveLength(1);
    expect(await s.contatos.list()).toHaveLength(1);
    expect(await s.negociacoes.list()).toHaveLength(2);
  });

  it("falhou no meio, desfaz tudo o que criou", async () => {
    const s = await stores();
    const antes = {
      clientes: (await s.clientes.list()).length,
      contatos: (await s.contatos.list()).length,
      negociacoes: (await s.negociacoes.list()).length,
      propostas: (await s.propostas.list()).length,
    };
    const espiao = vi.spyOn(s.tarefas, "create").mockRejectedValueOnce(new Error("banco caiu"));
    const res = await chamar({
      ...PROPOSTA,
      cliente: { nome: "Cliente Que Some" },
      contato: { nome: "Fulano" },
      proposta: { ...PROPOSTA.proposta, referencia: "GTA-2026-SOME-PROP-001" },
    });
    espiao.mockRestore();
    expect(res.status).toBe(500);
    expect((await corpoDe(res)).error).not.toContain("banco caiu");
    expect((await s.clientes.list()).length).toBe(antes.clientes);
    expect((await s.contatos.list()).length).toBe(antes.contatos);
    expect((await s.negociacoes.list()).length).toBe(antes.negociacoes);
    expect((await s.propostas.list()).length).toBe(antes.propostas);
  });

  it("cada chamada fica no log, sem dado pessoal do cliente", async () => {
    const log = JSON.parse(fs.readFileSync(path.join(tmp, "data", "integracao-log.json"), "utf8")) as {
      acao: string; resultado: string; detalhe: string; referencia: string;
    }[];
    expect(log.some((e) => e.acao === "registrar" && e.resultado === "ok")).toBe(true);
    expect(log.some((e) => e.resultado === "auth_falhou")).toBe(true);
    expect(JSON.stringify(log)).not.toContain("12.345.678");
    expect(JSON.stringify(log)).not.toContain("joao@santafe.com");
  });
});
