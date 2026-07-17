import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

const deleteClass = jest.fn((_input, res) => res.status(204).end())
const noop = jest.fn((_req, res) => res.status(204).end())

jest.mock('../../src/controllers/classes.controller', () => ({
  classesController: {
    listClassesSimple: noop,
    listClasses: noop,
    addOrEditClass: noop,
    syncHotmartClasses: noop,
    fetchClassData: noop,
    fetchClassDataPost: noop,
    getClassStats: noop,
    updateClassStatus: noop,
    getStudentsByClass: noop,
    getClassDetails: noop,
    deleteClass,
    moveStudent: noop,
    moveMultipleStudents: noop,
    getClassCompleteHistory: noop,
    getClassHistory: noop,
    checkAndUpdateClassHistory: noop,
    getStudentHistoryByDiscord: noop,
    getStudentHistoryByEmail: noop,
    createInactivationList: noop,
    getInactivationLists: noop,
    revertInactivation: noop,
    searchStudents: noop,
    syncComplete: noop,
  },
  bulkInactivateStudents: noop,
}))

import classesRouter from '../../src/routes/classes.routes'

const marker = { __bo2_offline_loopback: '1' }
const path = '/api/classes/HOTMART-CLASS-2026'

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'classes-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/classes', classesRouter)
  app.use(errors.handler)
  return app
}

function callRoute(body: Record<string, unknown> = {}) {
  const pending = request(buildApp()).delete(path).query(marker)
  return Object.keys(body).length > 0 ? pending.send(body) : pending
}

test('accepts a Hotmart string classId and forwards the DTO', async () => {
  deleteClass.mockClear()

  await callRoute().expect(204)

  expect(deleteClass).toHaveBeenCalledWith(
    expect.objectContaining({
      params: { classId: 'HOTMART-CLASS-2026' },
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
