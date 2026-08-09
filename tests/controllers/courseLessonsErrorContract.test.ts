import express from 'express'
import request from 'supertest'
import { createErrorHandling, type ErrorLogEvent } from '../../src/security/errorHandling'

const exec = jest.fn()
const lean = jest.fn(() => ({ exec }))
const sort = jest.fn(() => ({ lean }))
const find = jest.fn(() => ({ sort }))
const findOneAndUpdate = jest.fn(() => ({ lean }))
const syncCourseLessonCatalog = jest.fn()

jest.mock('../../src/models/CourseLesson', () => ({
  __esModule: true,
  default: { find, findOneAndUpdate },
}))

jest.mock('../../src/services/courseLessonCatalog.service', () => ({
  syncCourseLessonCatalog,
}))

import courseLessonsRouter from '../../src/routes/courseLessons.routes'

const marker = { __bo2_offline_loopback: '1' }

function buildApp(logError: (event: ErrorLogEvent) => void = () => undefined) {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'course-lessons-correlation-id',
    logError,
  })
  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/course-lessons', courseLessonsRouter)
  app.use(errors.handler)
  return app
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('list preserves the success envelope', async () => {
  exec.mockResolvedValueOnce([
    {
      pageId: 'lesson-1',
      pageName: 'Aula 1',
      moduleId: 'module-1',
      moduleName: 'Modulo 1',
      moduleSequence: 1,
      lessonSequence: 1,
      courseCode: 'OGI',
      url: 'https://example.test/lesson-1',
      isActive: true,
    },
  ])

  const response = await request(buildApp())
    .get('/api/course-lessons')
    .query(marker)
    .expect(200)

  expect(response.body).toMatchObject({
    totalLessons: 1,
    modules: [{ moduleId: 'module-1', lessons: [{ pageId: 'lesson-1' }] }],
  })
})

test.each([
  ['GET', '/api/course-lessons', 'COURSE_LESSONS_LIST_FAILED'],
  ['PUT', '/api/course-lessons/lesson-1', 'COURSE_LESSON_UPDATE_FAILED'],
  ['POST', '/api/course-lessons/sync', 'COURSE_LESSONS_SYNC_FAILED'],
] as const)('%s %s exposes only the canonical error contract', async (method, path, code) => {
  const cause = new Error('mongo failure for alice@example.test token=secret-value')
  exec.mockRejectedValueOnce(cause)
  syncCourseLessonCatalog.mockRejectedValueOnce(cause)
  const events: ErrorLogEvent[] = []

  const pending = request(buildApp((event) => events.push(event)))[method.toLowerCase() as 'get'](path)
    .query(marker)
  const response = method === 'PUT'
    ? await pending.send({ url: 'https://example.test/new' }).expect(500)
    : await pending.expect(500)

  expect(response.body).toEqual({
    success: false,
    code,
    message: expect.any(String),
    correlationId: 'course-lessons-correlation-id',
  })
  expect(response.text).not.toContain('mongo failure')
  expect(response.text).not.toContain('alice@example.test')
  expect(response.text).not.toContain('secret-value')
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({ code, detail: 'mongo failure for [REDACTED_EMAIL] token=[REDACTED]' })
})