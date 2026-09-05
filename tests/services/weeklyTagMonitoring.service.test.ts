const mockGetConfig = jest.fn()
const mockFindActiveTags = jest.fn()
const mockSnapshotCreate = jest.fn()
const mockSnapshotFindOneAndUpdate = jest.fn()
const mockSnapshotFindPreviousSnapshot = jest.fn()
const mockSnapshotDeleteMany = jest.fn()
const mockGetAllContacts = jest.fn()
const mockGetContactTagsByEmail = jest.fn()
const mockUserFindOne = jest.fn()
const mockUserProductFindOne = jest.fn()
const mockCreateGroupedNotification = jest.fn()
const mockCreateGroupedNotificationWithStatus = jest.fn()

jest.mock('../../src/models/tagMonitoring', () => ({
  __esModule: true,
  WeeklyNativeTagSnapshot: {
    create: mockSnapshotCreate,
    findOneAndUpdate: mockSnapshotFindOneAndUpdate,
    findPreviousSnapshot: mockSnapshotFindPreviousSnapshot,
    deleteMany: mockSnapshotDeleteMany,
  },
  CriticalTag: {
    findActiveTags: mockFindActiveTags,
  },
  WeeklyTagMonitoringConfig: {
    getConfig: mockGetConfig,
  },
}))

jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {
    getAllContacts: mockGetAllContacts,
    getContactTagsByEmail: mockGetContactTagsByEmail,
  },
}))

jest.mock('../../src/services/activeCampaign/nativeTagProtection.service', () => ({
  classifyTags: (tags: string[]) => ({ boTags: [], nativeTags: tags }),
}))

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    findOne: mockUserFindOne,
  },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    findOne: mockUserProductFindOne,
  },
}))

jest.mock('../../src/services/tagMonitoring/tagNotification.service', () => ({
  __esModule: true,
  default: {
    createGroupedNotification: mockCreateGroupedNotification,
    createGroupedNotificationWithStatus: mockCreateGroupedNotificationWithStatus,
  },
}))

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

import weeklyTagMonitoringService from '../../src/services/tagMonitoring/weeklyTagMonitoring.service'

type FailurePlan = {
  provider?: Set<number>
  snapshot?: Set<number>
  noNativeTags?: Set<number>
}

type FakeSnapshot = {
  email: string
  userId: string
  nativeTags: string[]
  capturedAt: Date
  weekNumber: number
  year: number
  compareWith: (previousSnapshot: FakeSnapshot) => {
    added: string[]
    removed: string[]
    unchanged: string[]
  }
}

type SnapshotData = Omit<FakeSnapshot, 'compareWith'>
type SnapshotFilter = { email: string; weekNumber: number; year: number }
type SnapshotUpdate = { $set?: Partial<SnapshotData> }

function indexFromEmail(email: string): number {
  return Number(email.match(/user-(\d+)@/)?.[1])
}

function makeSnapshot(data: SnapshotData): FakeSnapshot {
  return {
    ...data,
    compareWith: () => ({
      added: ['TAG_CRITICAL'],
      removed: [],
      unchanged: [],
    }),
  }
}

