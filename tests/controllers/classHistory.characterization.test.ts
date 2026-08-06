import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { classesController } from '../../src/controllers/classes.controller'
import { Class } from '../../src/models/Class'
import { User } from '../../src/models'
import StudentClassHistory from '../../src/models/StudentClassHistory'
import UserHistory from '../../src/models/UserHistory'
import SyncHistory from '../../src/models/SyncHistory'

type AnyHandler = (req: Request, res: Response) => Promise<void>
const cc = classesController as unknown as Record<string, AnyHandler>
const getClassHistory = cc.getClassHistory
const getStudentHistoryByDiscord = cc.getStudentHistoryByDiscord
const getStudentHistoryByEmail = cc.getStudentHistoryByEmail
const getClassCompleteHistory = cc.getClassCompleteHistory

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

const req = (params: Record<string, unknown>, query: Record<string, unknown> = {}): Request =>
  ({ params, query } as unknown as Request)

let mongoServer: MongoMemoryServer
const userId = new mongoose.Types.ObjectId()
const d1 = new Date('2026-08-01T10:00:00.000Z')
const d2 = new Date('2026-08-02T10:00:00.000Z')
const d3 = new Date('2026-08-03T10:00:00.000Z')

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'class_history_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('class_history_test')))
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
    UserHistory.collection.deleteMany({}),
    SyncHistory.collection.deleteMany({}),
  ])
})

const seedStudentAndMovement = async () => {
  await User.collection.insertOne({ _id: userId, name: 'Ana', email: 's1@x.test', classId: 'C1', discord: { discordIds: ['d-1'] } })
  await StudentClassHistory.collection.insertOne({
    studentId: userId, classId: 'C1', className: 'Turma 1', previousClassName: null,
    dateMoved: d1, reason: 'inicial', movedBy: 'admin',
  })
}

describe('class history characterization', () => {
  describe('getClassHistory (GET /history)', () => {
    it('filters by classId, sorts by dateMoved desc and echoes filters', async () => {
      await seedStudentAndMovement()
      await StudentClassHistory.collection.insertOne({
        studentId: userId, classId: 'C1', className: 'Turma 1', dateMoved: d3, movedBy: 'admin',
      })
      const captured: Captured = {}
      await getClassHistory(req({}, { classId: 'C1' }), makeResponse(captured))

      const body = captured.body as Body
      expect(body.success).toBe(true)
      expect(body.total).toBe(2)
      expect(body.history).toHaveLength(2)
      expect(new Date(body.history[0].dateMoved).getTime())
        .toBeGreaterThan(new Date(body.history[1].dateMoved).getTime())
      expect(body.filters).toMatchObject({ classId: 'C1', limit: 50, offset: 0 })
      expect(typeof body.timestamp).toBe('string')
    })

    it('answers failures with a local 500 envelope', async () => {
      jest.spyOn(StudentClassHistory, 'countDocuments').mockImplementation((() => { throw new Error('boom') }) as never)
      const captured: Captured = {}
      await getClassHistory(req({}, {}), makeResponse(captured))
      expect(captured.status).toBe(500)
      expect(captured.body).toMatchObject({ success: false, message: 'Erro ao buscar histórico' })
    })
  })

  describe('getStudentHistoryByDiscord (GET /studentHistory/:discordId)', () => {
    it('404s when no user matches the discord id', async () => {
      const captured: Captured = {}
      await getStudentHistoryByDiscord(req({ discordId: 'nope' }), makeResponse(captured))
      expect(captured.status).toBe(404)
      expect(captured.body).toMatchObject({ success: false })
    })

    it('returns the student and their movement history', async () => {
      await seedStudentAndMovement()
      const captured: Captured = {}
      await getStudentHistoryByDiscord(req({ discordId: 'd-1' }), makeResponse(captured))
      const body = captured.body as Body
      expect(body.success).toBe(true)
      expect(body.student).toMatchObject({ email: 's1@x.test' })
      expect(body.total).toBe(1)
    })
  })

  describe('getStudentHistoryByEmail (GET /studentHistoryByEmail/:email)', () => {
    it('lowercases the email and 404s when missing', async () => {
      const captured: Captured = {}
      await getStudentHistoryByEmail(req({ email: 'MISSING@X.TEST' }), makeResponse(captured))
      expect(captured.status).toBe(404)
    })

    it('finds the student by lowercased email', async () => {
      await seedStudentAndMovement()
      const captured: Captured = {}
      await getStudentHistoryByEmail(req({ email: 'S1@X.TEST' }), makeResponse(captured))
      const body = captured.body as Body
      expect(body.success).toBe(true)
      expect(body.student).toMatchObject({ email: 's1@x.test' })
      expect(body.total).toBe(1)
    })
  })

  describe('getClassCompleteHistory (GET /:classId/complete-history)', () => {
    const seedComplete = async () => {
      await seedStudentAndMovement()
      await UserHistory.collection.insertOne({
        userId, changeType: 'EMAIL_CHANGE', changeDate: d2, userEmail: 's1@x.test',
        field: 'email', previousValue: 'old', newValue: 'new', changedBy: 'admin',
      })
      await SyncHistory.collection.insertOne({
        type: 'hotmart', status: 'completed', metadata: { classIds: 'C1' }, startedAt: d3, stats: {},
      })
      await Class.collection.insertOne({ classId: 'C1', name: 'Turma 1', source: 'hotmart', code: 'C1' })
    }

    it('400s without a classId', async () => {
      const captured: Captured = {}
      await getClassCompleteHistory(req({ classId: '' }), makeResponse(captured))
      expect(captured.status).toBe(400)
    })

    it('404s when the class is not found', async () => {
      const captured: Captured = {}
      await getClassCompleteHistory(req({ classId: 'GHOST' }), makeResponse(captured))
      expect(captured.status).toBe(404)
    })

    it('merges movements, user changes and syncs, sorted by date desc', async () => {
      await seedComplete()
      const captured: Captured = {}
      await getClassCompleteHistory(req({ classId: 'C1' }), makeResponse(captured))
      const body = captured.body as Body
      expect(body.success).toBe(true)
      expect(body.className).toBe('Turma 1')
      expect(body.history.map((h: Body) => h.type)).toEqual(['SYNC', 'USER_CHANGE', 'STUDENT_MOVEMENT'])
      expect(body.total).toBe(3)
      expect(typeof body.timestamp).toBe('string')
    })

    it('absorbs a failing source and still returns the others (partial success)', async () => {
      await seedComplete()
      jest.spyOn(StudentClassHistory, 'find').mockImplementation((() => { throw new Error('movements down') }) as never)
      const captured: Captured = {}
      await getClassCompleteHistory(req({ classId: 'C1' }), makeResponse(captured))
      const body = captured.body as Body
      expect(body.success).toBe(true)
      expect(body.history.map((h: Body) => h.type)).toEqual(['SYNC', 'USER_CHANGE'])
      expect(body.total).toBe(2)
    })

    it('applies limit/offset in each source query and again on the merged array (known legacy double pagination)', async () => {
      await seedComplete()
      const captured: Captured = {}
      // limit 1 keeps at most 1 per source query, then slices the merged array again.
      await getClassCompleteHistory(req({ classId: 'C1' }, { limit: '1', offset: '0' }), makeResponse(captured))
      const body = captured.body as Body
      expect(body.history).toHaveLength(1)
      expect(body.pagination).toMatchObject({ limit: 1, offset: 0 })
    })
  })
})
