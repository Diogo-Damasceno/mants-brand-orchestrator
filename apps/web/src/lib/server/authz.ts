import type { RequestCtx } from './http';
import { canManageRole, type Role } from '@mants/shared-types';

export function isPlatformAdmin(ctx: RequestCtx): boolean {
  return ctx.roles.includes('platform_admin');
}

export function hasRole(ctx: RequestCtx, role: Role): boolean {
  return ctx.roles.includes(role);
}

/** Verifica se o usuário pode gerenciar o papel alvo (hierarquia). */
export function canManage(ctx: RequestCtx, target: Role): boolean {
  return ctx.roles.some((r) => canManageRole(r, target));
}

/** Papéis que podem criar/editar conteúdo de marca. */
export const CONTENT_MANAGER_ROLES: Role[] = [
  'platform_admin',
  'organization_owner',
  'organization_admin',
  'brand_manager',
];
