import {
  allowedRolesForTier,
  isRoleAllowed,
} from '../../src/security/roleAuthorization'

describe('route role authorization policy', () => {
  test('read tier allows moderator, admin, and super admin', () => {
    expect(allowedRolesForTier('read')).toEqual([
      'MODERATOR',
      'ADMIN',
      'SUPER_ADMIN',
    ])
  })

  test('internal-write excludes moderator', () => {
    const allowed = allowedRolesForTier('internal-write')

    expect(allowed).toEqual(['ADMIN', 'SUPER_ADMIN'])
    expect(isRoleAllowed('MODERATOR', allowed)).toBe(false)
    expect(isRoleAllowed('ADMIN', allowed)).toBe(true)
  })

  test('super-admin is exclusive', () => {
    const allowed = allowedRolesForTier('super-admin')

    expect(allowed).toEqual(['SUPER_ADMIN'])
    expect(isRoleAllowed('ADMIN', allowed)).toBe(false)
    expect(isRoleAllowed('SUPER_ADMIN', allowed)).toBe(true)
  })

  test('unknown roles fail closed', () => {
    expect(
      isRoleAllowed('OWNER', allowedRolesForTier('read')),
    ).toBe(false)
  })
})
