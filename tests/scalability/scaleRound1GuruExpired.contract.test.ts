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
    mockUpdateMany.mockImplementation(async ({ userId }: { userId: string }) => {
      await boundary(`products:${userId.slice(5)}`)
      return { modifiedCount: 1 }
    })

    const result = await checkExpiredTrials()

    expect(peak).toBe(1)
    expect(events).toEqual(Array.from({ length: size }, (_, index) => [
      `provider:${index}`,
      `products:${index}`,
      `products:${index}`,
      `save:${index}`,
    ]).flat())
    expect(result).toEqual({
      checked: size,
      markedForInactivation: size * 2,
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
    const updates: Array<[Record<string, unknown>, Record<string, unknown>]> = []
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
      updates.push([filter, update])
      return { modifiedCount: 1 }
    })

    await checkExpiredTrials()
    await checkExpiredTrials()

    expect(updates).toHaveLength(4)
    expect(updates[0]?.[0]).toMatchObject({ status: 'ACTIVE' })
    expect(updates[0]?.[1]).toMatchObject({
      $set: {
        status: 'PARA_INATIVAR',
        'metadata.guruTrialPreviousStatus': 'ACTIVE',
      },
    })
    expect(updates[1]?.[0]).toMatchObject({ status: 'QUARENTENA' })
    expect(updates[1]?.[1]).toMatchObject({
      $set: {
        status: 'PARA_INATIVAR',
        'metadata.guruTrialPreviousStatus': 'QUARENTENA',
      },
    })
    expect(updates[2]?.[0]).toMatchObject({
      status: 'PARA_INATIVAR',
      'metadata.guruTrialPreviousStatus': 'ACTIVE',
    })
    expect(updates[2]?.[1]).toMatchObject({ $set: { status: 'ACTIVE' } })
    expect(updates[3]?.[0]).toMatchObject({
      status: 'PARA_INATIVAR',
      'metadata.guruTrialPreviousStatus': 'QUARENTENA',
    })
    expect(updates[3]?.[1]).toMatchObject({ $set: { status: 'QUARENTENA' } })

    const legacyFilter = updates[3]?.[0]
    expect(legacyFilter?.['metadata.guruTrialPreviousStatus']).toBe('QUARENTENA')
  })
})
