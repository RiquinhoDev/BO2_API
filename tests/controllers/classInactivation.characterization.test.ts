import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import {
  createCreateInactivationListController,
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
    expect(body.message).toBe('Lista de inativação criada e turmas atualizadas')
    expect((body.list as Body).totalInactivated).toBe(1)
    expect((body.classUpdates as Body).successful).toBe(1)
    expect(body.timestamp).toBe('2026-02-03T04:05:06.000Z')

    // The injected Discord port is used with the bulk scope — no network.
    expect(discord.delegate).toHaveBeenCalledWith(['c1'], 'discord-inactivation-bulk')

    const student = await User.findById(oid(1)).lean() as { combined?: { status?: string } } | null
    expect(student?.combined?.status).toBe('INACTIVE')
    const cls = await Class.findOne({ classId: 'c1' }).lean()
    expect(cls?.isActive).toBe(false)
    expect(cls?.estado).toBe('inativo')
  })
})

describe('classInactivation characterization — getInactivationLists', () => {
  it('returns one list per INACTIVATION history record', async () => {
    await seedClass('c1', 'Class One')
    await seedActiveStudent(1, 's1@x.test', 'c1')
    await UserHistory.createInactivationHistory(oid(1), 's1@x.test', ['all'], 'reason', 'tester')

    const captured: Captured = {}
    await controllers.getInactivationLists(withQuery({}), makeResponse(captured), noNext)

    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect(body.total).toBe(1)
    expect((body.lists as unknown[])).toHaveLength(1)
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
    expect(body.action).toBe('deactivated')
    expect(body.message).toContain('Turma inativada com sucesso')
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
    expect(body.action).toBe('reactivated')
    expect(body.message).toContain('Turma ativada com sucesso')
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
    boundary(createRevertInactivationController, withParams({ id: 'x' }), 'CLASS_INACTIVATION_REVERT_FAILED'))

  it('updateClassStatus -> CLASS_UPDATE_STATUS_FAILED', () =>
    boundary(createUpdateClassStatusController, withBody({ classId: 'c1', isActive: false }), 'CLASS_UPDATE_STATUS_FAILED'))
})
