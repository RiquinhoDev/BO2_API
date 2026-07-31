import mongoose from 'mongoose'
import type { IndexDescription } from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import Product from '../../../src/models/product/Product'
import User from '../../../src/models/user'
import UserProduct from '../../../src/models/UserProduct'
import { buildUsersV2EnrollmentPipeline } from '../../../src/services/users/mongooseUsersV2Enrollment.reader'
import type { UsersV2EnrollmentFilters } from '../../../src/services/users/usersV2Enrollment.contract'

const fixtureSize = 1_200
const targetProductId = new mongoose.Types.ObjectId(
  '900000000000000000000001',
)
const fallbackProductId = new mongoose.Types.ObjectId(
  '900000000000000000000002',
)

interface QueryPlanEvidence {
  source: {
    nReturned: number
    totalDocsExamined: number
    totalKeysExamined: number
    stages: string[]
    indexes: string[]
  }
  lookups: {
    totalDocsExamined: number
    totalKeysExamined: number
    indexes: string[]
  }
  sortSpilled: boolean
}

interface SelectiveCase {
  name: string
  filters: Partial<UsersV2EnrollmentFilters>
  expectedIndex: string
  expectedMatches: number
}

let mongoServer: MongoMemoryServer

const baseFilters = (
  filters: Partial<UsersV2EnrollmentFilters> = {},
): UsersV2EnrollmentFilters => ({
  page: 1,
  limit: 50,
  ...filters,
})

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return Object.fromEntries(Object.entries(value))
}

const numberValue = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

const stringValues = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []

const findCursor = (value: unknown): Record<string, unknown> | undefined => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const cursor = findCursor(entry)
      if (cursor !== undefined) return cursor
    }
    return undefined
  }

  const record = asRecord(value)
  if (record === undefined) return undefined

  const cursor = asRecord(record.$cursor)
  if (cursor !== undefined) return cursor
  if (
    asRecord(record.queryPlanner) !== undefined
    && asRecord(record.executionStats) !== undefined
  ) {
    return record
  }

  for (const nested of Object.values(record)) {
    const found = findCursor(nested)
    if (found !== undefined) return found
  }
  return undefined
}

const collectPlanDetails = (
  value: unknown,
  stages: Set<string>,
  indexes: Set<string>,
): void => {
  if (Array.isArray(value)) {
    value.forEach(entry => collectPlanDetails(entry, stages, indexes))
    return
  }

  const record = asRecord(value)
  if (record === undefined) return

  if (typeof record.stage === 'string') stages.add(record.stage)
  if (typeof record.indexName === 'string') indexes.add(record.indexName)
  Object.values(record).forEach(entry =>
    collectPlanDetails(entry, stages, indexes))
}

const collectLookupEvidence = (
  value: unknown,
): QueryPlanEvidence['lookups'] => {
  const evidence = {
    totalDocsExamined: 0,
    totalKeysExamined: 0,
    indexes: new Set<string>(),
  }

  const visit = (nested: unknown): void => {
    if (Array.isArray(nested)) {
      nested.forEach(visit)
      return
    }

    const record = asRecord(nested)
    if (record === undefined) return

    const lookup = asRecord(record.$lookup)
    if (lookup !== undefined) {
      evidence.totalDocsExamined += numberValue(record.totalDocsExamined)
      evidence.totalKeysExamined += numberValue(record.totalKeysExamined)
      stringValues(record.indexesUsed).forEach(index =>
        evidence.indexes.add(index))
    }
    Object.values(record).forEach(visit)
  }

  visit(value)
  return {
    totalDocsExamined: evidence.totalDocsExamined,
    totalKeysExamined: evidence.totalKeysExamined,
    indexes: [...evidence.indexes].sort(),
  }
}

const hasSortSpill = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasSortSpill)

  const record = asRecord(value)
  if (record === undefined) return false

  if (record.usedDisk === true) return true
  for (const key of ['spills', 'spilledRecords', 'spilledDataStorageSize']) {
    if (numberValue(record[key]) > 0) return true
  }
  return Object.values(record).some(hasSortSpill)
}

const explainEvidence = (explain: unknown): QueryPlanEvidence => {
  const cursor = findCursor(explain)
  if (cursor === undefined) {
    throw new Error('aggregation explain did not expose a cursor plan')
  }

  const queryPlanner = asRecord(cursor.queryPlanner)
  const executionStats = asRecord(cursor.executionStats)
  if (queryPlanner === undefined || executionStats === undefined) {
    throw new Error('aggregation cursor omitted executionStats')
  }

  const stages = new Set<string>()
  const indexes = new Set<string>()
  collectPlanDetails(queryPlanner.winningPlan, stages, indexes)

  return {
    source: {
      nReturned: numberValue(executionStats.nReturned),
      totalDocsExamined: numberValue(executionStats.totalDocsExamined),
      totalKeysExamined: numberValue(executionStats.totalKeysExamined),
      stages: [...stages].sort(),
      indexes: [...indexes].sort(),
    },
    lookups: collectLookupEvidence(explain),
    sortSpilled: hasSortSpill(explain),
  }
}

