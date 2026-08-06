import { describe, expect, it } from "vitest";
import { chavesMapeadas, tipoSugeridoDoServico } from "@/lib/custo-equipe/servico-demanda";
import { SERVICES } from "@/services/registry";
import { TIPOS_PADRAO } from "@/lib/capacidade/types";

describe("mapa serviço → tipo de demanda", () => {
  it("todo serviço do registro passou por uma decisão", () => {
    const mapeadas = new Set(chavesMapeadas());
    const semDecisao = SERVICES.filter((s) => !mapeadas.has(s.key)).map((s) => s.key);
    // Serviço novo entra aqui até alguém dizer qual tipo de demanda ele consome
    // — inclusive para dizer "nenhum", que é uma resposta legítima.
    expect(semDecisao).toEqual([]);
  });

  it("o mapa não inventa serviço que não existe", () => {
    const doRegistro = new Set(SERVICES.map((s) => s.key));
    expect(chavesMapeadas().filter((k) => !doRegistro.has(k))).toEqual([]);
  });

  it("todo tipo sugerido existe mesmo no catálogo", () => {
    for (const chave of chavesMapeadas()) {
      const t = tipoSugeridoDoServico(chave);
      if (!t) continue;
      const existe = TIPOS_PADRAO.some((p) => p.categoria === t.categoria && p.nome === t.nome);
      expect(existe, `${chave} aponta para "${t.categoria} / ${t.nome}", que não está no catálogo`).toBe(true);
    }
  });

  it("serviço sem correspondência honesta devolve indefinido, não um palpite", () => {
    expect(tipoSugeridoDoServico("solar")).toBeUndefined();
    expect(tipoSugeridoDoServico("limpeza")).toBeUndefined();
  });

  it("chave desconhecida não explode", () => {
    expect(tipoSugeridoDoServico("nao-existe")).toBeUndefined();
  });
});
