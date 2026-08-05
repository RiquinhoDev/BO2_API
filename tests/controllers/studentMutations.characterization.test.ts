import fs from 'node:fs'
import path from 'node:path'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import type { NextFunction, Request, Response } from 'express'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import User from '../../src/models/user'
import StudentClassHistory from '../../src/models/StudentClassHistory'
import {
  editStudent as legacyEdit,
  syncSpecificStudent as legacySync,
  deleteStudent as legacyDelete,
} from '../../src/controllers/users.controller'

type ReqHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>
type DeleteInput = { params: { id: string }; query: { permanent?: 'true' | 'false' } }
type DeleteHandler = (input: DeleteInput, res: Response, next: NextFunction) => Promise<void>

const editStudent = legacyEdit as unknown as ReqHandler
const syncSpecificStudent = legacySync as unknown as ReqHandler
const deleteStudent = legacyDelete as unknown as DeleteHandler

type Captured = { status?: number; body?: Record<string, unknown> }

function makeResponse(captured: Captured): Response {
  const res = {
    status(code: number) {
      captured.status = code
      return res
    },
    json(body: unknown) {
      captured.body = body as Record<string, unknown>
      return res
    },
  }
  return res as unknown as Response
}

const noop = jest.fn() as unknown as NextFunction
const missingId = () => new mongoose.Types.ObjectId().toString()
let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'student_mutations_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('student_mutations_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  await Promise.all([
    User.collection.deleteMany({}),
    StudentClassHistory.collection.deleteMany({}),
  ])
})

const seedUser = async (): Promise<string> => {
  const id = new mongoose.Types.ObjectId()
  await User.collection.insertOne({ _id: id, name: 'Ana', email: 'ana@x.test', status: 'ACTIVE' })
  return id.toString()
}

