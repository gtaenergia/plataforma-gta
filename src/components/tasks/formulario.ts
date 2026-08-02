"use client";

import { acharTipo } from "@/lib/capacidade/motor";
import type { ConfigCapacidade } from "@/lib/capacidade/types";
import { horasParaMin, minParaHoras } from "@/components/capacidade/comum";
import type { Demandante, Prioridade } from "@/lib/tasks/types";

/**
 * Estado e regras do formulário de tarefa.
 *
 * Compartilhado entre a página de criação (/tarefas/nova) e a edição embutida
 * na lista. Duplicar isso deixaria as duas telas divergirem no comportamento
 * mais sensível — o preenchimento automático da estimativa a partir do tipo.
 */

export interface FormState {
  titulo: string;
  descricao: string;
  cliente: string;
  categoria: string;
  /** Tipo de demanda dentro da categoria — catálogo em /admin/planejamento. */
  tipoDemanda: string;
  demandante: Demandante;
  responsavel: string;
  prioridade: Prioridade;
  prazoComercial: string;
  prazoOperacional: string;
  horaComercial: string;
  horaOperacional: string;
  /** Em HORAS (texto). Vira minutos só no envio — ver `paraPayload`. */
  estimativaHoras: string;
}

export const FORM_VAZIO: FormState = {
  titulo: "",
  descricao: "",
  cliente: "",
  categoria: "",
  tipoDemanda: "",
  demandante: "operacional",
  responsavel: "",
  prioridade: "media",
  prazoComercial: "",
  prazoOperacional: "",
  horaComercial: "",
  horaOperacional: "",
  estimativaHoras: "",
};

/** O formulário fala em horas; a API e o banco falam em minutos. */
export function paraPayload(f: FormState) {
  const { estimativaHoras, ...resto } = f;
  return { ...resto, estimativaMin: horasParaMin(estimativaHoras) };
}

/**
 * Trocar a categoria zera o tipo, porque o catálogo de tipos é por categoria e
 * um tipo herdado da categoria anterior não existiria na nova — a estimativa
 * ficaria presa a um valor que a tela não sabe mais explicar.
 */
export function comCategoria(f: FormState, categoria: string): FormState {
  return { ...f, categoria, tipoDemanda: "" };
}

/**
 * Escolher o tipo traz junto a duração cadastrada, mas só quando a estimativa
 * ainda está vazia: um número digitado à mão nunca é sobrescrito. Sem esse
 * preenchimento a estimativa fica em branco na prática, a indicação cai no
 * valor padrão e o prazo calculado perde a utilidade.
 */
export function comTipoDemanda(f: FormState, tipoDemanda: string, config: ConfigCapacidade): FormState {
  const tipo = acharTipo(config, f.categoria, tipoDemanda);
  const estimativaHoras =
    f.estimativaHoras === "" && tipo && tipo.minutos > 0 ? minParaHoras(tipo.minutos) : f.estimativaHoras;
  return { ...f, tipoDemanda, estimativaHoras };
}
