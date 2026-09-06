import type { CronExecutionPhaseHooks } from '../../../src/services/cron/scheduler/executionPhases'
import { MAX_PROVIDER_READ_ITEMS } from '../../../src/security/providerReadBatchPolicy'

jest.mock('../../../src/models/cron/CronExecution', () => ({
  __esModule: true,
  default: {
    countDocuments: jest.fn(),
    find: jest.fn(),
    deleteMany: jest.fn(),
  },
}))

import CronExecution from '../../../src/models/cron/CronExecution'
import {
  CRON_EXECUTION_CLEANUP_MIN_RECORDS,
  runCleanupManually,
} from '../../../src/jobs/cronExecutionCleanup.job'

type CleanupOptions = {
  dryRun?: boolean
  phaseHooks?: CronExecutionPhaseHooks
  now?: () => Date
}

const countDocuments = jest.mocked(CronExecution.countDocuments)
const find = jest.mocked(CronExecution.find)
const deleteMany = jest.mocked(CronExecution.deleteMany)

const now = () => new Date('2026-09-06T12:00:00.000Z')

function query(rows: Array<{ _id: string }>) {
  const chain = {
    sort: jest.fn(),
    select: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
    exec: jest.fn().mockResolvedValue(rows),
  }
  chain.sort.mockReturnValue(chain)
  chain.select.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.lean.mockReturnValue(chain)
  return chain
}

function invoke(options: CleanupOptions = {}) {
  return (runCleanupManually as unknown as (value?: CleanupOptions) => Promise<unknown>)(options)
}

beforeEach(() => {
  jest.clearAllMocks()
  deleteMany.mockResolvedValue({ acknowledged: true, deletedCount: 0 } as never)
})

test('dry-run returns a bounded plan and has zero mutation effects', async () => {
  const candidateQuery = query(Array.from({ length: 75 }, (_value, index) => ({ _id: `old-${index}` })))
  countDocuments.mockResolvedValueOnce(150 as never)
  find.mockReturnValueOnce(candidateQuery as never)
  const phaseHooks = {
    assertOwnership: jest.fn(),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }

  await expect(invoke({ dryRun: true, phaseHooks, now })).resolves.toMatchObject({
    success: true,
    dryRun: true,
    plan: {
      operation: 'cron-execution-cleanup',
      dryRun: true,
      totalBefore: 150,
      eligible: 75,
      wouldDelete: 50,
      minimumToKeep: CRON_EXECUTION_CLEANUP_MIN_RECORDS,
      limit: MAX_PROVIDER_READ_ITEMS,
      truncated: false,
      remaining: 0,
    },
  })
  expect(candidateQuery.limit).toHaveBeenCalledWith(MAX_PROVIDER_READ_ITEMS + 1)
  expect(deleteMany).not.toHaveBeenCalled()
  expect(phaseHooks.localMutationStarted).not.toHaveBeenCalled()
  expect(phaseHooks.providerStarted).not.toHaveBeenCalled()
  expect(phaseHooks.providerSucceeded).not.toHaveBeenCalled()
})

test('dry-run reports truncation when the bounded candidate sentinel is present', async () => {
  const candidateQuery = query(
    Array.from({ length: MAX_PROVIDER_READ_ITEMS + 1 }, (_value, index) => ({ _id: `old-${index}` })),
  )
  countDocuments.mockResolvedValueOnce(30_000 as never)
  find.mockReturnValueOnce(candidateQuery as never)

  await expect(invoke({ dryRun: true, now })).resolves.toMatchObject({
    success: true,
    dryRun: true,
    plan: {
      totalBefore: 30_000,
      eligible: MAX_PROVIDER_READ_ITEMS,
      wouldDelete: MAX_PROVIDER_READ_ITEMS,
      limit: MAX_PROVIDER_READ_ITEMS,
      truncated: true,
      remaining: 1,
    },
  })
  expect(deleteMany).not.toHaveBeenCalled()
})

test('live cleanup processes one bounded batch and reports the remaining lower bound', async () => {
  const candidateIds = Array.from(
    { length: MAX_PROVIDER_READ_ITEMS + 1 },
    (_value, index) => ({ _id: `old-${index}` }),
  )
  const candidateQuery = query(candidateIds)
  const revalidationQuery = query(candidateIds.slice(0, MAX_PROVIDER_READ_ITEMS))
  countDocuments.mockResolvedValueOnce(30_000 as never).mockResolvedValueOnce(30_000 as never).mockResolvedValueOnce(10_000 as never)
  find.mockReturnValueOnce(candidateQuery as never).mockReturnValueOnce(revalidationQuery as never)
  deleteMany.mockResolvedValueOnce({ acknowledged: true, deletedCount: MAX_PROVIDER_READ_ITEMS } as never)

  await expect(invoke({ now })).resolves.toMatchObject({
    success: true,
    deleted: MAX_PROVIDER_READ_ITEMS,
    remaining: 10_000,
    plan: {
      eligible: MAX_PROVIDER_READ_ITEMS,
      wouldDelete: MAX_PROVIDER_READ_ITEMS,
      truncated: true,
      remaining: 1,
    },
  })
  expect(deleteMany).toHaveBeenCalledWith({
    _id: { $in: candidateIds.slice(0, MAX_PROVIDER_READ_ITEMS).map(item => item._id) },
  })
})

