import {
  createGuruInactivationMutationService,
  type GuruInactivationMutationRepository,
} from '../../../src/services/guru/guruInactivationMutation.service'

const now = new Date('2026-08-09T12:00:00.000Z')

const repository = (
  overrides: Partial<GuruInactivationMutationRepository> = {},
): GuruInactivationMutationRepository => ({
  findUserByEmail: jest.fn(async () => undefined),
  quarantinePending: jest.fn(async () => 0),
  revertMark: jest.fn(async () => false),
  cleanupDuplicates: jest.fn(async () => 0),
  findUserIdsByEmails: jest.fn(async () => []),
  markProductsStale: jest.fn(async () => 0),
  markUsersInactive: jest.fn(async () => 0),
  restoreProducts: jest.fn(async () => 0),
  activateUser: jest.fn(async () => undefined),
  findCurseducaProductId: jest.fn(async () => undefined),
  activateProduct: jest.fn(async () => undefined),
  ...overrides,
})

test('quarantine normalizes email and updates only a found user', async () => {
  const repo = repository({
    findUserByEmail: jest.fn(async () => ({ id: 'user-1', email: 'alice@example.test' })),
    quarantinePending: jest.fn(async () => 2),
  })
  const service = createGuruInactivationMutationService(repo, { now: () => now })

  await expect(service.quarantine(' Alice@Example.Test ')).resolves.toEqual({
    kind: 'success',
    email: 'alice@example.test',
    modifiedCount: 2,
  })
  expect(repo.findUserByEmail).toHaveBeenCalledWith('alice@example.test')
  expect(repo.quarantinePending).toHaveBeenCalledWith('user-1', now)
})

test('quarantine reports a missing user without writing', async () => {
  const repo = repository()
  const service = createGuruInactivationMutationService(repo)

  await expect(service.quarantine('missing@example.test')).resolves.toEqual({
    kind: 'not-found',
  })
  expect(repo.quarantinePending).not.toHaveBeenCalled()
})

test('revert reports whether the enrollment exists', async () => {
  const repo = repository({ revertMark: jest.fn(async () => true) })
  const service = createGuruInactivationMutationService(repo, { now: () => now })

  await expect(service.revert('up-1')).resolves.toEqual({ kind: 'success' })
  expect(repo.revertMark).toHaveBeenCalledWith('up-1', now)
})

test.each([
  [true, 'primary'],
  [false, 'inactive'],
] as const)('cleans duplicates in %s mode', async (setPrimary, mode) => {
  const repo = repository({ cleanupDuplicates: jest.fn(async () => 2) })
  const service = createGuruInactivationMutationService(repo, { now: () => now })

  await expect(service.cleanupDuplicates(['up-1', 'up-2'], setPrimary)).resolves.toEqual({
    modifiedCount: 2,
    requestedCount: 2,
    mode,
  })
  expect(repo.cleanupDuplicates).toHaveBeenCalledWith(['up-1', 'up-2'], mode, now)
})

test('mark stale normalizes emails and updates products before users', async () => {
  const calls: string[] = []
  const repo = repository({
    findUserIdsByEmails: jest.fn(async () => ['user-1', 'user-2']),
    markProductsStale: jest.fn(async () => { calls.push('products'); return 3 }),
    markUsersInactive: jest.fn(async () => { calls.push('users'); return 2 }),
  })
  const service = createGuruInactivationMutationService(repo, { now: () => now })

  await expect(service.markStale([' A@X.TEST ', 'b@x.test'])).resolves.toEqual({
    emailsRequested: 2,
    usersFound: 2,
    userProductsModified: 3,
    usersModified: 2,
  })
  expect(repo.findUserIdsByEmails).toHaveBeenCalledWith(['a@x.test', 'b@x.test'])
  expect(calls).toEqual(['products', 'users'])
})

test('mark stale performs no writes when no users match', async () => {
  const repo = repository()
  const service = createGuruInactivationMutationService(repo)

  await expect(service.markStale(['missing@example.test'])).resolves.toEqual({
    emailsRequested: 1,
    usersFound: 0,
    userProductsModified: 0,
    usersModified: 0,
  })
  expect(repo.markProductsStale).not.toHaveBeenCalled()
  expect(repo.markUsersInactive).not.toHaveBeenCalled()
})

test('restore preserves requested and modified counts', async () => {
  const repo = repository({ restoreProducts: jest.fn(async () => 1) })
  const service = createGuruInactivationMutationService(repo, { now: () => now })

  await expect(service.restore(['up-1', 'up-2'])).resolves.toEqual({
    modifiedCount: 1,
    requestedCount: 2,
  })
  expect(repo.restoreProducts).toHaveBeenCalledWith(['up-1', 'up-2'], now)
})

test('fix active isolates missing users and missing products', async () => {
  const repo = repository({
    activateUser: jest.fn(async (email) => email === 'alice@example.test'
      ? { id: 'user-1', email }
      : email === 'bob@example.test'
        ? { id: 'user-2', email }
        : undefined),
    findCurseducaProductId: jest.fn(async (userId) => userId === 'user-1' ? 'up-1' : undefined),
    activateProduct: jest.fn(async () => undefined),
  })
  const service = createGuruInactivationMutationService(repo, { now: () => now })

  await expect(service.fixActive([
    'alice@example.test',
    'bob@example.test',
    'missing@example.test',
  ])).resolves.toEqual({
    updatedUsers: 2,
    updatedUserProducts: 1,
    results: [
      { email: 'alice@example.test', success: true, userUpdated: true, userProductUpdated: true },
      { email: 'bob@example.test', success: true, userUpdated: true, userProductUpdated: false },
      { email: 'missing@example.test', success: false, reason: 'User não encontrado' },
    ],
  })
  expect(repo.activateProduct).toHaveBeenCalledWith('up-1', now)
})
