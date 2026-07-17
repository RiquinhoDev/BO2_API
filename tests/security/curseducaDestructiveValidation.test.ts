import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

const cleanupDuplicates = jest.fn((_input, res) => res.status(204).end())
const noop = jest.fn((_req, res) => res.status(204).end())

jest.mock('../../src/controllers/syncUtilizadoresControllers/curseduca.controller', () => ({
  getDashboardStats: noop,
  getGroups: noop,
  getMembers: noop,
  getMemberByEmail: noop,
  getAccessReports: noop,
  getCurseducaUsers: noop,
  debugCurseducaAPI: noop,
  getSyncReport: noop,
  getUserByEmail: noop,
  cleanupDuplicates,
  getUsersWithClasses: noop,
  updateUserClasses: noop,
  getCurseducaProducts: noop,
  getCurseducaProductByGroupId: noop,
  getCurseducaProductUsers: noop,
  getCurseducaStats: noop,
  compareSyncMethods: noop,
  syncCurseducaUsersUniversal: noop,
  syncCurseducaUsersStart: noop,
  getCurseducaSyncStatus: noop,
}))

import curseducaRouter from '../../src/routes/curseduca.routes'

const marker = { __bo2_offline_loopback: '1' }
const path = '/api/curseduca/cleanup'

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'curseduca-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/curseduca', curseducaRouter)
  app.use(errors.handler)
  return app
}

function callRoute(body: Record<string, unknown> = {}) {
  const pending = request(buildApp()).post(path).query(marker)
  return Object.keys(body).length > 0 ? pending.send(body) : pending
}

test('accepts empty input and forwards the DTO to the stub', async () => {
  cleanupDuplicates.mockClear()

  await callRoute().expect(204)

  expect(cleanupDuplicates).toHaveBeenCalledWith(
    expect.objectContaining({
      params: {},
      query: {},
      body: {},
    }),
    expect.anything(),
  )
})

test('rejects an extra role field', async () => {
  await callRoute({ role: 'SUPER_ADMIN' }).expect(400)
})

test('rejects a nested Mongo operator', async () => {
  await callRoute({ filter: { $where: 'unsafe' } }).expect(400)
})