function makeHarness(size: number, failurePlan: FailurePlan = {}) {
  const emails = Array.from({ length: size }, (_, index) => `user-${index}@example.test`)
  const snapshots = new Map<string, FakeSnapshot>()
  const snapshotRows: FakeSnapshot[] = []
  const notifications = new Map<string, object>()
  const events: string[] = []
  let active = 0
  let peak = 0

  const record = async (event: string): Promise<void> => {
    active++
    peak = Math.max(peak, active)
    events.push(event)
    await Promise.resolve()
    active--
  }

  const serviceInternals = weeklyTagMonitoringService as unknown as { BATCH_DELAY_MS: number }
  serviceInternals.BATCH_DELAY_MS = 0

  mockGetConfig.mockResolvedValue({ enabled: true, scope: 'ALL_CONTACTS' })
  mockFindActiveTags.mockImplementation(async () => {
    await record('critical-tags')
    return [{ tagName: 'TAG_CRITICAL' }]
  })
  mockGetAllContacts.mockImplementation(async () => {
    await record('provider:list')
    return emails.map(email => ({ email }))
  })
  mockGetContactTagsByEmail.mockImplementation(async (email: string) => {
    const index = indexFromEmail(email)
    await record(`provider:${index}`)
    if (failurePlan.provider?.has(index)) throw new Error(`provider-${index}`)
    if (failurePlan.noNativeTags?.has(index)) return []
    return ['TAG_CRITICAL']
  })
  mockUserFindOne.mockImplementation((query: { email: string }) => ({
    select: jest.fn((projection: string) => {
      const index = indexFromEmail(query.email)
      if (projection === '_id') {
        return (async () => {
          await record(`user:${index}`)
          return { _id: `user-${index}` }
        })()
      }
      return {
        lean: jest.fn(async () => {
          await record(`change-user:${index}`)
          return { _id: `user-${index}`, name: `User ${index}` }
        }),
      }
    }),
  }))
  mockUserProductFindOne.mockImplementation((query: { userId: string }) => ({
    populate: jest.fn().mockReturnValue({
      lean: jest.fn(async () => {
        const index = Number(query.userId.replace('user-', ''))
        await record(`product:${index}`)
        return {
          productId: { name: 'Course' },
          classes: [{ className: `Class ${index}` }],
        }
      }),
    }),
  }))

  mockSnapshotCreate.mockImplementation(async (data: SnapshotData) => {
    const index = indexFromEmail(data.email)
    await record(`snapshot:${index}`)
    if (failurePlan.snapshot?.has(index)) throw new Error(`snapshot-${index}`)
    const snapshot = makeSnapshot(data)
    snapshotRows.push(snapshot)
    return snapshot
  })
  mockSnapshotFindOneAndUpdate.mockImplementation(async (
    filter: SnapshotFilter,
    update: SnapshotUpdate,
  ) => {
    const index = indexFromEmail(filter.email)
    await record(`snapshot:${index}`)
    if (failurePlan.snapshot?.has(index)) throw new Error(`snapshot-${index}`)
    const key = `${filter.email}|${filter.weekNumber}|${filter.year}`
    const data = {
      ...filter,
      ...(update.$set || {}),
    } as SnapshotData
    let snapshot = snapshots.get(key)
    if (!snapshot) {
      snapshot = makeSnapshot(data)
      snapshots.set(key, snapshot)
      snapshotRows.push(snapshot)
      return { value: snapshot, lastErrorObject: { upserted: snapshot.userId } }
    } else {
      Object.assign(snapshot, data)
      return { value: snapshot, lastErrorObject: { updatedExisting: true } }
    }
  })
  mockSnapshotFindPreviousSnapshot.mockImplementation(async (email: string) => {
    const index = indexFromEmail(email)
    await record(`previous:${index}`)
    return makeSnapshot({
      email,
      userId: `user-${index}`,
      nativeTags: ['TAG_OLD'],
      capturedAt: new Date('2026-08-30T00:00:00.000Z'),
      weekNumber: 1,
      year: 2026,
    })
  })
  mockCreateGroupedNotification.mockImplementation(async (
    tagName: string,
    changeType: string,
    weekNumber: number,
    year: number,
  ) => {
    await record(`notification:${tagName}:${changeType}`)
    const key = `${tagName}|${changeType}|${weekNumber}|${year}`
    const existing = notifications.get(key)
    if (existing) return existing
    const notification = { key }
    notifications.set(key, notification)
    return notification
  })
  mockCreateGroupedNotificationWithStatus.mockImplementation(async (
    tagName: string,
    changeType: string,
    weekNumber: number,
    year: number,
    students: unknown[],
  ) => {
    void students
    await record(`notification:${tagName}:${changeType}`)
    const key = `${tagName}|${changeType}|${weekNumber}|${year}`
    const existing = notifications.get(key)
    if (existing) return { notification: existing, created: false }
    const notification = { key }
    notifications.set(key, notification)
    return {
      notification,
      created: true,
    }
  })
  mockSnapshotDeleteMany.mockImplementation(async () => {
    await record('cleanup')
    return { deletedCount: 0 }
  })

  return {
    emails,
    events,
    snapshotRows,
    notifications,
    get peak() {
      return peak
    },
  }
}

function expectedPerEmailEvents(
  size: number,
  failedProvider: Set<number>,
  failedSnapshot: Set<number>,
  noNativeTags: Set<number> = new Set(),
): string[] {
  return Array.from({ length: size }, (_, index) => [
    `provider:${index}`,
    ...(failedProvider.has(index) || noNativeTags.has(index) ? [] : [
      `user:${index}`,
      `snapshot:${index}`,
      ...(failedSnapshot.has(index) ? [] : [
        `previous:${index}`,
        `change-user:${index}`,
        `product:${index}`,
      ]),
    ]),
  ]).flat()
}

