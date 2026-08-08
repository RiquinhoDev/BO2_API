import { installTestRuntimeConfigHooks } from '../../support/runtimeConfig'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import universalSyncService, { clearProductsCache } from '../../../src/services/syncUtilizadoresServices/universalSync'
import type { UniversalSourceItem } from '../../../src/types/universalSync.types'
import { Product, User, UserProduct } from '../../../src/models'
import { Class } from '../../../src/models/Class'
import SyncHistory from '../../../src/models/SyncModels/SyncHistory'

installTestRuntimeConfigHooks()

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'universal_sync_curseduca_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('universal_sync_curseduca_test')))
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
  await Product.collection.insertOne({
    code: 'CURSO', platform: 'curseduca', name: 'Curso', courseId: 'course-curso', curseducaGroupId: 'G1', isActive: true,
  })
})

const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))

function runCurseduca(sourceData: UniversalSourceItem | UniversalSourceItem[]) {
  return universalSyncService.executeUniversalSync({
    syncType: 'curseduca',
    jobName: 'char-curseduca',
    triggeredBy: 'MANUAL',
    fullSync: true,
    includeProgress: false,
    includeTags: false,
    batchSize: 10,
    sourceData,
  })
}

const baseItem = (over: Partial<UniversalSourceItem> = {}): UniversalSourceItem => ({
  email: 'c@x.test',
  name: 'Carla',
  curseducaUserId: 'cu-1',
  curseducaUuid: 'uuid-student-1',
  groupId: 'G1',
  groupName: 'Grupo Um',
  platformData: { situation: 'ACTIVE' },
  ...over,
})

describe('universalSync curseduca — class by groupId', () => {
  it('creates the class keyed by groupId, never by the student curseducaUuid', async () => {
    await runCurseduca(baseItem())

    expect(await Class.findOne({ classId: 'G1' }).lean()).not.toBeNull()
    expect(await Class.findOne({ classId: 'uuid-student-1' }).lean()).toBeNull()
    const user = await User.findOne({ email: 'c@x.test' }).lean()
    expect(user?.curseduca?.groupId).toBe('G1')
  })
})

describe('universalSync curseduca — member status from situation', () => {
  it.each([
    ['ACTIVE', 'ACTIVE'],
    ['INACTIVE', 'INACTIVE'],
    ['SUSPENDED', 'INACTIVE'],
  ] as const)('maps situation %s to memberStatus %s', async (situation, expected) => {
    await runCurseduca(baseItem({ platformData: { situation } }))
    const user = await User.findOne({ email: 'c@x.test' }).lean()
    expect(user?.curseduca?.memberStatus).toBe(expected)
    expect(user?.curseduca?.situation).toBe(situation)
  })
})

describe('universalSync curseduca — enrolledClasses', () => {
  it('populates all groups from allCurseducaGroups', async () => {
    await runCurseduca(
      baseItem({
        allCurseducaGroups: [
          { groupId: 'G1', groupName: 'Grupo Um', situation: 'ACTIVE' },
          { groupId: 'G2', groupName: 'Grupo Dois', situation: 'ACTIVE' },
        ],
      } as Partial<UniversalSourceItem>),
    )
    const user = await User.findOne({ email: 'c@x.test' }).lean()
    expect(user?.curseduca?.enrolledClasses).toHaveLength(2)
  })

  it('falls back to a single group when allCurseducaGroups is absent', async () => {
    await runCurseduca(baseItem())
    const user = await User.findOne({ email: 'c@x.test' }).lean()
    expect(user?.curseduca?.enrolledClasses).toHaveLength(1)
  })
})

describe('universalSync curseduca — PARA_INATIVAR reconciliation', () => {
  it('flips a PARA_INATIVAR userproduct to INACTIVE when curseduca is inactive', async () => {
    await User.collection.insertOne({ _id: oid(1), email: 'c@x.test', name: 'Carla', curseduca: {} })
    await UserProduct.collection.insertOne({
      _id: oid(9),
      userId: oid(1),
      platform: 'curseduca',
      status: 'PARA_INATIVAR',
      metadata: { markedForInactivationAt: new Date(), markedForInactivationReason: 'test' },
    })

    await runCurseduca(baseItem({ platformData: { situation: 'INACTIVE' } }))

    const up = await UserProduct.findById(oid(9)).lean() as { status?: string; metadata?: Record<string, unknown> } | null
    expect(up?.status).toBe('INACTIVE')
    expect(up?.metadata?.markedForInactivationAt).toBeUndefined()
  })

  it('leaves an active-curseduca sync from touching PARA_INATIVAR', async () => {
    await User.collection.insertOne({ _id: oid(2), email: 'c@x.test', name: 'Carla', curseduca: {} })
    await UserProduct.collection.insertOne({ _id: oid(8), userId: oid(2), platform: 'curseduca', status: 'PARA_INATIVAR' })

    await runCurseduca(baseItem({ platformData: { situation: 'ACTIVE' } }))

    const up = await UserProduct.findById(oid(8)).lean()
    expect(up?.status).toBe('PARA_INATIVAR') // untouched when situation is ACTIVE
  })
})
