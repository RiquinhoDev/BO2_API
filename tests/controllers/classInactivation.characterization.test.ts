import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import {
  createCreateInactivationListController,
  createDeleteInactivationListController,
  createGetInactivationListStudentsController,
  createGetInactivationListsController,
  createRevertInactivationController,
  createUpdateClassStatusController,
} from '../../src/controllers/classes/classInactivation.controller'
import { ClassInactivationService, type Clock } from '../../src/services/classes/classInactivation.service'
import { MongooseClassInactivationWriter } from '../../src/services/classes/mongooseClassInactivation.writer'
import { upsertClass } from '../../src/services/classes/classMutations.runtime'
import { HttpError } from '../../src/security/errorHandling'
import { Class } from '../../src/models/Class'
import { User, UserProduct } from '../../src/models'
import UserHistory from '../../src/models/UserHistory'
import InactivationList from '../../src/models/InactivationList'

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

const withBody = (body: Record<string, unknown>): Request => ({ body, params: {}, query: {} } as unknown as Request)
const withParams = (params: Record<string, unknown>, body: Record<string, unknown> = {}): Request =>
  ({ params, body, query: {} } as unknown as Request)
const withQuery = (query: Record<string, unknown>): Request => ({ query, body: {}, params: {} } as unknown as Request)
const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))
const noNext = jest.fn() as unknown as NextFunction

// Injected Discord port — the real axios adapter is never constructed, so the
// suite touches no network. The runtime is what wires the axios adapter.
const discord = { delegate: jest.fn().mockResolvedValue(0) }
const fixedClock: Clock = { now: () => new Date('2026-02-03T04:05:06.000Z') }

function buildControllers() {
  const service = new ClassInactivationService(
    new MongooseClassInactivationWriter(),
    discord,
    { upsert: (input) => upsertClass(input) },
    fixedClock,
  )
  return {
    createInactivationList: createCreateInactivationListController(service),
    getInactivationLists: createGetInactivationListsController(service),
    getInactivationListStudents: createGetInactivationListStudentsController(service),
    deleteInactivationList: createDeleteInactivationListController(service),
    revertInactivation: createRevertInactivationController(service),
    updateClassStatus: createUpdateClassStatusController(service),
  }
}

let controllers: ReturnType<typeof buildControllers>
let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'class_inactivation_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('class_inactivation_test')))
  controllers = buildControllers()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.clearAllMocks()
  await Promise.all([
    Class.collection.deleteMany({}),
    User.collection.deleteMany({}),
    UserProduct.collection.deleteMany({}),
    UserHistory.collection.deleteMany({}),
    InactivationList.collection.deleteMany({}),
  ])
})

async function seedClass(classId: string, name: string, isActive = true) {
  await Class.collection.insertOne({
    classId,
    name,
    source: 'manual',
    isActive,
    estado: isActive ? 'ativo' : 'inativo',
    studentCount: 0,
  })
}

async function seedActiveStudent(id: number, email: string, classId: string) {
  await User.collection.insertOne({ _id: oid(id), email, name: email, classId, combined: { status: 'ACTIVE' } })
}

