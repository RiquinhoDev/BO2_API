const mockUserFind = jest.fn()
const mockFindByIdAndUpdate = jest.fn()
const mockEvaluateAchievements = jest.fn()

jest.mock('../../../src/models/user', () => ({
  __esModule: true,
  default: {
    find: mockUserFind,
    findByIdAndUpdate: mockFindByIdAndUpdate,
  },
}))

jest.mock('../../../src/services/achievements/achievementEvaluator', () => ({
  __esModule: true,
  evaluateAchievements: mockEvaluateAchievements,
}))

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
  },
}))

import { evaluateAllAchievements } from '../../../src/services/achievements/achievementEvaluation.service'

type FakeUser = {
  _id: string
  email: string
  hotmart: { purchaseDate: Date }
  achievements: []
  achievementStats?: undefined
}

type EvaluationResult = {
  achievements: Array<{
    id: string
    unlockedAt: Date | null
    seenAt: Date | null
  }>
  stats: {
    total: number
    unlocked: number
    percentage: number
    currentStreak: number
    bestStreak: number
    lastEvaluatedAt: Date
  }
}

function queryFor(users: FakeUser[]) {
  return {
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(users),
  }
}

function makeUsers(size: number): FakeUser[] {
  return Array.from({ length: size }, (_, index) => ({
    _id: `user-${index}`,
    email: `user-${index}@example.test`,
    hotmart: { purchaseDate: new Date('2026-01-01T00:00:00.000Z') },
    achievements: [],
  }))
}

function indexFromId(id: string): number {
  return Number(id.replace('user-', ''))
}

function evaluationFor(index: number): EvaluationResult {
  return {
    achievements: [{ id: `achievement-${index}`, unlockedAt: new Date('2026-09-05T00:00:00.000Z'), seenAt: null }],
    stats: {
      total: 1,
      unlocked: 1,
      percentage: 100,
      currentStreak: 1,
      bestStreak: 1,
      lastEvaluatedAt: new Date('2026-09-05T00:00:00.000Z'),
    },
  }
}

describe.each([1, 10, 100])('achievement evaluation batch N=%i', (size) => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('keeps evaluation -> persistence order and one user in flight', async () => {
    const users = makeUsers(size)
    mockUserFind.mockReturnValue(queryFor(users))
    let active = 0
    let peak = 0
    const events: string[] = []

    const record = async (event: string): Promise<void> => {
      active++
      peak = Math.max(peak, active)
      events.push(event)
      await Promise.resolve()
      active--
    }

    mockEvaluateAchievements.mockImplementation(async (user: FakeUser) => {
      const index = indexFromId(user._id)
      await record(`evaluate:${index}`)
      return evaluationFor(index)
    })
    mockFindByIdAndUpdate.mockImplementation(async (id: string, update: { $set: unknown }) => {
      await record(`persist:${id.replace('user-', '')}`)
      expect(update.$set).toBeDefined()
      return {}
    })

    const result = await evaluateAllAchievements({ force: true })

    expect(result).toMatchObject({
      total: size,
      processed: size,
      evaluated: size,
      errors: 0,
    })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(peak).toBe(1)
    expect(events).toEqual(Array.from({ length: size }, (_, index) => [
      `evaluate:${index}`,
      `persist:${index}`,
    ]).flat())
    expect(mockEvaluateAchievements).toHaveBeenCalledTimes(size)
    expect(mockFindByIdAndUpdate).toHaveBeenCalledTimes(size)
  })

  test('counts failed attempts and continues in input order', async () => {
    const users = makeUsers(size)
    const evaluationFailures = new Set(users.filter((_, index) => index % 10 === 0).map(user => user._id))
    const persistenceFailures = new Set(users.filter((_, index) => index % 10 === 1).map(user => user._id))
    mockUserFind.mockReturnValue(queryFor(users))
    const events: string[] = []

    mockEvaluateAchievements.mockImplementation(async (user: FakeUser) => {
      const index = indexFromId(user._id)
      events.push(`evaluate:${index}`)
      if (evaluationFailures.has(user._id)) throw new Error(`evaluate-${index}`)
      return evaluationFor(index)
    })
    mockFindByIdAndUpdate.mockImplementation(async (id: string) => {
      const index = indexFromId(id)
      events.push(`persist:${index}`)
      if (persistenceFailures.has(id)) throw new Error(`persist-${index}`)
      return {}
    })

    const result = await evaluateAllAchievements({ force: true })
    const failedCount = evaluationFailures.size + persistenceFailures.size
    const successfulCount = size - failedCount

    expect(result).toMatchObject({
      total: size,
      processed: size,
      evaluated: successfulCount,
      errors: failedCount,
    })
    expect(events).toEqual(users.map((user, index) => [
      `evaluate:${index}`,
      ...(evaluationFailures.has(user._id) ? [] : [`persist:${index}`]),
    ]).flat())
    expect(mockEvaluateAchievements).toHaveBeenCalledTimes(size)
    expect(mockFindByIdAndUpdate).toHaveBeenCalledTimes(size - evaluationFailures.size)
  })
})
