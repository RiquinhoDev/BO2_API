const mockFetchAllSubscriptionsComplete = jest.fn()
const mockFetchSubscriptionById = jest.fn()
const mockUserFind = jest.fn()
const mockUserUpdateOne = jest.fn()
const mockUserProductUpdateMany = jest.fn()

jest.mock('../../../src/services/guru/guruSync.service', () => ({
  fetchAllSubscriptionsComplete: mockFetchAllSubscriptionsComplete,
  fetchSubscriptionById: mockFetchSubscriptionById,
}))

jest.mock('../../../src/models/user', () => ({
  __esModule: true,
  default: {
    find: mockUserFind,
    updateOne: mockUserUpdateOne,
  },
}))

jest.mock('../../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { updateMany: mockUserProductUpdateMany },
}))

import {
  runCheckExpiredTrials,
  runSyncTrialsFromGuru,
} from '../../../src/services/guru/guruTrialCheckExecution.service'

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

const hooks = (events: string[]) => ({
  assertOwnership: jest.fn(() => events.push('assert')),
  providerStarted: jest.fn(() => events.push('provider-start')),
  providerSucceeded: jest.fn(() => events.push('provider-success')),
  localMutationStarted: jest.fn(() => events.push('local-start')),
})

describe('GuruTrialCheck bounded execution', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUserUpdateOne.mockResolvedValue({ modifiedCount: 1 })
    mockUserProductUpdateMany.mockResolvedValue({ modifiedCount: 1 })
  })

  test('dry-run sync stays read-only and forwards provider ownership phases', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([subscription(1)])
    mockUserFind.mockReturnValue(queryResult([{ _id: 'user-1', email: 'trial-1@example.test' }]))
    const events: string[] = []
    const phaseHooks = hooks(events)

    await expect(runSyncTrialsFromGuru({ dryRun: true, phaseHooks })).resolves.toEqual({ synced: 1, errors: 0 })

    expect(mockUserUpdateOne).not.toHaveBeenCalled()
    expect(phaseHooks.providerStarted).toHaveBeenCalledTimes(1)
    expect(phaseHooks.providerSucceeded).toHaveBeenCalledTimes(1)
    expect(phaseHooks.localMutationStarted).not.toHaveBeenCalled()
    expect(events).toEqual(['provider-start', 'assert', 'provider-success'])
  })

  test('conflicting duplicate trial identities fail before local writes', async () => {
    mockFetchAllSubscriptionsComplete.mockResolvedValue([
      subscription(1),
      subscription(2, {
        subscriber: { email: 'TRIAL-1@example.test' },
        trial_finished_at: '2026-01-09T00:00:00.000Z',
      }),
    ])
    mockUserFind.mockReturnValue(queryResult([{ _id: 'user-1', email: 'trial-1@example.test' }]))

    await expect(runSyncTrialsFromGuru()).rejects.toMatchObject({
      code: 'GURU_TRIAL_EXECUTION_INCOMPLETE',
      status: 503,
    })
    expect(mockUserUpdateOne).not.toHaveBeenCalled()
  })

  test('expiry provider failure completes no local mutation from an earlier candidate', async () => {
    const userA = {
      _id: 'user-a',
      email: 'a@example.test',
      guru: { subscriptionCode: 'sub-a' },
      set: jest.fn(),
      save: jest.fn(),
    }
    const userB = {
      _id: 'user-b',
      email: 'b@example.test',
      guru: { subscriptionCode: 'sub-b' },
      set: jest.fn(),
      save: jest.fn(),
    }
    mockUserFind.mockReturnValue(queryResult([userA, userB]))
    mockFetchSubscriptionById
      .mockResolvedValueOnce({ last_status: 'expired' })
      .mockRejectedValueOnce(new Error('provider-down'))

    await expect(runCheckExpiredTrials()).rejects.toMatchObject({
      code: 'GURU_TRIAL_EXECUTION_INCOMPLETE',
      status: 503,
    })
    expect(mockUserProductUpdateMany).not.toHaveBeenCalled()
    expect(userA.save).not.toHaveBeenCalled()
    expect(userB.save).not.toHaveBeenCalled()
  })

  test('expiry dry-run reports bounded plan without local writes', async () => {
    const user = {
      _id: 'user-a',
      email: 'a@example.test',
      guru: { subscriptionCode: 'sub-a' },
      set: jest.fn(),
      save: jest.fn(),
    }
    mockUserFind.mockReturnValue(queryResult([user]))
    mockFetchSubscriptionById.mockResolvedValue({ last_status: 'expired' })

    await expect(runCheckExpiredTrials({ dryRun: true })).resolves.toMatchObject({
      checked: 1,
      markedForInactivation: 1,
      plan: {
        operation: 'guru-trial-check',
        dryRun: true,
        plannedMutations: 3,
        remaining: 0,
        anomaly: false,
      },
    })
    expect(mockUserProductUpdateMany).not.toHaveBeenCalled()
    expect(user.save).not.toHaveBeenCalled()
  })
})
