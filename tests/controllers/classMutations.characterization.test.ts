import fs from 'node:fs'
import path from 'node:path'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { classesController } from '../../src/controllers/classes.controller'
import { Class } from '../../src/models/Class'
import { User } from '../../src/models'

type EditHandler = (req: Request, res: Response, next?: NextFunction) => Promise<void>
type DeleteInput = { params: { classId: string }; query: Record<string, unknown> }
type DeleteHandler = (input: DeleteInput, res: Response, next?: NextFunction) => Promise<void>

const cc = classesController as unknown as Record<string, unknown>
const addOrEditClass = cc.addOrEditClass as EditHandler
const deleteClass = cc.deleteClass as DeleteHandler

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

const editReq = (body: Record<string, unknown>): Request => ({ body } as unknown as Request)
const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))
let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'class_mutations_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('class_mutations_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await Promise.all([Class.collection.deleteMany({}), User.collection.deleteMany({})])
})

describe('classMutations characterization — addOrEditClass (POST /addOrEditClass)', () => {
  it('400s without classId or name', async () => {
    const captured: Captured = {}
    await addOrEditClass(editReq({ name: 'Only name' }), makeResponse(captured))
    expect(captured.status).toBe(400)
  })

  it('creates a new class with isNew true', async () => {
    const captured: Captured = {}
    await addOrEditClass(editReq({ classId: 'new-class', name: 'New Class' }), makeResponse(captured))
    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect(body.isNew).toBe(true)
    expect(body.message).toBe('Turma criada com sucesso')
    expect(typeof body.timestamp).toBe('string')
  })

  it('edits an existing class without changing its source, with isNew false', async () => {
    await addOrEditClass(editReq({ classId: 'ex', name: 'Existing', source: 'curseduca_sync' }), makeResponse({}))
    const captured: Captured = {}
    await addOrEditClass(editReq({ classId: 'ex', name: 'Edited Name', source: 'manual' }), makeResponse(captured))
    const body = captured.body as Body
    expect(body.isNew).toBe(false)
    expect(body.message).toBe('Turma atualizada com sucesso')
    const stored = await Class.findOne({ classId: 'ex' }).lean() as Record<string, unknown> | null
    expect(stored?.source).toBe('curseduca_sync') // source preserved on edit
    expect(stored?.name).toBe('Edited Name')
  })

  it('rejects an invalid classId and a too-short name with a local 500', async () => {
    const badId: Captured = {}
    await addOrEditClass(editReq({ classId: 'bad id!', name: 'Valid Name' }), makeResponse(badId))
    expect(badId.status).toBe(500)

    const shortName: Captured = {}
    await addOrEditClass(editReq({ classId: 'okid', name: 'ab' }), makeResponse(shortName))
    expect(shortName.status).toBe(500)
  })
})

describe('classMutations characterization — deleteClass (DELETE /:classId via withValidatedInput)', () => {
  const del = (classId: string) => {
    const captured: Captured = {}
    return deleteClass({ params: { classId }, query: {} }, makeResponse(captured)).then(() => captured)
  }

  it('is mounted behind the validated wrapper', () => {
    const routes = fs.readFileSync(path.join(process.cwd(), 'src/routes/classes.routes.ts'), 'utf8')
    expect(routes).toMatch(/router\.delete\(\s*'\/:classId',\s*withValidatedInput\(classesDeleteInput/)
  })

  it('404s when the class is missing', async () => {
    expect((await del('ghost')).status).toBe(404)
  })

  it('400s when the class still has active students (source-aware count)', async () => {
    await addOrEditClass(editReq({ classId: 'full', name: 'Full Class' }), makeResponse({}))
    await User.collection.insertMany([
      { _id: oid(1), email: 'f1@x.test', classId: 'full', status: 'ACTIVE' },
      { _id: oid(2), email: 'f2@x.test', classId: 'full', status: 'ACTIVE' },
    ])
    const captured = await del('full')
    expect(captured.status).toBe(400)
    expect((captured.body as Body).message).toContain('Mova os estudantes primeiro')
  })

  it('removes an empty class', async () => {
    await addOrEditClass(editReq({ classId: 'empty', name: 'Empty Class' }), makeResponse({}))
    const captured = await del('empty')
    expect(captured.body).toMatchObject({ success: true, message: 'Turma removida com sucesso' })
    expect(await Class.findOne({ classId: 'empty' }).lean()).toBeNull()
  })
})
