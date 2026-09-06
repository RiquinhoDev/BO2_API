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
  exec: jest.fn().mockResolvedValue(value),
})

describe('Guru trial unified preflight', () => {
  beforeEach(() => {
    mockFetchAllSubscriptionsComplete.mockReset()
    mockFetchSubscriptionById.mockReset()
    mockUserFind.mockReset()
    mockUserUpdateOne.mockReset()
    mockUserProductFind.mockReset()
    mockUserProductUpdateOne.mockReset()
    mockUserUpdateOne.mockResolvedValue({ modifiedCount: 1 })
    mockUserProductUpdateOne.mockResolvedValue({ modifiedCount: 1 })
    mockUserProductFind.mockReturnValue(queryResult([]))
  })

  test('provider failure in expiry preflight leaves sync with zero writes', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([subscription(1)])
    mockUserFind
      .mockReturnValueOnce(queryResult([{ _id: 'user-1', email: 'trial-1@example.test' }]))
      .mockReturnValueOnce(queryResult([{
        _id: 'user-expired',
        email: 'expired@example.test',
        guru: {
          subscriptionCode: 'sub-expired',
          trialStartedAt: '2026-01-01T00:00:00.000Z',
          trialFinishedAt: '2026-01-08T00:00:00.000Z',
        },
      }]))
    mockFetchSubscriptionById.mockRejectedValueOnce(new Error('provider-down'))

    await expect(runGuruTrialCheck()).rejects.toMatchObject({
      code: 'GURU_TRIAL_EXECUTION_INCOMPLETE',
    })
    expect(mockUserUpdateOne).not.toHaveBeenCalled()
    expect(mockUserProductUpdateOne).not.toHaveBeenCalled()
  })

  test('physical product cap rejects before any mutation', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([])
    mockUserFind.mockReturnValueOnce(queryResult([{
        _id: 'user-expired',
        email: 'expired@example.test',
        guru: {
          subscriptionCode: 'sub-expired',
          trialStartedAt: '2026-01-01T00:00:00.000Z',
          trialFinishedAt: '2026-01-08T00:00:00.000Z',
        },
      }]))
    mockFetchSubscriptionById.mockResolvedValue({ last_status: 'expired' })
    mockUserProductFind.mockReturnValue(queryResult(
      Array.from({ length: 20001 }, (_, index) => ({
        _id: `product-${index}`,
        status: 'ACTIVE',
        metadata: {},
      })),
    ))

    await expect(runGuruTrialCheck()).rejects.toMatchObject({
      code: 'GURU_TRIAL_PLAN_CAP_EXCEEDED',
    })
    expect(mockUserUpdateOne).not.toHaveBeenCalled()
    expect(mockUserProductUpdateOne).not.toHaveBeenCalled()
  })

  test('preview uses the planned sync state to include a newly expired trial', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([subscription(1, {
      trial_finished_at: '2020-01-08T00:00:00.000Z',
    })])
    mockUserFind
      .mockReturnValueOnce(queryResult([{ _id: 'user-1', email: 'trial-1@example.test' }]))
      .mockReturnValueOnce(queryResult([]))
    mockUserProductFind.mockReturnValue(queryResult([{
      _id: 'product-1',
      status: 'ACTIVE',
      metadata: {},
    }]))

    await expect(runGuruTrialCheck({ dryRun: true })).resolves.toMatchObject({
      dryRun: true,
      checked: 1,
      synced: 1,
      stillInTrial: 1,
      plan: { candidates: 1, stillInTrial: 1 },
    })
    expect(mockUserUpdateOne).not.toHaveBeenCalled()
    expect(mockUserProductUpdateOne).not.toHaveBeenCalled()
  })

  test('unknown provider status and invalid dates fail closed before writes', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([subscription(1, {
      last_status: 'mystery',
      trial_finished_at: 'not-a-date',
    })])
    mockUserFind.mockReturnValueOnce(queryResult([{ _id: 'user-1', email: 'trial-1@example.test' }]))

    await expect(runGuruTrialCheck()).rejects.toMatchObject({
      code: 'GURU_TRIAL_EXECUTION_INCOMPLETE',
    })
    expect(mockUserUpdateOne).not.toHaveBeenCalled()
  })

  test('bounds and validates fallback details before planning writes', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([subscription(1, {
      trial_started_at: undefined,
      trial_finished_at: undefined,
    })])
    mockUserFind
      .mockReturnValueOnce(queryResult([{ _id: 'user-1', email: 'trial-1@example.test' }]))
      .mockReturnValueOnce(queryResult([]))
    mockFetchSubscriptionById.mockResolvedValueOnce(subscription(1, {
      subscriber: { email: 'trial-1@example.test' },
      trial_started_at: '2026-01-01T00:00:00.000Z',
      trial_finished_at: '2026-01-08T00:00:00.000Z',
    }))

    await expect(runGuruTrialCheck({ dryRun: true })).resolves.toMatchObject({ synced: 1 })
    expect(mockFetchSubscriptionById).toHaveBeenCalledTimes(1)
    expect(mockUserUpdateOne).not.toHaveBeenCalled()
  })

  test('stops after the first local failure and never reports success', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([])
    mockUserFind.mockReturnValueOnce(queryResult([{
      _id: 'user-expired',
      email: 'expired@example.test',
      guru: {
        subscriptionCode: 'sub-expired',
        trialStartedAt: '2026-01-01T00:00:00.000Z',
        trialFinishedAt: '2026-01-08T00:00:00.000Z',
      },
    }]))
    mockFetchSubscriptionById.mockResolvedValue({ last_status: 'expired' })
    mockUserProductFind.mockReturnValue(queryResult([{
      _id: 'product-1',
      status: 'ACTIVE',
      metadata: {},
    }]))
    mockUserProductUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 })
    mockUserUpdateOne.mockRejectedValueOnce(new Error('local-write-failed'))

    await expect(runGuruTrialCheck()).rejects.toMatchObject({
      code: 'GURU_TRIAL_EXECUTION_INCOMPLETE',
    })
    expect(mockUserProductUpdateOne).toHaveBeenCalledTimes(1)
    expect(mockUserUpdateOne).toHaveBeenCalledTimes(1)
  })

  test('ownership loss before the next effect prevents that effect', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([])
    mockUserFind.mockReturnValueOnce(queryResult([{
      _id: 'user-expired',
      email: 'expired@example.test',
      guru: {
        subscriptionCode: 'sub-expired',
        trialStartedAt: '2026-01-01T00:00:00.000Z',
        trialFinishedAt: '2026-01-08T00:00:00.000Z',
      },
    }]))
    mockFetchSubscriptionById.mockResolvedValue({ last_status: 'expired' })
    mockUserProductFind.mockReturnValue(queryResult([{
      _id: 'product-1',
      status: 'ACTIVE',
      metadata: {},
    }]))
    let assertions = 0
    const phaseHooks = {
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
      assertOwnership: jest.fn(() => {
        assertions++
        if (assertions > 1) throw new Error('lease-lost')
      }),
    }

    await expect(runGuruTrialCheck({ phaseHooks })).rejects.toMatchObject({
      code: 'GURU_TRIAL_EXECUTION_INCOMPLETE',
    })
    expect(mockUserProductUpdateOne).toHaveBeenCalledTimes(1)
    expect(mockUserUpdateOne).not.toHaveBeenCalled()
  })

  test('duplicate local product identities fail before writes', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([])
    mockUserFind.mockReturnValueOnce(queryResult([{
      _id: 'user-expired',
      email: 'expired@example.test',
      guru: {
        subscriptionCode: 'sub-expired',
        trialStartedAt: '2026-01-01T00:00:00.000Z',
        trialFinishedAt: '2026-01-08T00:00:00.000Z',
      },
    }]))
    mockFetchSubscriptionById.mockResolvedValue({ last_status: 'expired' })
    mockUserProductFind.mockReturnValue(queryResult([
      { _id: 'product-1', status: 'ACTIVE', metadata: {} },
      { _id: 'product-1', status: 'ACTIVE', metadata: {} },
    ]))

    await expect(runGuruTrialCheck()).rejects.toMatchObject({
      code: 'GURU_TRIAL_EXECUTION_INCOMPLETE',
    })
    expect(mockUserProductUpdateOne).not.toHaveBeenCalled()
    expect(mockUserUpdateOne).not.toHaveBeenCalled()
  })
})
