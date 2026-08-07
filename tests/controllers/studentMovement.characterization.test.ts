import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { classesController } from '../../src/controllers/classes.controller'
import { Class, ClassHistory } from '../../src/models/Class'
import { User } from '../../src/models'

type Handler = (req: Request, res: Response) => Promise<void>
const cc = classesController as unknown as Record<string, unknown>
const moveStudent = cc.moveStudent as Handler
const moveMultipleStudents = cc.moveMultipleStudents as Handler

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

const req = (body: Record<string, unknown>): Request => ({ body } as unknown as Request)
const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))
let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'student_movement_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('student_movement_test')))
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
    ClassHistory.collection.deleteMany({}),
  ])
})

async function seedStudentInClass(id: number, email: string, classId: string, className: string) {
  await User.collection.insertOne({
    _id: oid(id),
    email,
    name: email,
    classId,
    className,
    status: 'ACTIVE',
  })
}

async function seedClass(classId: string, name: string) {
  await Class.collection.insertOne({ classId, name, source: 'manual', studentCount: 0 })
}

describe('studentMovement characterization — moveStudent (POST /moveStudent)', () => {
  it('400s without studentId or toClassId', async () => {
    const captured: Captured = {}
    await moveStudent(req({ studentId: 's1' }), makeResponse(captured))
    expect(captured.status).toBe(400)
  })

  it('moves a student, records history, and updates both class counts', async () => {
    await seedClass('from', 'From Class')
    await seedClass('to', 'To Class')
    await seedStudentInClass(1, 's1@x.test', 'from', 'From Class')

    const captured: Captured = {}
    await moveStudent(req({ studentId: oid(1).toString(), toClassId: 'to', reason: 'promo' }), makeResponse(captured))

    const body = captured.body as Body
    expect(body.success).toBe(true)
    expect(body.message).toBe('Estudante movido com sucesso')

    const moved = await User.findById(oid(1)).lean()
    expect(moved?.classId).toBe('to')
    expect(moved?.className).toBe('To Class')

    const history = await ClassHistory.findOne({ studentId: oid(1).toString() }).lean()
    expect(history).toMatchObject({ action: 'MOVE', classId: 'to', fromClassId: 'from', reason: 'promo' })

    const toClass = await Class.findOne({ classId: 'to' }).lean()
    const fromClass = await Class.findOne({ classId: 'from' }).lean()
    expect(toClass?.studentCount).toBe(1)
    expect(fromClass?.studentCount).toBe(0)
  })

  it('surfaces a missing student as a local 500', async () => {
    await seedClass('to', 'To Class')
    const captured: Captured = {}
    await moveStudent(req({ studentId: oid(99).toString(), toClassId: 'to' }), makeResponse(captured))
    expect(captured.status).toBe(500)
  })
})

describe('studentMovement characterization — moveMultipleStudents (POST /moveMultipleStudents)', () => {
  it('400s without a studentIds array or toClassId', async () => {
    const captured: Captured = {}
    await moveMultipleStudents(req({ toClassId: 'to' }), makeResponse(captured))
    expect(captured.status).toBe(400)
  })

  it('reports per-student success and errors', async () => {
    await seedClass('to', 'To Class')
    await seedStudentInClass(1, 'a@x.test', 'from', 'From Class')

    const captured: Captured = {}
    await moveMultipleStudents(
      req({ studentIds: [oid(1).toString(), oid(98).toString()], toClassId: 'to' }),
      makeResponse(captured),
    )

    const body = captured.body as Body
    expect(body.success).toBe(true)
    const results = body.results as { success: unknown[]; errors: unknown[] }
    expect(results.success).toHaveLength(1)
    expect(results.errors).toHaveLength(1)
    expect(body.message).toContain('1 sucessos, 1 erros')
  })
})
