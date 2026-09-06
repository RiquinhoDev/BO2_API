const mockFetchAllSubscriptionsComplete = jest.fn()
const mockFetchSubscriptionById = jest.fn()
const mockUserFind = jest.fn()
const mockUserUpdateOne = jest.fn()
const mockUserProductFind = jest.fn()
const mockUserProductUpdateOne = jest.fn()

jest.mock('../../../src/services/guru/guruSync.service', () => ({
  fetchAllSubscriptionsComplete: mockFetchAllSubscriptionsComplete,
  fetchSubscriptionById: mockFetchSubscriptionById,
}))

jest.mock('../../../src/models/user', () => ({
  __esModule: true,
  default: { find: mockUserFind, updateOne: mockUserUpdateOne },
}))

jest.mock('../../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { find: mockUserProductFind, updateOne: mockUserProductUpdateOne },
}))

import { runGuruTrialCheck } from '../../../src/services/guru/guruTrialCheckExecution.service'
import { normalizeGuruStatus } from '../../../src/services/guru/sync/persistence'

const subscription = (index: number, overrides: Record<string, unknown> = {}) => ({
  id: `sub-${index}`,
  subscription_code: `sub-${index}`,
  last_status: 'trial',
  trial_started_at: '2026-01-01T00:00:00.000Z',
  trial_finished_at: '2026-01-08T00:00:00.000Z',
  subscriber: { email: `trial-${index}@example.test` },
  ...overrides,
})

const queryResult = <T,>(value: T) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
})

