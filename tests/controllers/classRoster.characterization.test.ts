import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { HttpError } from '../../src/security/errorHandling'
import { getStudentsByClass as rtStudents, searchStudents as rtSearch } from '../../src/services/classes/classRoster.runtime'
import { Class } from '../../src/models/Class'
import { User, UserProduct } from '../../src/models'

type AnyHandler = (req: Request, res: Response, next?: NextFunction) => Promise<void>
const getStudentsByClass = rtStudents as unknown as AnyHandler
const searchStudents = rtSearch as unknown as AnyHandler

type Body = {
  success?: boolean
  message?: string
  data?: { classId?: string; className?: string; students?: Array<Record<string, unknown>> }
  meta?: { pagination?: Record<string, unknown>; filters?: Record<string, unknown>; timestamp?: unknown }
  students?: Array<Record<string, unknown>>
  multiple?: boolean
  total?: number
  timestamp?: unknown
  name?: string
  email?: string
  [key: string]: unknown
}
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

const req = (params: Record<string, unknown>, query: Record<string, unknown> = {}): Request =>
  ({ params, query } as unknown as Request)

const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))
let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'class_roster_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('class_roster_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await Promise.all([
    Class.collection.deleteMany({}),
    User.collection.deleteMany({}),
    UserProduct.collection.deleteMany({}),
  ])
  await Class.collection.insertMany([
    { classId: 'CUR', name: 'Curseduca T', source: 'curseduca_sync', code: 'CUR' },
    { classId: 'HOT', name: 'Hotmart T', source: 'hotmart', code: 'HOT' },
  ])
  const meta = { createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') }
  await User.collection.insertMany([
    { _id: oid(1), name: 'Ana', email: 'ana@x.test', combined: { status: 'ACTIVE' }, discord: { discordIds: ['d1'] }, curseduca: { joinedDate: new Date('2026-02-01') }, metadata: meta },
    { _id: oid(2), name: 'Bea', email: 'bea@x.test', combined: { status: 'ACTIVE' }, curseduca: { memberStatus: 'INACTIVE' }, metadata: meta },
    { _id: oid(3), name: 'Caio', email: 'caio@x.test', classId: 'HOT', combined: { status: 'ACTIVE' }, hotmart: { purchaseDate: new Date('2026-03-01'), status: 'ACTIVE' }, metadata: meta },
    { _id: oid(4), name: 'Dan', email: 'dan@x.test', classId: 'HOT', combined: { status: 'ACTIVE' }, inactivation: { isManuallyInactivated: true }, metadata: meta },
    { _id: oid(5), name: 'Eva', email: 'eva@x.test', classId: 'HOT', combined: { status: 'INACTIVE' }, metadata: meta },
  ])
  await UserProduct.collection.insertMany([
    { userId: oid(1), productId: oid(101), platform: 'curseduca', status: 'ACTIVE', classes: [{ classId: 'CUR' }] },
    { userId: oid(2), productId: oid(102), platform: 'curseduca', status: 'INACTIVE', classes: [{ classId: 'CUR' }] },
  ])
})

