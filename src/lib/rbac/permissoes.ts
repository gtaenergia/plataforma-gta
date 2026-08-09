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
  // Custo, markup e margem são o que a GTA ganha em cima do cliente. Quem
  // INFORMA as horas não precisa enxergar isso — o dono disse que "qualquer
  // pessoa, do comercial ou do campo" pode lançar as horas. Por isso a leitura
  // do dinheiro é uma permissão separada de `servicos.editar`.
  "financeiro.ver": "Ver custo, markup e margem dos orçamentos",
  // A chave fica "tracker.*" por compatibilidade: ela está gravada nos cargos
  // (jsonb no banco) e renomear revogaria em silêncio quem já a tem.
  "tracker.ver_equipe": "Ver os apontamentos de horas de outros usuários",
  // CRM — a segunda ferramenta da conta. As chaves entram já com o nome
  // definitivo, ainda que as telas desta primeira entrega sejam esqueleto: uma
  // vez concedidas num cargo elas ficam gravadas em jsonb, e renomear depois
  // revogaria em silêncio quem já as tiver.
  // `crm.configurar` é a única EXIGIDA hoje: ela guarda o processo comercial
  // (funil, etapas, catálogos) contra mudança acidental. As demais estão
  // declaradas para os cargos já poderem ser desenhados, mas o CRM segue aberto
  // a quem está autenticado — como o resto da plataforma. Exigi-las agora
  // trancaria para fora todo mundo que ainda não tem cargo.
  "crm.acessar": "Acessar o CRM (ainda não exigida)",
  "crm.negociacoes.editar": "Criar e editar negociações (ainda não exigida)",
  "crm.cadastros.editar": "Criar e editar empresas e contatos (ainda não exigida)",
  "crm.relatorios.ver": "Ver os relatórios do CRM (ainda não exigida)",
  "crm.configurar": "Configurar funis, etapas, fontes, motivos de perda e produtos",
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
    modulo: "CRM",
    chaves: ["crm.acessar", "crm.negociacoes.editar", "crm.cadastros.editar", "crm.relatorios.ver", "crm.configurar"],
  },
  {
    modulo: "Administração",
    chaves: ["usuarios.administrar", "cargos.administrar", "parametros.editar"],
  },
];
