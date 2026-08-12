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
  test('preserves provider, user-save and enrollment-write order with one item in flight', async () => {
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
      `save:${index}`,
      `products:${index}`,
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
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })
})
