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
})
