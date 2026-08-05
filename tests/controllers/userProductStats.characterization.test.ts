import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import User from '../../src/models/user'
import { getProductStats as legacyHandler } from '../../src/controllers/users.controller'

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>
const getProductStats = legacyHandler as unknown as Handler

type StatsBody = {
  success: boolean
  stats: {
    total: number
    grandeInvestimento: number
    relatoriosClareza: number
    ambos: number
    semProdutos: number
    hotmart: number
    curseduca: number
  }
  timestamp: string
}
type Captured = { status?: number; body?: StatsBody }

function makeResponse(captured: Captured): Response {
  const res = {
    status(code: number) {
      captured.status = code
      return res
    },
    json(body: unknown) {
      captured.body = body as StatsBody
      return res
    },
  }
  return res as unknown as Response
}

const req = {} as Request
let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'user_product_stats_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('user_product_stats_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await User.collection.deleteMany({})
})

describe('GET /api/users/getProductStats — product membership stats characterization', () => {
  it('counts product membership from className over non-deleted users', async () => {
    await User.collection.insertMany([
      { email: 'a@x.test', className: 'Grande Investimento 2024', hotmartUserId: 'H1' },
      { email: 'b@x.test', className: 'Relatórios Clareza', curseducaUserId: 'C1' },
      { email: 'c@x.test', className: 'Grande Investimento e Relatórios Clareza' },
      { email: 'd@x.test', className: 'Curso Avulso' },
      { email: 'e@x.test', isDeleted: true, className: 'Grande Investimento', hotmartUserId: 'H9' },
    ])

    const captured: Captured = {}
    await getProductStats(req, makeResponse(captured), jest.fn() as unknown as NextFunction)

    const body = captured.body as StatsBody
    expect(body.success).toBe(true)
    expect(typeof body.timestamp).toBe('string')
    expect(body.stats).toEqual({
      total: 4,
      grandeInvestimento: 2,
      relatoriosClareza: 2,
      ambos: 1,
      semProdutos: 1,
      hotmart: 1,
      curseduca: 1,
    })
  })

  it('returns a zero-shaped snapshot when there are no users', async () => {
    const captured: Captured = {}
    await getProductStats(req, makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect((captured.body as StatsBody).stats).toEqual({
      total: 0,
      grandeInvestimento: 0,
      relatoriosClareza: 0,
      ambos: 0,
      semProdutos: 0,
      hotmart: 0,
      curseduca: 0,
    })
  })

  // Current behaviour: a local 500 whose body leaks the raw error message.
  it('answers failures with a local 500 envelope', async () => {
    jest.spyOn(User, 'find').mockImplementation((() => { throw new Error('boom') }) as never)

    const captured: Captured = {}
    await getProductStats(req, makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect(captured.status).toBe(500)
    expect(captured.body).toMatchObject({ success: false })
  })
})
