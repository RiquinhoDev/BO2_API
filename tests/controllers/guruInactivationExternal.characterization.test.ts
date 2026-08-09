import type { NextFunction, Request, Response } from 'express'
import axios from 'axios'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import User from '../../src/models/user'
import UserProduct from '../../src/models/UserProduct'
import type {
  GuruInactivationBulkInput,
  GuruInactivationSingleInput,
} from '../../src/security/guruDestructiveInput'

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    patch: jest.fn(),
    create: jest.fn(() => ({
      get: jest.fn(),
      interceptors: { request: { use: jest.fn() } },
    })),
    isAxiosError: jest.fn((error: unknown) =>
      typeof error === 'object' && error !== null && 'isAxiosError' in error,
    ),
  },
}))
jest.mock('../../src/services/requestDrivenRuntimeConfig', () => ({
  getGuruUserToken: jest.fn(() => 'offline-guru-token'),
  getOptionalCurseducaRuntimeSettings: jest.fn(() => ({
    apiUrl: 'https://offline.invalid',
    accessToken: 'offline-token',
    apiKey: 'offline-key',
  })),
}))

import {
  cleanupInactivationList,
  diagnoseUsers,
  inactivateBulk,
  inactivateSingle,
} from '../../src/controllers/guru.inactivation.controller'

let mongoServer: MongoMemoryServer
let userId: mongoose.Types.ObjectId
let userProductId: mongoose.Types.ObjectId

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'guru_inactivation_external_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('guru_inactivation_external_test')),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.clearAllMocks()
  await Promise.all([User.collection.deleteMany({}), UserProduct.collection.deleteMany({})])
  userId = new mongoose.Types.ObjectId()
  userProductId = new mongoose.Types.ObjectId()
  await User.collection.insertOne({
    _id: userId,
    email: 'alice@example.test',
    name: 'Alice',
    curseduca: { curseducaUserId: '101', memberStatus: 'ACTIVE' },
  })
  await UserProduct.collection.insertOne({
    _id: userProductId,
    userId,
    productId: new mongoose.Types.ObjectId(),
    platform: 'curseduca',
    platformUserId: '101',
    status: 'PARA_INATIVAR',
    classes: [],
    metadata: {},
  })
})

const next = (): NextFunction => jest.fn()

const response = () => {
  const json = jest.fn()
  return {
    value: { status: jest.fn().mockReturnThis(), json } as unknown as Response,
    json,
  }
}

const singleInput = (): GuruInactivationSingleInput => ({
  params: {},
  query: {},
  body: { userProductId: String(userProductId) },
})

const bulkInput = (ids: string[]): GuruInactivationBulkInput => ({
  params: {},
  query: {},
  body: { userProductIds: ids },
})

test('single calls CursEduca once then persists enrollment and user state', async () => {
  jest.mocked(axios.patch).mockResolvedValue({ status: 200, data: { ok: true } })
  const res = response()

  await inactivateSingle(singleInput(), res.value, next())

  expect(axios.patch).toHaveBeenCalledTimes(1)
  expect(axios.patch).toHaveBeenCalledWith(
    'https://offline.invalid/inactivate-member',
    { member: { id: 101 } },
    expect.objectContaining({ timeout: 10000 }),
  )
  expect(res.json).toHaveBeenCalledWith({
    success: true,
    message: 'Membro inativado com sucesso',
    memberId: '101',
    email: 'alice@example.test',
  })
  expect(await UserProduct.findById(userProductId).lean()).toMatchObject({
    status: 'INACTIVE',
    metadata: {
      inactivatedBy: 'guru_integration',
      inactivatedAt: expect.any(Date),
      curseducaResponse: { ok: true },
    },
  })
  expect(await User.findById(userId).lean()).toMatchObject({
    curseduca: { memberStatus: 'INACTIVE', inactivatedAt: expect.any(Date) },
  })
})

test('single records a remote failure without changing the enrollment status', async () => {
  jest.mocked(axios.patch).mockRejectedValue(new Error('offline remote failure'))
  const res = response()

  await inactivateSingle(singleInput(), res.value, next())

  expect(res.value.status).toHaveBeenCalledWith(500)
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: 'Erro ao inativar no CursEduca',
    error: 'offline remote failure',
  })
  expect(await UserProduct.findById(userProductId).lean()).toMatchObject({
    status: 'PARA_INATIVAR',
    metadata: {
      inactivationError: 'offline remote failure',
      inactivationAttemptAt: expect.any(Date),
    },
  })
})