const seedRepresentativeData = async (): Promise<void> => {
  const users: Record<string, unknown>[] = []
  const enrollments: Record<string, unknown>[] = []

  for (let index = 0; index < fixtureSize; index += 1) {
    const userId = new mongoose.Types.ObjectId()
    const inSelectivePlatform = index < 300
    const inSelectiveStatus = index < 20 || (index >= 400 && index < 980)
    const inSelectiveProduct = index < 120
    const inEngagementRange = index >= 300 && index < 350
    const inProgressRange = index >= 350 && index < 400

    users.push({
      _id: userId,
      name: `Plan User ${index}`,
      email: `plan-user-${index}@example.test`,
      combined: { status: 'ACTIVE' },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    enrollments.push({
      _id: new mongoose.Types.ObjectId(),
      userId,
      productId: inSelectiveProduct ? targetProductId : fallbackProductId,
      platform: inSelectivePlatform ? 'curseduca' : 'hotmart',
      platformUserId: `plan-user-${index}`,
      enrolledAt: new Date('2026-01-01T00:00:00.000Z'),
      status: inSelectiveStatus ? 'ACTIVE' : 'INACTIVE',
      source: 'MIGRATION',
      isPrimary: true,
      classes: [],
      progress: { percentage: inProgressRange ? 90 : 20 },
      engagement: { engagementScore: inEngagementRange ? 95 : 20 },
    })
  }

  await User.collection.insertMany(users)
  await Product.collection.insertMany([
    {
      _id: targetProductId,
      name: 'Selective Product',
      code: 'SELECTIVE',
      platform: 'curseduca',
    },
    {
      _id: fallbackProductId,
      name: 'Fallback Product',
      code: 'FALLBACK',
      platform: 'hotmart',
    },
  ])
  await UserProduct.collection.insertMany(enrollments)
}

const inspect = async (
  filters: Partial<UsersV2EnrollmentFilters>,
): Promise<QueryPlanEvidence> => {
  const pipeline = buildUsersV2EnrollmentPipeline(baseFilters(filters), {
    users: User.collection.name,
    products: Product.collection.name,
  })
  const explain = await UserProduct.aggregate(pipeline)
    .option({ maxTimeMS: 120_000, allowDiskUse: false })
    .explain('executionStats')

  return explainEvidence(explain)
}

const createDeclaredUserProductIndexes = async (): Promise<void> => {
  const indexesByKey = new Map<string, IndexDescription>()

  for (const [key, options] of UserProduct.schema.indexes()) {
    const signature = JSON.stringify(Object.entries(key))
    const existing = indexesByKey.get(signature)
    if (existing === undefined || options.unique === true) {
      const normalizedKey: Record<string, 1 | -1> = {}
      for (const [path, direction] of Object.entries(key)) {
        if (direction !== 1 && direction !== -1) {
          throw new Error(`unsupported UserProduct index direction: ${path}`)
        }
        normalizedKey[path] = direction
      }
      indexesByKey.set(signature, {
        key: normalizedKey,
        name: options.name,
        unique: options.unique === true,
        sparse: options.sparse === true,
      })
    }
  }

  await UserProduct.collection.createIndexes([...indexesByKey.values()])
}

beforeAll(async () => {
  expect(process.env.MONGOMS_RUNTIME_DOWNLOAD).toBe('false')
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'users_v2_enrollment_explain_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(
      mongoServer.getUri('users_v2_enrollment_explain_test'),
    ),
    { autoIndex: false },
  )
  await createDeclaredUserProductIndexes()
  await seedRepresentativeData()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

describe('Users V2 enrollment query plans', () => {
  const selectiveCases: SelectiveCase[] = [
    {
      name: 'productId + status',
      filters: {
        productId: targetProductId.toHexString(),
        status: 'ACTIVE',
      },
      expectedIndex: 'productId_1_status_1',
      expectedMatches: 20,
    },
    {
      name: 'platform + status',
      filters: { platform: 'curseduca', status: 'ACTIVE' },
      expectedIndex: 'users_v2_platform_status',
      expectedMatches: 20,
    },
    {
      name: 'engagement score range',
      filters: { minEngagement: 90, maxEngagement: 100 },
      expectedIndex: 'engagement.engagementScore_-1',
      expectedMatches: 50,
    },
    {
      name: 'progress percentage range',
      filters: { progressLevel: 'MUITO_ALTO' },
      expectedIndex: 'progress.percentage_-1',
      expectedMatches: 50,
    },
  ]

  it.each(selectiveCases)(
    'uses a selective bounded source plan for $name',
    async ({ name, filters, expectedIndex, expectedMatches }) => {
      const evidence = await inspect(filters)
      console.info(`[users-v2 explain] ${name}`, JSON.stringify(evidence))

      expect(evidence.source.nReturned).toBeGreaterThan(0)
      expect(evidence.source.nReturned).toBe(expectedMatches)
      expect(evidence.source.nReturned).toBeLessThanOrEqual(
        fixtureSize * 0.1,
      )
      expect(evidence.source.stages).toContain('IXSCAN')
      expect(evidence.source.indexes).toContain(expectedIndex)
      expect(evidence.source.totalDocsExamined).toBeLessThanOrEqual(
        evidence.source.nReturned * 10,
      )
      expect(evidence.sortSpilled).toBe(false)
    },
  )

  it('documents the bounded default scan without requiring an index', async () => {
    const evidence = await inspect({})
    console.info('[users-v2 explain] default', JSON.stringify(evidence))

    expect(evidence.source.nReturned).toBe(fixtureSize)
    expect(evidence.source.totalDocsExamined).toBeLessThanOrEqual(fixtureSize)
    expect(evidence.sortSpilled).toBe(false)
  })

  it('documents literal substring search as a bounded scan exception', async () => {
    const evidence = await inspect({ search: 'Plan User 1199' })
    console.info(
      '[users-v2 explain] substring search',
      JSON.stringify(evidence),
    )

    expect(evidence.source.nReturned).toBe(fixtureSize)
    expect(evidence.source.totalDocsExamined).toBeLessThanOrEqual(fixtureSize)
    expect(evidence.sortSpilled).toBe(false)
  })
})
