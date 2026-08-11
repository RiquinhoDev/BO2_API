import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import User from '../../src/models/user'
import UserProduct from '../../src/models/UserProduct'
import Product from '../../src/models/product/Product'
import { HttpError } from '../../src/security/errorHandling'
import { getUsersStatsOverview as extractedOverviewHandler } from '../../src/services/users/userStatsOverview.runtime'

// The extracted handler is a RequestHandler; this narrows it to the awaited
// shape the tests invoke and assert against.
type OverviewHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>
const getUsersStatsOverview = extractedOverviewHandler as unknown as OverviewHandler

type StatsBody = {
  success: boolean
  _v2Enabled: boolean
  data: {
    totalUsers: number
    byPlatform: Array<{ _id: string; count: number }>
    byProduct: Array<{ _id: unknown; productName: string; count: number }>
  }
}

type Captured = {
  status?: number
  body?: StatsBody
}

/**
 * Minimal Express double: records the single terminal write. The handler
 * answers the happy path with `res.json` and reports failure with
 * `next(HttpError)`, so both a `json`/`status` sink and a `next` spy are
 * supplied and each test asserts which one fired.
 */
function makeResponse(captured: Captured): Response {
  const res = {
    status(code: number) {
      captured.status = code
      return res
    },
    json(body: unknown) {
      captured.body = body as StatsBody
      return res
    },
  }
  return res as unknown as Response
}

const groupIdOf = (pipeline: Array<Record<string, unknown>>): unknown => {
  const stage = pipeline.find(candidate => '$group' in candidate)
  return (stage?.$group as { _id: unknown } | undefined)?._id
}

const hasMatchStage = (pipeline: Array<Record<string, unknown>>): boolean =>
  pipeline.some(candidate => '$match' in candidate)

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'user_stats_overview_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('user_stats_overview_test')),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await Promise.all([
    User.collection.deleteMany({}),
    UserProduct.collection.deleteMany({}),
    Product.collection.deleteMany({}),
  ])
})

