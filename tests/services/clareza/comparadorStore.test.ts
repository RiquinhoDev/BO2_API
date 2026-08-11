import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import ClarezaComparadorData from '../../../src/models/ClarezaComparadorData'
import {
  MongooseComparadorSnapshotRepository,
  RedisMongoComparadorStore,
  type ComparadorCachePort,
} from '../../../src/services/clareza/comparador/comparadorStore'
import type { ComparadorSnapshot, ComparadorStock } from '../../../src/services/clareza/comparador/comparador.types'

class FakeComparadorCache implements ComparadorCachePort {
  readonly values = new Map<string, unknown>()
  readonly setCalls: Array<{ readonly key: string; readonly ttlSeconds: number }> = []
  failRead = false
  failWrite = false

  async get(key: string): Promise<unknown> {
    if (this.failRead) throw new Error('redis read unavailable')
    return this.values.get(key) ?? null
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (this.failWrite) throw new Error('redis write unavailable')
    this.values.set(key, value)
    this.setCalls.push({ key, ttlSeconds })
  }
}

function sampleStock(ticker: string): ComparadorStock {
  return {
    ticker,
    name: `${ticker} Incorporated`,
    image: null,
    sector: 'Technology',
    industry: null,
    country: 'US',
    currency: 'USD',
    exchange: 'NASDAQ',
    isReit: false,
    price: 10,
    change: null,
    perf12m: null,
    marketCap: null,
    beta: null,
    pe: null,
    peg: null,
    ps: null,
    pb: null,
    evEbitda: null,
    pFfo: null,
    grossMargin: null,
    netMargin: null,
    roe: null,
    roic: null,
    fcfYield: null,
    debtEquity: null,
    debtEbitda: null,
    dividendYield: null,
    payoutRatio: null,
    ffoPayout: null,
    analystConsensus: null,
    strongBuy: null,
    buy: null,
    hold: null,
    sell: null,
    strongSell: null,
    targetConsensus: null,
    upside: null,
    updated: '2026-08-11T09:30:00.000Z',
  }
}

function snapshot(ticker: string, updated: string): ComparadorSnapshot {
  return { updated, stocks: { [ticker]: sampleStock(ticker) } }
}

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'comparador_store_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('comparador_store_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await ClarezaComparadorData.collection.deleteMany({})
})

function createStore(cache: FakeComparadorCache): RedisMongoComparadorStore {
  return new RedisMongoComparadorStore({
    cache,
    repository: new MongooseComparadorSnapshotRepository(ClarezaComparadorData),
    cacheKey: 'clareza:comparador:v1',
    ttlSeconds: 90000,
  })
}

describe('RedisMongoComparadorStore', () => {
  it('returns a valid Redis snapshot without consulting Mongo', async () => {
    const cache = new FakeComparadorCache()
    const expected = snapshot('AAPL', '2026-08-11T09:30:00.000Z')
    cache.values.set('clareza:comparador:v1', expected)
    await ClarezaComparadorData.create({
      fetchedAt: new Date('2026-08-10T09:30:00.000Z'),
      updated: '2026-08-10T09:30:00.000Z',
      stockCount: 1,
      errors: 0,
      stocks: { OLD: sampleStock('OLD') },
    })

    await expect(createStore(cache).read()).resolves.toEqual(expected)
  })

  it('loads the latest Mongo snapshot after a cache miss and repopulates Redis', async () => {
    const cache = new FakeComparadorCache()
    const store = createStore(cache)
    await store.write(snapshot('OLD', '2026-08-10T09:30:00.000Z'), 0)
    await store.write(snapshot('NEW', '2026-08-11T09:30:00.000Z'), 1)
    cache.values.clear()
    cache.setCalls.length = 0

    await expect(store.read()).resolves.toEqual(snapshot('NEW', '2026-08-11T09:30:00.000Z'))
    expect(cache.values.get('clareza:comparador:v1')).toEqual(snapshot('NEW', '2026-08-11T09:30:00.000Z'))
    expect(cache.setCalls).toEqual([{ key: 'clareza:comparador:v1', ttlSeconds: 90000 }])
  })

  it('keeps exactly five newest snapshots', async () => {
    const store = createStore(new FakeComparadorCache())

    for (let index = 0; index < 6; index += 1) {
      const day = String(index + 1).padStart(2, '0')
      await store.write(snapshot(`T${index}`, `2026-08-${day}T09:30:00.000Z`), index)
    }

    const retained = await ClarezaComparadorData.find().sort({ fetchedAt: -1 }).lean()
    expect(retained).toHaveLength(5)
    expect(retained.map((entry: { readonly stockCount: number }) => entry.stockCount)).toEqual([1, 1, 1, 1, 1])
    expect(retained.map((entry: { readonly updated: string | null }) => entry.updated)).toEqual([
      '2026-08-06T09:30:00.000Z',
      '2026-08-05T09:30:00.000Z',
      '2026-08-04T09:30:00.000Z',
      '2026-08-03T09:30:00.000Z',
      '2026-08-02T09:30:00.000Z',
    ])
  })

  it('falls back to Mongo when Redis read or repopulation fails', async () => {
    const cache = new FakeComparadorCache()
    const store = createStore(cache)
    await store.write(snapshot('AAPL', '2026-08-11T09:30:00.000Z'), 0)
    cache.values.clear()
    cache.failRead = true
    cache.failWrite = true

    await expect(store.read()).resolves.toEqual(snapshot('AAPL', '2026-08-11T09:30:00.000Z'))
  })
})
