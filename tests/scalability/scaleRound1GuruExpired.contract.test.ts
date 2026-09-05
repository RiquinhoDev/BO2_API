const mockUserFind = jest.fn()
const mockUpdateMany = jest.fn()
const mockFetchSubscriptionById = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { find: mockUserFind },
}))
jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { updateMany: mockUpdateMany },
}))
jest.mock('../../src/services/guru/guruSync.service', () => ({
  fetchAllSubscriptionsComplete: jest.fn(),
  fetchSubscriptionById: mockFetchSubscriptionById,
}))

import { checkExpiredTrials } from '../../src/services/guru/guruTrialService'

type FakeProductStatus = 'ACTIVE' | 'QUARENTENA' | 'PARA_INATIVAR'
type FakeProduct = {
  userId: string
  platform: 'curseduca'
  status: FakeProductStatus
  metadata: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFakeProductStatus(value: unknown): value is FakeProductStatus {
  return value === 'ACTIVE' || value === 'QUARENTENA' || value === 'PARA_INATIVAR'
}

function fakeValueAt(product: FakeProduct, path: string): unknown {
  if (path === 'userId' || path === 'platform' || path === 'status') return product[path]
  if (path.startsWith('metadata.')) return product.metadata[path.slice('metadata.'.length)]
  return undefined
}

function fakeMatches(product: FakeProduct, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([path, expected]) => {
    const actual = fakeValueAt(product, path)
    if (isRecord(expected) && '$in' in expected) {
      return Array.isArray(expected.$in) && expected.$in.includes(actual)
    }
    return actual === expected
  })
}

function applyFakeUpdate(product: FakeProduct, update: Record<string, unknown>): void {
  const set = update.$set
  if (isRecord(set)) {
    for (const [path, value] of Object.entries(set)) {
      if (path === 'status' && isFakeProductStatus(value)) product.status = value
      else if (path.startsWith('metadata.')) product.metadata[path.slice('metadata.'.length)] = value
    }
  }

  const unset = update.$unset
  if (isRecord(unset)) {
    for (const path of Object.keys(unset)) {
      if (path.startsWith('metadata.')) delete product.metadata[path.slice('metadata.'.length)]
    }
  }
}

describe.each([1, 10, 100])('expired Guru trial compensation N=%i', (size) => {
  test('preserves provider, enrollment-write and user-save order with one item in flight', async () => {
    jest.clearAllMocks()
    let active = 0
    let peak = 0
    const events: string[] = []
    const boundary = async (event: string) => {
      active++
      peak = Math.max(peak, active)
      events.push(event)
      await Promise.resolve()
      active--
    }
    const users = Array.from({ length: size }, (_, index) => ({
      _id: `user-${index}`,
      email: `user-${index}@example.test`,
      guru: { subscriptionCode: `sub-${index}` },
      set: jest.fn(),
      save: jest.fn(async () => boundary(`save:${index}`)),
    }))
    mockUserFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(users),
    })
    mockFetchSubscriptionById.mockImplementation(async (code: string) => {
      await boundary(`provider:${code.slice(4)}`)
      return { last_status: 'expired' }
    })
    mockUpdateMany.mockImplementation(async ({ userId, status }: { userId: string; status: unknown }) => {
      if (status === 'ACTIVE') {
        await boundary(`products:${userId.slice(5)}`)
        return { modifiedCount: 1 }
      }
      return { modifiedCount: 0 }
    })

    const result = await checkExpiredTrials()

    expect(peak).toBe(1)
    expect(events).toEqual(Array.from({ length: size }, (_, index) => [
      `provider:${index}`,
      `products:${index}`,
      `save:${index}`,
    ]).flat())
    expect(result).toEqual({
      checked: size,
      markedForInactivation: size,
      converted: 0,
      stillInTrial: 0,
      errors: 0,
    })
  })

  test('accounts for each provider failure and continues in input order', async () => {
    jest.clearAllMocks()
    const users = Array.from({ length: size }, (_, index) => ({
      _id: `user-${index}`,
      email: `user-${index}@example.test`,
      guru: { subscriptionCode: `sub-${index}` },
      set: jest.fn(),
      save: jest.fn(async () => undefined),
    }))
    mockUserFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(users),
    })
    let call = 0
    mockFetchSubscriptionById.mockImplementation(async () => {
      const index = call++
      if (index % 10 === 0) throw new Error(`provider-${index}`)
      return { last_status: 'trial' }
    })

    const result = await checkExpiredTrials()
    const errors = Math.ceil(size / 10)
    expect(mockFetchSubscriptionById).toHaveBeenCalledTimes(size)
    expect(result.errors).toBe(errors)
    expect(result.stillInTrial).toBe(size - errors)
    expect(mockUpdateMany).toHaveBeenCalledTimes((size - errors) * 2)
  })
})

describe('expired Guru trial status restoration', () => {
  test('restores a quarantined product to QUARENTENA and leaves legacy marks fail-closed', async () => {
    jest.clearAllMocks()
    const user = {
      _id: 'user-quarantine',
      email: 'quarantine@example.test',
      guru: { subscriptionCode: 'sub-quarantine' },
      set: jest.fn(),
      save: jest.fn(async () => undefined),
    }
    const products: FakeProduct[] = [
      { userId: 'user-quarantine', platform: 'curseduca', status: 'ACTIVE', metadata: {} },
      { userId: 'user-quarantine', platform: 'curseduca', status: 'QUARENTENA', metadata: {} },
      {
        userId: 'user-quarantine',
        platform: 'curseduca',
        status: 'PARA_INATIVAR',
        metadata: { guruTrialExpired: true },
      },
    ]
    mockUserFind.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([user]),
    })
    mockFetchSubscriptionById
      .mockResolvedValueOnce({ last_status: 'expired' })
      .mockResolvedValueOnce({ last_status: 'active' })
    mockUpdateMany.mockImplementation(async (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
    ) => {
      const matches = products.filter((product) => fakeMatches(product, filter))
      matches.forEach((product) => applyFakeUpdate(product, update))
      return { modifiedCount: matches.length }
    })

    const expired = await checkExpiredTrials()
    const providerActive = await checkExpiredTrials()

    expect(expired.markedForInactivation).toBe(2)
    expect(providerActive.converted).toBe(1)
    expect(products[0]).toMatchObject({ status: 'ACTIVE' })
    expect(products[0]?.metadata.guruTrialPreviousStatus).toBeUndefined()
    expect(products[1]).toMatchObject({ status: 'QUARENTENA' })
    expect(products[1]?.metadata.guruTrialPreviousStatus).toBeUndefined()
    expect(products[2]).toEqual({
      userId: 'user-quarantine',
      platform: 'curseduca',
      status: 'PARA_INATIVAR',
      metadata: { guruTrialExpired: true },
    })
  })
})
