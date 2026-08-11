import type { NextFunction, Request, Response } from 'express'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import User from '../../src/models/user'
import UserProduct from '../../src/models/UserProduct'
import {
  getInactivationStats,
  listInactivated,
  listPendingInactivation,
} from '../../src/controllers/guruInactivationRead.controller'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'guru_inactivation_read_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('guru_inactivation_read_test')),
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

  const canceled = new mongoose.Types.ObjectId()
  const active = new mongoose.Types.ObjectId()
  const withoutGuru = new mongoose.Types.ObjectId()
  await User.collection.insertMany([
    {
      _id: canceled,
      email: 'canceled@example.test',
      name: 'Canceled Person',
      guru: { status: 'canceled' },
      curseduca: { curseducaUserId: 'member-canceled', memberStatus: 'INACTIVE' },
    },
    {
      _id: active,
      email: 'active@example.test',
      name: 'Active Person',
      guru: { status: 'active' },
      curseduca: { curseducaUserId: 'member-active', memberStatus: 'ACTIVE' },
    },
    {
      _id: withoutGuru,
      email: 'legacy@example.test',
      name: 'Legacy Person',
      curseduca: { curseducaUserId: 'member-legacy', memberStatus: 'INACTIVE' },
    },
  ])

  const now = new Date()
  await UserProduct.collection.insertMany([
    {
      userId: canceled,
      platform: 'curseduca',
      platformUserId: 'member-canceled',
      status: 'PARA_INATIVAR',
      classes: [{ classId: 'class-new', className: 'Newest', joinedAt: now }],
      metadata: { markedForInactivationAt: now, markedForInactivationReason: 'canceled' },
    },
    {
      userId: canceled,
      platform: 'curseduca',
      platformUserId: 'member-canceled',
      status: 'PARA_INATIVAR',
      classes: [{ classId: 'class-old', className: 'Older', joinedAt: now }],
      metadata: {
        markedForInactivationAt: new Date(now.getTime() - 60_000),
        markedForInactivationReason: 'older plan',
      },
    },
    {
      userId: active,
      platform: 'curseduca',
      platformUserId: 'member-active',
      status: 'PARA_INATIVAR',
      classes: [],
      metadata: { markedForInactivationAt: now },
    },
    {
      userId: withoutGuru,
      platform: 'curseduca',
      platformUserId: 'member-legacy',
      status: 'PARA_INATIVAR',
      classes: [],
      metadata: { markedForInactivationAt: now },
    },
    {
      userId: canceled,
      platform: 'curseduca',
      platformUserId: 'member-canceled',
      status: 'INACTIVE',
      classes: [],
      metadata: {
        inactivatedAt: now,
        inactivatedBy: 'guru_integration',
        inactivatedReason: 'CursEduca access removed',
      },
    },
  ])
})

const invoke = async (
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
  query: Request['query'] = {},
) => {
  const json = jest.fn()
  const response = { json, status: jest.fn().mockReturnThis() } as unknown as Response
  const next: NextFunction = jest.fn()
  await handler({ query } as Request, response, next)
  expect(next).not.toHaveBeenCalled()
  expect(json).toHaveBeenCalledTimes(1)
  return json.mock.calls[0][0]
}

test('lists only canceled or status-less members and keeps the newest duplicate', async () => {
  const payload = await invoke(listPendingInactivation)
  expect(payload).toMatchObject({ success: true, data: { count: 2, total: 4, filtered: 1, deduplicated: 1 } })
  expect(payload.data.pendingList.map((item: { email: string }) => item.email).sort()).toEqual([
    'canceled@example.test',
    'legacy@example.test',
  ])
  const canceled = payload.data.pendingList.find(
    (item: { email: string }) => item.email === 'canceled@example.test',
  )
  expect(canceled.classes[0].classId).toBe('class-new')
})

test('uses the same pending rule for stats and counts Guru inactivations', async () => {
  const payload = await invoke(getInactivationStats)
  expect(payload).toEqual({
    success: true,
    data: {
      pendingInactivation: 2,
      pendingInactivationTotal: 4,
      inactivatedToday: 1,
      totalInactivatedByGuru: 1,
    },
  })
})

test('preserves inactive filtering, pagination and response fields', async () => {
  const payload = await invoke(listInactivated, { page: '1', limit: '10000', email: 'CANCELED' })
  expect(payload).toMatchObject({
    success: true,
    data: {
      total: 1,
      page: 1,
      limit: 200,
      pages: 1,
      inactivatedList: [{
        email: 'canceled@example.test',
        name: 'Canceled Person',
        curseducaUserId: 'member-canceled',
        guruStatus: 'canceled',
        curseducaStatus: 'INACTIVE',
        inactivatedBy: 'guru_integration',
        inactivatedReason: 'CursEduca access removed',
      }],
    },
  })
})
