import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import User from '../../src/models/user'
import { getUserStats as legacyHandler } from '../../src/controllers/users.controller'

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>
const getUserStats = legacyHandler as unknown as Handler

type Captured = { status?: number; body?: Record<string, unknown> }

function makeResponse(captured: Captured): Response {
  const res = {
    status(code: number) {
      captured.status = code
      return res
    },
    json(body: unknown) {
      captured.body = body as Record<string, unknown>
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
    instance: { dbName: 'user_platform_stats_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('user_platform_stats_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await User.collection.deleteMany({})
})

describe('GET /api/users/stats — user platform stats characterization', () => {
  it('reports totals, platform buckets and engagement, counting even deleted users in the total', async () => {
    await User.collection.insertMany([
      { email: 'u1@x.test', status: 'ACTIVE', hotmartUserId: 'H1', accessCount: 60, engagement: 'ALTO' },
      { email: 'u2@x.test', estado: 'ativo', curseducaUserId: 'C1', progress: { completedPercentage: 90 } },
      { email: 'u3@x.test', status: 'BLOCKED', discordIds: ['d1'], classId: 'CL1' },
      // No base filter: this deleted, active user still swells totalUsers and activeUsers.
      { email: 'u4@x.test', status: 'ACTIVE', isDeleted: true },
    ])

    const captured: Captured = {}
    await getUserStats(req, makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect(captured.body).toEqual({
      totalUsers: 4,
      activeUsers: 3,
      inactiveUsers: 1,
      bothPlatforms: 1,
      platformStats: {
        hotmartUsers: 2,
        discordUsers: 1,
        curseducaUsers: 1,
        multiPlatformUsers: 0,
      },
      withEngagement: 2,
      averageEngagement: 25,
      topPerformersCount: 1,
      needsAttentionCount: 2,
    })
  })

  it('returns zeros when there are no users', async () => {
    const captured: Captured = {}
    await getUserStats(req, makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect(captured.body).toMatchObject({
      totalUsers: 0,
      activeUsers: 0,
      inactiveUsers: 0,
      bothPlatforms: 0,
      platformStats: { hotmartUsers: 0, discordUsers: 0, curseducaUsers: 0, multiPlatformUsers: 0 },
      withEngagement: 0,
      averageEngagement: 0,
      topPerformersCount: 0,
      needsAttentionCount: 0,
    })
  })

  // Current behaviour: a local 500 envelope that leaks the error via `details`.
  it('answers failures with a local 500 envelope', async () => {
    jest.spyOn(User, 'countDocuments').mockImplementation((() => { throw new Error('boom') }) as never)

    const captured: Captured = {}
    await getUserStats(req, makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect(captured.status).toBe(500)
    expect(captured.body).toMatchObject({ message: 'Erro ao obter estatísticas' })
  })
})
