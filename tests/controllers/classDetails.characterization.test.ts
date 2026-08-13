import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { HttpError } from '../../src/security/errorHandling'
import {
  fetchClassData as rtFetch,
  fetchClassDataPost as rtFetchPost,
  getClassDetails as rtDetails,
  getClassStats as rtStats,
} from '../../src/services/classes/classDetails.runtime'
import { Class, InactivationList } from '../../src/models/Class'
import { User } from '../../src/models'
import StudentClassHistory from '../../src/models/StudentClassHistory'

type AnyHandler = (req: Request, res: Response, next?: NextFunction) => Promise<void>
const getClassStats = rtStats as unknown as AnyHandler
const getClassDetails = rtDetails as unknown as AnyHandler
const fetchClassData = rtFetch as unknown as AnyHandler
const fetchClassDataPost = rtFetchPost as unknown as AnyHandler

type Body = Record<string, unknown>
type Row = Record<string, unknown>
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
    const data = body.data as Body
    const meta = body.meta as Body
    expect(body.success).toBe(true)
    expect(data).toMatchObject({ totalClasses: 3, activeClasses: 2, inactiveClasses: 1 })
    expect(data.inactivationStats).toEqual({ pendingLists: 1, completedLists: 1 })
    expect(data).toHaveProperty('sourceBreakdown')
    expect(data).toHaveProperty('studentDistribution')
    expect(typeof meta.timestamp).toBe('string')
  })

  it('reports failure through next(HttpError) with CLASS_STATS_FAILED', async () => {
    jest.spyOn(Class, 'countDocuments').mockImplementation((() => { throw new Error('boom') }) as never)
    const captured: Captured = {}
    const next = jest.fn()
    await getClassStats(req(), makeResponse(captured), next as unknown as NextFunction)
    expect(captured.body).toBeUndefined()
    expect((next.mock.calls[0]?.[0] as HttpError)).toMatchObject({ status: 500, code: 'CLASS_STATS_FAILED' })
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
    const data = body.data as Body
    const meta = body.meta as Body
    expect(body.success).toBe(true)
    expect(data.classId).toBe('H')
    expect(data.stats).toMatchObject({ totalStudents: expect.any(Number), activeStudents: 2 })
    expect(data.students).toBeUndefined()
    expect(data.recentHistory).toBeUndefined()
    expect(typeof meta.timestamp).toBe('string')

    const withExtras: Captured = {}
    await getClassDetails(req({ classId: 'H' }, { includeStudents: 'true', includeHistory: 'true' }), makeResponse(withExtras))
    const extras = (withExtras.body as Body).data as Body
    expect(Array.isArray(extras.students)).toBe(true)
    expect(Array.isArray(extras.recentHistory)).toBe(true)
  })

  it('reports failure through next(HttpError) with CLASS_DETAILS_FAILED', async () => {
    jest.spyOn(Class, 'findOne').mockImplementation((() => { throw new Error('boom') }) as never)
    const captured: Captured = {}
    const next = jest.fn()
    await getClassDetails(req({ classId: 'H' }), makeResponse(captured), next as unknown as NextFunction)
    expect((next.mock.calls[0]?.[0] as HttpError)).toMatchObject({ status: 500, code: 'CLASS_DETAILS_FAILED' })
  })
})

describe('classDetails characterization — fetchClassData (GET /fetchClassData)', () => {
  it('fetches selected classes by ids with the count envelope', async () => {
    const captured: Captured = {}
    await fetchClassData(req({}, { classIds: 'H,C' }), makeResponse(captured))
    const body = captured.body as Body
    const data = body.data as Body
    const meta = body.meta as Body
    const classes = data.classes as Row[]
    expect(body.success).toBe(true)
    expect(meta.count).toBe(2)
    expect(classes.map(c => c.classId).sort()).toEqual(['C', 'H'])
    expect(classes[0]).toHaveProperty('stats')
    expect(typeof meta.timestamp).toBe('string')
  })

  it('fetches all active classes when no ids are given', async () => {
    const captured: Captured = {}
    await fetchClassData(req(), makeResponse(captured))
    const data = (captured.body as Body).data as Body
    expect((data.classes as Row[]).map(c => c.classId).sort()).toEqual(['C', 'H'])
  })

  it('reports failure through next(HttpError) with CLASS_FETCH_FAILED', async () => {
    jest.spyOn(Class, 'find').mockImplementation((() => { throw new Error('boom') }) as never)
    const captured: Captured = {}
    const next = jest.fn()
    await fetchClassData(req(), makeResponse(captured), next as unknown as NextFunction)
    expect((next.mock.calls[0]?.[0] as HttpError)).toMatchObject({ status: 500, code: 'CLASS_FETCH_FAILED' })
  })
})

describe('classDetails characterization — fetchClassDataPost (POST /fetchClassData)', () => {
  it('400s without a classIds array', async () => {
    const captured: Captured = {}
    await fetchClassDataPost(req({}, {}, {}), makeResponse(captured))
    expect(captured.status).toBe(400)
  })

  it('returns { className, students } in the canonical envelope and never mutates Class or User', async () => {
    const MUTATORS = ['insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany', 'bulkWrite', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace'] as const
    const spies = [
      ...MUTATORS.map(m => jest.spyOn(Class.collection, m as never)),
      ...MUTATORS.map(m => jest.spyOn(User.collection, m as never)),
    ]

    const captured: Captured = {}
    await fetchClassDataPost(req({}, {}, { classIds: ['H'] }), makeResponse(captured))
    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect((body.data as Row[])[0]).toMatchObject({ className: 'Hotmart T' })
    expect(Array.isArray((body.data as Row[])[0].students)).toBe(true)
    // Read-only: POST fetchClassData never writes to Class or User.
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('reports failure through next(HttpError) with CLASS_FETCH_POST_FAILED', async () => {
    jest.spyOn(Class, 'find').mockImplementation((() => { throw new Error('boom') }) as never)
    const captured: Captured = {}
    const next = jest.fn()
    await fetchClassDataPost(req({}, {}, { classIds: ['H'] }), makeResponse(captured), next as unknown as NextFunction)
    expect((next.mock.calls[0]?.[0] as HttpError)).toMatchObject({ status: 500, code: 'CLASS_FETCH_POST_FAILED' })
  })
})
