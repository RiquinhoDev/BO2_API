import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { searchStudents as rtSearch } from '../../src/services/classes/classRoster.runtime'
import { User } from '../../src/models'

type Handler = (req: Request, res: Response, next?: NextFunction) => Promise<void>
const searchStudents = rtSearch as unknown as Handler

type Student = { name?: string; email?: string; [k: string]: unknown }
type Body = {
  success?: boolean
  data?: { students?: Student[] }
  meta?: { multiple?: boolean; total?: number }
  [k: string]: unknown
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

const req = (query: Record<string, unknown>): Request => ({ params: {}, query } as unknown as Request)
const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))
let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'class_roster_hardening_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('class_roster_hardening_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await User.collection.deleteMany({})
  await User.collection.insertMany([
    { _id: oid(1), name: 'A.B', email: 'ab@x.test' },
    { _id: oid(2), name: 'AXB', email: 'axb@x.test' },
    { _id: oid(3), name: 'Disc', email: 'disc@x.test', discord: { discordIds: ['dx'] } },
  ])
})

describe('classRoster hardening — search', () => {
  it('treats the name term as a literal regex (dot matches only a dot)', async () => {
    const captured: Captured = {}
    await searchStudents(req({ name: 'A.B' }), makeResponse(captured))
    const body = captured.body as Body
    // Escaped: only the literal "A.B" matches, not "AXB".
    expect(body.meta?.multiple).toBe(false)
    expect(body.data?.students).toHaveLength(1)
    expect(body.data?.students?.[0].name).toBe('A.B')
  })

  it('searches Discord by the canonical discord.discordIds schema path', async () => {
    const captured: Captured = {}
    await searchStudents(req({ discordId: 'dx' }), makeResponse(captured))
    const body = captured.body as Body
    expect(body.meta?.multiple).toBe(false)
    expect(body.data?.students).toHaveLength(1)
    expect(body.data?.students?.[0].email).toBe('disc@x.test')
  })
})
