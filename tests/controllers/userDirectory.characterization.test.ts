import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import User from '../../src/models/user'
import { HttpError } from '../../src/security/errorHandling'
import { getAllUsersUnified as extractedHandler } from '../../src/services/users/userDirectory.runtime'

type DirectoryHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>
const getAllUsersUnified = extractedHandler as unknown as DirectoryHandler

type DirectoryBody = {
  success: boolean
  users: Array<{ email?: string; name?: string }>
  pagination: { page: number; limit: number; total: number; pages: number }
}

type Captured = { status?: number; body?: DirectoryBody }

function makeResponse(captured: Captured): Response {
  const res = {
    status(code: number) {
      captured.status = code
      return res
    },
    json(body: unknown) {
      captured.body = body as DirectoryBody
      return res
    },
  }
  return res as unknown as Response
}

const request = (query: Record<string, unknown>): Request =>
  ({ query } as unknown as Request)

const emailsOf = (body: DirectoryBody): string[] =>
  body.users.map(user => user.email ?? '').sort()

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'user_directory_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('user_directory_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await User.collection.deleteMany({})
})

const seed = async (): Promise<void> => {
  await User.collection.insertMany([
    { name: 'Ana Silva', email: 'ana@example.test', status: 'ACTIVE', hotmartUserId: 'H1' },
    {
      name: 'Bruno Costa',
      email: 'bruno@example.test',
      curseducaUserId: 'C1',
      combined: { status: 'INACTIVE' },
    },
    // Soft-deleted: excluded from every listing by the isDeleted base filter.
    { name: 'Del Removed', email: 'del@example.test', isDeleted: true, hotmartUserId: 'H2' },
  ])
}

describe('GET /api/users/unified — user directory characterization', () => {
  it('lists non-deleted users with default pagination', async () => {
    await seed()
    const captured: Captured = {}
    await getAllUsersUnified(request({}), makeResponse(captured), jest.fn() as unknown as NextFunction)

    const body = captured.body as DirectoryBody
    expect(body.success).toBe(true)
    expect(emailsOf(body)).toEqual(['ana@example.test', 'bruno@example.test'])
    expect(body.pagination).toEqual({ page: 1, limit: 1000, total: 2, pages: 1 })
  })

  it('filters by active status', async () => {
    await seed()
    const captured: Captured = {}
    await getAllUsersUnified(request({ status: 'active' }), makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect(emailsOf(captured.body as DirectoryBody)).toEqual(['ana@example.test'])
  })

  it('filters by hotmart platform', async () => {
    await seed()
    const captured: Captured = {}
    await getAllUsersUnified(request({ platform: 'hotmart' }), makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect(emailsOf(captured.body as DirectoryBody)).toEqual(['ana@example.test'])
  })

  it('searches across name, email and username', async () => {
    await seed()
    const captured: Captured = {}
    await getAllUsersUnified(request({ search: 'bruno' }), makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect(emailsOf(captured.body as DirectoryBody)).toEqual(['bruno@example.test'])
  })

  it('combines a platform filter with search through $and', async () => {
    await seed()
    const captured: Captured = {}
    await getAllUsersUnified(
      request({ platform: 'hotmart', search: 'ana' }),
      makeResponse(captured),
      jest.fn() as unknown as NextFunction,
    )

    expect(emailsOf(captured.body as DirectoryBody)).toEqual(['ana@example.test'])
  })

  it('paginates with skip and reports the page count', async () => {
    await seed()
    const captured: Captured = {}
    await getAllUsersUnified(
      request({ limit: '1', page: '1' }),
      makeResponse(captured),
      jest.fn() as unknown as NextFunction,
    )

    const body = captured.body as DirectoryBody
    expect(body.users).toHaveLength(1)
    expect(body.pagination).toEqual({ page: 1, limit: 1, total: 2, pages: 2 })
  })

  it('returns an empty listing when nothing matches', async () => {
    const captured: Captured = {}
    await getAllUsersUnified(request({}), makeResponse(captured), jest.fn() as unknown as NextFunction)

    expect(captured.body).toEqual({
      success: true,
      users: [],
      pagination: { page: 1, limit: 1000, total: 0, pages: 0 },
    })
  })

  // SEC-10: failures now route through the central handler with a stable code
  // and no leaked detail, replacing the legacy local-500 envelope.
  it('reports failure through next(HttpError) with USER_DIRECTORY_FAILED', async () => {
    jest.spyOn(User, 'find').mockImplementation((() => { throw new Error('boom') }) as never)

    const captured: Captured = {}
    const next = jest.fn()
    await getAllUsersUnified(request({}), makeResponse(captured), next as unknown as NextFunction)

    expect(captured.body).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
    const error = next.mock.calls[0]?.[0] as HttpError
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 500, code: 'USER_DIRECTORY_FAILED' })
    expect(error.message).not.toContain('boom')
  })
})
