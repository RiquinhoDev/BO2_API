import { installTestRuntimeConfigHooks } from '../../support/runtimeConfig'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import universalSyncService, { clearProductsCache } from '../../../src/services/syncUtilizadoresServices/universalSync'
import type { UniversalSourceItem } from '../../../src/types/universalSync.types'
import { Product, User, UserProduct } from '../../../src/models'
import { Class } from '../../../src/models/Class'
import SyncHistory from '../../../src/models/SyncModels/SyncHistory'

// Characterization of the UserProduct create/update block of processSyncItem
// (currently ~lines 605-1089). Golden net BEFORE the block is extracted into a
// prepare + pure builders + single executor. Behaviour is locked exactly as it
// is today, including quirks — surprises are flagged in comments, not fixed.

installTestRuntimeConfigHooks()

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'universal_sync_userproduct_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('universal_sync_userproduct_test')))
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
  await Promise.all([
    Product.collection.insertOne({ code: 'OGI_V1', platform: 'hotmart', name: 'OGI', courseId: 'course-ogi', isActive: true }),
    Product.collection.insertOne({ code: 'CURSO_A', platform: 'curseduca', name: 'Curso A', courseId: 'course-a', curseducaGroupId: 'G1', isActive: true }),
    Product.collection.insertOne({ code: 'CURSO_B', platform: 'curseduca', name: 'Curso B', courseId: 'course-b', curseducaGroupId: 'G2', isActive: true }),
  ])
})

const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))

function runHotmart(sourceData: UniversalSourceItem | UniversalSourceItem[]) {
  return universalSyncService.executeUniversalSync({
    syncType: 'hotmart', jobName: 'char-up-hotmart', triggeredBy: 'MANUAL',
    fullSync: true, includeProgress: true, includeTags: false, batchSize: 10, sourceData,
  })
}

function runCurseduca(sourceData: UniversalSourceItem | UniversalSourceItem[]) {
  return universalSyncService.executeUniversalSync({
    syncType: 'curseduca', jobName: 'char-up-curseduca', triggeredBy: 'MANUAL',
    fullSync: true, includeProgress: true, includeTags: false, batchSize: 10, sourceData,
  })
}

const hotmartItem = (over: Partial<UniversalSourceItem> = {}): UniversalSourceItem => ({
  email: 'h@x.test', name: 'Hugo', hotmartUserId: 'h-1', productCode: 'OGI_V1',
  classId: 'C1', className: 'Turma C1', role: 'student',
  purchaseDate: new Date('2026-01-10T00:00:00.000Z'),
  accessCount: 4, currentModule: 2,
  progress: { percentage: 50, completed: 5, total: 10, lessons: [
    { pageId: 'p1', moduleName: 'M1', isCompleted: true },
    { pageId: 'p2', moduleName: 'M1', isCompleted: false },
  ] },
  ...over,
})

const curseducaItem = (over: Partial<UniversalSourceItem> = {}): UniversalSourceItem => ({
  email: 'c@x.test', name: 'Carla', curseducaUserId: 'cu-1', curseducaUuid: 'uuid-1',
  groupId: 'G1', groupName: 'Grupo Um', platformData: { situation: 'ACTIVE' },
  lastLogin: new Date('2026-02-01T00:00:00.000Z'), accessCount: 7,
  enrolledAt: new Date('2026-01-05T00:00:00.000Z'),
  ...over,
})

async function upFor(email: string) {
  const user = await User.findOne({ email }).lean()
  return UserProduct.findOne({ userId: String(user?._id) }).lean()
}

describe('UserProduct create — hotmart (new)', () => {
  it('creates an ACTIVE PURCHASE userproduct with platform/ids/enrolledAt/classes', async () => {
    await runHotmart(hotmartItem())
    const up = await upFor('h@x.test')

    expect(up?.platform).toBe('hotmart')
    expect(up?.status).toBe('ACTIVE')
    expect(up?.source).toBe('PURCHASE')
    expect(up?.isPrimary).toBe(true)
    expect(up?.platformUserId).toBe('h-1')
    expect(new Date(up!.enrolledAt as Date).toISOString()).toBe('2026-01-10T00:00:00.000Z')
    expect(up?.classes).toHaveLength(1)
    expect(up?.classes?.[0].classId).toBe('C1')
    expect(up?.classes?.[0].role).toBe('student')
  })

  it('populates hotmart progress fields from the item', async () => {
    await runHotmart(hotmartItem())
    const up = await upFor('h@x.test')

    expect(up?.progress?.percentage).toBe(50)
    expect(up?.progress?.currentModule).toBe(2)
    expect(up?.progress?.completed).toBe(5)
    expect(up?.progress?.total).toBe(10)
    expect(up?.progress?.lessonsCompleted).toEqual(['p1'])
    expect(up?.progress?.modulesCompleted).toEqual(['M1'])
  })

  it('sets engagementScore from accessCount and stamps metadata.platform', async () => {
    await runHotmart(hotmartItem())
    const up = await upFor('h@x.test')

    expect(up?.engagement?.engagementScore).toBe(4)
    expect(up?.metadata?.platform).toBe('hotmart')
  })
})

