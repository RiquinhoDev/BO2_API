const mockGetContactTagsByEmail = jest.fn()
const mockSnapshotFindOne = jest.fn()
const mockSnapshotCreate = jest.fn()

jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {
    getContactTagsByEmailStrict: mockGetContactTagsByEmail,
  },
}))

jest.mock('../../src/models/acTags/ACNativeTagsSnapshot', () => ({
  __esModule: true,
  default: {
    findOne: mockSnapshotFindOne,
    create: mockSnapshotCreate,
  },
}))

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

import { captureNativeTagsBatch } from '../../src/services/activeCampaign/nativeTagProtection.service'

type HistoryAction = 'ADDED' | 'REMOVED' | 'INITIAL_CAPTURE'

type HistoryEntry = {
  timestamp: Date
  action: HistoryAction
  tags: string[]
  source: string
}

type SnapshotState = {
  email: string
  nativeTags: string[]
  boTags: string[]
  capturedAt: Date
  lastSyncAt: Date
  syncCount: number
  history: HistoryEntry[]
}

type SnapshotDocument = SnapshotState & {
  save: jest.Mock<Promise<unknown>, []>
}

type FailurePlan = {
  provider?: Set<number>
  create?: Set<number>
  saveOnce?: Set<number>
}

function indexFromEmail(email: string): number {
  return Number(email.match(/user-(\d+)@/)?.[1])
}

function cloneState(state: SnapshotState): SnapshotState {
  return {
    ...state,
    nativeTags: [...state.nativeTags],
    boTags: [...state.boTags],
    capturedAt: new Date(state.capturedAt),
    lastSyncAt: new Date(state.lastSyncAt),
    history: state.history.map(entry => ({
      ...entry,
      timestamp: new Date(entry.timestamp),
      tags: [...entry.tags],
    })),
  }
}

function makeState(email: string, nativeTags: string[] = ['Cliente VIP']): SnapshotState {
  const capturedAt = new Date('2026-09-01T10:00:00.000Z')
  return {
    email,
    nativeTags,
    boTags: ['BO_OGI_V1 - Inativo 14d'],
    capturedAt,
    lastSyncAt: capturedAt,
    syncCount: 1,
    history: [{
      timestamp: capturedAt,
      action: 'INITIAL_CAPTURE',
      tags: nativeTags,
      source: 'INITIAL',
    }],
  }
}

