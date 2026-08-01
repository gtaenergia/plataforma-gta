/**
 * Modelo e helpers puros do painel de armazenamento.
 *
 * Fica separado de `armazenamento.ts` (que abre conexão com o Postgres e o
 * Blob) porque o painel é um componente de cliente: importar de lá arrastaria
 * o driver do banco para o bundle do navegador. Mesma divisão de
 * `src/lib/tracker/types.ts`.
 */

export interface UsoTabela {
  nome: string;
  bytes: number;
  linhas: number;
}

export interface UsoPasta {
  nome: string;
  bytes: number;
  arquivos: number;
}

export interface Armazenamento {
  banco:
    | { configurado: false }
    | { configurado: true; totalBytes: number; limiteBytes: number; tabelas: UsoTabela[] };
  blob:
    | { configurado: false }
    | {
        configurado: true;
        totalBytes: number;
        limiteBytes: number;
        arquivos: number;
        pastas: UsoPasta[];
        maiores: { nome: string; bytes: number; enviadoEm: string }[];
        truncado: boolean;
      };
  /** Falha parcial: um serviço respondeu, o outro não. */
  erro?: string;
}

/** "1,4 MB" — base 1024, que é como Neon e Vercel contam a cota. */
export function formatarBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), unidades.length - 1);
  const valor = bytes / Math.pow(1024, i);
  const casas = i === 0 ? 0 : valor < 10 ? 1 : 0;
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })} ${unidades[i]}`;
}
