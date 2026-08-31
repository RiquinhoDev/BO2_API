import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import ClarezaCoreGeneration from '../../../src/models/ClarezaCoreGeneration'
import ClarezaCorePublication from '../../../src/models/ClarezaCorePublication'
import { MongooseCoreGenerationStore } from '../../../src/services/clareza/core/coreGenerationStore'
import type { CoreGenerationCandidate } from '../../../src/services/clareza/core/coreGeneration.types'

let mongoServer: MongoMemoryServer

function candidate(generationId: string, createdAt: string): CoreGenerationCandidate {
  return {
    generationId,
    universeVersion: 'universe-2026-09-01',
    dataVersion: 'core-data-v1',
    createdAt: new Date(createdAt),
    records: [{ ticker: 'AAPL', kind: 'stock', datasets: { profile: { price: 200 } } }],
  }
}

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'clareza_core_generation_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('clareza_core_generation_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await Promise.all([
    ClarezaCoreGeneration.collection.deleteMany({}),
    ClarezaCorePublication.collection.deleteMany({}),
  ])
})

describe('MongooseCoreGenerationStore', () => {
  it('keeps candidates invisible and never advances the pointer for a missing candidate', async () => {
    const store = new MongooseCoreGenerationStore()
    await store.createCandidate(candidate('generation-a', '2026-09-01T01:00:00.000Z'))

    await expect(store.readPublished()).resolves.toBeNull()
    await expect(store.publishCandidate('missing', null)).resolves.toEqual({ status: 'missing' })
    await expect(store.readPublished()).resolves.toBeNull()
  })

  it('publishes a durable candidate only after compare-and-set succeeds', async () => {
    const store = new MongooseCoreGenerationStore()
    const expected = candidate('generation-a', '2026-09-01T01:00:00.000Z')
    await store.createCandidate(expected)

    await expect(store.publishCandidate('generation-a', null)).resolves.toEqual({
      status: 'published',
      currentGenerationId: 'generation-a',
      previousGenerationId: null,
      revision: 1,
    })
    await expect(store.readPublished()).resolves.toEqual(expected)

    const pointer = await ClarezaCorePublication.findOne({ key: 'core' }).lean()
    expect(pointer).toMatchObject({ currentGenerationId: 'generation-a', revision: 1 })
  })

  it('prevents an older concurrent candidate from replacing a newer generation', async () => {
    const store = new MongooseCoreGenerationStore()
    await store.createCandidate(candidate('generation-old', '2026-09-01T01:00:00.000Z'))
    await store.createCandidate(candidate('generation-new', '2026-09-01T02:00:00.000Z'))

    const results = await Promise.all([
      store.publishCandidate('generation-old', null),
      store.publishCandidate('generation-new', null),
    ])

    expect(results).toContainEqual({ status: 'conflict' })
    expect(results).toContainEqual({
      status: 'published',
      currentGenerationId: 'generation-new',
      previousGenerationId: null,
      revision: 1,
    })
    await expect(store.readPublished()).resolves.toMatchObject({ generationId: 'generation-new' })
  })

  it('preserves current and previous generations through retention and atomic rollback', async () => {
    const store = new MongooseCoreGenerationStore()
    for (const [id, hour] of [['a', '01'], ['b', '02'], ['c', '03']] as const) {
      await store.createCandidate(candidate(`generation-${id}`, `2026-09-01T${hour}:00:00.000Z`))
    }
    await store.publishCandidate('generation-c', null)
    await store.createCandidate(candidate('generation-d', '2026-09-01T04:00:00.000Z'))
    await store.publishCandidate('generation-d', 'generation-c')

    await store.retainCandidates(1)
    const retainedIds = (await ClarezaCoreGeneration.find().sort({ createdAt: 1 }).lean())
      .map(entry => entry.generationId)
    expect(retainedIds).toEqual(['generation-c', 'generation-d'])

    await expect(store.rollback('generation-d')).resolves.toEqual({
      status: 'published',
      currentGenerationId: 'generation-c',
      previousGenerationId: 'generation-d',
      revision: 3,
    })
    await expect(store.readPublished()).resolves.toMatchObject({ generationId: 'generation-c' })
  })

  it('keeps a generation immutable when the same id is written twice', async () => {
    const store = new MongooseCoreGenerationStore()
    await store.createCandidate(candidate('generation-a', '2026-09-01T01:00:00.000Z'))

    await expect(store.createCandidate({
      ...candidate('generation-a', '2026-09-01T02:00:00.000Z'),
      universeVersion: 'different-universe',
    })).rejects.toThrow()
    await expect(store.readCandidate('generation-a')).resolves.toEqual(
      candidate('generation-a', '2026-09-01T01:00:00.000Z'),
    )
  })
})
