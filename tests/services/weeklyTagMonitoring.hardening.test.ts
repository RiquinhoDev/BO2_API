import { MAX_PROVIDER_READ_ITEMS } from '../../src/security/providerReadBatchPolicy'

const mockGetConfig = jest.fn()
const mockFindActiveTags = jest.fn()
const mockSnapshotFindOneAndUpdate = jest.fn()
const mockSnapshotFindPreviousSnapshot = jest.fn()
const mockSnapshotFind = jest.fn()
const mockSnapshotDeleteMany = jest.fn()
const mockGetAllContactsBounded = jest.fn()
const mockGetContactTagsByEmail = jest.fn()
const mockUserFind = jest.fn()
const mockUserFindOne = jest.fn()
const mockUserProductAggregate = jest.fn()
const mockUserProductFindOne = jest.fn()
const mockCreateNotification = jest.fn()

jest.mock('../../src/models/tagMonitoring', () => ({
  __esModule: true,
  WeeklyNativeTagSnapshot: {
    findOneAndUpdate: mockSnapshotFindOneAndUpdate,
    findPreviousSnapshot: mockSnapshotFindPreviousSnapshot,
    find: mockSnapshotFind,
    deleteMany: mockSnapshotDeleteMany,
  },
  CriticalTag: { findActiveTags: mockFindActiveTags },
  WeeklyTagMonitoringConfig: { getConfig: mockGetConfig },
}))

jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {
    getAllContactsBounded: mockGetAllContactsBounded,
    getContactTagsByEmailStrict: mockGetContactTagsByEmail,
  },
}))

jest.mock('../../src/services/activeCampaign/nativeTagProtection.service', () => ({
  classifyTags: (tags: string[]) => ({ boTags: [], nativeTags: tags }),
}))

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { find: mockUserFind, findOne: mockUserFindOne },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { aggregate: mockUserProductAggregate, findOne: mockUserProductFindOne },
}))

jest.mock('../../src/services/tagMonitoring/tagNotification.service', () => ({
  __esModule: true,
  default: { createGroupedNotificationWithStatus: mockCreateNotification },
}))

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

import weeklyTagMonitoringService from '../../src/services/tagMonitoring/weeklyTagMonitoring.service'

const query = <T>(value: T) => ({
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
})

const snapshot = (email: string, nativeTags = ['TAG']) => ({
  email,
  userId: 'user-1',
  nativeTags,
  capturedAt: new Date(),
  weekNumber: 1,
  year: 2026,
  compareWith: jest.fn(() => ({ added: [], removed: [], unchanged: nativeTags })),
})

function setupSingleContact() {
  mockGetConfig.mockResolvedValue({ enabled: true, scope: 'ALL_CONTACTS' })
  mockGetAllContactsBounded.mockResolvedValue({
    contacts: [{ email: 'alice@example.test' }],
    truncated: false,
    remaining: 0,
  })
  mockFindActiveTags.mockResolvedValue([])
  mockGetContactTagsByEmail.mockResolvedValue({ contactFound: true, tags: ['TAG'] })
  mockUserFindOne.mockImplementation(() => ({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: 'user-1', name: 'Alice' }),
    }),
  }))
  mockUserProductFindOne.mockReturnValue({
    populate: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ productId: { name: 'Course' }, classes: [] }),
    }),
  })
  mockSnapshotFindPreviousSnapshot.mockResolvedValue(null)
  mockSnapshotFind.mockReturnValue(query([]))
  mockSnapshotFindOneAndUpdate.mockResolvedValue({
    value: snapshot('alice@example.test'),
    lastErrorObject: { updatedExisting: true },
  })
  mockCreateNotification.mockResolvedValue({ created: false, notification: {} })
  mockSnapshotDeleteMany.mockResolvedValue({ deletedCount: 0 })
}

