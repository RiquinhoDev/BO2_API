import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import ClarezaSuggestionSubmission from '../../../src/models/ClarezaSuggestionSubmission'
import { MongooseCoreSuggestionStore } from '../../../src/services/clareza/core/coreSuggestionStore'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'clareza_suggestion_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('clareza_suggestion_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await ClarezaSuggestionSubmission.collection.deleteMany({})
})

describe('MongooseCoreSuggestionStore', () => {
  it('counts unique submissions and replays the same submission exactly once', async () => {
    const store = new MongooseCoreSuggestionStore()
    const first = await store.increment({
      key: 'NVIDIA PORTUGAL', query: 'Nvidia Portugal',
      requestedAt: '2026-09-01T10:00:00.000Z', submissionId: 'submission-id-0001',
    })
    const replay = await store.increment({
      key: 'IGNORED', query: 'Ignored',
      requestedAt: '2026-09-01T11:00:00.000Z', submissionId: 'submission-id-0001',
    })
    const second = await store.increment({
      key: 'NVIDIA PORTUGAL', query: 'Nvidia Portugal',
      requestedAt: '2026-09-01T12:00:00.000Z', submissionId: 'submission-id-0002',
    })

    expect(first).toMatchObject({ replayed: false, record: { count: 1 } })
    expect(replay).toMatchObject({ replayed: true, record: { key: 'NVIDIA PORTUGAL', count: 1 } })
    expect(second).toMatchObject({ replayed: false, record: {
      count: 2, firstRequestedAt: '2026-09-01T10:00:00.000Z',
      lastRequestedAt: '2026-09-01T12:00:00.000Z', status: 'pending',
    } })
    await expect(ClarezaSuggestionSubmission.countDocuments()).resolves.toBe(2)
  })

  it('lists aggregated demand with deterministic pagination', async () => {
    const store = new MongooseCoreSuggestionStore()
    await store.increment({ key: 'LOW', query: 'Low', requestedAt: '2026-09-01T09:00:00.000Z', submissionId: 'submission-id-low-1' })
    await store.increment({ key: 'HIGH', query: 'High', requestedAt: '2026-09-01T10:00:00.000Z', submissionId: 'submission-id-high-1' })
    await store.increment({ key: 'HIGH', query: 'High', requestedAt: '2026-09-01T11:00:00.000Z', submissionId: 'submission-id-high-2' })

    await expect(store.list({ offset: 0, limit: 1, order: 'demand-desc' })).resolves.toEqual({
      total: 2,
      items: [expect.objectContaining({ key: 'HIGH', query: 'High', count: 2 })],
    })
  })
})
