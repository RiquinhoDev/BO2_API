import express from 'express'
import request from 'supertest'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'

installTestRuntimeConfigHooks()

const mockCollectMetrics = jest.fn()
const mockGetStats = jest.fn()
const mockGetHistory = jest.fn()
jest.mock('../../src/services/metrics.service', () => ({
  __esModule: true,
  default: { collectMetrics: mockCollectMetrics, getStats: mockGetStats, getHistory: mockGetHistory },
}))

const mockCronFind = jest.fn()
jest.mock('../../src/models/cron/CronExecutionLog', () => ({
  __esModule: true,
  default: { find: mockCronFind },
}))

const mockUserFindOne = jest.fn()
const mockUserAggregate = jest.fn()
const mockUserFind = jest.fn()
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { findOne: mockUserFindOne, aggregate: mockUserAggregate, find: mockUserFind },
}))

const mockEvaluateOne = jest.fn()
const mockEvaluateAll = jest.fn()
jest.mock('../../src/services/achievements/achievementEvaluation.service', () => ({
  evaluateAndPersistAchievements: mockEvaluateOne,
  evaluateAllAchievements: mockEvaluateAll,
}))
jest.mock('../../src/services/achievements/achievementDefinitions', () => ({
  ACHIEVEMENT_DEFINITIONS: [{ id: 'first' }],
  TOTAL_ACHIEVEMENTS: 1,
}))
jest.mock('../../src/services/studentOgiSummary.service', () => ({
  isValidSummaryAccessToken: jest.fn(() => true),
  normalizeStudentEmail: jest.fn((email: string) => email.toLowerCase().trim()),
  resolveStudentEmailFromToken: jest.fn(() => 'student@example.test'),
}))

import metricsRouter from '../../src/routes/metrics.routes'
import achievementsRouter from '../../src/routes/achievements.routes'

const marker = '__bo2_offline_loopback=1'

function appAt(mount: string, router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use(mount, router)
  return app
}

beforeEach(() => { jest.clearAllMocks() })

test('metrics reads use canonical data and meta without changing calculations', async () => {
  mockCollectMetrics.mockReturnValue({ memory: 10 })
  mockGetStats.mockReturnValue({ samples: 2 })
  mockGetHistory.mockReturnValue([{ memory: 9 }])
  mockCronFind.mockReturnValue({
    sort: jest.fn().mockResolvedValue([
      { status: 'success', duration: 100, startedAt: new Date('2026-08-11T12:00:00.000Z') },
      { status: 'failed', duration: 300, startedAt: new Date('2026-08-11T12:00:00.000Z') },
    ]),
  })

  const app = appAt('/api/metrics', metricsRouter)
  const current = await request(app).get('/api/metrics?' + marker).expect(200)
  const history = await request(app).get('/api/metrics/history?' + marker).expect(200)
  const cron = await request(app).get('/api/metrics/cron?' + marker).expect(200)

  expect(current.body).toEqual({
    success: true,
    data: { memory: 10 },
    meta: { stats: { samples: 2 }, timestamp: expect.any(String) },
  })
  expect(history.body).toEqual({
    success: true,
    data: [{ memory: 9 }],
    meta: { count: 1 },
  })
  expect(cron.body).toEqual({
    success: true,
    data: expect.objectContaining({
      totalExecutions: 2,
      successfulExecutions: 1,
      failedExecutions: 1,
      successRate: 50,
      averageDuration: 200,
    }),
  })
})

test('achievements success routes use canonical data and meta and preserve persistence order', async () => {
  const user = {
    achievements: [{ id: 'first', unlockedAt: new Date('2026-01-01T00:00:00.000Z') }],
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  }
  mockUserFindOne.mockResolvedValue(user)
  mockEvaluateOne.mockResolvedValue({ stats: { unlocked: 1 }, achievements: [{ id: 'first' }] })
  mockEvaluateAll.mockResolvedValue({
    total: 2, processed: 2, evaluated: 1, errors: 0, durationMs: 20,
  })
  mockUserAggregate.mockResolvedValue([{ totalUsers: 1 }])
  mockUserFind.mockReturnValue({
    lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([user]) }),
  })

  const app = appAt('/api/achievements', achievementsRouter)
  const definitions = await request(app).get('/api/achievements/definitions?' + marker).expect(200)
  const single = await request(app)
    .post('/api/achievements/evaluate/student@example.test?' + marker).expect(200)
  const all = await request(app).post('/api/achievements/evaluate-all?' + marker).expect(200)
  const seen = await request(app)
    .post('/api/achievements/mark-seen?' + marker)
    .send({ token: 'token', ids: ['first'] })
    .expect(200)
  const stats = await request(app).get('/api/achievements/stats?' + marker).expect(200)

  expect(definitions.body).toEqual({ success: true, data: [{ id: 'first' }], meta: { total: 1 } })
  expect(single.body).toEqual({
    success: true,
    data: [{ id: 'first' }],
    meta: { message: 'Conquistas avaliadas para student@example.test', stats: { unlocked: 1 } },
  })
  expect(all.body).toEqual({
    success: true,
    data: { total: 2, processed: 2, evaluated: 1, errors: 0, durationMs: 20, avgPerUser: 10 },
    meta: { message: 'AvaliaÃ§Ã£o de conquistas concluÃ­da' },
  })
  expect(user.markModified).toHaveBeenCalledWith('achievements')
  expect(user.save).toHaveBeenCalledTimes(1)
  expect(seen.body).toEqual({
    success: true,
    data: { updated: 1 },
    meta: { message: 'Conquistas marcadas como vistas.' },
  })
  expect(stats.body).toEqual({
    success: true,
    data: {
      global: { totalUsers: 1 },
      mostCommon: [{ id: 'first', count: 1 }],
      leastCommon: [{ id: 'first', count: 1 }],
      totalDefinitions: 1,
    },
  })
})