describe('weekly tag snapshot hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const internals = weeklyTagMonitoringService as unknown as { BATCH_DELAY_MS: number }
    internals.BATCH_DELAY_MS = 0
  })

  it('rejects a student universe over the cap before the first snapshot write', async () => {
    mockGetConfig.mockResolvedValue({ enabled: true, scope: 'STUDENTS_ONLY' })
    mockUserProductAggregate.mockReturnValue(query(
      Array.from({ length: MAX_PROVIDER_READ_ITEMS + 1 }, (_, index) => ({ _id: `user-${index}` })),
    ))

    await expect(weeklyTagMonitoringService.performWeeklySnapshot()).rejects.toMatchObject({
      status: 413,
      code: 'WEEKLY_TAG_SNAPSHOT_LIMIT_EXCEEDED',
    })

    expect(mockUserProductAggregate).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ $limit: MAX_PROVIDER_READ_ITEMS + 1 }),
    ]))
    expect(mockSnapshotFindOneAndUpdate).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockSnapshotDeleteMany).not.toHaveBeenCalled()
  })

  it('rejects an oversized critical-tag universe before provider or snapshot work', async () => {
    setupSingleContact()
    mockFindActiveTags.mockResolvedValue(Array.from(
      { length: MAX_PROVIDER_READ_ITEMS + 1 },
      (_, index) => ({ tagName: `CRITICAL_${index}` }),
    ))

    await expect(weeklyTagMonitoringService.performWeeklySnapshot()).rejects.toMatchObject({
      status: 413,
      code: 'WEEKLY_TAG_CRITICAL_TAG_LIMIT_EXCEEDED',
    })
    expect(mockFindActiveTags).toHaveBeenCalledWith(MAX_PROVIDER_READ_ITEMS)
    expect(mockGetContactTagsByEmail).not.toHaveBeenCalled()
    expect(mockSnapshotFindOneAndUpdate).not.toHaveBeenCalled()
  })

  it('runs dry-run without snapshot, notification or cleanup writes', async () => {
    setupSingleContact()
    const phaseHooks = {
      assertOwnership: jest.fn(),
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
    }

    const result = await weeklyTagMonitoringService.performWeeklySnapshot({
      dryRun: true,
      phaseHooks,
    })

    expect(result).toMatchObject({
      success: true,
      dryRun: true,
      totalStudents: 1,
      inserted: 0,
      updated: 0,
      notificationsCreated: 0,
      plan: expect.objectContaining({
        operation: 'weekly-tag-snapshot',
        dryRun: true,
        truncated: false,
        remaining: 0,
      }),
    })
    expect(mockSnapshotFindOneAndUpdate).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockSnapshotDeleteMany).not.toHaveBeenCalled()
    expect(phaseHooks.localMutationStarted).not.toHaveBeenCalled()
  })

  it('returns a useful dry-run plan when monitoring is disabled', async () => {
    mockGetConfig.mockResolvedValue({ enabled: false, scope: 'STUDENTS_ONLY' })

    const result = await weeklyTagMonitoringService.performWeeklySnapshot({ dryRun: true })

    expect(result).toMatchObject({
      success: false,
      dryRun: true,
      plan: {
        operation: 'weekly-tag-snapshot',
        dryRun: true,
        monitoringEnabled: false,
        scope: 'STUDENTS_ONLY',
        matching: 0,
        wouldSnapshot: 0,
        wouldNotify: 0,
      },
    })
    expect(mockGetAllContactsBounded).not.toHaveBeenCalled()
    expect(mockSnapshotFindOneAndUpdate).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockSnapshotDeleteMany).not.toHaveBeenCalled()
  })

  it('rejects an oversized notification detail set before any notification write', async () => {
    setupSingleContact()
    const tags = Array.from(
      { length: MAX_PROVIDER_READ_ITEMS },
      (_, index) => `CRITICAL_${index}`,
    )
    mockFindActiveTags.mockResolvedValue(tags.map(tagName => ({ tagName })))
    mockGetContactTagsByEmail.mockResolvedValue({ contactFound: true, tags })
    mockSnapshotFindOneAndUpdate.mockResolvedValue({
      value: {
        ...snapshot('alice@example.test'),
        compareWith: () => ({ added: tags, removed: [tags[0]], unchanged: [] }),
      },
      lastErrorObject: { updatedExisting: true },
    })
    mockSnapshotFindPreviousSnapshot.mockResolvedValue({
      compareWith: () => ({ added: tags, removed: [tags[0]], unchanged: [] }),
    })

    await expect(weeklyTagMonitoringService.performWeeklySnapshot()).rejects.toMatchObject({
      status: 413,
      code: 'WEEKLY_TAG_NOTIFICATION_LIMIT_EXCEEDED',
    })
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockSnapshotDeleteMany).not.toHaveBeenCalled()
  })

  it('fails closed on an oversized ActiveCampaign page without fallback', async () => {
    setupSingleContact()
    mockGetAllContactsBounded.mockResolvedValue({
      contacts: [{ email: 'alice@example.test' }],
      truncated: true,
      remaining: 1,
    })

    await expect(weeklyTagMonitoringService.performWeeklySnapshot()).rejects.toMatchObject({
      status: 413,
      code: 'WEEKLY_TAG_SNAPSHOT_LIMIT_EXCEEDED',
    })
    expect(mockGetContactTagsByEmail).not.toHaveBeenCalled()
    expect(mockSnapshotFindOneAndUpdate).not.toHaveBeenCalled()
  })

  it('propagates cleanup read and delete failures instead of returning zero success', async () => {
    setupSingleContact()
    const readFailure = new Error('cleanup read failed')
    mockSnapshotFind.mockImplementation(() => { throw readFailure })

    await expect(weeklyTagMonitoringService.performWeeklySnapshot()).rejects.toThrow('cleanup read failed')

    setupSingleContact()
    mockSnapshotFind.mockReturnValue(query([{ _id: 'old-1' }]))
    mockSnapshotDeleteMany.mockRejectedValue(new Error('cleanup delete failed'))

    await expect(weeklyTagMonitoringService.performWeeklySnapshot()).rejects.toThrow('cleanup delete failed')
  })

  it('rethrows ownership loss instead of counting a continuable item error', async () => {
    setupSingleContact()
    const ownershipError = new Error('lease lost')
    ownershipError.name = 'ActiveCampaignExecutionOwnershipError'
    const phaseHooks = {
      assertOwnership: jest.fn(() => { throw ownershipError }),
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
    }

    await expect(weeklyTagMonitoringService.performWeeklySnapshot({ phaseHooks }))
      .rejects.toThrow('lease lost')
    expect(mockSnapshotFindOneAndUpdate).not.toHaveBeenCalled()
  })
})
