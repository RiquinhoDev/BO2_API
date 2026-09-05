const mockUserFind = jest.fn()
const mockUpdateOne = jest.fn()
const mockAddTag = jest.fn()
const mockRemoveTag = jest.fn()

jest.mock('../../../src/models/user', () => ({
  __esModule: true,
  default: {
    find: mockUserFind,
    updateOne: mockUpdateOne,
  },
}))

jest.mock('../../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {
    addTag: mockAddTag,
    removeTag: mockRemoveTag,
  },
}))

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

import { syncTestimonialTags } from '../../../src/services/activeCampaign/testimonialTagSync.service'

type FakeUser = {
  _id: { toString: () => string }
  email: string
  communicationByCourse: {
    TESTIMONIALS: {
      currentTags: string[]
      lastSyncedAt?: Date
    }
  }
}

function queryFor(users: FakeUser[]) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(users),
  }
}

function makeUsers(size: number): FakeUser[] {
  return Array.from({ length: size }, (_, index) => {
    const id = `user-${index}`
    return {
      _id: { toString: () => id },
      email: `${id}@example.test`,
      communicationByCourse: {
        TESTIMONIALS: {
          currentTags: ['COURSE_CONCLUIDO'],
        },
      },
    }
  })
}

function indexFromEmail(email: string): number {
  return Number(email.match(/user-(\d+)@/)?.[1])
}

function updateUserId(call: unknown[]): string {
  const filter = call[0] as { _id: { toString: () => string } }
  return filter._id.toString()
}

describe.each([1, 10, 100])('testimonial tag sync N=%i', (size) => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('keeps remove -> add -> local marker order with one operation in flight', async () => {
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

    mockRemoveTag.mockImplementation(async (email: string, tag: string) => {
      expect(tag).toBe('COURSE')
      await record(`remove:${indexFromEmail(email)}`)
      return true
    })
    mockAddTag.mockImplementation(async (email: string, tag: string) => {
      expect(tag).toBe('COURSE_CONCLUIDO')
      await record(`add:${indexFromEmail(email)}`)
      return {}
    })
    mockUpdateOne.mockImplementation(async (filter: { _id: { toString: () => string } }) => {
      await record(`update:${filter._id.toString().replace('user-', '')}`)
      return { acknowledged: true }
    })

    const result = await syncTestimonialTags()

    expect(result).toEqual({
      success: true,
      stats: {
        totalUsers: size,
        totalTags: size,
        synced: size,
        skipped: 0,
        failed: 0,
      },
      errors: [],
    })
    expect(peak).toBe(1)
    expect(events).toEqual(Array.from({ length: size }, (_, index) => [
      `remove:${index}`,
      `add:${index}`,
      `update:${index}`,
    ]).flat())
    expect(mockRemoveTag).toHaveBeenCalledTimes(size)
    expect(mockAddTag).toHaveBeenCalledTimes(size)
    expect(mockUpdateOne).toHaveBeenCalledTimes(size)
  })

  test('counts partial provider failures and does not advance the local marker', async () => {
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

    mockRemoveTag.mockImplementation(async (email: string, tag: string) => {
      expect(tag).toBe('COURSE')
      const index = indexFromEmail(email)
      await record(`remove:${index}`)
      return index % 10 !== 0
    })
    mockAddTag.mockImplementation(async (email: string, tag: string) => {
      expect(tag).toBe('COURSE_CONCLUIDO')
      const index = indexFromEmail(email)
      await record(`add:${index}`)
      if (index % 10 === 1) throw new Error(`provider-add-${index}`)
      return {}
    })
    mockUpdateOne.mockImplementation(async (filter: { _id: { toString: () => string } }) => {
      await record(`update:${filter._id.toString().replace('user-', '')}`)
      return { acknowledged: true }
    })

    const result = await syncTestimonialTags()
    const removeFailures = users.filter((_, index) => index % 10 === 0).length
    const addFailures = users.filter((_, index) => index % 10 === 1).length
    const successfulUserIds = users
      .filter((_, index) => index % 10 !== 0 && index % 10 !== 1)
      .map(user => user._id.toString())

    expect(result.success).toBe(false)
    expect(result.stats).toEqual({
      totalUsers: size,
      totalTags: size,
      synced: size - addFailures,
      skipped: 0,
      failed: removeFailures + addFailures,
    })
    expect(result.errors).toHaveLength(removeFailures + addFailures)
    expect(result.errors.filter(error => error.error.includes('removal'))).toHaveLength(removeFailures)
    expect(result.errors.filter(error => error.error.includes('COURSE_CONCLUIDO'))).toHaveLength(addFailures)
    expect(mockUpdateOne.mock.calls.map(updateUserId)).toEqual(successfulUserIds)
    expect(peak).toBe(1)
    expect(events).toEqual(Array.from({ length: size }, (_, index) => [
      `remove:${index}`,
      `add:${index}`,
      ...(index % 10 !== 0 && index % 10 !== 1 ? [`update:${index}`] : []),
    ]).flat())
  })

  test('skips recent users before any provider write or local marker update', async () => {
    const users = makeUsers(size)
    const recent = new Date(Date.now() - 60 * 60 * 1000)
    users.forEach(user => {
      user.communicationByCourse.TESTIMONIALS.lastSyncedAt = recent
    })
    mockUserFind.mockReturnValue(queryFor(users))

    const result = await syncTestimonialTags()

    expect(result).toEqual({
      success: true,
      stats: {
        totalUsers: size,
        totalTags: size,
        synced: 0,
        skipped: size,
        failed: 0,
      },
      errors: [],
    })
    expect(mockRemoveTag).not.toHaveBeenCalled()
    expect(mockAddTag).not.toHaveBeenCalled()
    expect(mockUpdateOne).not.toHaveBeenCalled()
  })

  test('reports local marker persistence failure and retries the provider work', async () => {
    const users = makeUsers(size)
    mockUserFind.mockReturnValue(queryFor(users))
    mockRemoveTag.mockResolvedValue(true)
    mockAddTag.mockResolvedValue({})
    mockUpdateOne.mockRejectedValue(new Error('database unavailable'))

    const firstResult = await syncTestimonialTags()

    expect(firstResult).toEqual({
      success: false,
      stats: {
        totalUsers: size,
        totalTags: size,
        synced: size,
        skipped: 0,
        failed: size,
      },
      errors: users.map(user => ({
        userId: user._id.toString(),
        email: user.email,
        error: 'lastSyncedAt: database unavailable',
      })),
    })
    expect(mockRemoveTag).toHaveBeenCalledTimes(size)
    expect(mockAddTag).toHaveBeenCalledTimes(size)
    expect(mockUpdateOne).toHaveBeenCalledTimes(size)

    mockUpdateOne.mockResolvedValue({ acknowledged: true })
    const retryResult = await syncTestimonialTags()

    expect(retryResult.success).toBe(true)
    expect(retryResult.stats).toEqual({
      totalUsers: size,
      totalTags: size,
      synced: size,
      skipped: 0,
      failed: 0,
    })
    expect(mockRemoveTag).toHaveBeenCalledTimes(size * 2)
    expect(mockAddTag).toHaveBeenCalledTimes(size * 2)
    expect(mockUpdateOne).toHaveBeenCalledTimes(size * 2)
  })
})
