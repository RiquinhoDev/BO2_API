// The Discord delegation posts to the old API over the network; mock axios so
// the whole suite stays offline. The extraction replaces this with an injected
// port, at which point tests will mock the port instead of global axios.
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn().mockRejectedValue(new Error('offline: discord delegation not called in tests')),
    isAxiosError: () => false,
  },
}))

import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { classesController } from '../../src/controllers/classes.controller'
import { Class } from '../../src/models/Class'
import { User, UserProduct } from '../../src/models'
import UserHistory from '../../src/models/UserHistory'

type Handler = (req: Request, res: Response) => Promise<void>
const cc = classesController as unknown as Record<string, Handler>
const createInactivationList = cc.createInactivationList
const getInactivationLists = cc.getInactivationLists
const revertInactivation = cc.revertInactivation
const updateClassStatus = cc.updateClassStatus

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

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'class_inactivation_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('class_inactivation_test')))
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
  await User.collection.insertOne({
    _id: oid(id),
    email,
    name: email,
    classId,
    combined: { status: 'ACTIVE' },
  })
}

describe('classInactivation characterization — createInactivationList', () => {
  it('400s without a classIds array', async () => {
    const captured: Captured = {}
    await createInactivationList(withBody({ name: 'X' }), makeResponse(captured))
    expect(captured.status).toBe(400)
  })

  it('inactivates the class students and marks the class inactive', async () => {
    await seedClass('c1', 'Class One')
    await seedActiveStudent(1, 's1@x.test', 'c1')

    const captured: Captured = {}
    await createInactivationList(withBody({ classIds: ['c1'], userId: 'tester' }), makeResponse(captured))

    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect(body.message).toBe('Lista de inativação criada e turmas atualizadas')
    expect((body.list as Body).totalInactivated).toBe(1)
    expect((body.classUpdates as Body).successful).toBe(1)

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
    await getInactivationLists(withQuery({}), makeResponse(captured))

    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect(body.total).toBe(1)
    expect((body.lists as unknown[])).toHaveLength(1)
  })
})

describe('classInactivation characterization — revertInactivation', () => {
  it('400s without an id', async () => {
    const captured: Captured = {}
    await revertInactivation(withParams({}), makeResponse(captured))
    expect(captured.status).toBe(400)
  })

  it('404s when the inactivation record is missing', async () => {
    const captured: Captured = {}
    await revertInactivation(withParams({ id: oid(999).toString() }), makeResponse(captured))
    expect(captured.status).toBe(404)
  })

  it('reactivates the user and logs a STATUS_CHANGE history', async () => {
    await User.collection.insertOne({
      _id: oid(1),
      email: 's1@x.test',
      name: 's1',
      classId: 'c1',
      combined: { status: 'INACTIVE' },
    })
    const record = await UserHistory.createInactivationHistory(oid(1), 's1@x.test', ['all'], 'reason', 'tester')
    const recordId = (record as unknown as { _id: mongoose.Types.ObjectId })._id.toString()

    const captured: Captured = {}
    await revertInactivation(withParams({ id: recordId }, { userId: 'tester' }), makeResponse(captured))

    expect((captured.body as Body).success).toBe(true)
    const user = await User.findById(oid(1)).lean() as { combined?: { status?: string } } | null
    expect(user?.combined?.status).toBe('ACTIVE')
    expect(await UserHistory.countDocuments({ userId: oid(1), changeType: 'STATUS_CHANGE' })).toBe(1)
  })
})

describe('classInactivation characterization — updateClassStatus', () => {
  it('400s without classId or a boolean isActive', async () => {
    const captured: Captured = {}
    await updateClassStatus(withBody({ classId: 'c1' }), makeResponse(captured))
    expect(captured.status).toBe(400)
  })

  it('404s when the class is missing', async () => {
    const captured: Captured = {}
    await updateClassStatus(withBody({ classId: 'ghost', isActive: false }), makeResponse(captured))
    expect(captured.status).toBe(404)
  })

  it('deactivating a class inactivates its active students', async () => {
    await seedClass('c1', 'Class One', true)
    await seedActiveStudent(1, 's1@x.test', 'c1')

    const captured: Captured = {}
    await updateClassStatus(withBody({ classId: 'c1', isActive: false }), makeResponse(captured))

    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect(body.action).toBe('deactivated')
    expect(body.message).toContain('Turma inativada com sucesso')

    const student = await User.findById(oid(1)).lean() as { combined?: { status?: string } } | null
    expect(student?.combined?.status).toBe('INACTIVE')
    const cls = await Class.findOne({ classId: 'c1' }).lean()
    expect(cls?.isActive).toBe(false)
  })

  it('reactivating a class restores its manually-inactivated students', async () => {
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
    await updateClassStatus(withBody({ classId: 'c1', isActive: true }), makeResponse(captured))

    const body = captured.body as Body
    expect(body.action).toBe('reactivated')
    expect(body.message).toContain('Turma ativada com sucesso')

    const student = await User.findById(oid(2)).lean() as { combined?: { status?: string } } | null
    expect(student?.combined?.status).toBe('ACTIVE')
  })
})
