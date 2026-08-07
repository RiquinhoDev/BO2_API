import { installTestRuntimeConfigHooks } from '../../support/runtimeConfig'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import universalSyncService, { clearProductsCache } from '../../../src/services/syncUtilizadoresServices/universalSyncService'
import type { UniversalSourceItem, UniversalSyncConfig } from '../../../src/types/universalSync.types'
import { Product, User, UserProduct } from '../../../src/models'
import { Class } from '../../../src/models/Class'
import SyncHistory from '../../../src/models/SyncModels/SyncHistory'

installTestRuntimeConfigHooks()

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'universal_sync_shared_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('universal_sync_shared_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  clearProductsCache()
  await Promise.all([
    Product.collection.deleteMany({}),
    User.collection.deleteMany({}),
    UserProduct.collection.deleteMany({}),
    Class.collection.deleteMany({}),
    SyncHistory.collection.deleteMany({}),
  ])
  await Product.collection.insertOne({ code: 'OGI_V1', platform: 'hotmart', name: 'OGI', courseId: 'course-ogi', isActive: true })
})

function run(sourceData: UniversalSourceItem[], extra: Partial<UniversalSyncConfig> = {}) {
  return universalSyncService.executeUniversalSync({
    syncType: 'hotmart',
    jobName: 'char-shared',
    triggeredBy: 'MANUAL',
    fullSync: true,
    includeProgress: false,
    includeTags: false,
    batchSize: 10,
    sourceData,
    ...extra,
  })
}

const valid = (email: string): UniversalSourceItem => ({
  email,
  name: email,
  hotmartUserId: `h-${email}`,
  productCode: 'OGI_V1',
  classId: 'C1',
  className: 'Turma C1',
})

describe('universalSync shared — item outcomes', () => {
  it('counts an item with no email as an error and still finishes', async () => {
    const result = await run([{ name: 'no-email' } as UniversalSourceItem])
    expect(result.stats.total).toBe(1)
    expect(result.stats.errors).toBe(1)
    expect(result.stats.inserted).toBe(0)
  })

  it('processes valid items and isolates a failing one (partial error)', async () => {
    const result = await run([valid('a@x.test'), { name: 'bad' } as UniversalSourceItem, valid('b@x.test')])
    expect(result.stats.total).toBe(3)
    expect(result.stats.errors).toBe(1)
    expect(await User.countDocuments({})).toBe(2) // the two valid items were inserted
  })

  it('reports a final status and preserves aggregate stats', async () => {
    const result = await run([valid('a@x.test')])
    expect(result.stats.inserted).toBe(1)
    expect(result.success).toBeDefined()
  })
})

describe('universalSync shared — callbacks', () => {
  it('invokes onProgress during processing and onError on a failing item', async () => {
    const onProgress = jest.fn()
    const onError = jest.fn()
    await run([valid('a@x.test'), { name: 'bad' } as UniversalSourceItem], { onProgress, onError })
    expect(onProgress).toHaveBeenCalled()
    expect(onError).toHaveBeenCalled()
  })
})

describe('universalSync shared — independent executions', () => {
  it('does not leak state between two runs (fresh collector/stats each time)', async () => {
    const first = await run([valid('a@x.test')])
    const second = await run([valid('a@x.test')])
    expect(first.stats.inserted).toBe(1)
    expect(second.stats.inserted).toBe(0) // already exists on the second run
    expect(second.stats.total).toBe(1)
  })
})
