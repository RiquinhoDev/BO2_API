import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
installTestRuntimeConfigHooks()

const mockEventSave = jest.fn()
const mockEventFind = jest.fn()
const mockEventFindById = jest.fn()
const mockEventFindByIdAndUpdate = jest.fn()
const mockEventFindByIdAndDelete = jest.fn()
const mockEventFindOne = jest.fn()
const mockEventCreate = jest.fn()
const mockEventConstructor = jest.fn().mockImplementation((data: Record<string, unknown>) => ({ ...data, save: mockEventSave }))
Object.assign(mockEventConstructor, {
  find: mockEventFind,
  findById: mockEventFindById,
  findByIdAndUpdate: mockEventFindByIdAndUpdate,
  findByIdAndDelete: mockEventFindByIdAndDelete,
  findOne: mockEventFindOne,
  create: mockEventCreate,
})

const mockTypeSave = jest.fn()
const mockTypeFind = jest.fn()
const mockTypeFindByIdAndUpdate = jest.fn()
const mockTypeFindOne = jest.fn()
const mockTypeCreate = jest.fn()
const mockTypeConstructor = jest.fn().mockImplementation((data: Record<string, unknown>) => ({ ...data, save: mockTypeSave }))
Object.assign(mockTypeConstructor, {
  find: mockTypeFind,
  findByIdAndUpdate: mockTypeFindByIdAndUpdate,
  findOne: mockTypeFindOne,
  create: mockTypeCreate,
})

jest.mock('../../src/models/Event', () => ({ __esModule: true, default: mockEventConstructor }))
jest.mock('../../src/models/EventType', () => ({ __esModule: true, default: mockTypeConstructor }))

import eventsRouter from '../../src/routes/events.routes'

const marker = { __bo2_offline_loopback: '1' }
const objectId = '507f1f77bcf86cd799439011'

function queryChain(result: unknown = []) {
  const chain = {
    sort: jest.fn(), limit: jest.fn(), select: jest.fn(), lean: jest.fn(), exec: jest.fn().mockResolvedValue(result),
  }
  chain.sort.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.select.mockReturnValue(chain)
  chain.lean.mockReturnValue(chain)
  return chain
}

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'events-correlation-id',
    logError: () => undefined,
  })
  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/events', eventsRouter)
  app.use(errors.handler)
  return app
}

beforeEach(() => {
  jest.clearAllMocks()
  mockEventFind.mockReturnValue(queryChain())
  mockEventFindById.mockReturnValue(queryChain(null))
  mockEventFindByIdAndUpdate.mockResolvedValue({ _id: objectId })
  mockEventFindByIdAndDelete.mockResolvedValue({ _id: objectId })
  mockEventFindOne.mockResolvedValue({ _id: objectId })
  mockEventCreate.mockResolvedValue({ _id: objectId })
  mockEventSave.mockResolvedValue(undefined)
  mockTypeFind.mockReturnValue(queryChain())
  mockTypeFindByIdAndUpdate.mockResolvedValue({ _id: objectId })
  mockTypeFindOne.mockResolvedValue({ _id: objectId })
  mockTypeCreate.mockResolvedValue({ _id: objectId })
  mockTypeSave.mockResolvedValue(undefined)
})

type Case = {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch'
  path: string
  code: string
  arrange: () => void
  body?: Record<string, unknown>
}

const cases: Case[] = [
  { method: 'get', path: '/api/events/upcoming', code: 'EVENTS_UPCOMING_FAILED', arrange: () => mockEventFind.mockImplementationOnce(() => { throw new Error('mongo token=secret') }) },
  { method: 'get', path: `/api/events/${objectId}`, code: 'EVENT_READ_FAILED', arrange: () => mockEventFindById.mockImplementationOnce(() => { throw new Error('mongo token=secret') }) },
  { method: 'post', path: `/api/events/${objectId}/interest`, code: 'EVENT_INTEREST_FAILED', body: { email: 'alice@example.test' }, arrange: () => mockEventFindById.mockImplementationOnce(() => { throw new Error('mongo token=secret') }) },
  { method: 'get', path: '/api/events', code: 'EVENTS_LIST_FAILED', arrange: () => mockEventFind.mockImplementationOnce(() => { throw new Error('mongo token=secret') }) },
  { method: 'post', path: '/api/events', code: 'EVENT_CREATE_FAILED', body: { title: 'Evento' }, arrange: () => mockEventSave.mockRejectedValueOnce(new Error('mongo token=secret')) },
  { method: 'put', path: `/api/events/${objectId}`, code: 'EVENT_UPDATE_FAILED', body: { title: 'Evento' }, arrange: () => mockEventFindByIdAndUpdate.mockRejectedValueOnce(new Error('mongo token=secret')) },
  { method: 'delete', path: `/api/events/${objectId}`, code: 'EVENT_DELETE_FAILED', arrange: () => mockEventFindByIdAndDelete.mockRejectedValueOnce(new Error('mongo token=secret')) },
  { method: 'patch', path: `/api/events/${objectId}/status`, code: 'EVENT_STATUS_UPDATE_FAILED', body: { status: 'published' }, arrange: () => mockEventFindByIdAndUpdate.mockRejectedValueOnce(new Error('mongo token=secret')) },
  { method: 'get', path: '/api/events/types/list', code: 'EVENT_TYPES_LIST_FAILED', arrange: () => mockTypeFind.mockImplementationOnce(() => { throw new Error('mongo token=secret') }) },
  { method: 'post', path: '/api/events/types', code: 'EVENT_TYPE_CREATE_FAILED', body: { code: 'live' }, arrange: () => mockTypeSave.mockRejectedValueOnce(new Error('mongo token=secret')) },
  { method: 'put', path: `/api/events/types/${objectId}`, code: 'EVENT_TYPE_UPDATE_FAILED', body: { label: 'Live' }, arrange: () => mockTypeFindByIdAndUpdate.mockRejectedValueOnce(new Error('mongo token=secret')) },
  { method: 'post', path: '/api/events/seed', code: 'EVENTS_SEED_FAILED', arrange: () => mockTypeFindOne.mockRejectedValueOnce(new Error('mongo token=secret')) },
]

test.each(cases)('$method $path exposes only the canonical error contract', async ({ method, path, code, arrange, body }) => {
  arrange()
  let pending = request(buildApp())[method](path).query(marker)
  if (body) pending = pending.send(body)
  const response = await pending.expect(500)
  expect(response.body).toEqual({
    success: false,
    code,
    message: expect.any(String),
    correlationId: 'events-correlation-id',
  })
  expect(response.text).not.toContain('token=secret')
})

test('upcoming preserves its success envelope and privacy projection', async () => {
  const chain = queryChain([{ _id: objectId, title: 'Live' }])
  mockEventFind.mockReturnValueOnce(chain)
  const response = await request(buildApp()).get('/api/events/upcoming').query(marker).expect(200)
  expect(chain.select).toHaveBeenCalledWith('-interestedUsers')
  expect(response.body).toEqual({ success: true, data: { events: [{ _id: objectId, title: 'Live' }] } })
})