import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { HttpError } from '../../src/security/errorHandling'
import { listClasses as rtListClasses, listClassesSimple as rtSimple } from '../../src/services/classes/classDirectory.runtime'
import { Class } from '../../src/models/Class'
import { User } from '../../src/models'

type AnyHandler = (req: Request, res: Response, next?: NextFunction) => Promise<void>
const listClassesSimple = rtSimple as unknown as AnyHandler
const listClasses = rtListClasses as unknown as AnyHandler

type SimpleClass = { classId?: unknown; name?: string; isActive?: boolean; estado?: string; studentCount?: number; description?: string }
type ListBody = {
  success?: boolean
  data?: Array<Record<string, unknown>>
  classes?: Array<Record<string, unknown>>
  total?: number
  filters?: Record<string, unknown>
  timestamp?: unknown
  message?: string
}
type Captured = { status?: number; body?: unknown }

function makeResponse(captured: Captured): Response {
  const res = {
    status(code: number) {
      captured.status = code
      return res
    },
    json(body: unknown) {
      captured.body = body
      return res
    },
  }
  return res as unknown as Response
}

const req = (query: Record<string, unknown> = {}): Request => ({ query } as unknown as Request)
const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))
let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'class_directory_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('class_directory_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await Promise.all([Class.collection.deleteMany({}), User.collection.deleteMany({})])
  await Class.collection.insertMany([
    { classId: 'A', name: 'Alpha', source: 'curseduca_sync', curseducaUuid: 'uuid-a', isActive: false, estado: 'inativo', code: 'A' },
    { classId: 'B', name: 'Beta', source: 'manual', isActive: true, estado: 'ativo', description: 'desc-b', code: 'B' },
    { classId: 'Z', source: 'manual', isActive: true, code: 'Z' },
  ])
  await User.collection.insertMany([
    { _id: oid(1), email: 'u1@x.test', classId: 'B', status: 'ACTIVE' },
    { _id: oid(2), email: 'u2@x.test', classId: 'B', status: 'ACTIVE' },
    { _id: oid(3), email: 'u3@x.test', classId: 'B', status: 'INACTIVE' },
    { _id: oid(4), email: 'u4@x.test', curseduca: { groupCurseducaUuid: 'uuid-a' }, combined: { status: 'ACTIVE' } },
    { _id: oid(5), email: 'u5@x.test', curseduca: { groupCurseducaUuid: 'uuid-a' }, combined: { status: 'INACTIVE' } },
  ])
})

const byId = (arr: SimpleClass[], id: string) => arr.find(c => c.classId === id)!

describe('classDirectory characterization — listClassesSimple (GET /api/classes)', () => {
  it('returns a raw array (not an envelope) of active and inactive classes', async () => {
    const captured: Captured = {}
    await listClassesSimple(req(), makeResponse(captured))
    const body = captured.body as SimpleClass[]
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(3)
  })

  it('formats fields with name/estado fallbacks and platform-specific studentCount', async () => {
    const captured: Captured = {}
    await listClassesSimple(req(), makeResponse(captured))
    const body = captured.body as SimpleClass[]

    expect(byId(body, 'B')).toEqual({ classId: 'B', name: 'Beta', isActive: true, estado: 'ativo', studentCount: 2, description: 'desc-b' })
    expect(byId(body, 'A')).toMatchObject({ classId: 'A', name: 'Alpha', isActive: false, estado: 'inativo', studentCount: 1 })
    // Missing name -> classId fallback; missing estado -> derived from isActive.
    expect(byId(body, 'Z')).toEqual({ classId: 'Z', name: 'Z', isActive: true, estado: 'ativo', studentCount: 0, description: '' })
  })

  it('reports failure through next(HttpError) with CLASS_DIRECTORY_FAILED', async () => {
    jest.spyOn(Class, 'find').mockImplementation((() => { throw new Error('boom') }) as never)
    const captured: Captured = {}
    const next = jest.fn()
    await listClassesSimple(req(), makeResponse(captured), next as unknown as NextFunction)
    expect(captured.body).toBeUndefined()
    const error = next.mock.calls[0]?.[0] as HttpError
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 500, code: 'CLASS_DIRECTORY_FAILED' })
    expect(error.message).not.toContain('boom')
  })
})

describe('classDirectory characterization — listClasses (GET /api/classes/listClasses)', () => {
  it('duplicates the listing under data and classes with total, filters and timestamp', async () => {
    const captured: Captured = {}
    await listClasses(req(), makeResponse(captured))
    const body = captured.body as ListBody
    expect(body.success).toBe(true)
    expect(body.total).toBe(3)
    expect(body.data).toHaveLength(3)
    expect(body.classes).toEqual(body.data)
    // name asc: the unnamed class (null) sorts first, then Alpha, then Beta.
    expect(body.data!.map(c => c.classId)).toEqual(['Z', 'A', 'B'])
    expect(body.filters).toMatchObject({ limit: 100, offset: 0, sortBy: 'name', sortOrder: 'asc' })
    expect(typeof body.timestamp).toBe('string')
    // studentCount is embedded per class.
    expect((body.data as SimpleClass[]).find(c => c.classId === 'B')!.studentCount).toBe(2)
  })

  it('filters by source and returns an empty listing when nothing matches', async () => {
    const curseduca: Captured = {}
    await listClasses(req({ source: 'curseduca_sync' }), makeResponse(curseduca))
    expect((curseduca.body as ListBody).data!.map(c => c.classId)).toEqual(['A'])

    const none: Captured = {}
    await listClasses(req({ source: 'ghost' }), makeResponse(none))
    expect((none.body as ListBody).total).toBe(0)
    expect((none.body as ListBody).data).toEqual([])
  })

  it('filters by isActive and by search', async () => {
    const active: Captured = {}
    await listClasses(req({ isActive: 'true' }), makeResponse(active))
    expect((active.body as ListBody).data!.map(c => c.classId).sort()).toEqual(['B', 'Z'])

    const search: Captured = {}
    await listClasses(req({ search: 'alpha' }), makeResponse(search))
    expect((search.body as ListBody).data!.map(c => c.classId)).toEqual(['A'])
  })

  it('reports failure through next(HttpError) with CLASS_LIST_FAILED', async () => {
    jest.spyOn(Class, 'find').mockImplementation((() => { throw new Error('boom') }) as never)
    const captured: Captured = {}
    const next = jest.fn()
    await listClasses(req(), makeResponse(captured), next as unknown as NextFunction)
    expect(captured.body).toBeUndefined()
    const error = next.mock.calls[0]?.[0] as HttpError
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 500, code: 'CLASS_LIST_FAILED' })
    expect(error.message).not.toContain('boom')
  })
})
