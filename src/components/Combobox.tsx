"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { ITEM_NOVO, itensVisiveis, moverAtivo, recortar, valorEscolhido } from "./combobox-lista";

/**
 * Escolher de uma lista — com a opção de acrescentar um valor que não está nela.
 *
 * ## O problema que ele resolve
 *
 * A plataforma tinha DOIS controles para a mesma tarefa, e eles não se pareciam
 * em nada:
 *
 * - Valores fixos (prioridade, status) usavam `<select>`: caixa com seta,
 *   lista que abre, teclado previsível.
 * - Valores abertos (categoria, cliente, tipo de demanda) usavam `<input
 *   list=…>` com `<datalist>`: parece uma caixa de texto, a lista abre por
 *   regra própria de cada navegador, e o comportamento no Firefox, no Chrome e
 *   no Safari é diferente em cada um.
 *
 * Para quem usa, os dois deveriam ser a mesma coisa: "escolher algo". A
 * diferença era um detalhe de implementação vazando para a tela.
 *
 * ## Por que não dá para usar `<select>` e pronto
 *
 * `<select>` não aceita valor fora da lista, e `<datalist>` não é estilizável —
 * nenhum navegador expõe a lista ao CSS. Ficar parecido com um `<select>` E
 * aceitar valor novo exige construir o controle: um botão com aparência de
 * campo, uma lista própria, e o teclado feito à mão.
 *
 * ## O que é feito à mão aqui, e por quê
 *
 * - **Teclado**: setas, Enter, Escape, Home/End. Sem isso o controle fica
 *   inacessível — `<select>` dá tudo isso de graça e é fácil esquecer que agora
 *   é dívida nossa.
 * - **`aria-activedescendant`**: o foco permanece no campo de busca enquanto a
 *   seleção anda pela lista. É o padrão de combobox da WAI-ARIA; sem ele o
 *   leitor de tela não anuncia a opção destacada.
 * - **Fechar ao clicar fora**: em `pointerdown`, não em `click`. Em `click` o
 *   botão que recebeu o clique já teria disparado antes de a lista fechar.
 */

