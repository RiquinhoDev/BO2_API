import { installTestRuntimeConfigHooks } from '../../support/runtimeConfig'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import universalSyncService, { clearProductsCache } from '../../../src/services/syncUtilizadoresServices/universalSyncService'
import type { UniversalSourceItem } from '../../../src/types/universalSync.types'
import { Product, User, UserProduct } from '../../../src/models'
import { Class } from '../../../src/models/Class'
import StudentClassHistory from '../../../src/models/StudentClassHistory'
import SyncHistory from '../../../src/models/SyncModels/SyncHistory'

installTestRuntimeConfigHooks()

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'universal_sync_hotmart_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('universal_sync_hotmart_test')))
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
    StudentClassHistory.collection.deleteMany({}),
    SyncHistory.collection.deleteMany({}),
  ])
  await Product.collection.insertOne({ code: 'OGI_V1', platform: 'hotmart', name: 'OGI', courseId: 'course-ogi', isActive: true })
})

const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))

function runHotmart(sourceData: UniversalSourceItem | UniversalSourceItem[]) {
  return universalSyncService.executeUniversalSync({
    syncType: 'hotmart',
    jobName: 'char-hotmart',
    triggeredBy: 'MANUAL',
    fullSync: true,
    includeProgress: false,
    includeTags: false,
    batchSize: 10,
    sourceData,
  })
}

const baseItem = (over: Partial<UniversalSourceItem> = {}): UniversalSourceItem => ({
  email: 'a@x.test',
  name: 'Ana',
  hotmartUserId: 'h-1',
  productCode: 'OGI_V1',
  classId: 'C1',
  className: 'Turma C1',
  purchaseDate: new Date('2026-01-10T00:00:00.000Z'),
  accessCount: 4,
  ...over,
})

describe('universalSync hotmart — new/existing user', () => {
  it('inserts a new user with a userproduct and creates the class', async () => {
    const result = await runHotmart(baseItem())

    expect(result.stats.total).toBe(1)
    expect(result.stats.inserted).toBe(1)

    const user = await User.findOne({ email: 'a@x.test' }).lean()
    expect(user?.classId).toBe('C1')
    expect(user?.hotmart?.hotmartUserId).toBe('h-1')
    expect(await Class.findOne({ classId: 'C1' }).lean()).not.toBeNull()
    expect(await UserProduct.countDocuments({ userId: user?._id })).toBeGreaterThanOrEqual(1)
  })

  it('does not duplicate an existing class and returns its real DB name', async () => {
    await Class.collection.insertOne({ classId: 'C1', name: 'Nome Real Editado', source: 'manual', isActive: true })

    await runHotmart(baseItem({ className: 'Nome do Item Ignorado' }))

    expect(await Class.countDocuments({ classId: 'C1' })).toBe(1)
    const user = await User.findOne({ email: 'a@x.test' }).lean()
    expect(user?.className).toBe('Nome Real Editado')
  })
})

describe('universalSync hotmart — class history', () => {
  it('logs a first enrollment for an existing user gaining a class', async () => {
    await User.collection.insertOne({ _id: oid(1), email: 'a@x.test', name: 'Ana', hotmart: {} })

    await runHotmart(baseItem())

    const history = await StudentClassHistory.find({ studentId: oid(1).toString() }).lean()
    expect(history).toHaveLength(1)
    expect(history[0].classId).toBe('C1')
  })

  it('logs a class change with previous class id/name', async () => {
    await User.collection.insertOne({
      _id: oid(2),
      email: 'a@x.test',
      name: 'Ana',
      hotmart: { enrolledClasses: [{ classId: 'OLD', className: 'Turma Antiga', source: 'hotmart', isActive: true }] },
    })

    await runHotmart(baseItem({ classId: 'C1', className: 'Turma C1' }))

    const history = await StudentClassHistory.findOne({ studentId: oid(2).toString(), classId: 'C1' }).lean()
    expect(history?.previousClassId).toBe('OLD')
    expect(history?.previousClassName).toBe('Turma Antiga')
  })

  it('does not abort the sync when history creation fails', async () => {
    await User.collection.insertOne({ _id: oid(3), email: 'a@x.test', name: 'Ana', hotmart: {} })
    jest.spyOn(StudentClassHistory, 'create').mockRejectedValue(new Error('history down') as never)

    const result = await runHotmart(baseItem())

    expect(result.stats.errors).toBe(0)
    const user = await User.findById(oid(3)).lean()
    expect(user?.classId).toBe('C1') // user still updated despite history failure
  })
})

describe('universalSync hotmart — expired collection stays passive', () => {
  it('collects an expired student but performs no auto-inactivation (feature off)', async () => {
    // Purchase > 380 days before the class has no YYMM period -> purchaseDate branch expires.
    const result = await runHotmart(
      baseItem({ classId: 'SEMPERIODO', className: 'Turma sem periodo', purchaseDate: new Date('2024-01-01T00:00:00.000Z') }),
    )

    expect(result.stats.total).toBe(1)
    const user = await User.findOne({ email: 'a@x.test' }).lean()
    // AUTO_INACTIVATION_ENABLED is false: the sync never flips the user to INACTIVE.
    expect(user?.combined?.status).not.toBe('INACTIVE')
  })
})

describe('universalSync hotmart — repeated sync', () => {
  it('reports unchanged on a second identical sync', async () => {
    await runHotmart(baseItem())
    const second = await runHotmart(baseItem())
    expect(second.stats.inserted).toBe(0)
    expect(second.stats.unchanged + second.stats.updated).toBe(1)
  })
})
