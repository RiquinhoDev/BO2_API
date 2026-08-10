import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import {
  createCheckAndUpdateClassHistoryController,
  createSyncCompleteController,
  createSyncHotmartClassesController,
} from '../../src/controllers/classes/hotmartClassSync.controller'
import { HotmartClassSyncService, type Clock } from '../../src/services/classes/hotmartClassSync.service'
import { MongooseHotmartClassSyncWriter } from '../../src/services/classes/mongooseHotmartClassSync.writer'
import type { HotmartClubClient, HotmartClubPage, HotmartClubUser } from '../../src/services/classes/hotmartClubClient'
import type { Sleeper } from '../../src/services/classes/sleeper'
import { HttpError } from '../../src/security/errorHandling'
import { Class } from '../../src/models/Class'
import { User } from '../../src/models'
import StudentClassHistory from '../../src/models/StudentClassHistory'
import SyncHistory from '../../src/models/SyncHistory'

type Body = Record<string, unknown>
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

const emptyReq = () => ({ body: {}, params: {}, query: {} } as unknown as Request)
const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))

class FakeHotmartClubClient implements HotmartClubClient {
  configured = true
  tokenError: Error | null = null
  private pages: HotmartClubPage[] = [{ users: [], nextPageToken: null }]
  private index = 0

  setPages(pages: Array<{ users: HotmartClubUser[]; nextPageToken: string | null }>) {
    this.pages = pages
    this.index = 0
  }

  isConfigured(): boolean {
    return this.configured
  }

  async getAccessToken(): Promise<string> {
    if (this.tokenError) throw this.tokenError
    return 'fake-token'
  }

  async fetchUsersPage(): Promise<HotmartClubPage> {
    const page = this.pages[this.index] ?? { users: [], nextPageToken: null }
    this.index++
    return page
  }
}

class FakeSleeper implements Sleeper {
  waits: number[] = []
  async wait(ms: number): Promise<void> {
    this.waits.push(ms)
  }
}

const fixedClock: Clock = { now: () => new Date('2026-03-04T05:06:07.000Z') }
let client: FakeHotmartClubClient
let sleeper: FakeSleeper
let handlers: {
  syncHotmartClasses: RequestHandler
  checkAndUpdateClassHistory: RequestHandler
  syncComplete: RequestHandler
}

function buildHandlers() {
  const service = new HotmartClassSyncService(new MongooseHotmartClassSyncWriter(), client, sleeper, fixedClock)
  return {
    syncHotmartClasses: createSyncHotmartClassesController(service),
    checkAndUpdateClassHistory: createCheckAndUpdateClassHistoryController(service),
    syncComplete: createSyncCompleteController(service),
  }
}

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'hotmart_class_sync_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('hotmart_class_sync_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  client = new FakeHotmartClubClient()
  sleeper = new FakeSleeper()
  handlers = buildHandlers()
  await Promise.all([
    Class.collection.deleteMany({}),
    User.collection.deleteMany({}),
    StudentClassHistory.collection.deleteMany({}),
    SyncHistory.collection.deleteMany({}),
  ])
})

describe('hotmartClassSync — syncHotmartClasses', () => {
  it('creates classes across two pages, waits 200ms per page, and completes the record', async () => {
    client.setPages([
      { users: [{ email: 'a@x.test', class_id: 'H1' }], nextPageToken: 'p2' },
      { users: [{ email: 'b@x.test', class_id: 'H2' }], nextPageToken: null },
    ])
    await User.collection.insertOne({ _id: oid(1), email: 'a@x.test', classId: 'H1', combined: { status: 'ACTIVE' } })

    const captured: Captured = {}
    await handlers.syncHotmartClasses(emptyReq(), makeResponse(captured), jest.fn() as unknown as NextFunction)

    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect((body.classIds as string[]).sort()).toEqual(['H1', 'H2'])
    expect(sleeper.waits).toEqual([200, 200]) // one wait per page, no real sleeping

    const cls = await Class.findOne({ classId: 'H1' }).lean()
    expect(cls?.source).toBe('hotmart_sync')
    expect(cls?.studentCount).toBe(1)
    const record = await SyncHistory.findOne({ type: 'hotmart' }).sort({ startedAt: -1 }).lean()
    expect(record?.status).toBe('completed')
  })

  it('maps a token failure to a 500 SEC-10 and marks the record failed', async () => {
    client.tokenError = new Error('token boom')
    const next = jest.fn()
    await handlers.syncHotmartClasses(emptyReq(), makeResponse({}), next as unknown as NextFunction)

    expect((next.mock.calls[0]?.[0] as HttpError)).toMatchObject({ status: 500, code: 'HOTMART_CLASS_SYNC_FAILED' })
    const record = await SyncHistory.findOne({ type: 'hotmart' }).sort({ startedAt: -1 }).lean()
    expect(record?.status).toBe('failed')
  })

  it('is fail-closed with no config: 503, no sync record created', async () => {
    client.configured = false
    const next = jest.fn()
    await handlers.syncHotmartClasses(emptyReq(), makeResponse({}), next as unknown as NextFunction)

    expect((next.mock.calls[0]?.[0] as HttpError)).toMatchObject({ status: 503, code: 'HOTMART_SYNC_NOT_CONFIGURED' })
    expect(await SyncHistory.countDocuments({})).toBe(0)
  })
})

