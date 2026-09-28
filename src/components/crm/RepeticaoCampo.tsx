"use client";

import { useState } from "react";
import { Campo } from "@/components/Campo";
import { descreverRepeticao, indicePreset, PRESETS_REPETICAO } from "@/lib/crm/repeticao";
import { UNIDADES_REPETICAO, type UnidadeRepeticao } from "@/lib/crm/types";

export interface Repeticao {
  cada: number;
  unidade: UnidadeRepeticao | "";
}

const PERSONALIZADO = "personalizado";

/**
 * "Repetir": as cadências comuns numa lista, e o resto em "Personalizado".
 *
 * A lista resolve o caso de todo dia sem conta nenhuma; o personalizado
 * existe porque cadência de relacionamento é do cliente, não da ferramenta —
 * há quem precise de "a cada 45 dias".
 */
export function RepeticaoCampo({ valor, onChange, className = "", compacto = false }: {
  valor: Repeticao;
  onChange: (r: Repeticao) => void;
  className?: string;
  compacto?: boolean;
}) {
  // Personalizado é escolha de tela, não só do valor: quem escolhe
  // "Personalizado" e ainda não digitou nada precisa ver os campos.
  const [escolheuPersonalizado, setEscolheuPersonalizado] = useState(indicePreset(valor.cada, valor.unidade) < 0);
  const indice = indicePreset(valor.cada, valor.unidade);
  const personalizado = escolheuPersonalizado || indice < 0;
  const tamanho = compacto ? " !py-1 text-sm" : "";

  return (
    <div className={className}>
      <Campo label="Repetir">
        <select
          className={`field-input${tamanho}`}
          value={personalizado ? PERSONALIZADO : String(indice)}
          onChange={(e) => {
            if (e.target.value === PERSONALIZADO) {
              setEscolheuPersonalizado(true);
              // Começa de um valor que faz sentido, em vez de "a cada 0".
              if (!valor.cada) onChange({ cada: 2, unidade: "meses" });
              return;
            }
            setEscolheuPersonalizado(false);
            const p = PRESETS_REPETICAO[Number(e.target.value)];
            onChange({ cada: p.cada, unidade: p.unidade });
          }}
        >
          {PRESETS_REPETICAO.map((p, i) => (
            <option key={i} value={i}>{descreverRepeticao(p.cada, p.unidade)}</option>
          ))}
          <option value={PERSONALIZADO}>Personalizado…</option>
        </select>
      </Campo>
      {personalizado && (
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <span className="shrink-0">A cada</span>
          <input
            type="number"
            min={1}
            max={365}
            className={`field-input w-20${tamanho}`}
            value={valor.cada || ""}
            aria-label="Repetir a cada"
            onChange={(e) => onChange({ cada: Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0))), unidade: valor.unidade || "dias" })}
          />
          <select
            className={`field-input w-auto${tamanho}`}
            value={valor.unidade || "dias"}
            aria-label="Unidade da repetição"
            onChange={(e) => onChange({ cada: valor.cada || 1, unidade: e.target.value as UnidadeRepeticao })}
          >
            {UNIDADES_REPETICAO.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
