jest.mock('../../../src/services/cache.service', () => ({
  cacheService: { get: jest.fn(), set: jest.fn() },
}))

import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import { cacheService } from '../../../src/services/cache.service'
import { RedisMongoCarteiraStore } from '../../../src/services/clareza/carteira/carteiraStore'
import ClarezaCarteiraData, { type IClarezaCarteiraItem } from '../../../src/models/ClarezaCarteiraData'

const mockedGet = cacheService.get as jest.Mock
const mockedSet = cacheService.set as jest.Mock

const sampleItems = (ticker: string): IClarezaCarteiraItem[] => [
  { ticker, name: ticker, type: 'growth', kind: 'stock', sector: 'Tech', data: null },
]

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'carteira_store_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('carteira_store_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.clearAllMocks()
  await ClarezaCarteiraData.collection.deleteMany({})
})

describe('RedisMongoCarteiraStore cache', () => {
  it('readCache delegates to the cache with the configured key', async () => {
    mockedGet.mockResolvedValue([{ ticker: 'X' }])
    const store = new RedisMongoCarteiraStore('clareza:key')
    expect(await store.readCache()).toEqual([{ ticker: 'X' }])
    expect(mockedGet).toHaveBeenCalledWith('clareza:key')
  })

  it('readCache returns null when the cache is empty', async () => {
    mockedGet.mockResolvedValue(null)
    expect(await new RedisMongoCarteiraStore('k').readCache()).toBeNull()
  })

  it('writeCache sets the configured key with the ttl', async () => {
    const items = sampleItems('AAA')
    await new RedisMongoCarteiraStore('clareza:key').writeCache(items, 99)
    expect(mockedSet).toHaveBeenCalledWith('clareza:key', items, 99)
  })
})

describe('RedisMongoCarteiraStore snapshots', () => {
  it('creates a snapshot and retains exactly the five most recent, deleting the rest', async () => {
    const store = new RedisMongoCarteiraStore('k')
    for (let i = 0; i < 7; i++) {
      await store.saveSnapshot({ fetchedAt: new Date(2026, 0, 1 + i), itemCount: i, errors: 0, items: sampleItems(`T${i}`) })
    }

    const remaining = await ClarezaCarteiraData.find().sort({ fetchedAt: -1 }).lean()
    expect(remaining).toHaveLength(5)
    expect(remaining.map((d) => d.itemCount)).toEqual([6, 5, 4, 3, 2]) // five most recent, descending
  })

  it('latestSnapshot returns the most recent snapshot items', async () => {
    await ClarezaCarteiraData.create({ fetchedAt: new Date(2026, 0, 1), itemCount: 1, errors: 0, items: sampleItems('OLD') })
    await ClarezaCarteiraData.create({ fetchedAt: new Date(2026, 0, 5), itemCount: 1, errors: 0, items: sampleItems('NEW') })

    const latest = await new RedisMongoCarteiraStore('k').latestSnapshot()
    expect(latest?.items[0].ticker).toBe('NEW')
  })

  it('latestSnapshot returns null when there is no snapshot with items', async () => {
    expect(await new RedisMongoCarteiraStore('k').latestSnapshot()).toBeNull()
  })
})