describe('UserProduct create — curseduca (new)', () => {
  it('creates a curseduca userproduct with uuid, group class and action engagement', async () => {
    await runCurseduca(curseducaItem())
    const up = await upFor('c@x.test')

    expect(up?.platform).toBe('curseduca')
    expect(up?.platformUserId).toBe('cu-1')
    expect(up?.platformUserUuid).toBe('uuid-1')
    expect(up?.isPrimary).toBe(true)
    expect(up?.classes?.[0].classId).toBe('G1')
    expect(new Date(up!.engagement!.lastAction as Date).toISOString()).toBe('2026-02-01T00:00:00.000Z')
    expect(up?.metadata?.platform).toBe('curseduca')
  })
})

describe('UserProduct update — hotmart (existing)', () => {
  async function seedUserWithUP() {
    const product = await Product.findOne({ code: 'OGI_V1' }).lean()
    await User.collection.insertOne({ _id: oid(10), email: 'h@x.test', name: 'Hugo', hotmart: {} })
    await UserProduct.collection.insertOne({
      userId: oid(10), productId: product?._id, platform: 'hotmart', status: 'ACTIVE',
      source: 'PURCHASE', isPrimary: true, enrolledAt: new Date('2026-01-01T00:00:00.000Z'),
      progress: { percentage: 10 }, engagement: { engagementScore: 1 }, classes: [],
    })
    return product
  }

  it('updates progress.percentage only when it differs', async () => {
    await seedUserWithUP()
    await runHotmart(hotmartItem({ progress: { percentage: 77 } }))
    const up = await upFor('h@x.test')
    expect(up?.progress?.percentage).toBe(77)
  })

  it('appends a newly-seen class to the existing classes array', async () => {
    await seedUserWithUP()
    await runHotmart(hotmartItem({ classId: 'C1', className: 'Turma C1' }))
    const up = await upFor('h@x.test')
    expect(up?.classes?.map((c) => c.classId)).toContain('C1')
    expect(up?.classes).toHaveLength(1)
  })

  it('does not duplicate the class on a repeated identical sync', async () => {
    await seedUserWithUP()
    await runHotmart(hotmartItem())
    await runHotmart(hotmartItem())
    const up = await upFor('h@x.test')
    expect(up?.classes?.filter((c) => c.classId === 'C1')).toHaveLength(1)
  })
})

describe('UserProduct create — curseduca primary reassignment', () => {
  async function seedExistingPrimary(enrolledAt: Date) {
    const productA = await Product.findOne({ code: 'CURSO_A' }).lean()
    await User.collection.insertOne({ _id: oid(20), email: 'c@x.test', name: 'Carla', curseduca: {} })
    await UserProduct.collection.insertOne({
      userId: oid(20), productId: productA?._id, platform: 'curseduca', status: 'ACTIVE',
      source: 'PURCHASE', isPrimary: true, enrolledAt, classes: [],
    })
    return productA
  }

  it('demotes+inactivates the older primary when a newer primary is synced', async () => {
    const productA = await seedExistingPrimary(new Date('2026-01-01T00:00:00.000Z'))
    // New sync for group G2 (product B), newer enrolledAt -> B becomes primary, A demoted+INACTIVE.
    await runCurseduca(curseducaItem({ groupId: 'G2', groupName: 'Grupo Dois', enrolledAt: new Date('2026-03-01T00:00:00.000Z') }))

    const upA = await UserProduct.findOne({ userId: String(oid(20)), productId: productA?._id }).lean()
    const productB = await Product.findOne({ code: 'CURSO_B' }).lean()
    const upB = await UserProduct.findOne({ userId: String(oid(20)), productId: productB?._id }).lean()

    expect(upA?.isPrimary).toBe(false)
    expect(upA?.status).toBe('INACTIVE')
    expect(upB?.isPrimary).toBe(true)
  })

  it('keeps the older primary and makes the newer-but-older-dated product secondary', async () => {
    const productA = await seedExistingPrimary(new Date('2026-05-01T00:00:00.000Z'))
    // New sync dated BEFORE the existing primary -> new becomes secondary, A stays primary+active.
    await runCurseduca(curseducaItem({ groupId: 'G2', groupName: 'Grupo Dois', enrolledAt: new Date('2026-02-01T00:00:00.000Z') }))

    const upA = await UserProduct.findOne({ userId: String(oid(20)), productId: productA?._id }).lean()
    const productB = await Product.findOne({ code: 'CURSO_B' }).lean()
    const upB = await UserProduct.findOne({ userId: String(oid(20)), productId: productB?._id }).lean()

    expect(upA?.isPrimary).toBe(true)
    expect(upA?.status).toBe('ACTIVE')
    expect(upB?.isPrimary).toBe(false)
  })
})

describe('UserProduct — partial failure tolerance', () => {
  it('syncs the user but creates no userproduct when no product matches, without erroring', async () => {
    const result = await runHotmart(hotmartItem({ productCode: 'DOES_NOT_EXIST' }))

    expect(result.stats.errors).toBe(0)
    expect(result.stats.inserted).toBe(1)
    const user = await User.findOne({ email: 'h@x.test' }).lean()
    expect(user).not.toBeNull()
    expect(await UserProduct.countDocuments({ userId: String(user?._id) })).toBe(0)
  })
})
