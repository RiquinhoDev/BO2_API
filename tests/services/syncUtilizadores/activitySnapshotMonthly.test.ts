import { ActivitySnapshotService } from '../../../src/services/syncUtilizadoresServices/activitySnapshot.service'

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

type Platform = 'HOTMART' | 'CURSEDUCA' | 'DISCORD'
type FakeUser = { _id: string }
type ActivitySnapshotInternals = {
  getActiveUsersForPlatform: jest.Mock
  getUserActivityForMonth: jest.Mock
  createSnapshot: jest.Mock
}

function internals(service: ActivitySnapshotService): ActivitySnapshotInternals {
  return service as unknown as ActivitySnapshotInternals
}

function makeHarness(size: number, failedIndexes = new Set<number>()) {
  const service = new ActivitySnapshotService()
  const methods = internals(service)
  methods.getActiveUsersForPlatform = jest.fn()
  methods.getUserActivityForMonth = jest.fn()
  methods.createSnapshot = jest.fn()
  const users: FakeUser[] = Array.from({ length: size }, (_, index) => ({ _id: `user-${index}` }))
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

  methods.getActiveUsersForPlatform.mockImplementation(async (platform: Platform) => {
    expect(platform).toBe('HOTMART')
    return users
  })
  methods.getUserActivityForMonth.mockImplementation(async (userId: string) => {
    const index = Number(userId.replace('user-', ''))
    await record(`activity:${index}`)
    return {
      wasActive: true,
      hadLogin: true,
      hadActivity: true,
      loginCount: 1,
      activityCount: 1,
    }
  })
  methods.createSnapshot.mockImplementation(async (dto: { userId: string }) => {
    const index = Number(dto.userId.replace('user-', ''))
    await record(`snapshot:${index}`)
    if (failedIndexes.has(index)) throw new Error(`snapshot-${index}`)
    return {}
  })

  return { service, users, events, get peak() { return peak } }
}

describe.each([1, 10, 100])('monthly activity snapshot N=%i', (size) => {
  test('keeps activity -> snapshot order and one write in flight on success', async () => {
    const harness = makeHarness(size)

    const result = await harness.service.createMonthlySnapshots(new Date('2026-09-01T00:00:00.000Z'), 'HOTMART')

    expect(result).toMatchObject({
      totalProcessed: size,
      snapshotsCreated: size,
      errors: [],
    })
    expect(result.duration).toBeGreaterThanOrEqual(0)
    expect(harness.peak).toBe(1)
    expect(harness.events).toEqual(Array.from({ length: size }, (_, index) => [
      `activity:${index}`,
      `snapshot:${index}`,
    ]).flat())
  })

  test('counts every user attempt and preserves ordered partial errors', async () => {
    const failedIndexes = new Set(Array.from({ length: size }, (_, index) => index).filter(index => index % 10 === 0))
    const harness = makeHarness(size, failedIndexes)

    const result = await harness.service.createMonthlySnapshots(new Date('2026-09-01T00:00:00.000Z'), 'HOTMART')
    const failedUsers = harness.users.filter((_, index) => failedIndexes.has(index))

    expect(result).toMatchObject({
      totalProcessed: size,
      snapshotsCreated: size - failedIndexes.size,
      errors: failedUsers.map((user) => ({
        userId: user._id,
        platform: 'HOTMART',
        error: `snapshot-${user._id.replace('user-', '')}`,
      })),
    })
    expect(result.duration).toBeGreaterThanOrEqual(0)
    expect(harness.peak).toBe(1)
    expect(harness.events).toEqual(Array.from({ length: size }, (_, index) => [
      `activity:${index}`,
      `snapshot:${index}`,
    ]).flat())
  })
})
