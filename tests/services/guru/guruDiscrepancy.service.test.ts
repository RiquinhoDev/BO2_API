import {
  CurseducaProductUnavailableError,
  createGuruDiscrepancyService,
  type DiscrepancyCandidate,
  type GuruDiscrepancyRepository,
} from '../../../src/services/guru/guruDiscrepancy.service'
import type { CurseducaIdentityLookup } from '../../../src/services/guru/curseducaIdentityLookup.client'
import type { GuruActiveSubscriptionLookup } from '../../../src/services/guru/guruActiveSubscription.client'

const candidate = (overrides: Partial<DiscrepancyCandidate> = {}): DiscrepancyCandidate => ({
  userId: 'user-1',
  email: 'alice@example.test',
  name: 'Alice',
  guruStatus: 'canceled',
  ...overrides,
})

const repository = (candidates: DiscrepancyCandidate[]): GuruDiscrepancyRepository => ({
  listCandidates: jest.fn(async () => candidates),
  findActiveCurseducaProductId: jest.fn(async () => 'product-1'),
  saveCurseducaUserId: jest.fn(async () => undefined),
  createPendingEnrollment: jest.fn(async () => 'created-enrollment'),
  markPending: jest.fn(async () => undefined),
})

const identityLookup = (): CurseducaIdentityLookup => ({
  findByEmail: jest.fn(async () => undefined),
})

const subscriptions = (): GuruActiveSubscriptionLookup => ({
  hasActiveSubscription: jest.fn(async () => false),
})

const clock = () => new Date('2026-08-09T12:00:00.000Z')

test('returns an empty result without loading a product when no candidate exists', async () => {
  const repo = repository([])
  const result = await createGuruDiscrepancyService(
    repo,
    identityLookup(),
    subscriptions(),
    clock,
  ).mark()

  expect(result).toEqual({
    marked: 0,
    created: 0,
    alreadyMarked: 0,
    skipped: 0,
    noUserProduct: 0,
    details: [],
  })
  expect(repo.findActiveCurseducaProductId).not.toHaveBeenCalled()
})

test('fails closed when canceled users exist but the active CursEduca product does not', async () => {
  const repo = repository([candidate()])
  jest.mocked(repo.findActiveCurseducaProductId).mockResolvedValueOnce(undefined)

  await expect(createGuruDiscrepancyService(
    repo,
    identityLookup(),
    subscriptions(),
    clock,
  ).mark()).rejects.toBeInstanceOf(CurseducaProductUnavailableError)

  expect(repo.createPendingEnrollment).not.toHaveBeenCalled()
  expect(repo.markPending).not.toHaveBeenCalled()
})

test('separates missing enrollments from other skipped candidates', async () => {
  const repo = repository([
    candidate(),
    candidate({
      userId: 'user-2',
      email: 'pending@example.test',
      enrollment: { id: 'pending', status: 'PARA_INATIVAR' },
    }),
    candidate({
      userId: 'user-3',
      email: 'inactive@example.test',
      curseducaSituation: 'INACTIVE',
      enrollment: { id: 'inactive', status: 'INACTIVE' },
    }),
  ])

  const result = await createGuruDiscrepancyService(
    repo,
    identityLookup(),
    subscriptions(),
    clock,
  ).mark()

  expect(result).toMatchObject({
    marked: 0,
    created: 0,
    alreadyMarked: 1,
    skipped: 2,
    noUserProduct: 1,
  })
})

test('creates, re-marks, protects and marks candidates without changing decision order', async () => {
  const repo = repository([
    candidate({ userId: 'create-user', email: 'create@example.test' }),
    candidate({
      userId: 'remark-user',
      email: 'remark@example.test',
      curseducaSituation: 'ACTIVE',
      enrollment: { id: 'remark', status: 'INACTIVE' },
    }),
    candidate({
      userId: 'protected-user',
      email: 'protected@example.test',
      enrollment: { id: 'protected', status: 'ACTIVE' },
    }),
    candidate({
      userId: 'mark-user',
      email: 'mark@example.test',
      enrollment: { id: 'mark', status: 'ACTIVE' },
    }),
  ])
  const identities = identityLookup()
  jest.mocked(identities.findByEmail).mockResolvedValueOnce({
    curseducaUserId: 'member-created',
    situation: 'ACTIVE',
    name: 'Create Remote',
  })
  const guru = subscriptions()
  jest.mocked(guru.hasActiveSubscription).mockImplementation(async email => {
    if (email === 'protected@example.test') return true
    if (email === 'mark@example.test') throw new Error('Guru unavailable')
    return false
  })

  const result = await createGuruDiscrepancyService(
    repo,
    identities,
    guru,
    clock,
  ).mark([' CREATE@example.test '])

  expect(repo.listCandidates).toHaveBeenCalledWith(['create@example.test'])
  expect(repo.saveCurseducaUserId).toHaveBeenCalledWith('create-user', 'member-created')
  expect(repo.createPendingEnrollment).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'create-user',
    productId: 'product-1',
    memberId: 'member-created',
    at: clock(),
  }))
  expect(repo.markPending).toHaveBeenNthCalledWith(1, 'remark', clock(), expect.any(String))
  expect(repo.markPending).toHaveBeenNthCalledWith(2, 'mark', clock(), expect.any(String))
  expect(repo.markPending).not.toHaveBeenCalledWith('protected', expect.anything(), expect.anything())
  expect(result).toMatchObject({
    marked: 2,
    created: 1,
    alreadyMarked: 0,
    skipped: 1,
    noUserProduct: 0,
  })
  expect(result.details.map(detail => detail.action)).toEqual([
    'created',
    're-marked (was INACTIVE but CursEduca still ACTIVE)',
    'marked',
  ])
})