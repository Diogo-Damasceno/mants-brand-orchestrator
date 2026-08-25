import type { Role } from '@mants/shared-types';

/**
 * Helper de autorização multi-tenant. NUNCA confia no organization_id vindo do
 * frontend como prova única. O backend SEMPRE filtra por organizationId do token.
 *
 * Estas funções são puras e testáveis sem banco.
 */

export interface AuthContext {
  userId: string;
  organizationId: string;
  roles: Role[];
}

export function hasRole(ctx: AuthContext, role: Role): boolean {
  return ctx.roles.includes(role);
}

/** owner/admin/brand_manager podem editar recursos da organização. */
export function canManageBrandContent(ctx: AuthContext): boolean {
  return ['platform_admin', 'organization_owner', 'organization_admin', 'brand_manager'].includes(
    ctx.roles[0] ?? 'viewer',
  );
}

export function isPlatformAdmin(ctx: AuthContext): boolean {
  return ctx.roles.includes('platform_admin');
}

/**
 * Garante isolamento: o registro pertence à organização do contexto?
 * Retorna true se seguro prosseguir. O backend deve usar como checagem extra,
 * além do filtro por organizationId.
 */
export function belongsToOrganization(
  recordOrganizationId: string | null | undefined,
  ctx: AuthContext,
): boolean {
  if (!recordOrganizationId) return isPlatformAdmin(ctx); // registros globais só admin
  return recordOrganizationId === ctx.organizationId || isPlatformAdmin(ctx);
}

/** Valida se um usuário pode acessar um recurso de outra organização (sempre false, salvo admin). */
export function canCrossTenant(ctx: AuthContext, targetOrganizationId: string): boolean {
  if (isPlatformAdmin(ctx)) return true;
  return ctx.organizationId === targetOrganizationId;
}

/** Limites de plano vs. uso atual. */
export interface LimitCheck {
  allowed: boolean;
  current: number;
  limit: number;
  reason?: string;
}

export function checkLimit(current: number, limit: number, label: string): LimitCheck {
  if (current >= limit) {
    return { allowed: false, current, limit, reason: `${label} atingiu o limite do plano.` };
  }
  return { allowed: true, current, limit };
}

/** Enumeração de recursos protegidos por tenant para auditoria. */
export const TENANT_RESOURCES = [
  'clients',
  'brand_kits',
  'brand_assets',
  'campaigns',
  'creative_packages',
  'results',
  'users',
  'subscriptions',
] as const;

export type TenantResource = (typeof TENANT_RESOURCES)[number];
