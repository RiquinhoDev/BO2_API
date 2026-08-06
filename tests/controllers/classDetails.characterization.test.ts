import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { classesController } from '../../src/controllers/classes.controller'
import { Class, InactivationList } from '../../src/models/Class'
import { User } from '../../src/models'
import StudentClassHistory from '../../src/models/StudentClassHistory'

type AnyHandler = (req: Request, res: Response, next?: NextFunction) => Promise<void>
const cc = classesController as unknown as Record<string, AnyHandler>
const getClassStats = cc.getClassStats
const getClassDetails = cc.getClassDetails
const fetchClassData = cc.fetchClassData
const fetchClassDataPost = cc.fetchClassDataPost

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

const req = (params: Record<string, unknown> = {}, query: Record<string, unknown> = {}, body: Record<string, unknown> = {}): Request =>
  ({ params, query, body } as unknown as Request)
const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))
let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'class_details_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('class_details_test')))
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
    StudentClassHistory.collection.deleteMany({}),
    InactivationList.collection.deleteMany({}),
  ])
  await Class.collection.insertMany([
    { classId: 'H', name: 'Hotmart T', source: 'hotmart', isActive: true, estado: 'ativo', code: 'H' },
    { classId: 'C', name: 'Curse T', source: 'curseduca_sync', curseducaUuid: 'u-c', isActive: true, estado: 'ativo', code: 'C' },
    { classId: 'I', name: 'Inactive T', source: 'manual', isActive: false, estado: 'inativo', code: 'I' },
  ])
  await User.collection.insertMany([
    { _id: oid(1), email: 'h1@x.test', name: 'H1', classId: 'H', status: 'ACTIVE' },
    { _id: oid(2), email: 'h2@x.test', name: 'H2', classId: 'H', status: 'ACTIVE' },
    { _id: oid(3), email: 'h3@x.test', name: 'H3', classId: 'H', status: 'INACTIVE' },
    { _id: oid(4), email: 'c1@x.test', name: 'C1', curseduca: { groupCurseducaUuid: 'u-c' }, combined: { status: 'ACTIVE' } },
  ])
  await StudentClassHistory.collection.insertOne({ studentId: oid(1), classId: 'H', dateMoved: new Date('2026-07-01') })
  await InactivationList.collection.insertMany([
    { status: 'PENDING' },
    { status: 'COMPLETED' },
  ])
})

describe('classDetails characterization — getClassStats (GET /stats)', () => {
  it('aggregates class stats plus controller-added inactivation stats', async () => {
    const captured: Captured = {}
    await getClassStats(req(), makeResponse(captured))
    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect(body).toMatchObject({ totalClasses: 3, activeClasses: 2, inactiveClasses: 1 })
    expect(body.inactivationStats).toEqual({ pendingLists: 1, completedLists: 1 })
    expect(body).toHaveProperty('sourceBreakdown')
    expect(body).toHaveProperty('studentDistribution')
    expect(typeof body.timestamp).toBe('string')
  })

  it('answers failures with a local 500', async () => {
    jest.spyOn(Class, 'countDocuments').mockImplementation((() => { throw new Error('boom') }) as never)
    const captured: Captured = {}
    await getClassStats(req(), makeResponse(captured))
    expect(captured.status).toBe(500)
  })
})

describe('classDetails characterization — getClassDetails (GET /:classId/details)', () => {
  it('404s when the class is missing', async () => {
    const captured: Captured = {}
    await getClassDetails(req({ classId: 'GHOST' }), makeResponse(captured))
    expect(captured.status).toBe(404)
  })

  it('returns details with stats and honours includeStudents/includeHistory', async () => {
    const base: Captured = {}
    await getClassDetails(req({ classId: 'H' }), makeResponse(base))
    const body = base.body as Body
    expect(body.success).toBe(true)
    expect(body.classId).toBe('H')
    expect(body.stats).toMatchObject({ totalStudents: expect.any(Number), activeStudents: 2 })
    expect(body.students).toBeUndefined()
    expect(body.recentHistory).toBeUndefined()
    expect(typeof body.timestamp).toBe('string')

    const withExtras: Captured = {}
    await getClassDetails(req({ classId: 'H' }, { includeStudents: 'true', includeHistory: 'true' }), makeResponse(withExtras))
    expect(Array.isArray((withExtras.body as Body).students)).toBe(true)
    expect(Array.isArray((withExtras.body as Body).recentHistory)).toBe(true)
  })
})

describe('classDetails characterization — fetchClassData (GET /fetchClassData)', () => {
  it('fetches selected classes by ids with the count envelope', async () => {
    const captured: Captured = {}
    await fetchClassData(req({}, { classIds: 'H,C' }), makeResponse(captured))
    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect(body.count).toBe(2)
    expect(body.classes.map((c: Body) => c.classId).sort()).toEqual(['C', 'H'])
    expect(body.classes[0]).toHaveProperty('stats')
    expect(typeof body.timestamp).toBe('string')
  })

  it('fetches all active classes when no ids are given', async () => {
    const captured: Captured = {}
    await fetchClassData(req(), makeResponse(captured))
    expect((captured.body as Body).classes.map((c: Body) => c.classId).sort()).toEqual(['C', 'H'])
  })
})

describe('classDetails characterization — fetchClassDataPost (POST /fetchClassData)', () => {
  it('400s without a classIds array', async () => {
    const captured: Captured = {}
    await fetchClassDataPost(req({}, {}, {}), makeResponse(captured))
    expect(captured.status).toBe(400)
  })

  it('returns a raw array of { className, students } and is read-only', async () => {
    const insertSpy = jest.spyOn(Class.collection, 'insertMany')
    const captured: Captured = {}
    await fetchClassDataPost(req({}, {}, { classIds: ['H'] }), makeResponse(captured))
    const body = captured.body as Body
    expect(Array.isArray(body)).toBe(true)
    expect(body[0]).toMatchObject({ className: 'Hotmart T' })
    expect(Array.isArray(body[0].students)).toBe(true)
    // Read-only: POST fetchClassData never writes.
    expect(insertSpy).not.toHaveBeenCalled()
  })
})
