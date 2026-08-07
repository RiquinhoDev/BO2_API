// Hotmart sync hits the club API over the network; mock axios (token POST +
// paginated GET) so the suite stays offline. The extraction replaces this with
// an injected Hotmart client port that tests fake instead of global axios.
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    isAxiosError: () => false,
  },
}))

import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { Request, Response } from 'express'
import axios from 'axios'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { classesController } from '../../src/controllers/classes.controller'
import { Class } from '../../src/models/Class'
import { User } from '../../src/models'
import StudentClassHistory from '../../src/models/StudentClassHistory'
import SyncHistory from '../../src/models/SyncHistory'

const mockedPost = axios.post as jest.Mock
const mockedGet = axios.get as jest.Mock

type Handler = (req: Request, res: Response) => Promise<void>
const cc = classesController as unknown as Record<string, Handler>
const syncHotmartClasses = cc.syncHotmartClasses
const checkAndUpdateClassHistory = cc.checkAndUpdateClassHistory
const syncComplete = cc.syncComplete

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

// One club page then no next token, so the pagination loop runs exactly once.
function mockClubPage(users: Array<Record<string, unknown>>) {
  mockedGet.mockResolvedValue({ data: { users, items: users, page_info: {} } })
}

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  process.env.HOTMART_CLIENT_ID = 'test-client-id'
  process.env.HOTMART_CLIENT_SECRET = 'test-client-secret'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'hotmart_class_sync_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('hotmart_class_sync_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
  delete process.env.HOTMART_CLIENT_ID
  delete process.env.HOTMART_CLIENT_SECRET
})

beforeEach(async () => {
  jest.clearAllMocks()
  mockedPost.mockResolvedValue({ data: { access_token: 'test-token' } })
  mockClubPage([])
  await Promise.all([
    Class.collection.deleteMany({}),
    User.collection.deleteMany({}),
    StudentClassHistory.collection.deleteMany({}),
    SyncHistory.collection.deleteMany({}),
  ])
})

describe('hotmartClassSync characterization — syncHotmartClasses', () => {
  it('creates classes from the Hotmart page and completes the sync record', async () => {
    mockClubPage([{ email: 'a@x.test', class_id: 'H1' }])
    await User.collection.insertOne({ _id: oid(1), email: 'a@x.test', classId: 'H1', combined: { status: 'ACTIVE' } })

    const captured: Captured = {}
    await syncHotmartClasses(emptyReq(), makeResponse(captured))

    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect(body.classIds).toEqual(['H1'])

    const cls = await Class.findOne({ classId: 'H1' }).lean()
    expect(cls?.source).toBe('hotmart_sync')
    expect(cls?.isActive).toBe(true)
    expect(cls?.studentCount).toBe(1)

    const record = await SyncHistory.findOne({ type: 'hotmart' }).sort({ startedAt: -1 }).lean()
    expect(record?.status).toBe('completed')
  })

  it('surfaces a token failure as a local 500 and marks the sync record failed', async () => {
    mockedPost.mockRejectedValue(new Error('token boom'))

    const captured: Captured = {}
    await syncHotmartClasses(emptyReq(), makeResponse(captured))

    expect(captured.status).toBe(500)
    const record = await SyncHistory.findOne({ type: 'hotmart' }).sort({ startedAt: -1 }).lean()
    expect(record?.status).toBe('failed')
  })
})

describe('hotmartClassSync characterization — checkAndUpdateClassHistory', () => {
  it('moves a local user whose Hotmart class changed and logs history', async () => {
    await User.collection.insertOne({ _id: oid(2), email: 'b@x.test', classId: 'OLD' })
    mockClubPage([{ email: 'b@x.test', class_id: 'NEW' }])

    const captured: Captured = {}
    await checkAndUpdateClassHistory(emptyReq(), makeResponse(captured))

    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect((body.stats as Body).changesDetected).toBe(1)

    const moved = await User.findById(oid(2)).lean()
    expect(moved?.classId).toBe('NEW')
    expect(await StudentClassHistory.countDocuments({ studentId: oid(2) })).toBe(1)
  })
})

describe('hotmartClassSync characterization — syncComplete', () => {
  it('400s when subdomain is not configured', async () => {
    const previous = process.env.subdomain
    delete process.env.subdomain

    const captured: Captured = {}
    await syncComplete(emptyReq(), makeResponse(captured))
    expect(captured.status).toBe(400)

    if (previous !== undefined) process.env.subdomain = previous
  })

  it('updates existing users and syncs classes when subdomain is set', async () => {
    process.env.subdomain = 'test-subdomain'
    await User.collection.insertOne({ _id: oid(3), email: 'c@x.test', combined: { classId: 'OLD' } })
    mockClubPage([{ email: 'c@x.test', class_id: 'NEW', user_id: 'h-3', status: 'ACTIVE' }])

    const captured: Captured = {}
    await syncComplete(emptyReq(), makeResponse(captured))

    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect((body.stats as Body).conflicts).toBe(1) // class change detected

    const cls = await Class.findOne({ classId: 'NEW' }).lean()
    expect(cls?.source).toBe('hotmart_sync')
    expect(await StudentClassHistory.countDocuments({ studentId: oid(3) })).toBe(1)

    delete process.env.subdomain
  })
})