test('live cleanup recalculates the delete budget after a race', async () => {
  const candidateIds = Array.from({ length: 75 }, (_value, index) => ({ _id: `old-${index}` }))
  const candidateQuery = query(candidateIds)
  const revalidationQuery = query(candidateIds.slice(0, 49))
  countDocuments.mockResolvedValueOnce(150 as never).mockResolvedValueOnce(149 as never).mockResolvedValueOnce(100 as never)
  find.mockReturnValueOnce(candidateQuery as never).mockReturnValueOnce(revalidationQuery as never)
  deleteMany.mockResolvedValueOnce({ acknowledged: true, deletedCount: 49 } as never)

  await expect(invoke({ now })).resolves.toMatchObject({
    success: true,
    deleted: 49,
    remaining: 100,
  })
  expect(revalidationQuery.limit).toHaveBeenCalledWith(50)
  expect(deleteMany).toHaveBeenCalledWith({
    _id: { $in: candidateIds.slice(0, 49).map(item => item._id) },
  })
})

test('live cleanup keeps zero records when the rechecked total is already at the minimum', async () => {
  const candidateQuery = query(Array.from({ length: 75 }, (_value, index) => ({ _id: `old-${index}` })))
  countDocuments.mockResolvedValueOnce(99 as never)
  find.mockReturnValueOnce(candidateQuery as never)

  await expect(invoke({ now })).resolves.toMatchObject({
    success: true,
    deleted: 0,
    remaining: 99,
  })
  expect(deleteMany).not.toHaveBeenCalled()
})

test('live cleanup keeps zero records when the rechecked total reaches the minimum', async () => {
  const candidateQuery = query(Array.from({ length: 75 }, (_value, index) => ({ _id: `old-${index}` })))
  countDocuments.mockResolvedValueOnce(150 as never).mockResolvedValueOnce(100 as never)
  find.mockReturnValueOnce(candidateQuery as never)

  await expect(invoke({ now })).resolves.toMatchObject({
    success: true,
    deleted: 0,
    remaining: 100,
  })
  expect(deleteMany).not.toHaveBeenCalled()
})

test('live cleanup revalidates the selected ids and deletes only that bounded set', async () => {
  const candidateIds = Array.from({ length: 75 }, (_value, index) => ({ _id: `old-${index}` }))
  const selectedIds = candidateIds.slice(0, 50)
  const candidateQuery = query(candidateIds)
  const revalidationQuery = query(selectedIds)
  countDocuments.mockResolvedValueOnce(150 as never).mockResolvedValueOnce(150 as never).mockResolvedValueOnce(100 as never)
  find.mockReturnValueOnce(candidateQuery as never).mockReturnValueOnce(revalidationQuery as never)
  deleteMany.mockResolvedValueOnce({ acknowledged: true, deletedCount: 50 } as never)
  const events: string[] = []
  const phaseHooks = {
    assertOwnership: jest.fn(() => events.push('assert')),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(() => events.push('local')),
  }

  await expect(invoke({ phaseHooks, now })).resolves.toMatchObject({
    success: true,
    deleted: 50,
    remaining: 100,
  })
  expect(revalidationQuery.limit).toHaveBeenCalledWith(51)
  expect(deleteMany).toHaveBeenCalledWith({ _id: { $in: selectedIds.map(item => item._id) } })
  expect(events[events.length - 2]).toBe('local')
  expect(events[events.length - 1]).toBe('assert')
  expect(phaseHooks.providerStarted).not.toHaveBeenCalled()
  expect(phaseHooks.providerSucceeded).not.toHaveBeenCalled()
})

test('live cleanup fails closed when selected ids cannot be revalidated', async () => {
  const candidateIds = Array.from({ length: 75 }, (_value, index) => ({ _id: `old-${index}` }))
  countDocuments.mockResolvedValueOnce(150 as never).mockResolvedValueOnce(150 as never)
  find.mockReturnValueOnce(query(candidateIds) as never).mockReturnValueOnce(query(candidateIds.slice(0, 49)) as never)

  await expect(invoke({ now })).resolves.toMatchObject({
    success: false,
    deleted: 0,
    remaining: 150,
    error: 'Revalidação dos candidatos falhou; nenhuma remoção efetuada',
  })
  expect(deleteMany).not.toHaveBeenCalled()
})

test('live cleanup never deletes after ownership is lost at the delete boundary', async () => {
  const candidateIds = Array.from({ length: 75 }, (_value, index) => ({ _id: `old-${index}` }))
  countDocuments.mockResolvedValueOnce(150 as never).mockResolvedValueOnce(150 as never)
  find.mockReturnValueOnce(query(candidateIds) as never).mockReturnValueOnce(query(candidateIds.slice(0, 50)) as never)
  const phaseHooks = {
    assertOwnership: jest.fn(),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(() => {
      phaseHooks.assertOwnership.mockImplementation(() => { throw new Error('ownership lost') })
    }),
  }

  await expect(invoke({ phaseHooks, now })).rejects.toThrow('ownership lost')
  expect(deleteMany).not.toHaveBeenCalled()
})
