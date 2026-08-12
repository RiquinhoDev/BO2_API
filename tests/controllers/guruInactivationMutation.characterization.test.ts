import type { NextFunction, Request, Response } from 'express'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import User from '../../src/models/user'
import UserProduct from '../../src/models/UserProduct'
import {
  cleanupDuplicateUserProducts,
  fixUsersToActive,
  markStaleInactive,
  quarantineUser,
  restoreUserProducts,
  revertInactivationMark,
} from '../../src/controllers/guruInactivationMutation.controller'

let mongoServer: MongoMemoryServer
let userId: mongoose.Types.ObjectId
let productId: mongoose.Types.ObjectId
let userProductId: mongoose.Types.ObjectId

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'guru_inactivation_mutation_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('guru_inactivation_mutation_test')),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await Promise.all([
    User.collection.deleteMany({}),
    UserProduct.collection.deleteMany({}),
  ])
  userId = new mongoose.Types.ObjectId()
  productId = new mongoose.Types.ObjectId()
  userProductId = new mongoose.Types.ObjectId()
  await User.collection.insertOne({
    _id: userId,
    email: 'alice@example.test',
    name: 'Alice',
    curseduca: { memberStatus: 'ACTIVE', situation: 'ACTIVE' },
  })
  await UserProduct.collection.insertOne({
    _id: userProductId,
    userId,
    productId,
    platform: 'curseduca',
    platformUserId: 'member-1',
    status: 'PARA_INATIVAR',
    isPrimary: true,
    classes: [],
    metadata: {
      markedForInactivationAt: new Date('2026-08-01T00:00:00.000Z'),
      markedForInactivationReason: 'guru canceled',
    },
  })
})

const invoke = async (
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
  body: Record<string, unknown>,
) => {
  const json = jest.fn()
  const response = { status: jest.fn().mockReturnThis(), json } as unknown as Response
  const next: NextFunction = jest.fn()
  await handler({ body } as Request, response, next)
  expect(next).not.toHaveBeenCalled()
  expect(json).toHaveBeenCalledTimes(1)
  const envelope = json.mock.calls[0][0]
  expect(envelope).toEqual({ success: true, data: expect.any(Object) })
  return { success: true, ...envelope.data }
}

test('quarantine and revert persist their audit metadata instead of dropping it', async () => {
  await invoke(quarantineUser, { email: ' ALICE@EXAMPLE.TEST ' })
  const quarantined = await UserProduct.findById(userProductId).lean()
  expect(quarantined).toMatchObject({
    status: 'QUARENTENA',
    metadata: {
      quarantinedAt: expect.any(Date),
      quarantineReason: expect.stringContaining('revisão manual'),
    },
  })
  expect(quarantined?.metadata?.markedForInactivationAt).toBeUndefined()

  await invoke(revertInactivationMark, { userProductId: String(userProductId) })
  const reverted = await UserProduct.findById(userProductId).lean()
  expect(reverted).toMatchObject({
    status: 'ACTIVE',
    metadata: { revertedAt: expect.any(Date), revertedBy: 'manual' },
  })
})

test('cleanup supports primary-only and inactive modes', async () => {
  await UserProduct.updateOne({ _id: userProductId }, { $set: { isPrimary: false } })
  await invoke(cleanupDuplicateUserProducts, {
    userProductIds: [String(userProductId)],
    setIsPrimary: true,
  })
  expect(await UserProduct.findById(userProductId).lean()).toMatchObject({
    status: 'PARA_INATIVAR',
    isPrimary: true,
  })

  await invoke(cleanupDuplicateUserProducts, {
    userProductIds: [String(userProductId)],
  })
  expect(await UserProduct.findById(userProductId).lean()).toMatchObject({
    status: 'INACTIVE',
    isPrimary: false,
    metadata: { inactivatedBy: 'cleanup_duplicates' },
  })
})

test('mark stale updates the enrollment and denormalized user status', async () => {
  await UserProduct.updateOne({ _id: userProductId }, { $set: { status: 'ACTIVE' } })
  const payload = await invoke(markStaleInactive, { emails: [' ALICE@EXAMPLE.TEST '] })

  expect(payload).toMatchObject({
    success: true,
    emailsRequested: 1,
    usersFound: 1,
    userProductsModified: 1,
    usersModified: 1,
  })
  expect(await UserProduct.findById(userProductId).lean()).toMatchObject({
    status: 'INACTIVE',
    isPrimary: false,
    metadata: { inactivatedBy: 'mark_stale_inactive' },
  })
  expect(await User.findById(userId).lean()).toMatchObject({
    curseduca: { memberStatus: 'INACTIVE', situation: 'INACTIVE' },
  })
})

test('restore persists audit metadata and removes inactive metadata', async () => {
  await UserProduct.updateOne({ _id: userProductId }, {
    $set: {
      status: 'INACTIVE',
      'metadata.inactivatedAt': new Date(),
      'metadata.inactivatedBy': 'test',
      'metadata.inactivatedReason': 'test',
    },
  })
  await invoke(restoreUserProducts, { userProductIds: [String(userProductId)] })

  const restored = await UserProduct.findById(userProductId).lean()
  expect(restored).toMatchObject({
    status: 'PARA_INATIVAR',
    isPrimary: true,
    metadata: {
      restoredAt: expect.any(Date),
      restoredReason: expect.stringContaining('Restaurado manualmente'),
    },
  })
  expect(restored?.metadata?.inactivatedAt).toBeUndefined()
})

test('fix active updates user and enrollment and persists its audit metadata', async () => {
  await UserProduct.updateOne({ _id: userProductId }, { $set: { status: 'INACTIVE' } })
  const payload = await invoke(fixUsersToActive, { emails: ['alice@example.test'] })

  expect(payload).toMatchObject({
    success: true,
    updatedUsers: 1,
    updatedUserProducts: 1,
  })
  expect(await User.findById(userId).lean()).toMatchObject({
    curseduca: { memberStatus: 'ACTIVE' },
  })
  expect(await UserProduct.findById(userProductId).lean()).toMatchObject({
    status: 'ACTIVE',
    metadata: {
      fixedToActiveAt: expect.any(Date),
      fixedToActiveReason: expect.stringContaining('Correção manual'),
    },
  })
})