describe('GET /api/users/stats/overview — stats overview characterization', () => {
  it('counts every enrollment by platform and product without filtering status, soft-delete or honouring product orphans', async () => {
    // Two hotmart products let a single user inflate the platform bucket; a
    // curseduca and a discord product keep each byProduct row distinct.
    const prodHotmartA = new mongoose.Types.ObjectId()
    const prodHotmartB = new mongoose.Types.ObjectId()
    const prodCurseduca = new mongoose.Types.ObjectId()
    const prodDiscord = new mongoose.Types.ObjectId()
    const orphanProductId = new mongoose.Types.ObjectId() // no matching Product

    const userLive = new mongoose.Types.ObjectId()
    const userSoftDeleted = new mongoose.Types.ObjectId()
    const userCancelled = new mongoose.Types.ObjectId()
    const userParaInativar = new mongoose.Types.ObjectId()
    const userQuarentena = new mongoose.Types.ObjectId()
    const userNoStatus = new mongoose.Types.ObjectId()
    const userOrphan = new mongoose.Types.ObjectId()

    await Product.collection.insertMany([
      { _id: prodHotmartA, code: 'HOTMART-A', name: 'Curso Hotmart A', platform: 'hotmart' },
      { _id: prodHotmartB, code: 'HOTMART-B', name: 'Curso Hotmart B', platform: 'hotmart' },
      { _id: prodCurseduca, code: 'CURSEDUCA', name: 'Curso Curseduca', platform: 'curseduca' },
      { _id: prodDiscord, code: 'DISCORD', name: 'Curso Discord', platform: 'discord' },
    ])

    await User.collection.insertMany([
      { _id: userLive, name: 'Live', email: 'live@example.test' },
      // Soft-deleted, yet still counted by the unfiltered countDocuments().
      { _id: userSoftDeleted, name: 'Soft', email: 'soft@example.test', isDeleted: true },
      { _id: userCancelled, name: 'Cancelled', email: 'cancelled@example.test' },
      { _id: userParaInativar, name: 'ParaInativar', email: 'para@example.test' },
      { _id: userQuarentena, name: 'Quarentena', email: 'quarentena@example.test' },
      { _id: userNoStatus, name: 'NoStatus', email: 'nostatus@example.test' },
      { _id: userOrphan, name: 'Orphan', email: 'orphan@example.test' },
    ])

    // Six typed EnrollmentStatus values plus a seventh case with the field
    // absent: ACTIVE, INACTIVE, SUSPENDED, CANCELLED, PARA_INATIVAR, QUARENTENA,
    // and status absent. QUARENTENA is a typed value the schema enum omits, so
    // it is inserted straight through the collection (validation bypassed).
    await UserProduct.collection.insertMany([
      { userId: userLive, productId: prodHotmartA, platform: 'hotmart', status: 'ACTIVE' },
      { userId: userLive, productId: prodHotmartB, platform: 'hotmart', status: 'INACTIVE' },
      { userId: userSoftDeleted, productId: prodCurseduca, platform: 'curseduca', status: 'SUSPENDED' },
      { userId: userCancelled, productId: prodDiscord, platform: 'discord', status: 'CANCELLED' },
      { userId: userParaInativar, productId: prodHotmartA, platform: 'hotmart', status: 'PARA_INATIVAR' },
      { userId: userQuarentena, productId: prodCurseduca, platform: 'curseduca', status: 'QUARENTENA' },
      { userId: userNoStatus, productId: prodDiscord, platform: 'discord' }, // status absent
      { userId: userOrphan, productId: orphanProductId, platform: 'hotmart', status: 'ACTIVE' }, // orphan
    ])

    const countSpy = jest.spyOn(User, 'countDocuments')
    const aggregateSpy = jest.spyOn(UserProduct, 'aggregate')

    const captured: Captured = {}
    const next = jest.fn()
    await getUsersStatsOverview(
      {} as Request,
      makeResponse(captured),
      next as unknown as NextFunction,
    )

    expect(next).not.toHaveBeenCalled()
    expect(captured.status).toBeUndefined()

    const body = captured.body as StatsBody
    expect(body.success).toBe(true)

    // Soft-deleted user is included: seven user documents, no isDeleted filter.
    expect(body.data.totalUsers).toBe(7)

    // byPlatform over-counts: hotmart shows 3 enrollments though only two
    // distinct users are on hotmart — userLive alone contributes two products.
    const byPlatform = [...body.data.byPlatform].sort((a, b) => a._id.localeCompare(b._id))
    expect(byPlatform).toEqual([
      { _id: 'curseduca', count: 2 },
      { _id: 'discord', count: 2 },
      { _id: 'hotmart', count: 3 },
    ])

    // byProduct keeps each product separate, so the same over-enrolled user is
    // attributed correctly (A=2, B=1) and never conflated across the platform.
    const byProduct = body.data.byProduct
      .map(row => ({ _id: String(row._id), productName: row.productName, count: row.count }))
      .sort((a, b) => a.productName.localeCompare(b.productName))
    expect(byProduct).toEqual([
      { _id: String(prodCurseduca), productName: 'Curso Curseduca', count: 2 },
      { _id: String(prodDiscord), productName: 'Curso Discord', count: 2 },
      { _id: String(prodHotmartA), productName: 'Curso Hotmart A', count: 2 },
      { _id: String(prodHotmartB), productName: 'Curso Hotmart B', count: 1 },
    ])

    // Orphan enrollment (no matching product) is dropped from both breakdowns:
    // total counted enrollments = 7, not the 8 inserted.
    const platformTotal = byPlatform.reduce((sum, row) => sum + row.count, 0)
    const productTotal = byProduct.reduce((sum, row) => sum + row.count, 0)
    expect(platformTotal).toBe(7)
    expect(productTotal).toBe(7)

    // Sequential access, never parallel: countDocuments, then platform, then
    // product. Two aggregations, neither of which filters status or user.
    expect(countSpy).toHaveBeenCalledTimes(1)
    expect(countSpy.mock.calls[0]).toHaveLength(0)
    expect(aggregateSpy).toHaveBeenCalledTimes(2)
    expect(countSpy.mock.invocationCallOrder[0]).toBeLessThan(
      aggregateSpy.mock.invocationCallOrder[0],
    )
    const platformPipeline = aggregateSpy.mock.calls[0]?.[0] as unknown as Array<Record<string, unknown>>
    const productPipeline = aggregateSpy.mock.calls[1]?.[0] as unknown as Array<Record<string, unknown>>
    expect(groupIdOf(platformPipeline)).toBe('$product.platform')
    expect(groupIdOf(productPipeline)).toBe('$product._id')
    expect(hasMatchStage(platformPipeline)).toBe(false)
    expect(hasMatchStage(productPipeline)).toBe(false)
  })

  it('returns an empty snapshot when there are no users or enrollments', async () => {
    const captured: Captured = {}
    const next = jest.fn()
    await getUsersStatsOverview(
      {} as Request,
      makeResponse(captured),
      next as unknown as NextFunction,
    )

    expect(next).not.toHaveBeenCalled()
    expect(captured.body).toEqual({
      success: true,
      data: {
        totalUsers: 0,
        byPlatform: [],
        byProduct: [],
      },
    })
  })

  // SEC-10: the legacy handler answered 500 with error.message in the body. The
  // successor routes failure through the central handler with a stable code and
  // never writes a response itself. This is a deliberate change of behaviour.
  it('reports failure through next(HttpError) with USER_STATS_OVERVIEW_FAILED and leaks nothing', async () => {
    jest.spyOn(User, 'countDocuments').mockImplementation(
      (() => Promise.reject(new Error('boom'))) as never,
    )

    const captured: Captured = {}
    const next = jest.fn()
    await getUsersStatsOverview(
      {} as Request,
      makeResponse(captured),
      next as unknown as NextFunction,
    )

    expect(captured.body).toBeUndefined()
    expect(captured.status).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
    const error = next.mock.calls[0]?.[0] as HttpError
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({
      status: 500,
      code: 'USER_STATS_OVERVIEW_FAILED',
    })
    expect(error.message).not.toContain('boom')
  })
})
