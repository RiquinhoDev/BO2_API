import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import User from '../../src/models/user'
import { cacheService } from '../../src/services/cache.service'
import { HttpError } from '../../src/security/errorHandling'
import { getUsersInfinite as extractedHandler } from '../../src/services/users/userInfiniteListing.runtime'

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>
const getUsersInfinite = extractedHandler as unknown as Handler

type Body = Record<string, any>
type Captured = { status?: number; body?: Body }

function makeResponse(captured: Captured): Response {
  const res = {
    status(code: number) {
      captured.status = code
      return res
    },
    json(body: unknown) {
      captured.body = body as Body
      return res
    },
  }
  return res as unknown as Response
}

const request = (query: Record<string, unknown>): Request => ({ query } as unknown as Request)
let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'user_infinite_listing_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('user_infinite_listing_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  jest.spyOn(cacheService, 'get').mockResolvedValue(null)
  jest.spyOn(cacheService, 'set').mockResolvedValue(undefined)
  await User.collection.deleteMany({})
})

const seedThree = async () => {
  await User.collection.insertMany([
    { _id: new mongoose.Types.ObjectId(), name: 'A', email: 'a@x.test', status: 'ACTIVE', accessCount: 3 },
    { _id: new mongoose.Types.ObjectId(), name: 'B', email: 'b@x.test', status: 'ACTIVE' },
    { _id: new mongoose.Types.ObjectId(), name: 'C', email: 'c@x.test', estado: 'ativo' },
    { _id: new mongoose.Types.ObjectId(), name: 'D', email: 'd@x.test', isDeleted: true },
  ])
}

describe('GET /api/users/infinite — infinite listing characterization', () => {
  it('returns a cursor page of non-deleted users with meta and count', async () => {
    await seedThree()
    const captured: Captured = {}
    await getUsersInfinite(request({}), makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect(captured.status).toBe(200)
    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect(body.hasMore).toBe(false)
    expect(body.users).toHaveLength(3)
    expect(body.meta).toMatchObject({ limit: 50, returned: 3, preCalculated: false })
    // No cursor -> the estimated document count is used (counts even the deleted doc).
    expect(body.totalCount).toBe(4)
    expect(body.nextCursor).toBeTruthy()
    expect(typeof body.timestamp).toBe('string')
    expect(cacheService.set).toHaveBeenCalledTimes(1)
  })

  it('caps the page at the floored limit and flags hasMore, dropping the extra row', async () => {
    // The limit is clamped to [10, 100]; with 11 users a floor-10 page overflows.
    await User.collection.insertMany(
      Array.from({ length: 11 }, (_, i) => ({
        _id: new mongoose.Types.ObjectId(),
        name: `U${i}`,
        email: `u${i}@x.test`,
        status: 'ACTIVE',
      })),
    )
    const captured: Captured = {}
    await getUsersInfinite(request({ limit: '2' }), makeResponse(captured), jest.fn() as unknown as NextFunction)

    const body = captured.body as Body
    expect(body.meta.limit).toBe(10)
    expect(body.users).toHaveLength(10)
    expect(body.hasMore).toBe(true)
  })

  it('serves a cache hit verbatim with fromCache flag and skips aggregation', async () => {
    const aggregate = jest.spyOn(User, 'aggregate')
    jest.spyOn(cacheService, 'get').mockResolvedValue({
      success: true,
      users: [],
      hasMore: false,
      nextCursor: null,
      cachedAt: 123,
    } as never)

    const captured: Captured = {}
    await getUsersInfinite(request({}), makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect(captured.status).toBe(200)
    expect(captured.body).toMatchObject({ success: true, fromCache: true })
    expect(aggregate).not.toHaveBeenCalled()
  })

  it('bypasses the cache when forceRefresh is set', async () => {
    await seedThree()
    const getSpy = jest.spyOn(cacheService, 'get').mockResolvedValue(null)
    const captured: Captured = {}
    await getUsersInfinite(request({ forceRefresh: 'true' }), makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect(getSpy).not.toHaveBeenCalled()
    expect((captured.body as Body).success).toBe(true)
  })

  // SEC-10: failures now route through the central handler with a stable code,
  // replacing the legacy nodeEnv-branched local 500.
  it('reports failure through next(HttpError) with USER_INFINITE_LISTING_FAILED', async () => {
    jest.spyOn(User, 'aggregate').mockImplementation((() => { throw new Error('boom') }) as never)
    const captured: Captured = {}
    const next = jest.fn()
    await getUsersInfinite(request({}), makeResponse(captured), next as unknown as NextFunction)

    expect(captured.body).toBeUndefined()
    const error = next.mock.calls[0]?.[0] as HttpError
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 500, code: 'USER_INFINITE_LISTING_FAILED' })
    expect(error.message).not.toContain('boom')
  })
})
