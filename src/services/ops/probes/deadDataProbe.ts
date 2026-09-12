// Procura espaço ocupado por dados que ninguém usa. São três perguntas
// diferentes, e vale a pena não as confundir:
//
//   1. há colecções sem modelo nenhum no código? (órfãs de uma versão antiga)
//   2. há colecções que existem e estão vazias? (lixo de migrações)
//   3. dentro das que pesam, quanto é histórico antigo? (dívida de retenção)
//
// A quarta pergunta — que índices nunca são usados — precisa de `$indexStats`,
// que o Atlas bloqueia nos planos partilhados. Fica de fora até haver plano que
// a permita, e é pena: os índices deste cluster valem dezenas de megabytes.

import mongoose from 'mongoose'
import type { MongoProbePort } from './mongoProbe'

const DAY_MS = 24 * 60 * 60 * 1_000

/** Campos de data por onde procuramos a idade de um documento, por ordem. */
const DATE_FIELDS = ['createdAt', 'timestamp', 'date', 'capturedAt', 'snapshotDate'] as const

export interface CollectionAgeProfile {
  readonly name: string
  readonly documents: number
  readonly dateField: string | null
  readonly oldest: Date | null
  readonly olderThan90Days: number | null
  readonly olderThan180Days: number | null
  /** Documentos escritos nas últimas 24 horas — a velocidade a que cresce. */
  readonly writtenLastDay: number | null
}

export interface DeadDataReport {
  /** Colecções que existem na base mas não têm modelo no código. */
  readonly orphanCollections: readonly string[]
  /** Colecções sem um único documento. */
  readonly emptyCollections: readonly string[]
  readonly ageProfiles: readonly CollectionAgeProfile[]
  readonly indexUsageAvailable: boolean
}

export interface DeadDataProbePort extends MongoProbePort {
  countDocuments(
    collection: string,
    filter: Record<string, unknown>,
  ): Promise<number>
  findOneProjected(
    collection: string,
    projection: Record<string, 1>,
    sort?: Record<string, 1 | -1>,
  ): Promise<Record<string, unknown> | null>
  estimatedCount(collection: string): Promise<number>
}

export function createDeadDataProbePort(base: MongoProbePort): DeadDataProbePort {
  const requireDb = () => {
    const db = mongoose.connection.db
    if (!db) throw new Error('Mongo is not connected')
    return db
  }

  return {
    ...base,
    countDocuments: (collection, filter) =>
      requireDb().collection(collection).countDocuments(filter),
    findOneProjected: async (collection, projection, sort) => {
      const cursor = requireDb().collection(collection).find({}).project(projection).limit(1)
      if (sort) cursor.sort(sort)
      const [document] = await cursor.toArray()
      return (document as Record<string, unknown> | undefined) ?? null
    },
    estimatedCount: (collection) =>
      requireDb().collection(collection).estimatedDocumentCount(),
  }
}

/** Nomes de colecção que o código conhece, via modelos registados no mongoose. */
export function modelledCollectionNames(): ReadonlySet<string> {
  const names = new Set<string>()
  for (const modelName of mongoose.modelNames()) {
    try {
      names.add(mongoose.model(modelName).collection.name)
    } catch {
      // Um modelo que não resolva não invalida os outros.
    }
  }
  return names
}

async function detectDateField(
  port: DeadDataProbePort,
  collection: string,
): Promise<string | null> {
  const projection = Object.fromEntries(DATE_FIELDS.map((field) => [field, 1 as const]))
  const sample = await port.findOneProjected(collection, projection)
  if (!sample) return null
  return DATE_FIELDS.find((field) => sample[field] instanceof Date) ?? null
}

async function profileCollection(
  port: DeadDataProbePort,
  name: string,
  now: number,
): Promise<CollectionAgeProfile> {
  const documents = await port.estimatedCount(name)
  const dateField = documents === 0 ? null : await detectDateField(port, name)

  if (!dateField) {
    return {
      name,
      documents,
      dateField: null,
      oldest: null,
      olderThan90Days: null,
      olderThan180Days: null,
      writtenLastDay: null,
    }
  }

  const olderThan = (days: number) =>
    port.countDocuments(name, { [dateField]: { $lt: new Date(now - days * DAY_MS) } })

  const [olderThan90Days, olderThan180Days, writtenLastDay, oldestDocument] = await Promise.all([
    olderThan(90),
    olderThan(180),
    port.countDocuments(name, { [dateField]: { $gte: new Date(now - DAY_MS) } }),
    port.findOneProjected(name, { [dateField]: 1 }, { [dateField]: 1 }),
  ])

  const oldestValue = oldestDocument?.[dateField]

  return {
    name,
    documents,
    dateField,
    oldest: oldestValue instanceof Date ? oldestValue : null,
    olderThan90Days,
    olderThan180Days,
    writtenLastDay,
  }
}

/**
 * Corre uma vez por dia, com o resto do detalhe caro. As contagens por idade
 * percorrem índices, não documentos, quando o campo de data está indexado — e
 * quando não está, é uma vez por dia sobre as colecções que pesam, não sobre as
 * noventa e seis.
 */
export async function probeDeadData(
  port: DeadDataProbePort,
  heaviestCollections: readonly string[],
  now: Date = new Date(),
): Promise<DeadDataReport> {
  const modelled = modelledCollectionNames()
  const all = await port.listCollectionNames()

  const orphanCollections = all.filter((name) => !modelled.has(name)).sort()

  const emptyCollections: string[] = []
  for (const name of all) {
    try {
      if ((await port.estimatedCount(name)) === 0) emptyCollections.push(name)
    } catch {
      // Uma colecção que desapareça a meio não invalida o varrimento.
    }
  }

  const ageProfiles: CollectionAgeProfile[] = []
  for (const name of heaviestCollections) {
    try {
      ageProfiles.push(await profileCollection(port, name, now.getTime()))
    } catch {
      // idem
    }
  }

  return {
    orphanCollections,
    emptyCollections: emptyCollections.sort(),
    ageProfiles,
    // `$indexStats` é bloqueado nos planos partilhados do Atlas. Registamos a
    // ausência para o painel poder dizer porque é que não mostra índices.
    indexUsageAvailable: false,
  }
}