describe.each([1, 10, 100])('weekly tag snapshot N=%i', (size) => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('keeps provider -> user -> snapshot -> previous order with peak one', async () => {
    const harness = makeHarness(size)
    const result = await weeklyTagMonitoringService.performWeeklySnapshot()

    expect(result).toMatchObject({
      success: true,
      totalStudents: size,
      snapshotsCreated: size,
      changesDetected: 1,
      notificationsCreated: 1,
      errors: 0,
      mode: 'ALL_CONTACTS',
    })
    expect(harness.peak).toBe(1)
    expect(harness.events).toEqual([
      'provider:list',
      'critical-tags',
      ...expectedPerEmailEvents(size, new Set(), new Set()),
      'notification:TAG_CRITICAL:ADDED',
      'cleanup',
    ])
    expect(harness.snapshotRows).toHaveLength(size)
    expect(harness.notifications.size).toBe(1)
  })

  test('counts partial failures and continues in input order', async () => {
    const failedProvider = new Set(Array.from({ length: size }, (_, index) => index).filter(index => index % 10 === 0))
    const failedSnapshot = new Set(Array.from({ length: size }, (_, index) => index).filter(index => index % 10 === 1))
    const harness = makeHarness(size, { provider: failedProvider, snapshot: failedSnapshot })
    const successfulCount = size - failedProvider.size - failedSnapshot.size

    const result = await weeklyTagMonitoringService.performWeeklySnapshot()

    expect(result).toMatchObject({
      success: true,
      totalStudents: size,
      snapshotsCreated: successfulCount,
      changesDetected: successfulCount > 0 ? 1 : 0,
      notificationsCreated: successfulCount > 0 ? 1 : 0,
      errors: failedProvider.size + failedSnapshot.size,
    })
    expect(harness.peak).toBe(1)
    expect(harness.events).toEqual([
      'provider:list',
      'critical-tags',
      ...expectedPerEmailEvents(size, failedProvider, failedSnapshot),
      ...(successfulCount > 0 ? ['notification:TAG_CRITICAL:ADDED'] : []),
      'cleanup',
    ])
    expect(harness.snapshotRows).toHaveLength(successfulCount)
  })

  test('does not count contacts without native tags as errors', async () => {
    const noNativeTags = new Set([0, Math.floor(size / 2)])
    const harness = makeHarness(size, { noNativeTags })
    const successfulCount = size - noNativeTags.size

    const result = await weeklyTagMonitoringService.performWeeklySnapshot()

    expect(result).toMatchObject({
      success: true,
      totalStudents: size,
      snapshotsCreated: successfulCount,
      changesDetected: successfulCount > 0 ? 1 : 0,
      notificationsCreated: successfulCount > 0 ? 1 : 0,
      errors: 0,
    })
    expect(harness.peak).toBe(1)
    expect(harness.events).toEqual([
      'provider:list',
      'critical-tags',
      ...expectedPerEmailEvents(size, new Set(), new Set(), noNativeTags),
      ...(successfulCount > 0 ? ['notification:TAG_CRITICAL:ADDED'] : []),
      'cleanup',
    ])
    expect(harness.snapshotRows).toHaveLength(successfulCount)
  })

  test('replays the same week and emails without duplicate snapshots or notifications', async () => {
    const harness = makeHarness(size)

    const first = await weeklyTagMonitoringService.performWeeklySnapshot()
    const firstRunEvents = harness.events.slice()
    const second = await weeklyTagMonitoringService.performWeeklySnapshot()
    const secondRunEvents = harness.events.slice(firstRunEvents.length)

    expect(first).toMatchObject({ snapshotsCreated: size, notificationsCreated: 1, errors: 0 })
    expect(second).toMatchObject({ snapshotsCreated: 0, notificationsCreated: 0, errors: 0 })
    expect(harness.snapshotRows).toHaveLength(size)
    expect(harness.notifications.size).toBe(1)
    expect(mockSnapshotCreate).not.toHaveBeenCalled()
    expect(mockSnapshotFindOneAndUpdate).toHaveBeenCalledTimes(size * 2)
    expect(harness.peak).toBe(1)
    expect(firstRunEvents).toContain('notification:TAG_CRITICAL:ADDED')
    expect(secondRunEvents).toContain('notification:TAG_CRITICAL:ADDED')
    expect(secondRunEvents.at(-1)).toBe('cleanup')
  })
})
