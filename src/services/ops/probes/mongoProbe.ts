// Fotografia do espaco ocupado na Mongo. `dbStats` e barato e corre de hora a
// hora; o detalhe por coleccao usa `$collStats`, que percorre metadados de
// todas as coleccoes e por isso so corre uma vez por dia.

import mongoose from 'mongoose'

export interface MongoStorageTotals {
  readonly dataSizeBytes: number
  readonly storageSizeBytes: number
  readonly indexSizeBytes: number
  readonly totalSizeBytes: number
  readonly objects: number
  readonly collections: number
  readonly indexes: number
}

export interface MongoCollectionUsage {
  readonly name: string
  readonly documents: number
  readonly dataSizeBytes: number
  readonly storageSizeBytes: number
  readonly indexSizeBytes: number
  readonly averageObjectSizeBytes: number
}

export interface MongoProbePort {
  command(command: Record<string, unknown>): Promise<Record<string, unknown>>
  listCollectionNames(): Promise<readonly string[]>
  collectionStorageStats(name: string): Promise<Record<string, unknown> | null>
}

function number(source: Record<string, unknown>, field: string): number {
  const value = source[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function nestedNumber(
  source: Record<string, unknown>,
  path: readonly string[],
): number {
  let current: unknown = source
  for (const segment of path) {
    if (typeof current !== 'object' || current === null) return 0
    current = (current as Record<string, unknown>)[segment]
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : 0
}

export function createMongoProbePort(): MongoProbePort {
  const requireDb = () => {
    const db = mongoose.connection.db
    if (!db) throw new Error('Mongo is not connected')
    return db
  }

  return {
    command: async (command) =>
      (await requireDb().command(command)) as Record<string, unknown>,
    listCollectionNames: async () => {
      const collections = await requireDb()
        .listCollections({}, { nameOnly: true })
        .toArray()
      return collections.map((collection) => collection.name)
    },
    collectionStorageStats: async (name) => {
      const results = await requireDb()
        .collection(name)
        .aggregate([{ $collStats: { storageStats: {} } }])
        .toArray()
      return (results[0] as Record<string, unknown> | undefined) ?? null
    },
  }
}

export async function probeMongoTotals(port: MongoProbePort): Promise<MongoStorageTotals> {
  const stats = await port.command({ dbStats: 1, scale: 1 })
  return {
    dataSizeBytes: number(stats, 'dataSize'),
    storageSizeBytes: number(stats, 'storageSize'),
    indexSizeBytes: number(stats, 'indexSize'),
    // `totalSize` so existe a partir do Mongo 6; somamos a mao quando falta.
    totalSizeBytes:
      number(stats, 'totalSize') || number(stats, 'storageSize') + number(stats, 'indexSize'),
    objects: number(stats, 'objects'),
    collections: number(stats, 'collections'),
    indexes: number(stats, 'indexes'),
  }
}

/**
 * Detalhe por coleccao, ordenado pelo que ocupa mais espaco em disco. Uma
 * coleccao que falhe (permissoes, vista, coleccao apagada a meio) e saltada:
 * meia fotografia vale mais do que nenhuma.
 */
export async function probeMongoCollections(
  port: MongoProbePort,
  limit = 15,
): Promise<readonly MongoCollectionUsage[]> {
  const names = await port.listCollectionNames()
  const usages: MongoCollectionUsage[] = []

  for (const name of names) {
    let stats: Record<string, unknown> | null = null
    try {
      stats = await port.collectionStorageStats(name)
    } catch {
      continue
    }
    if (!stats) continue

    usages.push({
      name,
      documents: nestedNumber(stats, ['storageStats', 'count']),
      dataSizeBytes: nestedNumber(stats, ['storageStats', 'size']),
      storageSizeBytes: nestedNumber(stats, ['storageStats', 'storageSize']),
      indexSizeBytes: nestedNumber(stats, ['storageStats', 'totalIndexSize']),
      averageObjectSizeBytes: nestedNumber(stats, ['storageStats', 'avgObjSize']),
    })
  }

  return usages
    .sort(
      (left, right) =>
        right.storageSizeBytes + right.indexSizeBytes
        - (left.storageSizeBytes + left.indexSizeBytes),
    )
    .slice(0, limit)
}

export interface MongoConnectionUsage {
  readonly readyState: number
  readonly poolSize: number | null
}

export function probeMongoConnection(): MongoConnectionUsage {
  const connection = mongoose.connection
  const options = connection.config as { maxPoolSize?: number } | undefined
  return {
    readyState: connection.readyState,
    poolSize: typeof options?.maxPoolSize === 'number' ? options.maxPoolSize : null,
  }
}
