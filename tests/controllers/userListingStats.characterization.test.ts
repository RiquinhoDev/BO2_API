import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import User from '../../src/models/user'
import { HttpError } from '../../src/security/errorHandling'
import { getUsersInfiniteStats as extractedHandler } from '../../src/services/users/userListingStats.runtime'

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>
const getUsersInfiniteStats = extractedHandler as unknown as Handler

type StatsBody = {
  success: boolean
  data: {
    _id?: unknown
    totalUsers: number
    activeUsers: number
    withEngagement: number
    withProgress: number
  }
  meta: { timestamp: string }
}
type Captured = { status?: number; body?: StatsBody }

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

const req = {} as Request
let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'user_listing_stats_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('user_listing_stats_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await User.collection.deleteMany({})
})

describe('GET /api/users/infiniteStats — listing stats characterization', () => {
  it('aggregates totals, active, engagement and progress over non-deleted users', async () => {
    await User.collection.insertMany([
      { email: 'a@x.test', status: 'ACTIVE', engagementScore: 50, progress: { completedPercentage: 80 } },
      { email: 'b@x.test', estado: 'ativo', progress: { completedPercentage: 0 } },
      { email: 'c@x.test', status: 'BLOCKED', engagementScore: 10 },
      { email: 'd@x.test', isDeleted: true, status: 'ACTIVE', engagementScore: 99 },
    ])

    const captured: Captured = {}
    await getUsersInfiniteStats(req, makeResponse(captured), jest.fn() as unknown as NextFunction)

    const body = captured.body as StatsBody
    expect(body.success).toBe(true)
    expect(typeof body.meta.timestamp).toBe('string')
    // The response returns the raw $group result, including its _id: null.
    // withEngagement counts every non-deleted document: a missing engagementScore
    // still satisfies { $ne: ['$engagementScore', null] } in the pipeline.
    expect(body.data).toEqual({
      _id: null,
      totalUsers: 3,
      activeUsers: 2,
      withEngagement: 3,
      withProgress: 1,
    })
  })

  it('returns a zero snapshot when there are no users', async () => {
    const captured: Captured = {}
    await getUsersInfiniteStats(req, makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect((captured.body as StatsBody).data).toEqual({
      totalUsers: 0,
      activeUsers: 0,
      withEngagement: 0,
      withProgress: 0,
    })
  })

  // SEC-10: failures now route through the central handler with a stable code.
  it('reports failure through next(HttpError) with USER_LISTING_STATS_FAILED', async () => {
    jest.spyOn(User, 'aggregate').mockImplementation((() => { throw new Error('boom') }) as never)

    const captured: Captured = {}
    const next = jest.fn()
    await getUsersInfiniteStats(req, makeResponse(captured), next as unknown as NextFunction)

    expect(captured.body).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
    const error = next.mock.calls[0]?.[0] as HttpError
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 500, code: 'USER_LISTING_STATS_FAILED' })
    expect(error.message).not.toContain('boom')
  })
})