describe('classInactivation characterization — createInactivationList', () => {
  it('400s without a classIds array', async () => {
    const captured: Captured = {}
    await controllers.createInactivationList(withBody({ name: 'X' }), makeResponse(captured), noNext)
    expect(captured.status).toBe(400)
  })

  it('inactivates the class students, marks the class inactive, and delegates Discord', async () => {
    await seedClass('c1', 'Class One')
    await seedActiveStudent(1, 's1@x.test', 'c1')

    const captured: Captured = {}
    await controllers.createInactivationList(withBody({ classIds: ['c1'], userId: 'tester' }), makeResponse(captured), noNext)

    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect((body.meta as Body).message).toBe('Lista de inativação criada e turmas atualizadas')
    expect(((body.data as Body).list as Body).totalInactivated).toBe(1)
    expect(((body.data as Body).classUpdates as Body).successful).toBe(1)
    expect((body.meta as Body).timestamp).toBe('2026-02-03T04:05:06.000Z')

    // The injected Discord port is used with the bulk scope — no network.
    expect(discord.delegate).toHaveBeenCalledWith(['c1'], 'discord-inactivation-bulk')

    const student = await User.findById(oid(1)).lean() as { combined?: { status?: string } } | null
    expect(student?.combined?.status).toBe('INACTIVE')
    const cls = await Class.findOne({ classId: 'c1' }).lean()
    expect(cls?.isActive).toBe(false)
    expect(cls?.estado).toBe('inativo')
  })

  it('defaults to OGI platforms and leaves the Clareza UserProduct active', async () => {
    await seedClass('c1', 'Class One')
    await seedActiveStudent(1, 's1@x.test', 'c1')
    await UserProduct.collection.insertMany([
      { _id: oid(101), userId: oid(1), productId: oid(201), platform: 'hotmart', platformUserId: 'h1', enrolledAt: fixedClock.now(), status: 'ACTIVE', source: 'PURCHASE', classes: [] },
      { _id: oid(102), userId: oid(1), productId: oid(202), platform: 'curseduca', platformUserId: 'g1', enrolledAt: fixedClock.now(), status: 'ACTIVE', source: 'PURCHASE', classes: [] },
    ])

    await controllers.createInactivationList(withBody({ classIds: ['c1'], userId: 'tester' }), makeResponse({}), noNext)

    const products = await UserProduct.find({ userId: oid(1) }).sort({ platform: 1 }).lean()
    expect(products.map((product) => [product.platform, product.status])).toEqual([
      ['curseduca', 'ACTIVE'],
      ['hotmart', 'INACTIVE'],
    ])
    const user = await User.findById(oid(1)).lean() as { curseduca?: { memberStatus?: string } } | null
    expect(user?.curseduca?.memberStatus).toBeUndefined()
  })

  it('rejects unbounded, empty or duplicate class mutations', async () => {
    for (const classIds of [Array.from({ length: 101 }, (_, i) => `c${i}`), ['c1', ''], ['c1', 'c1']]) {
      const captured: Captured = {}
      await controllers.createInactivationList(withBody({ classIds }), makeResponse(captured), noNext)
      expect(captured.status).toBe(400)
    }
  })

  it('persists a created list in the canonical collection so the list endpoint returns it', async () => {
    await seedClass('c1', 'Class One')
    await seedActiveStudent(1, 'persisted@x.test', 'c1')

    const created: Captured = {}
    await controllers.createInactivationList(withBody({ name: 'Persistida', classIds: ['c1'], userId: 'tester' }), makeResponse(created), noNext)
    const createdId = ((((created.body as Body).data as Body).list as Body)._id as string)

    const listed: Captured = {}
    await controllers.getInactivationLists(withQuery({ status: 'COMPLETED' }), makeResponse(listed), noNext)
    expect((((listed.body as Body).data as Body).lists as Body[]).map(({ name }) => name)).toContain('Persistida')
    expect(await InactivationList.findById(createdId).lean()).toMatchObject({ name: 'Persistida', status: 'COMPLETED' })
  })
})

