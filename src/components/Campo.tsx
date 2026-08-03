"use client";

import { cloneElement, useId, type ReactElement, type ReactNode } from "react";

/**
 * Campo de formulário: rótulo + controle, com a associação já feita.
 *
 * Existe por um motivo específico. O par solto
 *
 *     <div><label className="field-label">Potência</label><input className="field-input" /></div>
 *
 * fica visualmente correto e programaticamente mudo: o leitor de tela anuncia
 * "campo de edição" sem dizer de quê, e o clique no rótulo não foca o controle.
 * Ligar os dois exige um `id` único por campo — e `id` escrito à mão colide
 * silenciosamente quando o campo está dentro de um `.map()`, caso em que o
 * `htmlFor` passa a apontar para a primeira linha da tabela.
 *
 * `useId()` resolve os dois problemas de uma vez: é único por instância, então
 * funciona igual em campo fixo e em linha repetida, e não há string para
 * alguém errar. O `id` vai para o controle por clonagem, e não como prop
 * explícita, para que o local de uso continue lendo como o JSX de antes.
 *
 * `children` é UM elemento de propósito. Se fosse `ReactNode`, passar dois
 * filhos compilaria e o rótulo voltaria a ficar mudo — sem erro, sem aviso.
 * Conteúdo extra (dica, cálculo, aviso) vai em `hint`, que renderiza abaixo.
 */
export function Campo({
  label,
  hint,
  className = "",
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {cloneElement(children, { id })}
      {hint}
    </div>
  );
}
