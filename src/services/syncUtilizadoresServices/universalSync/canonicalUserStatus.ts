/**
 * The canonical "active" status update applied to a User document across all
 * segregated status fields. Single source of truth for reactivation flows —
 * keep every "set this user active" write going through this helper so the
 * combined/hotmart/curseduca status fields never drift apart.
 */
export const buildCanonicalActiveUserStatusUpdate = () => ({
  'combined.status': 'ACTIVE',
  'hotmart.status': 'ACTIVE',
  'curseduca.memberStatus': 'ACTIVE',
})