describe('classInactivation characterization — getInactivationLists', () => {
  it('returns real lists with resolved names and bounded pagination', async () => {
    await seedClass('c1', 'Class One')
    await InactivationList.collection.insertMany([
      { _id: oid(501), name: 'Nova', status: 'COMPLETED', classIds: ['c1'], classNames: [], students: [{ studentId: oid(1), email: 'a@x.test', classId: 'c1', previousState: 'ativo' }], execution: { totalProcessed: 1, successCount: 1, errorCount: 0 }, createdAt: new Date('2026-02-02') },
      { _id: oid(502), name: 'Antiga', status: 'REVERSED', classIds: ['c1'], classNames: ['Nome guardado'], students: [], execution: { totalProcessed: 0, successCount: 0, errorCount: 0 }, createdAt: new Date('2026-02-01') },
    ])
    await UserHistory.createInactivationHistory(oid(1), 'fake@x.test', ['all'], 'reason', 'tester')

    const captured: Captured = {}
    await controllers.getInactivationLists(withQuery({ limit: '999', offset: '0' }), makeResponse(captured), noNext)

    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect((body.meta as Body).total).toBe(2)
    expect(((body.meta as Body).filters as Body).limit).toBe(200)
    expect((((body.data as Body).lists as Body[])[0])).toMatchObject({ name: 'Nova', classNames: ['Class One'], studentCount: 1 })
  })

  it('accepts every canonical status, rejects the REVERTED typo, and rejects invalid offsets', async () => {
    const canonicalStatuses = ['PENDING', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED']
    for (const [index, status] of canonicalStatuses.entries()) {
      await InactivationList.collection.insertOne({ _id: oid(503 + index), name: status, status, classIds: [], classNames: [], students: [], execution: { totalProcessed: 0, successCount: 0, errorCount: 0 }, createdAt: new Date() })
      const filtered: Captured = {}
      await controllers.getInactivationLists(withQuery({ status, offset: '0' }), makeResponse(filtered), noNext)
      expect((((filtered.body as Body).data as Body).lists as Body[])[0]?.status).toBe(status)
    }

    const typo: Captured = {}
    await controllers.getInactivationLists(withQuery({ status: 'REVERTED' }), makeResponse(typo), noNext)
    expect(typo.status).toBe(400)

    const invalid: Captured = {}
    await controllers.getInactivationLists(withQuery({ offset: '-1' }), makeResponse(invalid), noNext)
    expect(invalid.status).toBe(400)
  })
})

describe('classInactivation characterization — list students and delete history', () => {
  it('paginates real list students, resolves current state and caps the page size', async () => {
    await seedClass('c1', 'Class One')
    await User.collection.insertMany([
      { _id: oid(1), email: 'z@x.test', name: 'Zed', combined: { status: 'INACTIVE' } },
      { _id: oid(2), email: 'a@x.test', name: 'Ana', combined: { status: 'ACTIVE' } },
    ])
    await InactivationList.collection.insertOne({
      _id: oid(510), name: 'Lista', status: 'COMPLETED', classIds: ['c1'], classNames: [], createdAt: new Date(),
      students: [
        { studentId: oid(1), email: 'z@x.test', classId: 'c1', previousState: 'ativo', processed: true },
        { studentId: oid(2), email: 'a@x.test', classId: 'c1', previousState: 'inativo', processed: true },
      ], execution: { totalProcessed: 2, successCount: 2, errorCount: 0 },
    })
    const captured: Captured = {}
    await controllers.getInactivationListStudents(
      { params: { id: oid(510).toString() }, body: {}, query: { limit: '999' } } as unknown as Request,
      makeResponse(captured),
      noNext,
    )
    const body = captured.body as Body
    expect(((body.meta as Body).pagination as Body).limit).toBe(200)
    expect(((body.meta as Body).pagination as Body).total).toBe(2)
    expect((((body.data as Body).students as Body[])[0])).toMatchObject({ nome: 'Ana', turma: 'Class One', estadoAnterior: 'inativo', estadoActual: 'ACTIVE' })
  })

  it('deletes only the list record and leaves student state unchanged', async () => {
    await User.collection.insertOne({ _id: oid(1), email: 'a@x.test', combined: { status: 'INACTIVE' } })
    await InactivationList.collection.insertOne({ _id: oid(511), name: 'Lista', status: 'COMPLETED', classIds: [], classNames: [], students: [{ studentId: oid(1), email: 'a@x.test', classId: 'c1', previousState: 'ativo' }], execution: { totalProcessed: 1, successCount: 1, errorCount: 0 }, createdAt: new Date() })
    const captured: Captured = {}
    await controllers.deleteInactivationList(withParams({ id: oid(511).toString() }), makeResponse(captured), noNext)
    expect(((captured.body as Body).data as Body).removed).toMatchObject({ name: 'Lista', studentsAbrangidos: 1 })
    expect(await InactivationList.findById(oid(511))).toBeNull()
    expect((await User.findById(oid(1)).lean() as { combined?: { status?: string } })?.combined?.status).toBe('INACTIVE')
  })
})

describe('classInactivation characterization — revertInactivation', () => {
  it('400s without an id', async () => {
    const captured: Captured = {}
    await controllers.revertInactivation(withParams({}), makeResponse(captured), noNext)
    expect(captured.status).toBe(400)
  })

  it('404s when the inactivation record is missing', async () => {
    const captured: Captured = {}
    await controllers.revertInactivation(withParams({ id: oid(999).toString() }), makeResponse(captured), noNext)
    expect(captured.status).toBe(404)
  })

  it('reactivates the user and logs a STATUS_CHANGE history', async () => {
    await User.collection.insertOne({ _id: oid(1), email: 's1@x.test', name: 's1', classId: 'c1', combined: { status: 'INACTIVE' } })
    const record = await UserHistory.createInactivationHistory(oid(1), 's1@x.test', ['all'], 'reason', 'tester')
    const recordId = (record as unknown as { _id: mongoose.Types.ObjectId })._id.toString()

    const captured: Captured = {}
    await controllers.revertInactivation(withParams({ id: recordId }, { userId: 'tester' }), makeResponse(captured), noNext)

    expect((captured.body as Body).success).toBe(true)
    const user = await User.findById(oid(1)).lean() as { combined?: { status?: string } } | null
    expect(user?.combined?.status).toBe('ACTIVE')
    expect(await UserHistory.countDocuments({ userId: oid(1), changeType: 'STATUS_CHANGE' })).toBe(1)
  })

  it('reverts only previously-active students and only OGI products', async () => {
    await User.collection.insertMany([
      { _id: oid(1), email: 'active-before@x.test', combined: { status: 'INACTIVE' }, hotmart: { status: 'INACTIVE' }, curseduca: { memberStatus: 'INACTIVE' }, discord: { isActive: false } },
      { _id: oid(2), email: 'inactive-before@x.test', combined: { status: 'INACTIVE' }, hotmart: { status: 'INACTIVE' }, discord: { isActive: false } },
    ])
    await UserProduct.collection.insertMany([
      { _id: oid(111), userId: oid(1), productId: oid(211), platform: 'hotmart', platformUserId: 'h1', enrolledAt: fixedClock.now(), status: 'INACTIVE', source: 'PURCHASE', classes: [] },
      { _id: oid(112), userId: oid(1), productId: oid(212), platform: 'curseduca', platformUserId: 'g1', enrolledAt: fixedClock.now(), status: 'INACTIVE', source: 'PURCHASE', classes: [] },
      { _id: oid(113), userId: oid(2), productId: oid(213), platform: 'hotmart', platformUserId: 'h2', enrolledAt: fixedClock.now(), status: 'INACTIVE', source: 'PURCHASE', classes: [] },
    ])
    await InactivationList.collection.insertOne({
      _id: oid(520), name: 'Lista', status: 'COMPLETED', classIds: ['c1'], classNames: ['Class One'], createdAt: new Date(),
      students: [
        { studentId: oid(1), email: 'active-before@x.test', classId: 'c1', previousState: 'ativo' },
        { studentId: oid(2), email: 'inactive-before@x.test', classId: 'c1', previousState: 'inativo' },
      ], execution: { totalProcessed: 2, successCount: 2, errorCount: 0 },
    })
    const captured: Captured = {}
    await controllers.revertInactivation(withParams({ id: oid(520).toString() }, { userId: 'tester' }), makeResponse(captured), noNext)

    expect(((captured.body as Body).data as Body).result).toMatchObject({ reactivados: 1, jaEstavamInactivos: 1 })
    expect((await User.findById(oid(1)).lean() as { combined?: { status?: string } }).combined?.status).toBe('ACTIVE')
    expect((await User.findById(oid(1)).lean() as { curseduca?: { memberStatus?: string } }).curseduca?.memberStatus).toBe('INACTIVE')
    expect((await User.findById(oid(2)).lean() as { combined?: { status?: string } }).combined?.status).toBe('INACTIVE')
    const products = await UserProduct.find().sort({ _id: 1 }).lean()
    expect(products.map((product) => product.status)).toEqual(['ACTIVE', 'INACTIVE', 'INACTIVE'])
  })

  it('refuses to mutate an oversized reversal list', async () => {
    await InactivationList.collection.insertOne({
      _id: oid(521), name: 'Lista enorme', status: 'COMPLETED', classIds: ['c1'], classNames: ['Class One'], createdAt: new Date(),
      students: Array.from({ length: 5001 }, (_, index) => ({ studentId: oid(10_000 + index), email: `s${index}@x.test`, classId: 'c1', previousState: 'inativo' })),
      execution: { totalProcessed: 5001, successCount: 5001, errorCount: 0 },
    })
    const captured: Captured = {}
    await controllers.revertInactivation(withParams({ id: oid(521).toString() }, { userId: 'tester' }), makeResponse(captured), noNext)
    expect(captured.status).toBe(413)
    expect((await InactivationList.findById(oid(521)).lean())?.status).toBe('COMPLETED')
  })
})

describe('classInactivation characterization — updateClassStatus', () => {
  it('400s without classId or a boolean isActive', async () => {
    const captured: Captured = {}
    await controllers.updateClassStatus(withBody({ classId: 'c1' }), makeResponse(captured), noNext)
    expect(captured.status).toBe(400)
  })

  it('404s when the class is missing', async () => {
    const captured: Captured = {}
    await controllers.updateClassStatus(withBody({ classId: 'ghost', isActive: false }), makeResponse(captured), noNext)
    expect(captured.status).toBe(404)
  })

  it('deactivating inactivates active students and delegates Discord once', async () => {
    await seedClass('c1', 'Class One', true)
    await seedActiveStudent(1, 's1@x.test', 'c1')

    const captured: Captured = {}
    await controllers.updateClassStatus(withBody({ classId: 'c1', isActive: false }), makeResponse(captured), noNext)

    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect((body.data as Body).action).toBe('deactivated')
    expect((body.meta as Body).message).toContain('Turma inativada com sucesso')
    expect(discord.delegate).toHaveBeenCalledWith(['c1'], 'discord-inactivation-single')

    const student = await User.findById(oid(1)).lean() as { combined?: { status?: string } } | null
    expect(student?.combined?.status).toBe('INACTIVE')
    const cls = await Class.findOne({ classId: 'c1' }).lean()
    expect(cls?.isActive).toBe(false)
  })

  it('reactivating restores manually-inactivated students without calling Discord', async () => {
    await seedClass('c1', 'Class One', false)
    await User.collection.insertOne({
      _id: oid(2),
      email: 's2@x.test',
      name: 's2',
      classId: 'c1',
      combined: { status: 'INACTIVE' },
      inactivation: { isManuallyInactivated: true, classId: 'c1' },
    })

    const captured: Captured = {}
    await controllers.updateClassStatus(withBody({ classId: 'c1', isActive: true }), makeResponse(captured), noNext)

    const body = captured.body as Body
    expect((body.data as Body).action).toBe('reactivated')
    expect((body.meta as Body).message).toContain('Turma ativada com sucesso')
    expect(discord.delegate).not.toHaveBeenCalled()

    const student = await User.findById(oid(2)).lean() as { combined?: { status?: string } } | null
    expect(student?.combined?.status).toBe('ACTIVE')
  })
})

describe('classInactivation SEC-10 boundaries', () => {
  const boundary = async (build: (svc: never) => RequestHandler, req: Request, code: string) => {
    const failing = {
      async createList() { throw new Error('boom') },
      async listInactivations() { throw new Error('boom') },
      async listStudents() { throw new Error('boom') },
      async deleteList() { throw new Error('boom') },
      async revert() { throw new Error('boom') },
      async updateStatus() { throw new Error('boom') },
    }
    const handler = build(failing as never)
    const next = jest.fn()
    await handler(req, makeResponse({}), next as unknown as NextFunction)
    expect((next.mock.calls[0]?.[0] as HttpError)).toMatchObject({ status: 500, code })
  }

  it('createInactivationList -> CLASS_INACTIVATION_CREATE_FAILED', () =>
    boundary(createCreateInactivationListController, withBody({ classIds: ['c1'] }), 'CLASS_INACTIVATION_CREATE_FAILED'))

  it('getInactivationLists -> CLASS_INACTIVATION_LIST_FAILED', () =>
    boundary(createGetInactivationListsController, withQuery({}), 'CLASS_INACTIVATION_LIST_FAILED'))

  it('revertInactivation -> CLASS_INACTIVATION_REVERT_FAILED', () =>
    boundary(createRevertInactivationController, withParams({ id: oid(999).toString() }), 'CLASS_INACTIVATION_REVERT_FAILED'))

  it('updateClassStatus -> CLASS_UPDATE_STATUS_FAILED', () =>
    boundary(createUpdateClassStatusController, withBody({ classId: 'c1', isActive: false }), 'CLASS_UPDATE_STATUS_FAILED'))
})
