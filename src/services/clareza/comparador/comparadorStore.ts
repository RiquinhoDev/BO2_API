import type { Model } from 'mongoose'
import ClarezaComparadorData, { type IClarezaComparadorData } from '../../../models/ClarezaComparadorData'
import type { ComparadorSnapshot, ComparadorStock } from './comparador.types'

const SNAPSHOT_RETENTION = 5

type JsonObject = Readonly<Record<string, unknown>>

export interface ComparadorStorePort {
  read(): Promise<ComparadorSnapshot | null>
  write(snapshot: ComparadorSnapshot, errors: number): Promise<void>
}

export interface ComparadorCachePort {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>
}

export interface ComparadorSnapshotRecord {
  readonly fetchedAt: Date
  readonly updated: string | null
  readonly stockCount: number
  readonly errors: number
  readonly stocks: Readonly<Record<string, ComparadorStock>>
}

export interface ComparadorSnapshotRepository {
  create(record: ComparadorSnapshotRecord): Promise<void>
  latest(): Promise<unknown>
  retainLatest(limit: number): Promise<void>
}

export interface RedisMongoComparadorStoreOptions {
  readonly cache: ComparadorCachePort
  readonly repository: ComparadorSnapshotRepository
  readonly cacheKey: string
  readonly ttlSeconds: number
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function decodeStock(value: unknown): ComparadorStock | null {
  if (!isJsonObject(value)) return null
  const ticker = nullableString(value.ticker)
  const name = nullableString(value.name)
  const currency = nullableString(value.currency)
  const updated = nullableString(value.updated)
  if (!ticker || name === null || !currency || !updated || typeof value.isReit !== 'boolean') return null

  return {
    ticker,
    name,
    image: nullableString(value.image),
    sector: nullableString(value.sector),
    industry: nullableString(value.industry),
    country: nullableString(value.country),
    currency,
    exchange: nullableString(value.exchange),
    isReit: value.isReit,
    price: nullableNumber(value.price),
    change: nullableNumber(value.change),
    perf12m: nullableNumber(value.perf12m),
    marketCap: nullableNumber(value.marketCap),
    beta: nullableNumber(value.beta),
    pe: nullableNumber(value.pe),
    peg: nullableNumber(value.peg),
    ps: nullableNumber(value.ps),
    pb: nullableNumber(value.pb),
    evEbitda: nullableNumber(value.evEbitda),
    pFfo: nullableNumber(value.pFfo),
    grossMargin: nullableNumber(value.grossMargin),
    netMargin: nullableNumber(value.netMargin),
    roe: nullableNumber(value.roe),
    roic: nullableNumber(value.roic),
    fcfYield: nullableNumber(value.fcfYield),
    debtEquity: nullableNumber(value.debtEquity),
    debtEbitda: nullableNumber(value.debtEbitda),
    dividendYield: nullableNumber(value.dividendYield),
    payoutRatio: nullableNumber(value.payoutRatio),
    ffoPayout: nullableNumber(value.ffoPayout),
    analystConsensus: nullableString(value.analystConsensus),
    strongBuy: nullableNumber(value.strongBuy),
    buy: nullableNumber(value.buy),
    hold: nullableNumber(value.hold),
    sell: nullableNumber(value.sell),
    strongSell: nullableNumber(value.strongSell),
    targetConsensus: nullableNumber(value.targetConsensus),
    upside: nullableNumber(value.upside),
    updated,
  }
}

function decodeSnapshot(value: unknown): ComparadorSnapshot | null {
  if (!isJsonObject(value) || !isJsonObject(value.stocks)) return null
  const stocks: Record<string, ComparadorStock> = {}
  for (const [ticker, rawStock] of Object.entries(value.stocks)) {
    const stock = decodeStock(rawStock)
    if (!stock) return null
    stocks[ticker] = stock
  }
  const updated = value.updated === null ? null : nullableString(value.updated)
  if (updated === null && value.updated !== null) return null
  return { updated, stocks }
}

function snapshotRecord(snapshot: ComparadorSnapshot, errors: number): ComparadorSnapshotRecord {
  const fetchedAt = snapshot.updated ? new Date(snapshot.updated) : new Date()
  return {
    fetchedAt: Number.isNaN(fetchedAt.getTime()) ? new Date() : fetchedAt,
    updated: snapshot.updated,
    stockCount: Object.keys(snapshot.stocks).length,
    errors,
    stocks: snapshot.stocks,
  }
}

export class MongooseComparadorSnapshotRepository implements ComparadorSnapshotRepository {
  constructor(private readonly model: Model<IClarezaComparadorData> = ClarezaComparadorData) {}

  async create(record: ComparadorSnapshotRecord): Promise<void> {
    await this.model.create(record)
  }

  async latest(): Promise<unknown> {
    return this.model.findOne().sort({ fetchedAt: -1 }).lean()
  }

  async retainLatest(limit: number): Promise<void> {
    const snapshots = await this.model.find({}, '_id fetchedAt').sort({ fetchedAt: -1 }).lean()
    if (snapshots.length <= limit) return
    await this.model.deleteMany({ _id: { $in: snapshots.slice(limit).map((snapshot) => snapshot._id) } })
  }
}

export class RedisMongoComparadorStore implements ComparadorStorePort {
  constructor(private readonly options: RedisMongoComparadorStoreOptions) {}

  async read(): Promise<ComparadorSnapshot | null> {
    const cached = await this.readCache()
    if (cached) return cached

    let snapshot: ComparadorSnapshot | null
    try {
      snapshot = decodeSnapshot(await this.options.repository.latest())
    } catch {
      return null
    }
    if (!snapshot) return null
    await this.writeCache(snapshot)
    return snapshot
  }

  async write(snapshot: ComparadorSnapshot, errors: number): Promise<void> {
    await this.options.repository.create(snapshotRecord(snapshot, errors))
    await this.options.repository.retainLatest(SNAPSHOT_RETENTION)
    await this.writeCache(snapshot)
  }

  private async readCache(): Promise<ComparadorSnapshot | null> {
    try {
      return decodeSnapshot(await this.options.cache.get(this.options.cacheKey))
    } catch {
      return null
    }
  }

  private async writeCache(snapshot: ComparadorSnapshot): Promise<void> {
    try {
      await this.options.cache.set(this.options.cacheKey, snapshot, this.options.ttlSeconds)
    } catch {
      // A snapshot Mongo continua disponivel quando Redis esta temporariamente indisponivel.
    }
  }
}