export interface ComboboxProps {
  value: string;
  onChange: (v: string) => void;
  /** Sugestões. Podem crescer: o que for digitado e aceito volta aqui pelo pai. */
  options: readonly string[];
  /** Deixa aceitar valor fora da lista. Falso = comporta-se como `<select>`. */
  permitirNovo?: boolean;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
  /** Texto do item de criação. `{v}` é trocado pelo que foi digitado. */
  rotuloNovo?: string;
  /** Máximo de itens no DOM. A busca continua cobrindo a lista inteira. */
  maxVisiveis?: number;
  /**
   * Deixa apagar uma opção pela própria lista. Ausente = ninguém apaga nada,
   * que continua sendo o caso da maioria das telas — por isso é opcional, e não
   * um comportamento novo para todo mundo.
   *
   * Quem recebe decide se a exclusão pode acontecer (item em uso, permissão) e
   * atualiza `options`.
   */
  onExcluir?: (valor: string) => void;
  /** Rótulo acessível do botão de excluir. `{v}` é trocado pelo item. */
  rotuloExcluir?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  permitirNovo = true,
  placeholder = "Escolher…",
  id,
  disabled,
  className = "",
  rotuloNovo = "Usar “{v}”",
  maxVisiveis = 100,
  onExcluir,
  rotuloExcluir = "Excluir “{v}”",
  ...resto
}: ComboboxProps) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const idLista = `${idCampo}-lista`;
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const campoBusca = useRef<HTMLInputElement>(null);

  /* A lógica de lista mora em `combobox-lista.ts`, testada sem navegador. Aqui
     havia uma cópia dela — e cópia de regra é o que fez o preço do carregador
     divergir entre engine e tela. */
  const { itens, ocultos } = useMemo(() => {
    const todos = itensVisiveis(options, busca, permitirNovo);
    const r = recortar(todos, maxVisiveis);
    /* O item de criar não pode ser cortado: ele mora no fim, e é justamente com
       lista grande que ele mais importa. */
    if (r.ocultos > 0 && todos[todos.length - 1] === ITEM_NOVO) {
      r.visiveis[r.visiveis.length - 1] = ITEM_NOVO;
    }
    return { itens: r.visiveis, ocultos: r.ocultos };
  }, [options, busca, permitirNovo, maxVisiveis]);

  useEffect(() => {
    if (!aberto) return;
    const foraDaCaixa = (e: PointerEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) fechar();
    };
    document.addEventListener("pointerdown", foraDaCaixa);
    return () => document.removeEventListener("pointerdown", foraDaCaixa);
  }, [aberto]);

  useEffect(() => {
    if (aberto) campoBusca.current?.focus();
  }, [aberto]);

  // A opção destacada tem que estar visível: navegar com as setas até o fim de
  // uma lista de vinte itens sem isto rola a página, não a lista.
  useEffect(() => {
    if (!aberto) return;
    document.getElementById(`${idLista}-${ativo}`)?.scrollIntoView({ block: "nearest" });
  }, [ativo, aberto, idLista]);

  function abrir() {
    if (disabled) return;
    setBusca("");
    const i = options.findIndex((o) => o === value);
    setAtivo(i >= 0 ? i : 0);
    setAberto(true);
  }

  function fechar() {
    setAberto(false);
    setBusca("");
  }

  function escolher(i: number) {
    const v = valorEscolhido(itens, i, busca);
    if (v === undefined) return;
    onChange(v);
    fechar();
  }

  function teclado(e: React.KeyboardEvent) {
    if (!aberto) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrir();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setAtivo((a) => moverAtivo(a, 1, itens.length));
        break;
      case "ArrowUp":
        e.preventDefault();
        setAtivo((a) => moverAtivo(a, -1, itens.length));
        break;
      case "Home":
        e.preventDefault();
        setAtivo(0);
        break;
      case "End":
        e.preventDefault();
        setAtivo(moverAtivo(0, itens.length, itens.length));
        break;
      case "Enter":
        e.preventDefault();
        escolher(ativo);
        break;
      case "Escape":
        e.preventDefault();
        fechar();
        break;
      case "Tab":
        // Tab confirma e segue: prender o foco aqui quebraria o formulário.
        fechar();
        break;
    }
  }

  return (
    <div ref={caixa} className={`relative ${className}`}>
      <button
        type="button"
        id={idCampo}
        disabled={disabled}
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={teclado}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? idLista : undefined}
        aria-label={resto["aria-label"]}
        className="field-input flex items-center justify-between gap-2 text-left"
      >
        <span className={value ? "truncate" : "truncate text-slate-400 dark:text-slate-500"}>
          {value || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </button>

      {aberto && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
          <div className="border-b border-slate-200 p-2 dark:border-slate-700">
            <input
              ref={campoBusca}
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setAtivo(0);
              }}
              onKeyDown={teclado}
              placeholder={permitirNovo ? "Buscar ou escrever…" : "Buscar…"}
              aria-label="Buscar na lista"
              aria-autocomplete="list"
              aria-controls={idLista}
              aria-activedescendant={itens.length ? `${idLista}-${ativo}` : undefined}
              className="field-input !py-1.5"
            />
          </div>

          <ul id={idLista} role="listbox" className="max-h-60 overflow-y-auto p-1">
            {itens.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                Nada encontrado.
              </li>
            )}
            {itens.map((o, i) => {
              const criar = o === ITEM_NOVO;
              return (
                <li
                  key={criar ? "__novo" : o}
                  id={`${idLista}-${i}`}
                  role="option"
                  aria-selected={!criar && o === value}
                  onMouseEnter={() => setAtivo(i)}
                  onClick={() => escolher(i)}
                  className={`flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm ${
                    i === ativo
                      ? "bg-gta-indigo/10 text-gta-navy dark:bg-gta-indigo/25 dark:text-slate-100"
                      : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {criar ? (
                    <>
                      <Plus className="h-4 w-4 shrink-0 text-gta-indigo dark:text-indigo-300" aria-hidden />
                      <span className="truncate">{rotuloNovo.replace("{v}", busca.trim())}</span>
                    </>
                  ) : (
                    <>
                      <Check
                        className={`h-4 w-4 shrink-0 ${o === value ? "text-gta-indigo dark:text-indigo-300" : "opacity-0"}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{o}</span>
                      {/* `stopPropagation`: sem ele o clique sobe para o <li> e
                          o item seria escolhido no mesmo gesto que o apaga. */}
                      {onExcluir && (
                        <button
                          type="button"
                          className="remover-ficha shrink-0"
                          aria-label={rotuloExcluir.replace("{v}", o)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onExcluir(o);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {ocultos > 0 && (
            <div className="border-t border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Mostrando {itens.length} de {options.length} — continue digitando para refinar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