describe('classRoster characterization — getStudentsByClass', () => {
  it('400s without a classId', async () => {
    const captured: Captured = {}
    await getStudentsByClass(req({ classId: '' }), makeResponse(captured))
    expect(captured.status).toBe(400)
  })

  it('404s when the class does not exist', async () => {
    const captured: Captured = {}
    await getStudentsByClass(req({ classId: 'GHOST' }), makeResponse(captured))
    expect(captured.status).toBe(404)
  })

  it('lists CursEduca members from UserProduct, active by default and including inactive on demand', async () => {
    const active: Captured = {}
    await getStudentsByClass(req({ classId: 'CUR' }), makeResponse(active))
    expect(active.body!.data!.students!.map(s => s.email)).toEqual(['ana@x.test'])

    const all: Captured = {}
    await getStudentsByClass(req({ classId: 'CUR' }, { includeInactive: 'true' }), makeResponse(all))
    expect((all.body!.data!.students!.map(s => s.email) as string[]).sort()).toEqual(['ana@x.test', 'bea@x.test'])
  })

  it('lists Hotmart members by classId, excluding manual inactivation and INACTIVE combined status', async () => {
    const captured: Captured = {}
    await getStudentsByClass(req({ classId: 'HOT' }), makeResponse(captured))
    expect(captured.body!.data!.students!.map(s => s.email)).toEqual(['caio@x.test'])
  })

  it('formats each student and returns the exact envelope', async () => {
    const captured: Captured = {}
    await getStudentsByClass(req({ classId: 'CUR' }), makeResponse(captured))
    const body = captured.body as Body
    expect(body).toMatchObject({ success: true, data: { classId: 'CUR', className: 'Curseduca T' } })
    expect(body.meta!.pagination).toMatchObject({ total: 1, limit: 100, offset: 0, hasMore: false })
    expect(body.meta!.filters).toMatchObject({ includeInactive: false, sortBy: 'name', sortOrder: 'asc' })
    expect(typeof body.meta!.timestamp).toBe('string')
    expect(body.data!.students![0]).toMatchObject({
      name: 'Ana',
      email: 'ana@x.test',
      discordId: 'd1',
      status: 'ACTIVE',
      estado: 'ativo',
      platform: 'curseduca',
    })
    expect(body.data!.students![0]).toHaveProperty('joinedAt')
    expect(body.data!.students![0]).toHaveProperty('lastActivity')
  })

  it('reports failure through next(HttpError) with CLASS_ROSTER_FAILED', async () => {
    jest.spyOn(User, 'countDocuments').mockImplementation((() => { throw new Error('boom') }) as never)
    const captured: Captured = {}
    const next = jest.fn()
    await getStudentsByClass(req({ classId: 'HOT' }), makeResponse(captured), next as unknown as NextFunction)
    expect(captured.body).toBeUndefined()
    const error = next.mock.calls[0]?.[0] as HttpError
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 500, code: 'CLASS_ROSTER_FAILED' })
    expect(error.message).not.toContain('boom')
  })
})

describe('classRoster characterization — searchStudents', () => {
  it('400s without any of email/name/discordId/classId (status alone does not count)', async () => {
    const none: Captured = {}
    await searchStudents(req({}, {}), makeResponse(none))
    expect(none.status).toBe(400)

    const statusOnly: Captured = {}
    await searchStudents(req({}, { status: 'ACTIVE' }), makeResponse(statusOnly))
    expect(statusOnly.status).toBe(400)
  })

  it('404s when no student matches', async () => {
    const captured: Captured = {}
    await searchStudents(req({}, { email: 'nobody@x.test' }), makeResponse(captured))
    expect(captured.status).toBe(404)
  })

  it('spreads a single result at the root with multiple=false', async () => {
    const captured: Captured = {}
    await searchStudents(req({}, { email: 'ana@x.test' }), makeResponse(captured))
    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect(body.multiple).toBe(false)
    expect(body.name).toBe('Ana')
    expect(body.email).toBe('ana@x.test')
  })

  it('returns multiple=true with students + total, sorted by name asc, with resolved className', async () => {
    const captured: Captured = {}
    await searchStudents(req({}, { classId: 'HOT' }), makeResponse(captured))
    const body = captured.body as Body
    expect(body.multiple).toBe(true)
    expect(body.total).toBe(3)
    expect(body.students!.map(s => s.name)).toEqual(['Caio', 'Dan', 'Eva'])
    expect(body.students![0].className).toBe('Hotmart T')
  })

  it('reports failure through next(HttpError) with CLASS_STUDENT_SEARCH_FAILED', async () => {
    jest.spyOn(User, 'find').mockImplementation((() => { throw new Error('boom') }) as never)
    const captured: Captured = {}
    const next = jest.fn()
    await searchStudents(req({}, { email: 'ana@x.test' }), makeResponse(captured), next as unknown as NextFunction)
    expect(captured.body).toBeUndefined()
    const error = next.mock.calls[0]?.[0] as HttpError
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 500, code: 'CLASS_STUDENT_SEARCH_FAILED' })
    expect(error.message).not.toContain('boom')
  })
})
