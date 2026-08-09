import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import Product from '../../../src/models/product/Product'
import User from '../../../src/models/user'
import UserProduct from '../../../src/models/UserProduct'
import { mongooseGuruDiscrepancyRepository } from '../../../src/services/guru/mongooseGuruDiscrepancy.repository'

let mongoServer: MongoMemoryServer
const canceledUserId = new mongoose.Types.ObjectId()
const activeUserId = new mongoose.Types.ObjectId()
const productId = new mongoose.Types.ObjectId()
const enrollmentId = new mongoose.Types.ObjectId()

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'guru_discrepancy_repository_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(
    mongoServer.getUri('guru_discrepancy_repository_test'),
  ))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await Promise.all([
    Product.collection.deleteMany({}),
    User.collection.deleteMany({}),
    UserProduct.collection.deleteMany({}),
  ])
  await Product.collection.insertOne({
    _id: productId,
    name: 'Clareza',
    code: 'CLAREZA',
    platform: 'curseduca',
    isActive: true,
  })
  await User.collection.insertMany([
    {
      _id: canceledUserId,
      email: 'alice@example.test',
      name: 'Alice',
      guru: { status: 'canceled' },
      curseduca: { curseducaUserId: 'member-1', situation: 'ACTIVE' },
    },
    {
      _id: activeUserId,
      email: 'active@example.test',
      name: 'Active',
      guru: { status: 'active' },
    },
  ])
  await UserProduct.collection.insertOne({
    _id: enrollmentId,
    userId: canceledUserId,
    productId,
    platform: 'curseduca',
    platformUserId: 'member-1',
    status: 'ACTIVE',
    classes: [],
  })
})

test('loads only canceled candidates and joins their existing enrollment', async () => {
  const candidates = await mongooseGuruDiscrepancyRepository.listCandidates()

  expect(candidates).toEqual([expect.objectContaining({
    userId: canceledUserId,
    email: 'alice@example.test',
    guruStatus: 'canceled',
    curseducaUserId: 'member-1',
    curseducaSituation: 'ACTIVE',
    enrollment: { id: enrollmentId, status: 'ACTIVE' },
  })])
  expect(await mongooseGuruDiscrepancyRepository.findActiveCurseducaProductId())
    .toEqual(productId)
})

test('persists create and re-mark metadata through canonical schema fields', async () => {
  const at = new Date('2026-08-09T12:00:00.000Z')
  const createdId = await mongooseGuruDiscrepancyRepository.createPendingEnrollment({
    userId: activeUserId,
    productId,
    memberId: 'member-2',
    enrolledAt: at,
    at,
    reason: 'created reason',
  })
  await mongooseGuruDiscrepancyRepository.markPending(
    enrollmentId,
    at,
    'remark reason',
  )

  expect(await UserProduct.findById(createdId).lean()).toMatchObject({
    status: 'PARA_INATIVAR',
    platform: 'curseduca',
    platformUserId: 'member-2',
    metadata: {
      markedForInactivationAt: at,
      markedForInactivationReason: 'created reason',
      markedFromComparison: true,
    },
  })
  expect(await UserProduct.findById(enrollmentId).lean()).toMatchObject({
    status: 'PARA_INATIVAR',
    metadata: {
      markedForInactivationAt: at,
      markedForInactivationReason: 'remark reason',
      markedFromComparison: true,
    },
  })
})