function makeHarness(
  size: number,
  failurePlan: FailurePlan = {},
  initialSnapshots: Map<string, SnapshotState> = new Map(),
) {
  const emails = Array.from({ length: size }, (_, index) => `user-${index}@example.test`)
  const persisted = new Map<string, SnapshotState>(
    Array.from(initialSnapshots.entries(), ([email, state]) => [email, cloneState(state)]),
  )
  const currentTags = new Map(emails.map(email => [email, ['Cliente VIP', 'BO_OGI_V1 - Inativo 14d']]))
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

  const makeDocument = (state: SnapshotState): SnapshotDocument => {
    const document = {
      ...cloneState(state),
      save: jest.fn(async () => {
        const index = indexFromEmail(state.email)
        await record(`snapshot-save:${index}`)
        if (failurePlan.saveOnce?.has(index)) {
          failurePlan.saveOnce.delete(index)
          throw new Error(`save-${index}`)
        }
        persisted.set(state.email, cloneState(document))
        return document
      }),
    } as SnapshotDocument
    return document
  }

  mockGetContactTagsByEmail.mockImplementation(async (email: string) => {
    const index = indexFromEmail(email)
    await record(`provider:${index}`)
    if (failurePlan.provider?.has(index)) throw new Error(`provider-${index}`)
    return { contactFound: true, tags: [...(currentTags.get(email) || [])] }
  })
  mockSnapshotFindOne.mockImplementation(async ({ email }: { email: string }) => {
    const index = indexFromEmail(email)
    await record(`snapshot-find:${index}`)
    const state = persisted.get(email)
    return state ? makeDocument(state) : null
  })
  mockSnapshotCreate.mockImplementation(async (data: SnapshotState) => {
    const index = indexFromEmail(data.email)
    await record(`snapshot-create:${index}`)
    if (failurePlan.create?.has(index)) throw new Error(`create-${index}`)
    const state = cloneState(data)
    persisted.set(data.email, state)
    return makeDocument(state)
  })

  return {
    emails,
    currentTags,
    events,
    persisted,
    get peak() {
      return peak
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe.each([1, 10, 100])('native tag capture N=%i', (size) => {
  test('keeps provider -> snapshot writes ordered with one item in flight', async () => {
    const harness = makeHarness(size)

    const result = await captureNativeTagsBatch(harness.emails, 'SCALE_TEST', size)

    expect(result).toEqual({
      success: true,
      processed: size,
      captured: size,
      errors: 0,
    })
    expect(harness.peak).toBe(1)
    expect(harness.events).toEqual(Array.from({ length: size }, (_, index) => [
      `provider:${index}`,
      `snapshot-find:${index}`,
      `snapshot-create:${index}`,
    ]).flat())
    expect(harness.persisted.size).toBe(size)
    expect([...harness.persisted.values()].every(snapshot => snapshot.syncCount === 1)).toBe(true)
  })

  test('counts partial provider/create failures and continues in input order', async () => {
    const providerFailures = new Set([0])
    const createFailures = new Set(size > 1 ? [1] : [])
    const harness = makeHarness(size, {
      provider: providerFailures,
      create: createFailures,
    })

    const result = await captureNativeTagsBatch(harness.emails, 'SCALE_TEST', size)

    expect(result).toEqual({
      success: false,
      processed: size,
      captured: size - providerFailures.size - createFailures.size,
      errors: providerFailures.size + createFailures.size,
    })
    expect(harness.peak).toBe(1)
    expect(harness.events).toEqual(Array.from({ length: size }, (_, index) => [
      `provider:${index}`,
      ...(providerFailures.has(index) ? [] : [
        `snapshot-find:${index}`,
        `snapshot-create:${index}`,
      ]),
    ]).flat())
    expect(harness.persisted.size).toBe(size - providerFailures.size - createFailures.size)
  })

  test('replays unchanged snapshots without duplicating history', async () => {
    const harness = makeHarness(size)

    const first = await captureNativeTagsBatch(harness.emails, 'SCALE_TEST', size)
    const firstHistory = new Map([...harness.persisted].map(([email, snapshot]) => [email, snapshot.history.length]))
    const second = await captureNativeTagsBatch(harness.emails, 'SCALE_TEST', size)

    expect(first).toEqual({ success: true, processed: size, captured: size, errors: 0 })
    expect(second).toEqual({ success: true, processed: size, captured: size, errors: 0 })
    expect(harness.peak).toBe(1)
    expect([...harness.persisted.values()].every(snapshot => snapshot.syncCount === 2)).toBe(true)
    expect([...harness.persisted].every(([email, snapshot]) => snapshot.history.length === firstHistory.get(email))).toBe(true)
  })

  test('records provider-side total removal in snapshot and history', async () => {
    const initialSnapshots = new Map(
      harnessEmails(size).map(email => [email, makeState(email)]),
    )
    const harness = makeHarness(size, {}, initialSnapshots)
    harness.currentTags.forEach((_, email) => harness.currentTags.set(email, []))

    const result = await captureNativeTagsBatch(harness.emails, 'SCALE_TEST', size)

    expect(result).toEqual({ success: true, processed: size, captured: size, errors: 0 })
    expect(harness.peak).toBe(1)
    expect(harness.events).toEqual(Array.from({ length: size }, (_, index) => [
      `provider:${index}`,
      `snapshot-find:${index}`,
      `snapshot-save:${index}`,
    ]).flat())
    expect([...harness.persisted.values()].every(snapshot => snapshot.nativeTags.length === 0)).toBe(true)
    expect([...harness.persisted.values()].every(snapshot => snapshot.history.at(-1)?.action === 'REMOVED')).toBe(true)
  })
})

function harnessEmails(size: number): string[] {
  return Array.from({ length: size }, (_, index) => `user-${index}@example.test`)
}

test('retries a failed snapshot save without persisting partial state or duplicating history', async () => {
  const email = 'user-0@example.test'
  const initialSnapshots = new Map([[email, makeState(email)]])
  const harness = makeHarness(1, { saveOnce: new Set([0]) }, initialSnapshots)
  harness.currentTags.set(email, ['Nova Tag'])

  const first = await captureNativeTagsBatch(harness.emails, 'SCALE_TEST', 1)
  const persistedAfterFailure = harness.persisted.get(email)
  const retry = await captureNativeTagsBatch(harness.emails, 'SCALE_TEST', 1)
  const persistedAfterRetry = harness.persisted.get(email)

  expect(first).toEqual({ success: false, processed: 1, captured: 0, errors: 1 })
  expect(persistedAfterFailure?.nativeTags).toEqual(['Cliente VIP'])
  expect(persistedAfterFailure?.history).toHaveLength(1)
  expect(retry).toEqual({ success: true, processed: 1, captured: 1, errors: 0 })
  expect(persistedAfterRetry?.nativeTags).toEqual(['Nova Tag'])
  expect(persistedAfterRetry?.history.map(entry => entry.action)).toEqual([
    'INITIAL_CAPTURE',
    'ADDED',
    'REMOVED',
  ])
})

test('does not mutate an existing snapshot when the strict provider read fails', async () => {
  const email = 'user-0@example.test'
  const harness = makeHarness(
    1,
    { provider: new Set([0]) },
    new Map([[email, makeState(email)]]),
  )

  const result = await captureNativeTagsBatch(harness.emails, 'SCALE_TEST', 1)
  const persisted = harness.persisted.get(email)

  expect(result).toEqual({ success: false, processed: 1, captured: 0, errors: 1 })
  expect(harness.events).toEqual(['provider:0'])
  expect(persisted?.nativeTags).toEqual(['Cliente VIP'])
  expect(persisted?.history).toHaveLength(1)
})

test('concurrent initial captures converge after a unique-email duplicate key', async () => {
  const email = 'user-0@example.test'
  const harness = makeHarness(1)
  let releaseInitialFinds!: () => void
  const initialFindsReleased = new Promise<void>(resolve => {
    releaseInitialFinds = resolve
  })
  let findCalls = 0

  mockSnapshotFindOne.mockImplementation(async () => {
    findCalls++
    if (findCalls <= 2) {
      if (findCalls === 2) releaseInitialFinds()
      await initialFindsReleased
      return null
    }

    const state = harness.persisted.get(email)
    if (!state) return null
    return {
      ...cloneState(state),
      save: jest.fn(async () => undefined),
    } as SnapshotDocument
  })
  mockSnapshotCreate.mockImplementation(async (data: SnapshotState) => {
    if (harness.persisted.has(data.email)) {
      throw Object.assign(new Error('duplicate email'), { code: 11000 })
    }
    harness.persisted.set(data.email, cloneState(data))
    return {
      ...cloneState(data),
      save: jest.fn(async () => undefined),
    } as SnapshotDocument
  })

  const results = await Promise.all([
    captureNativeTagsBatch([email], 'CONCURRENT_A', 1),
    captureNativeTagsBatch([email], 'CONCURRENT_B', 1),
  ])

  expect(results).toEqual([
    { success: true, processed: 1, captured: 1, errors: 0 },
    { success: true, processed: 1, captured: 1, errors: 0 },
  ])
  expect(mockSnapshotCreate).toHaveBeenCalledTimes(2)
  expect(harness.persisted.size).toBe(1)
})

test('normalizes email before provider reads and snapshot identity writes', async () => {
  const rawEmail = ' User-0@Example.Test '
  const normalizedEmail = 'user-0@example.test'
  const harness = makeHarness(1)

  mockGetContactTagsByEmail.mockImplementation(async (email: string) => {
    expect(email).toBe(normalizedEmail)
    return { contactFound: true, tags: ['Cliente VIP'] }
  })
  mockSnapshotFindOne.mockImplementation(async ({ email }: { email: string }) => {
    expect(email).toBe(normalizedEmail)
    return null
  })
  mockSnapshotCreate.mockImplementation(async (data: SnapshotState) => {
    expect(data.email).toBe(normalizedEmail)
    harness.persisted.set(normalizedEmail, cloneState(data))
    return {
      ...cloneState(data),
      save: jest.fn(async () => undefined),
    } as SnapshotDocument
  })

  const result = await captureNativeTagsBatch([rawEmail], 'SCALE_TEST', 1)

  expect(result).toEqual({ success: true, processed: 1, captured: 1, errors: 0 })
  expect(harness.persisted.has(normalizedEmail)).toBe(true)
})

test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
  'rejects invalid batchSize %p before provider I/O',
  async (batchSize) => {
    await expect(captureNativeTagsBatch(
      ['user-0@example.test'],
      'SCALE_TEST',
      batchSize,
    )).rejects.toThrow('batchSize must be a positive integer')
    expect(mockGetContactTagsByEmail).not.toHaveBeenCalled()
  },
)
