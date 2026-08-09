import {
  createGuruInactivationReadService,
  type GuruInactivationReadRecord,
  type GuruInactivationReadRepository,
} from '../../../src/services/guru/guruInactivationRead.service'

const record = (
  id: string,
  overrides: Partial<GuruInactivationReadRecord> = {},
): GuruInactivationReadRecord => ({
  userProductId: id,
  userId: `user-${id}`,
  email: `${id}@example.test`,
  name: `Name ${id}`,
  platformUserId: `member-${id}`,
  fallbackCurseducaUserId: undefined,
  guruStatus: 'canceled',
  curseducaStatus: 'INACTIVE',
  markedAt: new Date('2026-08-01T10:00:00.000Z'),
  markedReason: 'guru canceled',
  inactivatedAt: new Date('2026-08-02T10:00:00.000Z'),
  inactivatedBy: 'guru_integration',
  inactivatedReason: 'CursEduca access removed',
  classes: [{
    classId: 'class-1',
    className: 'Class One',
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  }],
  ...overrides,
})

const repository = (
  overrides: Partial<GuruInactivationReadRepository> = {},
): GuruInactivationReadRepository => ({
  findPending: jest.fn(async () => []),
  findPendingForStats: jest.fn(async () => []),
  findInactive: jest.fn(async () => []),
  countInactivatedSince: jest.fn(async () => 0),
  countInactivatedByGuru: jest.fn(async () => 0),
  ...overrides,
})

test('filters active Guru records and deduplicates canceled records by CursEduca member', async () => {
  const records = [
    record('newest'),
    record('older', { platformUserId: 'member-newest' }),
    record('active', { guruStatus: 'active' }),
    record('without-guru', { guruStatus: undefined }),
    record('without-id', {
      platformUserId: undefined,
      fallbackCurseducaUserId: undefined,
    }),
  ]
  const service = createGuruInactivationReadService(repository({
    findPending: jest.fn(async () => records),
  }))

  const result = await service.listPending()

  expect(result).toMatchObject({
    count: 3,
    total: 5,
    filtered: 1,
    deduplicated: 1,
  })
  expect(result.pendingList.map((item) => item.userProductId)).toEqual([
    'newest',
    'without-guru',
    'without-id',
  ])
})

test('uses the populated-user CursEduca id as the deduplication fallback', async () => {
  const service = createGuruInactivationReadService(repository({
    findPending: jest.fn(async () => [
      record('first', {
        platformUserId: undefined,
        fallbackCurseducaUserId: 'shared-member',
      }),
      record('second', {
        platformUserId: undefined,
        fallbackCurseducaUserId: 'shared-member',
      }),
    ]),
  }))

  const result = await service.listPending()

  expect(result.count).toBe(1)
  expect(result.deduplicated).toBe(1)
  expect(result.pendingList[0].curseducaUserId).toBe('shared-member')
})

test('calculates stats with the same status filter and member deduplication', async () => {
  const startOfDay = new Date('2026-08-09T12:34:56.000Z')
  startOfDay.setHours(0, 0, 0, 0)
  const repo = repository({
    findPendingForStats: jest.fn(async () => [
      record('one'),
      record('duplicate', { platformUserId: 'member-one' }),
      record('active', { guruStatus: 'active' }),
      record('no-id', { platformUserId: undefined }),
    ]),
    countInactivatedSince: jest.fn(async () => 7),
    countInactivatedByGuru: jest.fn(async () => 11),
  })
  const service = createGuruInactivationReadService(repo, {
    now: () => new Date('2026-08-09T12:34:56.000Z'),
  })

  await expect(service.getStats()).resolves.toEqual({
    pendingInactivation: 2,
    pendingInactivationTotal: 4,
    inactivatedToday: 7,
    totalInactivatedByGuru: 11,
  })
  expect(repo.countInactivatedSince).toHaveBeenCalledWith(startOfDay)
})

test('filters inactive records by email or name and clamps pagination to 200', async () => {
  const inactive = [
    record('alice', { email: 'alice@example.test', name: 'Alice Smith' }),
    record('bob', { email: 'bob@example.test', name: 'Bob Alice' }),
    record('carol', { email: 'carol@example.test', name: 'Carol Jones' }),
  ]
  const service = createGuruInactivationReadService(repository({
    findInactive: jest.fn(async () => inactive),
  }))

  const result = await service.listInactive({
    page: '1',
    limit: '10000',
    email: ' ALICE ',
  })

  expect(result).toMatchObject({ total: 2, page: 1, limit: 200, pages: 1 })
  expect(result.inactivatedList.map((item) => item.email)).toEqual([
    'alice@example.test',
    'bob@example.test',
  ])
})

test('preserves inactive response fields and paginates after filtering', async () => {
  const service = createGuruInactivationReadService(repository({
    findInactive: jest.fn(async () => [record('one'), record('two'), record('three')]),
  }))

  const result = await service.listInactive({ page: '2', limit: '2' })

  expect(result).toMatchObject({ total: 3, page: 2, limit: 2, pages: 2 })
  expect(result.inactivatedList).toEqual([{
    userProductId: 'three',
    email: 'three@example.test',
    name: 'Name three',
    curseducaUserId: 'member-three',
    guruStatus: 'canceled',
    curseducaStatus: 'INACTIVE',
    inactivatedAt: new Date('2026-08-02T10:00:00.000Z'),
    inactivatedBy: 'guru_integration',
    inactivatedReason: 'CursEduca access removed',
  }])
})
