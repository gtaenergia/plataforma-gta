"use client";

import { useEffect, useState } from "react";

/**
 * Avisa antes de perder o que foi editado e não salvo.
 *
 * As telas de configuração da plataforma guardam a edição em memória até
 * alguém clicar em Salvar. Quem digita o custo-hora de seis pessoas e fecha a
 * aba perde tudo em silêncio — nenhum erro, nenhuma pergunta, e o preço
 * continua saindo com o valor antigo, que é pior do que sair errado, porque
 * parece certo.
 *
 * São DUAS saídas, e o navegador só cobre uma:
 *
 * - **Fechar, recarregar ou sair do site** → `beforeunload`. O navegador mostra
 *   um diálogo próprio, e o texto é dele: navegador nenhum aceita mensagem
 *   customizada desde 2017. Por isso não passamos texto.
 * - **Clicar num link da própria plataforma** → o `beforeunload` NÃO dispara,
 *   porque não há recarga de página. O App Router também não oferece um
 *   bloqueador de navegação. Interceptamos o clique em `<a>` na fase de
 *   captura, antes de o Next tratá-lo.
 *
 * Nenhuma das duas substitui o aviso VISÍVEL na tela. As duas são a rede; o
 * selo de "não salvo" é o que faz a pessoa não chegar até aqui.
 */
export function useAvisoNaoSalvo(sujo: boolean) {
  useEffect(() => {
    if (!sujo) return;

    const aoSair = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Exigido por navegadores antigos; os atuais ignoram o valor.
      e.returnValue = "";
    };

    const aoClicar = (e: MouseEvent) => {
      // Clique com modificador abre em outra aba: esta página não vai a lugar
      // nenhum, e perguntar seria ruído.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const alvo = (e.target as HTMLElement | null)?.closest?.("a");
      if (!alvo) return;
      const href = alvo.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (alvo.target && alvo.target !== "_self") return;

      // Link para a MESMA página não perde nada.
      const destino = new URL(alvo.href, window.location.href);
      if (destino.pathname === window.location.pathname) return;

      if (!window.confirm("Há alterações não salvas nesta página. Sair mesmo assim?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", aoSair);
    // Captura: o Next escuta na fase de bolha, e precisamos decidir antes dele.
    document.addEventListener("click", aoClicar, true);
    return () => {
      window.removeEventListener("beforeunload", aoSair);
      document.removeEventListener("click", aoClicar, true);
    };
  }, [sujo]);
}

/**
 * Edição pendente de gravação, para telas em que "sujo" não se deduz do estado.
 *
 * Comparar o formulário com o valor inicial não serve nos configuradores: eles
 * se auto-preenchem sozinhos — a referência da proposta chega da API, o preço
 * sugerido vem do cálculo — e a tela ficaria "suja" sem ninguém ter tocado em
 * nada. Aviso que aparece à toa é aviso que se aprende a ignorar.
 *
 * A fronteira usada é a que o código já tinha: `set(...)` é edição de gente,
 * `setForm(f => ...)` direto é a máquina preenchendo. Só a primeira marca.
 */
export function useEdicaoPendente(): {
  pendente: boolean;
  marcarEditado: () => void;
  marcarSalvo: () => void;
} {
  const [pendente, setPendente] = useState(false);
  useAvisoNaoSalvo(pendente);
  return {
    pendente,
    marcarEditado: () => setPendente(true),
    marcarSalvo: () => setPendente(false),
  };
}
