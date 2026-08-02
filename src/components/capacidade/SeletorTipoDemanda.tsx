"use client";

import { useEffect, useId, useState } from "react";
import { acharTipo, tiposDaCategoria } from "@/lib/capacidade/motor";
import type { ConfigCapacidade } from "@/lib/capacidade/types";
import { horasParaMin, minParaHoras } from "./comum";

/**
 * Tipo de demanda dentro da categoria.
 *
 * Campo de texto com sugestões (`datalist`), o mesmo padrão de Cliente e
 * Categoria: digitar é o ato natural e o catálogo é atalho, não trava. Demanda
 * específica é rotina numa empresa de projetos.
 *
 * Ao digitar um tipo que não existe, abre-se um bloco para CONFIGURÁ-LO — a
 * duração — e a decisão fica com quem está preenchendo: usar só nesta tarefa
 * ou incorporar ao catálogo. Antes havia só um link que já assumia o cadastro,
 * sem oferecer a alternativa nem mostrar o que seria gravado.
 */

export function SeletorTipoDemanda({
  categoria,
  valor,
  config,
  onChange,
  id,
  estimativaMin = 0,
  onEstimativaChange,
  onAdicionarAoCatalogo,
}: {
  categoria: string;
  valor: string;
  config: ConfigCapacidade;
  onChange: (v: string) => void;
  id?: string;
  /** Duração da tarefa — é ela que o bloco configura. */
  estimativaMin?: number;
  onEstimativaChange?: (minutos: number) => void;
  /** Ausente para quem não pode editar os parâmetros de planejamento. */
  onAdicionarAoCatalogo?: (categoria: string, nome: string, minutos: number) => Promise<void>;
}) {
  const listaId = useId();
  const [decidido, setDecidido] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<"catalogo" | "avulso" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const tipos = tiposDaCategoria(config, categoria);
  const semCategoria = !categoria.trim();
  const nome = valor.trim();
  const novo = Boolean(nome) && !acharTipo(config, categoria, nome);

  // Trocar o tipo (ou a categoria) desfaz a decisão anterior: ela valia para
  // aquela demanda, não para a próxima que a pessoa digitar.
  useEffect(() => {
    setDecidido(false);
    setResultado(null);
    setErro(null);
  }, [nome, categoria]);

  const mostrarBloco = novo && !semCategoria && !decidido;

  return (
    <>
      <input
        id={id}
        className="field-input"
        list={listaId}
        value={valor}
        disabled={semCategoria}
        aria-label="Tipo de demanda"
        placeholder={semCategoria ? "Escolha a categoria primeiro" : "Escolha ou descreva"}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listaId}>
        {tipos.map((t) => (
          <option key={t.id} value={t.nome} />
        ))}
      </datalist>

      {!semCategoria && !mostrarBloco && (
        <p className="hint mt-1">
          {resultado === "catalogo" ? (
            <span className="text-green-700 dark:text-green-400">
              Adicionada ao catálogo de {categoria.trim()}.
            </span>
          ) : resultado === "avulso" ? (
            <span>Demanda usada apenas nesta tarefa.</span>
          ) : tipos.length > 0 ? (
            `${tipos.length} ${tipos.length === 1 ? "tipo cadastrado" : "tipos cadastrados"} em ${categoria.trim()}. Você também pode descrever uma demanda específica.`
          ) : (
            `Nenhum tipo cadastrado em ${categoria.trim()}. Descreva a demanda e informe a duração.`
          )}
        </p>
      )}

      {mostrarBloco && (
        <div className="subcard-destaque mt-2">
          <p className="text-sm font-semibold text-gta-navy dark:text-slate-100">Demanda não catalogada</p>
          <p className="hint mt-0.5">
            “{nome}” ainda não existe em {categoria.trim()}. Configure a duração e escolha como usá-la.
          </p>

          <div className="mt-3 max-w-[10rem]">
            <label className="field-label" htmlFor={`${listaId}-dur`}>
              Duração estimada (h)
            </label>
            <input
              id={`${listaId}-dur`}
              type="number"
              min={0}
              step={0.5}
              className="field-input"
              value={minParaHoras(estimativaMin)}
              placeholder="Ex.: 4"
              onChange={(e) => onEstimativaChange?.(horasParaMin(e.target.value))}
            />
          </div>
          <p className="hint mt-1">Também vale como estimativa desta tarefa.</p>

          {erro && <p className="field-error">{erro}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary !py-1 text-xs"
              onClick={() => {
                setResultado("avulso");
                setDecidido(true);
              }}
            >
              Usar apenas nesta tarefa
            </button>
            {onAdicionarAoCatalogo && (
              <button
                type="button"
                className="btn-primary !py-1 text-xs"
                disabled={salvando}
                onClick={async () => {
                  setSalvando(true);
                  setErro(null);
                  try {
                    await onAdicionarAoCatalogo(categoria.trim(), nome, estimativaMin);
                    setResultado("catalogo");
                    setDecidido(true);
                  } catch (e) {
                    setErro(e instanceof Error ? e.message : "Falha ao adicionar ao catálogo.");
                  } finally {
                    setSalvando(false);
                  }
                }}
              >
                {salvando ? "Adicionando…" : `Adicionar ao catálogo de ${categoria.trim()}`}
              </button>
            )}
          </div>

          {!onAdicionarAoCatalogo && (
            <p className="hint mt-2">
              Incorporar esta demanda ao catálogo é atribuição de um administrador.
            </p>
          )}
        </div>
      )}
    </>
  );
}
