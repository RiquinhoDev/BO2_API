const mockUserFind = jest.fn()
const mockUserFindOne = jest.fn()
const mockUserUpdateOne = jest.fn()
const mockFetchAllSubscriptionsComplete = jest.fn()
const mockFetchSubscriptionById = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    find: mockUserFind,
    findOne: mockUserFindOne,
    updateOne: mockUserUpdateOne,
  },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { updateMany: jest.fn() },
}))

jest.mock('../../src/services/guru/guruSync.service', () => ({
  fetchAllSubscriptionsComplete: mockFetchAllSubscriptionsComplete,
  fetchSubscriptionById: mockFetchSubscriptionById,
}))

import { syncTrialsFromGuru } from '../../src/services/guru/guruTrialService'

const subscription = (index: number) => ({
  id: `sub-${index}`,
  subscription_code: `sub-${index}`,
  last_status: 'trial',
  contact: { email: `user-${index}@example.test` },
  trial_started_at: '2026-08-01T00:00:00.000Z',
  trial_finished_at: '2026-08-08T00:00:00.000Z',
})

function usersQuery(users: Array<{ _id: string; email: string }>) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(users),
  }
}

describe.each([1, 10, 100])('Guru trial local set read N=%i', (size) => {
  beforeEach(() => {
    jest.clearAllMocks()
    const users = Array.from({ length: size }, (_, index) => ({
      _id: `user-${index}`,
      email: `user-${index}@example.test`,
    }))
    mockFetchAllSubscriptionsComplete.mockResolvedValue(
      Array.from({ length: size }, (_, index) => subscription(index)),
    )
    mockUserFind.mockReturnValue(usersQuery(users))
    mockUserUpdateOne.mockResolvedValue({ modifiedCount: 1 })
  })

  test('loads all matching local users once and preserves directed write order', async () => {
    const result = await syncTrialsFromGuru()

    expect(mockUserFind).toHaveBeenCalledTimes(1)
    expect(mockUserFind).toHaveBeenCalledWith({
      email: { $in: Array.from({ length: size }, (_, index) => `user-${index}@example.test`) },
    })
    expect(mockUserFindOne).not.toHaveBeenCalled()
    expect(mockUserUpdateOne).toHaveBeenCalledTimes(size)
    expect(mockUserUpdateOne.mock.calls.map(([filter]) => filter._id)).toEqual(
      Array.from({ length: size }, (_, index) => `user-${index}`),
    )
    expect(result).toEqual({ synced: size, errors: 0 })
    expect(mockFetchSubscriptionById).not.toHaveBeenCalled()
  })

  test('accounts for every failed directed write without stopping later writes', async () => {
    const failed = new Set(Array.from({ length: size }, (_, index) => index).filter(index => index % 10 === 0))
    mockUserUpdateOne.mockImplementation(async ({ _id }: { _id: string }) => {
      const index = Number(_id.slice('user-'.length))
      if (failed.has(index)) throw new Error(`write-${index}`)
      return { modifiedCount: 1 }
    })

    const result = await syncTrialsFromGuru()

    expect(mockUserUpdateOne).toHaveBeenCalledTimes(size)
    expect(result).toEqual({ synced: size - failed.size, errors: failed.size })
  })
})

import {
  StudentMovementService,
  type MoveStudentInput,
  type StudentMovementWriter,
} from '../../src/services/classes/studentMovement.service'

describe.each([1, 10, 100])('student movement contractual sequence N=%i', (size) => {
  test('keeps one active write, input order, per-item clocks and complete errors', async () => {
    let active = 0
    let peak = 0
    const order: string[] = []
    const failed = new Set(Array.from({ length: size }, (_, index) => index).filter(index => index % 10 === 0))
    const writer: StudentMovementWriter = {
      async moveStudent(input: MoveStudentInput): Promise<unknown> {
        active++
        peak = Math.max(peak, active)
        order.push(input.studentId)
        await Promise.resolve()
        active--
        const index = Number(input.studentId.slice(2))
        if (failed.has(index)) throw new Error(`move-${index}`)
        return { id: `movement-${index}` }
      },
    }
    let instant = 0
    const service = new StudentMovementService(writer, {
      now: () => new Date(Date.UTC(2026, 7, 12, 0, 0, instant++)),
    })

    const result = await service.moveMany({
      studentIds: Array.from({ length: size }, (_, index) => `s-${index}`),
      toClassId: 'target',
    })

    expect(peak).toBe(1)
    expect(order).toEqual(Array.from({ length: size }, (_, index) => `s-${index}`))
    expect(result.results.success).toHaveLength(size - failed.size)
    expect(result.results.errors).toEqual(
      [...failed].map(index => ({ studentId: `s-${index}`, error: `move-${index}` })),
    )
    expect(result.timestamp).toBe(new Date(Date.UTC(2026, 7, 12, 0, 0, size)).toISOString())
  })
})

test('falls back to per-subscription reads when the Guru trial set read fails', async () => {
  jest.clearAllMocks()
  mockFetchAllSubscriptionsComplete.mockResolvedValue([subscription(0), subscription(1)])
  mockUserFind.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockRejectedValue(new Error('set-read')),
  })
  mockUserFindOne
    .mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ _id: 'user-0' }) })
    .mockReturnValueOnce({ select: jest.fn().mockRejectedValue(new Error('single-read')) })
  mockUserUpdateOne.mockResolvedValue({ modifiedCount: 1 })

  await expect(syncTrialsFromGuru()).resolves.toEqual({ synced: 1, errors: 1 })
  expect(mockUserFindOne).toHaveBeenCalledTimes(2)
  expect(mockUserUpdateOne).toHaveBeenCalledTimes(1)
})