describe('Guru trial round3 safety', () => {
  beforeEach(() => {
    mockFetchAllSubscriptionsComplete.mockReset()
    mockFetchSubscriptionById.mockReset()
    mockUserFind.mockReset()
    mockUserUpdateOne.mockReset()
    mockUserProductFind.mockReset()
    mockUserProductUpdateOne.mockReset()
    mockUserUpdateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 })
    mockUserProductUpdateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 })
    mockUserProductFind.mockReturnValue(queryResult([]))
  })

  test('known canonical non-trial statuses are validated then skipped', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([
      subscription(1),
      subscription(2, { last_status: 'past_due', subscriber: { email: 'paid@example.test' } }),
    ])
    mockUserFind
      .mockReturnValueOnce(queryResult([{ _id: 'user-1', email: 'trial-1@example.test' }]))
      .mockReturnValueOnce(queryResult([]))
    mockFetchSubscriptionById.mockResolvedValueOnce(subscription(1))
    mockUserProductFind.mockReturnValueOnce(queryResult([]))

    await expect(runGuruTrialCheck({ dryRun: true })).resolves.toMatchObject({ synced: 1, checked: 1 })
  })

  test.each([
    ['active', 'active'], ['paid', 'active'], ['trialing', 'trial'], ['past_due', 'pastdue'],
    ['unpaid', 'pastdue'], ['cancelled', 'canceled'], ['suspended', 'suspended'],
  ])('normalizes canonical Guru alias %s safely', (raw, expected) => {
    expect(normalizeGuruStatus(raw)).toBe(expected)
  })

  test.each(['constructor', '__proto__', 'toString'])('rejects non-status object keys: %s', raw => {
    expect(normalizeGuruStatus(raw)).toBeUndefined()
  })

  test('known non-trial status with malformed dates fails before filtering', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([subscription(1, {
      last_status: 'past_due',
      trial_started_at: 'not-a-date',
      subscriber: { email: 'paid@example.test' },
    })])

    await expect(runGuruTrialCheck()).rejects.toMatchObject({ code: 'GURU_TRIAL_EXECUTION_INCOMPLETE' })
    expect(mockUserFind).not.toHaveBeenCalled()
  })

  test('known status with malformed provider identity fails before filtering', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([subscription(1, {
      last_status: 'past_due',
      subscriber: { email: 'not-an-email' },
    })])

    await expect(runGuruTrialCheck()).rejects.toMatchObject({ code: 'GURU_TRIAL_EXECUTION_INCOMPLETE' })
    expect(mockUserFind).not.toHaveBeenCalled()
  })

  test('every expired candidate reads authoritative detail even when list dates are complete', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([subscription(1, { trial_started_at: '2019-01-01T00:00:00.000Z', trial_finished_at: '2020-01-08T00:00:00.000Z' })])
    mockUserFind
      .mockReturnValueOnce(queryResult([{ _id: 'user-1', email: 'trial-1@example.test' }]))
      .mockReturnValueOnce(queryResult([]))
    mockFetchSubscriptionById.mockResolvedValueOnce(subscription(1, {
      last_status: 'paid',
      trial_started_at: '2019-01-01T00:00:00.000Z',
      trial_finished_at: '2020-01-08T00:00:00.000Z',
    }))
    mockUserProductFind.mockReturnValueOnce(queryResult([]))

    await expect(runGuruTrialCheck({ dryRun: true })).resolves.toMatchObject({ checked: 1, converted: 1 })
    expect(mockFetchSubscriptionById).toHaveBeenCalledWith('sub-1', expect.anything())
  })

  test('converted local users stay excluded when stale trial list data is returned', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([subscription(1, { trial_started_at: '2019-01-01T00:00:00.000Z', trial_finished_at: '2020-01-08T00:00:00.000Z' })])
    mockUserFind
      .mockReturnValueOnce(queryResult([{
        _id: 'user-1', email: 'trial-1@example.test',
        guru: { trialConvertedAt: '2026-01-02T00:00:00.000Z' },
      }]))
      .mockReturnValueOnce(queryResult([]))

    await expect(runGuruTrialCheck({ dryRun: true })).resolves.toMatchObject({ checked: 0, synced: 1, plan: { plannedMutations: 1 } })
    expect(mockUserProductFind).not.toHaveBeenCalled()
  })

  test('global provider code ownership is checked before email deduplication', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([
      subscription(1, { subscription_code: 'shared-code' }),
      subscription(2, { subscription_code: 'shared-code', last_status: 'active', subscriber: { email: 'other@example.test' } }),
    ])

    await expect(runGuruTrialCheck()).rejects.toMatchObject({ code: 'GURU_TRIAL_EXECUTION_INCOMPLETE' })
    expect(mockUserFind).not.toHaveBeenCalled()
  })

  test('expiry detail shares code ownership from every list row', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([subscription(1, {
      last_status: 'pending',
      subscription_code: 'shared-code',
      subscriber: { email: 'list-owner@example.test' },
    })])
    mockUserFind.mockReturnValueOnce(queryResult([{
      _id: 'user-expired', email: 'expired@example.test',
      guru: { subscriptionCode: 'shared-code', trialStartedAt: '2026-01-01T00:00:00.000Z', trialFinishedAt: '2026-01-08T00:00:00.000Z' },
    }]))
    mockFetchSubscriptionById.mockResolvedValueOnce({
      id: 'shared-code', subscription_code: 'shared-code', last_status: 'expired',
      trial_started_at: '2026-01-01T00:00:00.000Z', trial_finished_at: '2026-01-08T00:00:00.000Z',
      subscriber: { email: 'expired@example.test' },
    })

    await expect(runGuruTrialCheck()).rejects.toMatchObject({ code: 'GURU_TRIAL_EXECUTION_INCOMPLETE' })
    expect(mockUserUpdateOne).not.toHaveBeenCalled()
    expect(mockUserProductFind).not.toHaveBeenCalled()
  })

  test('provider detail must preserve the requested code and local email', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([subscription(1, {
      trial_started_at: undefined,
      trial_finished_at: undefined,
    })])
    mockUserFind.mockReturnValueOnce(queryResult([{ _id: 'user-1', email: 'trial-1@example.test' }]))
    mockFetchSubscriptionById.mockResolvedValueOnce(subscription(1, {
      subscription_code: 'other-code',
      subscriber: { email: 'other@example.test' },
      trial_started_at: '2026-01-01T00:00:00.000Z',
      trial_finished_at: '2026-01-08T00:00:00.000Z',
    }))

    await expect(runGuruTrialCheck()).rejects.toMatchObject({
      code: 'GURU_TRIAL_EXECUTION_INCOMPLETE',
    })
    expect(mockUserUpdateOne).not.toHaveBeenCalled()
    expect(mockUserProductFind).not.toHaveBeenCalled()
  })

  test('one provider code cannot map to two local identities', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([
      subscription(1, { subscription_code: 'shared-code', subscriber: { email: 'one@example.test' } }),
      subscription(2, { subscription_code: 'shared-code', subscriber: { email: 'two@example.test' } }),
    ])

    await expect(runGuruTrialCheck()).rejects.toMatchObject({ code: 'GURU_TRIAL_EXECUTION_INCOMPLETE' })
    expect(mockUserUpdateOne).not.toHaveBeenCalled()
  })

  test('expiry detail identity must match its local candidate', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([])
    mockUserFind.mockReturnValueOnce(queryResult([{
      _id: 'user-expired', email: 'expired@example.test',
      guru: { subscriptionCode: 'sub-expired', trialStartedAt: '2026-01-01T00:00:00.000Z', trialFinishedAt: '2026-01-08T00:00:00.000Z' },
    }]))
    mockFetchSubscriptionById.mockResolvedValueOnce({ id: 'sub-expired', subscription_code: 'sub-expired', last_status: 'expired', trial_started_at: '2026-01-01T00:00:00.000Z', trial_finished_at: '2026-01-08T00:00:00.000Z', subscriber: { email: 'other@example.test' } })

    await expect(runGuruTrialCheck()).rejects.toMatchObject({ code: 'GURU_TRIAL_EXECUTION_INCOMPLETE' })
    expect(mockUserProductFind).not.toHaveBeenCalled()
  })

  test('cancelled provider status is canonicalized before local persistence', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([])
    mockUserFind.mockReturnValueOnce(queryResult([{
      _id: 'user-expired', email: 'expired@example.test',
      guru: { subscriptionCode: 'sub-expired', trialStartedAt: '2026-01-01T00:00:00.000Z', trialFinishedAt: '2026-01-08T00:00:00.000Z' },
    }]))
    mockFetchSubscriptionById.mockResolvedValueOnce({ id: 'sub-expired', subscription_code: 'sub-expired', last_status: 'cancelled', trial_started_at: '2026-01-01T00:00:00.000Z', trial_finished_at: '2026-01-08T00:00:00.000Z', subscriber: { email: 'expired@example.test' } })
    mockUserProductFind.mockReturnValueOnce(queryResult([]))

    await runGuruTrialCheck()
    expect(mockUserUpdateOne.mock.calls[0][1]).toEqual(expect.objectContaining({ $set: expect.objectContaining({ 'guru.status': 'canceled' }) }))
  })

  test('prepare captures one stable now for expiry filtering and projection', async () => {
    const now = Date.parse('2026-01-08T00:00:00.000Z')
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now)
    try {
      mockFetchAllSubscriptionsComplete.mockResolvedValue([subscription(1, { trial_started_at: '2026-01-01T00:00:00.000Z', trial_finished_at: '2026-01-08T00:00:00.000Z' })])
      mockUserFind
        .mockReturnValueOnce(queryResult([{ _id: 'user-1', email: 'trial-1@example.test' }]))
        .mockReturnValueOnce(queryResult([]))
      mockFetchSubscriptionById.mockResolvedValueOnce(subscription(1))
      mockUserProductFind.mockReturnValueOnce(queryResult([]))

      await expect(runGuruTrialCheck({ dryRun: true })).resolves.toMatchObject({ checked: 1 })
      expect(nowSpy).toHaveBeenCalledTimes(1)
    } finally {
      nowSpy.mockRestore()
    }
  })

  test.each([0, '0'])('product write with malformed modifiedCount %p fails closed', async modifiedCount => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([])
    mockUserFind.mockReturnValueOnce(queryResult([{
      _id: 'user-expired', email: 'expired@example.test',
      guru: { subscriptionCode: 'sub-expired', trialStartedAt: '2026-01-01T00:00:00.000Z', trialFinishedAt: '2026-01-08T00:00:00.000Z' },
    }]))
    mockFetchSubscriptionById.mockResolvedValueOnce({ id: 'sub-expired', subscription_code: 'sub-expired', last_status: 'expired', trial_started_at: '2026-01-01T00:00:00.000Z', trial_finished_at: '2026-01-08T00:00:00.000Z', subscriber: { email: 'expired@example.test' } })
    mockUserProductFind.mockReturnValueOnce(queryResult([{ _id: 'product-1', status: 'ACTIVE', metadata: {} }]))
    mockUserProductUpdateOne.mockResolvedValueOnce({ acknowledged: true, matchedCount: 1, modifiedCount })

    await expect(runGuruTrialCheck()).rejects.toMatchObject({ code: 'GURU_TRIAL_EXECUTION_INCOMPLETE' })
    expect(mockUserUpdateOne).not.toHaveBeenCalled()
  })
})