describe('hotmartClassSync — checkAndUpdateClassHistory', () => {
  it('follows two pages, moves changed users, and logs history', async () => {
    await User.collection.insertMany([
      { _id: oid(10), email: 'u1@x.test', classId: 'OLD1' },
      { _id: oid(11), email: 'u2@x.test', classId: 'OLD2' },
    ])
    client.setPages([
      { users: [{ email: 'u1@x.test', class_id: 'NEW1' }], nextPageToken: 'p2' },
      { users: [{ email: 'u2@x.test', class_id: 'NEW2' }], nextPageToken: null },
    ])

    const captured: Captured = {}
    await handlers.checkAndUpdateClassHistory(emptyReq(), makeResponse(captured), jest.fn() as unknown as NextFunction)

    const stats = (captured.body as Body).stats as Body
    expect(stats.changesDetected).toBe(2)
    expect(stats.pagesProcessed).toBe(2)
    expect(sleeper.waits).toEqual([200]) // sleeps only between pages, not after the last
    expect(await StudentClassHistory.countDocuments({})).toBe(2)
    expect((await User.findById(oid(10)).lean())?.classId).toBe('NEW1')
  })

  it('maps a token failure to a 500 SEC-10', async () => {
    client.tokenError = new Error('token boom')
    const next = jest.fn()
    await handlers.checkAndUpdateClassHistory(emptyReq(), makeResponse({}), next as unknown as NextFunction)
    expect((next.mock.calls[0]?.[0] as HttpError)).toMatchObject({ status: 500, code: 'HOTMART_CLASS_HISTORY_CHECK_FAILED' })
  })

  it('is fail-closed with no config: 503', async () => {
    client.configured = false
    const next = jest.fn()
    await handlers.checkAndUpdateClassHistory(emptyReq(), makeResponse({}), next as unknown as NextFunction)
    expect((next.mock.calls[0]?.[0] as HttpError)).toMatchObject({ status: 503, code: 'HOTMART_SYNC_NOT_CONFIGURED' })
  })
})

describe('hotmartClassSync — syncComplete', () => {
  it('follows two pages, detects class changes, and syncs the classes', async () => {
    await User.collection.insertMany([
      { _id: oid(20), email: 's1@x.test', combined: { classId: 'OLD1' } },
      { _id: oid(21), email: 's2@x.test', combined: { classId: 'OLD2' } },
    ])
    client.setPages([
      { users: [{ email: 's1@x.test', class_id: 'NEW1', status: 'ACTIVE' }], nextPageToken: 'p2' },
      { users: [{ email: 's2@x.test', class_id: 'NEW2', status: 'ACTIVE' }], nextPageToken: null },
    ])

    const captured: Captured = {}
    await handlers.syncComplete(emptyReq(), makeResponse(captured), jest.fn() as unknown as NextFunction)

    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect((body.stats as Body).conflicts).toBe(2)
    expect(sleeper.waits).toEqual([200, 200])
    expect(await Class.countDocuments({ classId: { $in: ['NEW1', 'NEW2'] } })).toBe(2)
    expect(await StudentClassHistory.countDocuments({})).toBe(2)
  })

  it('maps a token failure to a 500 SEC-10 and marks the record failed', async () => {
    client.tokenError = new Error('token boom')
    const next = jest.fn()
    await handlers.syncComplete(emptyReq(), makeResponse({}), next as unknown as NextFunction)
    expect((next.mock.calls[0]?.[0] as HttpError)).toMatchObject({ status: 500, code: 'HOTMART_COMPLETE_SYNC_FAILED' })
    const record = await SyncHistory.findOne({ type: 'hotmart' }).sort({ startedAt: -1 }).lean()
    expect(record?.status).toBe('failed')
  })

  it('is fail-closed with no config: 503, no sync record created', async () => {
    client.configured = false
    const next = jest.fn()
    await handlers.syncComplete(emptyReq(), makeResponse({}), next as unknown as NextFunction)
    expect((next.mock.calls[0]?.[0] as HttpError)).toMatchObject({ status: 503, code: 'HOTMART_SYNC_NOT_CONFIGURED' })
    expect(await SyncHistory.countDocuments({})).toBe(0)
  })
})
