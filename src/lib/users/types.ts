import { z } from "zod";

/** Modelo e validação de Usuários. */

export type Role = "admin" | "member";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  /** Cargo atribuído (concede permissões granulares aos não-admins). */
  cargoId?: string;
  /**
   * Faz parte do time comercial: o nome aparece nas listas de responsáveis do
   * CRM. Não é permissão — o CRM segue aberto a quem está autenticado. É quem
   * pode RECEBER negociações e follow-ups, para a lista não oferecer o
   * engenheiro de campo como dono de uma venda.
   */
  comercial?: boolean;
  /** Se true, é obrigado a definir nova senha no próximo acesso. */
  mustChangePassword: boolean;
  active: boolean;
  /** URL da foto de perfil (Vercel Blob em produção; data URL em dev). */
  avatarUrl?: string;
  criadoEm: string;
  atualizadoEm: string;
}

/** Tipos de imagem aceitos para foto de perfil. */
export const AVATAR_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
/** Teto de tamanho do arquivo de avatar (foto de perfil é pequena; sem necessidade de mais). */
export const AVATAR_MAX_BYTES = 3 * 1024 * 1024;

/** Usuário sem o hash de senha — seguro para enviar ao cliente. */
export type PublicUser = Omit<User, "passwordHash">;

export function toPublicUser(u: User): PublicUser {
  const { passwordHash: _omit, ...rest } = u;
  void _omit;
  return rest;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  member: "Membro",
};

const senha = z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(128);

// Na criação: "" (sem cargo) vira undefined.
const cargoIdCreate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

// Na edição: ausente = não altera; "" ou null = limpar o cargo; string = atribuir.
const cargoIdUpdate = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v == null ? v : v || null));

/** Admin cria um usuário (senha provisória pode ser gerada pelo servidor). */
export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  name: z.string().trim().min(1, "Informe o nome").max(120),
  role: z.enum(["admin", "member"]).default("member"),
  cargoId: cargoIdCreate,
  comercial: z.boolean().default(false),
  senhaProvisoria: senha.optional(),
});

/** Admin edita nome/papel/cargo/equipe/ativação. */
export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["admin", "member"]).optional(),
  cargoId: cargoIdUpdate,
  comercial: z.boolean().optional(),
  active: z.boolean().optional(),
});

/** Usuário troca a própria senha. `senhaAtual` é dispensada na troca obrigatória. */
export const changePasswordSchema = z.object({
  senhaAtual: z.string().optional(),
  novaSenha: senha,
});

/** Admin reseta a senha de alguém (senha pode ser gerada pelo servidor). */
export const resetPasswordSchema = z.object({
  novaSenha: senha.optional(),
});