describe('student mutations characterization', () => {
  describe('editStudent (PUT /:id and /editStudent/:id)', () => {
    it('is wired to both mounts', () => {
      const routes = fs.readFileSync(path.join(process.cwd(), 'src/routes/users.routes.ts'), 'utf8')
      expect(routes).toMatch(/router\.put\("\/:id", editStudent\)/)
      expect(routes).toMatch(/router\.put\("\/editStudent\/:id", editStudent\)/)
    })

    it('404s when the student is missing', async () => {
      const captured: Captured = {}
      await editStudent({ params: { id: missingId() }, body: {} } as unknown as Request, makeResponse(captured), noop)
      expect(captured.status).toBe(404)
      expect(captured.body).toEqual({ message: 'Aluno não encontrado' })
    })

    it('400s on an invalid email', async () => {
      const id = await seedUser()
      const captured: Captured = {}
      await editStudent({ params: { id }, body: { email: 'not-an-email' } } as unknown as Request, makeResponse(captured), noop)
      expect(captured.status).toBe(400)
      expect(captured.body).toEqual({ message: 'Email inválido' })
    })

    it('updates the name and returns the document', async () => {
      const id = await seedUser()
      const captured: Captured = {}
      await editStudent({ params: { id }, body: { name: 'Ana Maria' } } as unknown as Request, makeResponse(captured), noop)
      expect(captured.status).toBe(200)
      expect(captured.body).toMatchObject({ name: 'Ana Maria' })
    })

    it('dedupes discordIds into both shapes and recalculates combined data', async () => {
      const id = await seedUser()
      const updateSpy = jest.spyOn(User, 'findByIdAndUpdate')
      const captured: Captured = {}
      await editStudent(
        { params: { id }, body: { discordIds: ['1', '1', '2'] } } as unknown as Request,
        makeResponse(captured),
        noop,
      )
      expect(captured.status).toBe(200)
      // First update is the edit itself: deduped ids written to both shapes.
      const editPayload = updateSpy.mock.calls[0]?.[1] as Record<string, unknown>
      expect(editPayload['discord.discordIds']).toEqual(['1', '2'])
      expect(editPayload['discordIds']).toEqual(['1', '2'])
      // Second update is recalculateCombinedData persisting the combined block.
      expect(updateSpy.mock.calls).toHaveLength(2)
      expect(updateSpy.mock.calls[1]?.[1]).toHaveProperty('combined')
    })

    it('answers a local 500 on failure', async () => {
      jest.spyOn(User, 'findById').mockImplementation((() => { throw new Error('boom') }) as never)
      const captured: Captured = {}
      await editStudent({ params: { id: missingId() }, body: {} } as unknown as Request, makeResponse(captured), noop)
      expect(captured.status).toBe(500)
      expect(captured.body).toMatchObject({ message: 'Erro ao atualizar aluno' })
    })
  })

  describe('syncSpecificStudent (POST /:id/sync and /student/:id/sync)', () => {
    it('is wired to both mounts', () => {
      const routes = fs.readFileSync(path.join(process.cwd(), 'src/routes/users.routes.ts'), 'utf8')
      expect(routes).toMatch(/router\.post\("\/:id\/sync", syncSpecificStudent\)/)
      expect(routes).toMatch(/router\.post\("\/student\/:id\/sync", syncSpecificStudent\)/)
    })

    it('404s when the student is missing', async () => {
      const captured: Captured = {}
      await syncSpecificStudent({ params: { id: missingId() } } as unknown as Request, makeResponse(captured), noop)
      expect(captured.status).toBe(404)
      expect(captured.body).toEqual({ message: 'Aluno não encontrado.' })
    })

    it('confirms the student and echoes the email', async () => {
      const id = await seedUser()
      const captured: Captured = {}
      await syncSpecificStudent({ params: { id } } as unknown as Request, makeResponse(captured), noop)
      expect(captured.status).toBe(200)
      expect(captured.body).toEqual({
        message: 'Sincronização específica iniciada para o aluno.',
        email: 'ana@x.test',
      })
    })

    it('answers a local 500 on failure', async () => {
      jest.spyOn(User, 'findById').mockImplementation((() => { throw new Error('boom') }) as never)
      const captured: Captured = {}
      await syncSpecificStudent({ params: { id: missingId() } } as unknown as Request, makeResponse(captured), noop)
      expect(captured.status).toBe(500)
      expect(captured.body).toMatchObject({ message: 'Erro ao sincronizar aluno.' })
    })
  })

  describe('deleteStudent (DELETE /:id and /student/:id via withValidatedInput)', () => {
    it('is wired to both mounts behind the validated wrapper', () => {
      const routes = fs.readFileSync(path.join(process.cwd(), 'src/routes/users.routes.ts'), 'utf8')
      expect(routes).toMatch(/router\.delete\(\s*"\/:id",\s*withValidatedInput\(usersDeleteStudentInput/)
      expect(routes).toMatch(/router\.delete\(\s*"\/student\/:id",\s*withValidatedInput\(usersDeleteStudentInput/)
    })

    it('soft-deletes by default: issues the blocking update', async () => {
      const id = await seedUser()
      const updateSpy = jest.spyOn(User, 'findByIdAndUpdate')
      const captured: Captured = {}
      await deleteStudent({ params: { id }, query: {} }, makeResponse(captured), noop)
      expect(captured.status).toBe(200)
      expect(captured.body).toMatchObject({ message: 'Aluno marcado como inativo' })
      expect(updateSpy).toHaveBeenCalledWith(
        id,
        { status: 'BLOCKED', estado: 'inativo', updatedAt: expect.any(Date) },
        { new: true },
      )
    })

    it('404s a soft delete when the student is missing', async () => {
      const captured: Captured = {}
      await deleteStudent({ params: { id: missingId() }, query: {} }, makeResponse(captured), noop)
      expect(captured.status).toBe(404)
    })

    it('permanently deletes the student and its class history', async () => {
      const id = await seedUser()
      await StudentClassHistory.collection.insertOne({ studentId: new mongoose.Types.ObjectId(id), classId: 'CL1' })
      const captured: Captured = {}
      await deleteStudent({ params: { id }, query: { permanent: 'true' } }, makeResponse(captured), noop)
      expect(captured.status).toBe(200)
      expect(captured.body).toEqual({ message: 'Aluno eliminado permanentemente' })
      expect(await User.findById(id).lean()).toBeNull()
      expect(await StudentClassHistory.countDocuments({ studentId: new mongoose.Types.ObjectId(id) })).toBe(0)
    })

    it('404s a permanent delete when the student is missing', async () => {
      const captured: Captured = {}
      await deleteStudent({ params: { id: missingId() }, query: { permanent: 'true' } }, makeResponse(captured), noop)
      expect(captured.status).toBe(404)
    })

    it('answers a local 500 on failure', async () => {
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementation((() => { throw new Error('boom') }) as never)
      const captured: Captured = {}
      await deleteStudent({ params: { id: missingId() }, query: {} }, makeResponse(captured), noop)
      expect(captured.status).toBe(500)
      expect(captured.body).toMatchObject({ message: 'Erro ao eliminar aluno' })
    })
  })
})
