"use client";

/**
 * Escolha dos dias de trabalho da semana.
 *
 * Componente próprio porque a mesma linha de sete botões aparece em dois
 * contextos — jornada padrão da equipe e tabela por profissional — e tinha
 * divergido em tamanho entre eles (40 px contra 32 px, 49 botões na tela).
 * O estilo mora em `.dia-toggle`, no globals.css.
 *
 * `contexto` entra no rótulo acessível: sete botões chamados "S" repetidos por
 * pessoa não dizem nada a quem usa leitor de tela.
 */

const DIAS = [
  { valor: 0, inicial: "D", nome: "domingo" },
  { valor: 1, inicial: "S", nome: "segunda-feira" },
  { valor: 2, inicial: "T", nome: "terça-feira" },
  { valor: 3, inicial: "Q", nome: "quarta-feira" },
  { valor: 4, inicial: "Q", nome: "quinta-feira" },
  { valor: 5, inicial: "S", nome: "sexta-feira" },
  { valor: 6, inicial: "S", nome: "sábado" },
];

export const DIA_NOME = DIAS.map((d) => d.nome);

export function SeletorDias({
  valor,
  onAlternar,
  contexto,
}: {
  valor: number[];
  onAlternar: (dia: number) => void;
  /** A quem esta linha pertence, para o leitor de tela. */
  contexto?: string;
}) {
  return (
    <div className="flex gap-1">
      {DIAS.map((d) => (
        <button
          key={d.valor}
          type="button"
          aria-pressed={valor.includes(d.valor)}
          aria-label={contexto ? `${d.nome} de ${contexto}` : d.nome}
          onClick={() => onAlternar(d.valor)}
          className="dia-toggle"
        >
          {d.inicial}
        </button>
      ))}
    </div>
  );
}
