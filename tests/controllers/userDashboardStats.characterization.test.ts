import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import User from '../../src/models/user'
import SyncHistory from '../../src/models/SyncHistory'
import { HttpError } from '../../src/security/errorHandling'
import { getDashboardStats as extractedHandler } from '../../src/services/users/userDashboardStats.runtime'

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>
const getDashboardStats = extractedHandler as unknown as Handler

type DashboardBody = {
  success: boolean
  data: Record<string, unknown>
}
type Captured = { status?: number; body?: DashboardBody }

function makeResponse(captured: Captured): Response {
  const res = {
    status(code: number) {
      captured.status = code
      return res
    },
    json(body: unknown) {
      captured.body = body as DashboardBody
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
    instance: { dbName: 'user_dashboard_stats_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('user_dashboard_stats_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await Promise.all([
    User.collection.deleteMany({}),
    SyncHistory.collection.deleteMany({}),
  ])
})

describe('GET /api/users/dashboard-stats — dashboard stats characterization', () => {
  it('computes totals, platform buckets, exclusive distribution and engagement', async () => {
    await User.collection.insertMany([
      { email: 'u1@x.test', hotmartUserId: 'H1', status: 'ACTIVE', combined: { engagement: { score: 60 } } },
      { email: 'u2@x.test', curseducaUserId: 'C1', combined: { status: 'ACTIVE', engagement: {} }, hotmart: { engagement: { engagementScore: 20 } } },
      { email: 'u3@x.test', hotmartUserId: 'H3', curseducaUserId: 'C3', status: 'ACTIVE' },
      { email: 'u4@x.test', discord: { discordIds: ['d1'] }, status: 'INACTIVE' },
      { email: 'u5@x.test' },
      { email: 'u6@x.test', isDeleted: true, hotmartUserId: 'H6', status: 'ACTIVE' },
    ])
    const hotmartSyncAt = new Date('2026-08-01T10:00:00.000Z')
    await SyncHistory.collection.insertMany([
      { type: 'hotmart', status: 'completed', completedAt: hotmartSyncAt },
      { type: 'hotmart', status: 'completed', completedAt: new Date('2026-07-01T10:00:00.000Z') },
    ])

    const captured: Captured = {}
    await getDashboardStats(req, makeResponse(captured), jest.fn() as unknown as NextFunction)

    const body = captured.body as DashboardBody
    expect(body.success).toBe(true)
    expect(body.data).toEqual({
      totalUsers: 5,
      activeUsers: 3,
      inactiveUsers: 2,
      withProgress: 2,
      withEngagement: 2,
      averageEngagement: 16,
      topPerformersCount: 1,
      needsAttentionCount: 1,
      platformStats: {
        hotmartUsers: 2,
        curseducaUsers: 2,
        discordUsers: 1,
        multiPlatformUsers: 0,
      },
      platformDistribution: {
        hotmartOnly: 1,
        curseducaOnly: 1,
        bothPlatforms: 1,
        noPlatform: 2,
      },
      lastHotmartSync: hotmartSyncAt,
      lastCurseducaSync: null,
    })
  })

  it('returns a zeroed dashboard when there are no users', async () => {
    const captured: Captured = {}
    await getDashboardStats(req, makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect(captured.body?.data).toMatchObject({
      totalUsers: 0,
      activeUsers: 0,
      inactiveUsers: 0,
      withEngagement: 0,
      averageEngagement: 0,
      topPerformersCount: 0,
      needsAttentionCount: 0,
      platformStats: { hotmartUsers: 0, curseducaUsers: 0, discordUsers: 0, multiPlatformUsers: 0 },
      platformDistribution: { hotmartOnly: 0, curseducaOnly: 0, bothPlatforms: 0, noPlatform: 0 },
      lastHotmartSync: null,
      lastCurseducaSync: null,
    })
  })

  // SEC-10: failures now route through the central handler with a stable code.
  it('reports failure through next(HttpError) with USER_DASHBOARD_STATS_FAILED', async () => {
    jest.spyOn(User, 'countDocuments').mockImplementation((() => { throw new Error('boom') }) as never)

    const captured: Captured = {}
    const next = jest.fn()
    await getDashboardStats(req, makeResponse(captured), next as unknown as NextFunction)

    expect(captured.body).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
    const error = next.mock.calls[0]?.[0] as HttpError
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 500, code: 'USER_DASHBOARD_STATS_FAILED' })
    expect(error.message).not.toContain('boom')
  })
})
