export type AppRole = 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'

export type AuthorizationTier = 'read' | 'internal-write' | 'super-admin'

const ROLES_BY_TIER: Readonly<Record<AuthorizationTier, readonly AppRole[]>> = {
  read: ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'],
  'internal-write': ['ADMIN', 'SUPER_ADMIN'],
  'super-admin': ['SUPER_ADMIN'],
}

export function allowedRolesForTier(tier: AuthorizationTier): readonly AppRole[] {
  return ROLES_BY_TIER[tier]
}

export function isRoleAllowed(
  role: string,
  allowedRoles: readonly AppRole[],
): boolean {
  return allowedRoles.some((allowedRole) => allowedRole === role)
}
