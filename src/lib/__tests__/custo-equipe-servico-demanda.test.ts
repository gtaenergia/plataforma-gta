import { describe, expect, it } from "vitest";
import { chavesMapeadas, tipoSugeridoDoServico, type Escopo } from "@/lib/custo-equipe/servico-demanda";
import { SERVICES } from "@/services/registry";
import { TIPOS_PADRAO } from "@/lib/capacidade/types";

const ESCOPOS: Escopo[] = ["projeto", "orcamento"];

describe("mapa serviço → tipo de demanda", () => {
  it("todo serviço do registro passou por uma decisão", () => {
    const mapeadas = new Set(chavesMapeadas());
    const semDecisao = SERVICES.filter((s) => !mapeadas.has(s.key)).map((s) => s.key);
    // Serviço novo entra aqui até alguém dizer quais tipos de demanda ele
    // consome — inclusive para dizer "nenhum", que é resposta legítima.
    expect(semDecisao).toEqual([]);
  });

  it("o mapa não inventa serviço que não existe", () => {
    const doRegistro = new Set(SERVICES.map((s) => s.key));
    expect(chavesMapeadas().filter((k) => !doRegistro.has(k))).toEqual([]);
  });

  it("todo tipo sugerido existe mesmo no catálogo", () => {
    for (const chave of chavesMapeadas()) {
      for (const escopo of ESCOPOS) {
        const t = tipoSugeridoDoServico(chave, escopo);
        if (!t) continue;
        const existe = TIPOS_PADRAO.some((p) => p.categoria === t.categoria && p.nome === t.nome);
        expect(existe, `${chave}/${escopo} aponta para "${t.categoria} / ${t.nome}", fora do catálogo`).toBe(true);
      }
    }
  });

  it("cada escopo puxa da sua categoria — nunca da outra", () => {
    for (const chave of chavesMapeadas()) {
      expect(tipoSugeridoDoServico(chave, "projeto")?.categoria ?? "Projetos").toBe("Projetos");
      expect(tipoSugeridoDoServico(chave, "orcamento")?.categoria ?? "Orçamentos").toBe("Orçamentos");
    }
  });

  it("executar não puxa as horas de projetar", () => {
    // Cobraria as 40 h de projeto de quem contratou só a obra.
    expect(tipoSugeridoDoServico("execucao-subestacao", "projeto")).toBeUndefined();
    // Mas orçar a execução é o mesmo trabalho de orçar uma subestação.
    expect(tipoSugeridoDoServico("execucao-subestacao", "orcamento")?.nome).toBe("Subestação");
  });

  it("serviço sem correspondência honesta devolve indefinido, não um palpite", () => {
    expect(tipoSugeridoDoServico("solar", "projeto")).toBeUndefined();
    expect(tipoSugeridoDoServico("solar", "orcamento")).toBeUndefined(); // residencial x comercial
    expect(tipoSugeridoDoServico("limpeza", "orcamento")).toBeUndefined();
  });

  it("chave desconhecida não explode", () => {
    expect(tipoSugeridoDoServico("nao-existe", "projeto")).toBeUndefined();
  });
});
