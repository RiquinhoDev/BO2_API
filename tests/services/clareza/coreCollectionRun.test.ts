import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import ClarezaCoreCollectionRun from '../../../src/models/ClarezaCoreCollectionRun'
import {
  CoreCollectionRunner,
  type CoreItemProcessor,
} from '../../../src/services/clareza/core/coreCollectionRunner'
import { MongooseCoreCollectionRunStore } from '../../../src/services/clareza/core/coreCollectionRunStore'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'clareza_core_collection_run_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('clareza_core_collection_run_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await ClarezaCoreCollectionRun.collection.deleteMany({})
})

const now = new Date('2026-09-01T10:00:00.000Z')

describe('CoreCollectionRunner', () => {
  it('resumes at the persisted checkpoint without repeating completed items', async () => {
    const seen: string[] = []
    const processor: CoreItemProcessor = async key => {
      seen.push(key)
      return { status: 'success' }
    }
    const store = new MongooseCoreCollectionRunStore()
    const runner = new CoreCollectionRunner(store, processor, { batchSize: 2, leaseMs: 60_000 })
    await runner.create({
      runId: 'run-a', generationId: 'generation-a', universeVersion: 'universe-v1',
      itemKeys: ['AAPL', 'MSFT', 'O'], now,
    })

    await expect(runner.executeNext('run-a', 'worker-a', now)).resolves.toMatchObject({
      status: 'running', nextIndex: 2,
    })
    await expect(runner.executeNext('run-a', 'worker-b', new Date(now.getTime() + 61_000))).resolves.toMatchObject({
      status: 'completed', nextIndex: 3,
    })
    expect(seen).toEqual(['AAPL', 'MSFT', 'O'])
  })

  it('persists collected item data so an expired-lease resume can build the same generation', async () => {
    const seen: string[] = []
    const store = new MongooseCoreCollectionRunStore()
    const runner = new CoreCollectionRunner(store, async key => {
      seen.push(key)
      return { status: 'success', data: { price: key === 'AAPL' ? 100 : 200 } }
    }, { batchSize: 1, leaseMs: 60_000 })
    await runner.create({
      runId: 'run-data', generationId: 'generation-data', universeVersion: 'universe-v1',
      itemKeys: ['AAPL', 'MSFT'], now,
    })

    await runner.executeNext('run-data', 'worker-a', now)
    const resumed = await runner.executeNext(
      'run-data', 'worker-b', new Date(now.getTime() + 61_000),
    )

    expect(seen).toEqual(['AAPL', 'MSFT'])
    expect(resumed.collectedItems).toEqual([
      { key: 'AAPL', data: { price: 100 } },
      { key: 'MSFT', data: { price: 200 } },
    ])
  })

  it('records partial failures as failures rather than successful coverage', async () => {
    const store = new MongooseCoreCollectionRunStore()
    const runner = new CoreCollectionRunner(store, async key => (
      key === 'BROKEN' ? { status: 'failure', errorCode: 'dataset-unavailable' } : { status: 'success' }
    ), { batchSize: 10, leaseMs: 60_000 })
    await runner.create({
      runId: 'run-b', generationId: 'generation-b', universeVersion: 'universe-v1',
      itemKeys: ['OK', 'BROKEN'], now,
    })

    await expect(runner.executeNext('run-b', 'worker-a', now)).resolves.toMatchObject({
      status: 'completed', successfulItems: ['OK'],
      failedItems: [{ key: 'BROKEN', errorCode: 'dataset-unavailable' }],
    })
  })

  it('prevents a second executor from taking a live lease', async () => {
    const store = new MongooseCoreCollectionRunStore()
    const runner = new CoreCollectionRunner(store, async () => ({ status: 'success' }), {
      batchSize: 1, leaseMs: 60_000,
    })
    await runner.create({
      runId: 'run-c', generationId: 'generation-c', universeVersion: 'universe-v1',
      itemKeys: ['AAPL', 'MSFT'], now,
    })
    await store.claim('run-c', 'worker-a', now, 60_000)

    await expect(runner.executeNext('run-c', 'worker-b', now)).rejects.toThrow('collection run lease unavailable')
  })

  it('freezes generation, universe, and item order for the whole run', async () => {
    const store = new MongooseCoreCollectionRunStore()
    const runner = new CoreCollectionRunner(store, async () => ({ status: 'success' }), {
      batchSize: 1, leaseMs: 60_000,
    })
    await runner.create({
      runId: 'run-d', generationId: 'generation-d', universeVersion: 'universe-v1',
      itemKeys: ['AAPL'], now,
    })

    await expect(runner.create({
      runId: 'run-d', generationId: 'generation-other', universeVersion: 'universe-v2',
      itemKeys: ['OTHER'], now,
    })).rejects.toThrow()
    await expect(store.read('run-d')).resolves.toMatchObject({
      generationId: 'generation-d', universeVersion: 'universe-v1', itemKeys: ['AAPL'],
    })
  })

  it('prune removes runs outside the retained generations and keeps the rest', async () => {
    const store = new MongooseCoreCollectionRunStore()
    await store.create({
      runId: 'run-old', generationId: 'generation-old', universeVersion: 'universe-v1',
      itemKeys: ['AAPL'], now,
    })
    await store.create({
      runId: 'run-kept', generationId: 'generation-new', universeVersion: 'universe-v1',
      itemKeys: ['AAPL'], now,
    })

    await expect(store.prune(['generation-new'])).resolves.toBe(1)

    await expect(store.read('run-old')).resolves.toBeNull()
    await expect(store.read('run-kept')).resolves.not.toBeNull()
  })

  it('prune refuses to run without any retained generation, to avoid wiping everything', async () => {
    const store = new MongooseCoreCollectionRunStore()
    await store.create({
      runId: 'run-e', generationId: 'generation-e', universeVersion: 'universe-v1',
      itemKeys: ['AAPL'], now,
    })

    await expect(store.prune([])).resolves.toBe(0)
    await expect(store.read('run-e')).resolves.not.toBeNull()
  })
})
