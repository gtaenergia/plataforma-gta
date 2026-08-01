/**
 * Taxonomia de permissões por módulo/ação (RBAC orientado a dados).
 *
 * Os cargos (src/lib/cargos) concedem um subconjunto destas chaves aos usuários.
 * Um usuário com role "admin" é super-usuário e tem TODAS as permissões
 * implicitamente (ver src/lib/rbac/resolve.ts) — assim a proteção de "último
 * admin" já existente continua valendo sem alterações.
 */

export const PERMISSOES = {
  "orcamentos.criar": "Criar e enviar orçamentos para revisão",
  "orcamentos.revisar": "Revisar/comentar orçamentos em aprovação",
  "orcamentos.aprovar": "Aprovar ou rejeitar orçamentos (com parecer)",
  "orcamentos.cancelar": "Cancelar orçamentos",
  "servicos.editar": "Usar os configuradores de serviços",
  "propostas.gerar": "Gerar propostas (.docx)",
  "usuarios.administrar": "Gerenciar usuários",
  "cargos.administrar": "Gerenciar cargos e permissões",
  "parametros.editar": "Editar parâmetros e limiares de preço",
  // A chave fica "tracker.*" por compatibilidade: ela está gravada nos cargos
  // (jsonb no banco) e renomear revogaria em silêncio quem já a tem.
  "tracker.ver_equipe": "Ver os apontamentos de horas de outros usuários",
} as const;

export type PermissaoKey = keyof typeof PERMISSOES;

export const PERMISSAO_KEYS = Object.keys(PERMISSOES) as PermissaoKey[];

export function isPermissaoKey(v: unknown): v is PermissaoKey {
  return typeof v === "string" && v in PERMISSOES;
}

/** Agrupamento por módulo para exibição na UI de cargos. */
export const PERMISSOES_POR_MODULO: { modulo: string; chaves: PermissaoKey[] }[] = [
  {
    modulo: "Orçamentos (aprovação)",
    chaves: ["orcamentos.criar", "orcamentos.revisar", "orcamentos.aprovar", "orcamentos.cancelar"],
  },
  {
    modulo: "Propostas e serviços",
    chaves: ["servicos.editar", "propostas.gerar"],
  },
  {
    modulo: "Apontamentos (registro de horas)",
    chaves: ["tracker.ver_equipe"],
  },
  {
    modulo: "Administração",
    chaves: ["usuarios.administrar", "cargos.administrar", "parametros.editar"],
  },
];
