import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import ClarezaCoreCollectionRun from '../../../src/models/ClarezaCoreCollectionRun'
import ClarezaCoreGeneration from '../../../src/models/ClarezaCoreGeneration'
import ClarezaCorePublication from '../../../src/models/ClarezaCorePublication'
import { CoreCollectionRunner } from '../../../src/services/clareza/core/coreCollectionRunner'
import { MongooseCoreCollectionRunStore } from '../../../src/services/clareza/core/coreCollectionRunStore'
import { MongooseCoreGenerationStore } from '../../../src/services/clareza/core/coreGenerationStore'
import { CoreRefreshExecution } from '../../../src/services/clareza/core/coreRefreshExecution'
import type { ClarezaAsset } from '../../../src/services/clareza/universe/clarezaUniverse.types'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'clareza_core_refresh_execution_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('clareza_core_refresh_execution_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await Promise.all([
    ClarezaCoreCollectionRun.collection.deleteMany({}),
    ClarezaCoreGeneration.collection.deleteMany({}),
    ClarezaCorePublication.collection.deleteMany({}),
  ])
})

const universe: readonly ClarezaAsset[] = [
  { ticker: 'AAPL', name: 'Apple', kind: 'stock', type: 'growth', bucket: 'growth', sector: 'Technology' },
  { ticker: 'MSFT', name: 'Microsoft', kind: 'stock', type: 'growth', bucket: 'growth', sector: 'Technology' },
]
const metrics = (price: number) => ({
  price, change: 1, perf12m: 5, pe: 20, evEbitda: 12, fcfYield: 8,
  roic: 18, netMargin: 20, grossMarginTTM: 60,
  dividendYield: 0, currency: 'USD', exchange: 'NASDAQ',
  updated: '2026-09-01T12:00:00.000Z',
})
const policy = {
  requiredDatasets: ['data'], minimumDatasetCoverage: { data: 1 },
  minimumScoringCoverage: 1, maximumScoringFailures: 0, maximumAgeMs: 3_600_000,
}
const baseInput = {
  runId: 'run-a', generationId: 'generation-a', universeVersion: 'universe-v1',
  ownerId: 'worker-a', now: new Date('2026-09-01T12:00:00.000Z'),
  mode: 'publish' as const, expectedCurrentGenerationId: null,
}

describe('canonical core refresh execution', () => {
  it('persists, gates and atomically publishes one complete generation', async () => {
    const fetchItem = jest.fn(async (asset: ClarezaAsset) => metrics(asset.ticker === 'AAPL' ? 100 : 200))
    const generations = new MongooseCoreGenerationStore()
    const execution = new CoreRefreshExecution({
      runStore: new MongooseCoreCollectionRunStore(), generationStore: generations,
      fetcher: { fetchItem }, universe, policy, batchSize: 1, leaseMs: 60_000,
    })

    await expect(execution.execute(baseInput)).resolves.toMatchObject({
      status: 'published', generationId: 'generation-a', collectedAssets: 2,
    })
    expect(fetchItem).toHaveBeenCalledTimes(2)
    await expect(generations.readPublished()).resolves.toMatchObject({
      generationId: 'generation-a', records: expect.arrayContaining([
        expect.objectContaining({ ticker: 'AAPL', datasets: { data: expect.objectContaining({ price: 100 }), evaluation: expect.any(Object) } }),
      ]),
    })
  })

  it('reuses the persisted run and candidate when the same owned execution resumes', async () => {
    const fetchItem = jest.fn(async (asset: ClarezaAsset) => metrics(asset.ticker === 'AAPL' ? 100 : 200))
    const execution = new CoreRefreshExecution({
      runStore: new MongooseCoreCollectionRunStore(),
      generationStore: new MongooseCoreGenerationStore(),
      fetcher: { fetchItem }, universe, policy, batchSize: 1, leaseMs: 60_000,
    })

    await expect(execution.execute(baseInput)).resolves.toMatchObject({ status: 'published' })
    await expect(execution.execute(baseInput)).resolves.toMatchObject({ status: 'published' })
    expect(fetchItem).toHaveBeenCalledTimes(2)
    await expect(ClarezaCoreGeneration.countDocuments({ generationId: 'generation-a' }))
      .resolves.toBe(1)
  })

  it('resumes persisted item data after lease expiry without refetching it', async () => {
    const runStore = new MongooseCoreCollectionRunStore()
    const firstRunner = new CoreCollectionRunner(runStore, async key => ({
      status: 'success', data: metrics(key === 'AAPL' ? 100 : 200),
    }), { batchSize: 1, leaseMs: 60_000 })
    await firstRunner.create({
      runId: 'run-resume', generationId: 'generation-resume', universeVersion: 'universe-v1',
      itemKeys: ['AAPL', 'MSFT'], now: baseInput.now,
    })
    await firstRunner.executeNext('run-resume', 'worker-old', baseInput.now)

    const fetchItem = jest.fn(async (asset: ClarezaAsset) => metrics(asset.ticker === 'AAPL' ? 100 : 200))
    const execution = new CoreRefreshExecution({
      runStore, generationStore: new MongooseCoreGenerationStore(), fetcher: { fetchItem },
      universe, policy, batchSize: 1, leaseMs: 60_000,
    })
    await execution.execute({
      ...baseInput, runId: 'run-resume', generationId: 'generation-resume', ownerId: 'worker-new',
      now: new Date(baseInput.now.getTime() + 61_000),
    })

    expect(fetchItem).toHaveBeenCalledTimes(1)
    expect(fetchItem).toHaveBeenCalledWith(expect.objectContaining({ ticker: 'MSFT' }))
  })

  it('rejects partial collection and leaves the previous generation published', async () => {
    const generations = new MongooseCoreGenerationStore()
    await generations.createCandidate({
      generationId: 'previous', universeVersion: 'u', dataVersion: 'd', createdAt: baseInput.now,
      records: [],
    })
    await generations.publishCandidate('previous', null)
    const execution = new CoreRefreshExecution({
      runStore: new MongooseCoreCollectionRunStore(), generationStore: generations,
      fetcher: { fetchItem: async (asset: ClarezaAsset) => {
        if (asset.ticker === 'MSFT') throw Object.assign(new Error('down'), { code: 'FMP_UNAVAILABLE' })
        return metrics(100)
      } },
      universe, policy, batchSize: 2, leaseMs: 60_000,
    })

    await expect(execution.execute({
      ...baseInput, runId: 'run-partial', generationId: 'generation-partial',
      expectedCurrentGenerationId: 'previous',
    })).resolves.toMatchObject({ status: 'rejected', collectedAssets: 1 })
    await expect(generations.readPublished()).resolves.toMatchObject({ generationId: 'previous' })
  })

  it('runs preview through collection and gates without persisting or publishing a candidate', async () => {
    const generations = new MongooseCoreGenerationStore()
    const execution = new CoreRefreshExecution({
      runStore: new MongooseCoreCollectionRunStore(), generationStore: generations,
      fetcher: { fetchItem: async (asset: ClarezaAsset) => metrics(asset.ticker === 'AAPL' ? 100 : 200) },
      universe, policy, batchSize: 2, leaseMs: 60_000,
    })

    await expect(execution.execute({
      ...baseInput, runId: 'run-preview', generationId: 'generation-preview', mode: 'preview',
    })).resolves.toMatchObject({ status: 'preview', collectedAssets: 2 })
    await expect(generations.readCandidate('generation-preview')).resolves.toBeNull()
    await expect(generations.readPublished()).resolves.toBeNull()
  })
})