test('bulk deduplicates the same member and performs only one remote call', async () => {
  const duplicateId = new mongoose.Types.ObjectId()
  await UserProduct.collection.insertOne({
    _id: duplicateId,
    userId,
    productId: new mongoose.Types.ObjectId(),
    platform: 'curseduca',
    platformUserId: '101',
    status: 'PARA_INATIVAR',
    classes: [],
    metadata: {},
  })
  jest.mocked(axios.patch).mockResolvedValue({ status: 200, data: { ok: true } })
  const res = response()

  await inactivateBulk(
    bulkInput([String(userProductId), String(duplicateId)]),
    res.value,
    next(),
  )

  expect(axios.patch).toHaveBeenCalledTimes(1)
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    processed: 1,
    succeeded: 1,
    failed: 0,
  }))
  expect(await UserProduct.findById(userProductId).lean()).toMatchObject({
    status: 'INACTIVE',
    metadata: { inactivatedBy: 'guru_integration_bulk' },
  })
  expect(await UserProduct.findById(duplicateId).lean()).toMatchObject({
    status: 'INACTIVE',
    metadata: { inactivatedBy: 'bulk_dedup' },
  })
})

test('bulk isolates a missing member id without contacting CursEduca', async () => {
  await UserProduct.updateOne(
    { _id: userProductId },
    { $unset: { platformUserId: 1 } },
  )
  await User.updateOne(
    { _id: userId },
    { $unset: { 'curseduca.curseducaUserId': 1 } },
  )
  const res = response()

  await inactivateBulk(bulkInput([String(userProductId)]), res.value, next())

  expect(axios.patch).not.toHaveBeenCalled()
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    processed: 1,
    succeeded: 0,
    failed: 1,
    details: [expect.objectContaining({
      userProductId,
      success: false,
      error: 'curseducaUserId não encontrado',
    })],
  }))
})
test('single rejects an empty selector before reading or calling CursEduca', async () => {
  const res = response()
  const input: GuruInactivationSingleInput = { params: {}, query: {}, body: {} }

  await inactivateSingle(input, res.value, next())

  expect(res.value.status).toHaveBeenCalledWith(400)
  expect(res.json).toHaveBeenCalledWith({
    success: false,
    message: 'Deve fornecer userProductId ou curseducaUserId',
  })
  expect(axios.patch).not.toHaveBeenCalled()
})
test('cleanup reconciles an API-inactive member and updates the stale user cache', async () => {
  jest.mocked(axios.get).mockResolvedValue({
    status: 200,
    data: { situation: 'INACTIVE', name: 'Alice' },
  })
  const res = response()

  await cleanupInactivationList({ body: {} } as Request, res.value, next())

  expect(axios.get).toHaveBeenCalledWith(
    'https://offline.invalid/members/101',
    expect.objectContaining({ timeout: 10000 }),
  )
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    cleaned: { total: 1, curseducaInactive: 1, guruActive: 0 },
    kept: 0,
    total: 1,
  }))
  expect(await UserProduct.findById(userProductId).lean()).toMatchObject({
    status: 'INACTIVE',
    metadata: { inactivatedBy: 'cleanup_api_check' },
  })
  expect(await User.findById(userId).lean()).toMatchObject({
    curseduca: { memberStatus: 'INACTIVE', situation: 'INACTIVE' },
  })
})

test('diagnose combines database state with the mocked CursEduca member state', async () => {
  jest.mocked(axios.get).mockResolvedValue({
    status: 200,
    data: { data: { situation: 'ACTIVE', name: 'Alice Remote' } },
  })
  const res = response()

  await diagnoseUsers({ body: { emails: ['alice@example.test'] } } as Request, res.value, next())

  expect(res.json).toHaveBeenCalledWith({
    success: true,
    results: [expect.objectContaining({
      email: 'alice@example.test',
      found: true,
      db: expect.objectContaining({
        curseducaMemberStatus: 'ACTIVE',
        curseducaUserId: '101',
      }),
      userProduct: expect.objectContaining({
        status: 'PARA_INATIVAR',
        platformUserId: '101',
      }),
      curseducaApi: expect.objectContaining({
        status: 200,
        situation: 'ACTIVE',
        name: 'Alice Remote',
      }),
    })],
  })
})