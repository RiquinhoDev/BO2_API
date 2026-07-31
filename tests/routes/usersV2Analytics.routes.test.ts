import fs from 'node:fs'
import path from 'node:path'
import express, { type Response } from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

jest.mock('../../src/controllers/users.controller', () => {
  const names = [
    'listUsers',
    'getUserStats',
    'getAllUsersUnified',
    'getDashboardStats',
    'editStudent',
    'getStudentStats',
    'getStudentHistory',
    'syncSpecificStudent',
    'deleteStudent',
    'getUsersInfinite',
    'getUsersInfiniteStats',
    'getProductStats',
    'getUserAllClasses',
    'getUserProducts',
    'getUserById',
    'getUsersStats',
    'searchStudent',
  ]

  return {
    __esModule: true,
    ...Object.fromEntries(names.map((name) => [
      name,
      jest.fn((_req: unknown, res: Response) => res.status(204).end()),
    ])),
  }
})

jest.mock('../../src/controllers/userDiscordImport.controller', () => ({
  __esModule: true,
  syncDiscordAndHotmart: jest.fn(),
}))

jest.mock('../../src/controllers/userIdentityReconciliation.controller', () => ({
  __esModule: true,
  bulkDeleteIds: jest.fn(),
  bulkDeleteUnmatchedUsers: jest.fn(),
  bulkMergeIds: jest.fn(),
  deleteIdsDiferentes: jest.fn(),
  deleteUnmatchedUser: jest.fn(),
  manualMatch: jest.fn(),
  mergeDiscordId: jest.fn(),
}))

jest.mock('../../src/controllers/usersReviewLists.controller', () => ({
  __esModule: true,
  getIdsDiferentes: jest.fn(),
  getUnmatchedUsers: jest.fn(),
}))

jest.mock(
  '../../src/controllers/syncUtilizadoresControllers/curseduca.controller',
  () => ({
    __esModule: true,
    getUserByEmail: jest.fn(),
  }),
)

jest.mock('../../src/services/users/usersSimpleList.runtime', () => ({
  __esModule: true,
  listUsersSimple: jest.fn(),
}))

jest.mock('../../src/services/users/usersV2Analytics.runtime', () => ({
  __esModule: true,
  getUsersV2Stats: jest.fn((_input: unknown, _req: unknown, res: Response) =>
    res.status(200).json({ source: 'stats-runtime' })),
  getUsersV2Comparison: jest.fn((
    _input: unknown,
    _req: unknown,
    res: Response,
  ) => res.status(200).json({ source: 'comparison-runtime' })),
}))

jest.mock('../../src/services/users/usersV2List.runtime', () => ({
  __esModule: true,
  getUsersV2Legacy: jest.fn((_input: unknown, _req: unknown, res: Response) =>
    res.status(200).json({ source: 'legacy-runtime' })),
  getUsersV2Enrollments: jest.fn((
    _input: unknown,
    _req: unknown,
    res: Response,
  ) => res.status(200).json({ source: 'enrollment-runtime' })),
  getUsersV2OverviewAnalytics: jest.fn((
    _input: unknown,
    _req: unknown,
    res: Response,
  ) => res.status(200).json({ source: 'overview-runtime' })),
}))

import usersRouter from '../../src/routes/users.routes'
import {
  getUsersV2Comparison,
  getUsersV2Stats,
} from '../../src/services/users/usersV2Analytics.runtime'
import {
  getUsersV2Enrollments,
  getUsersV2Legacy,
  getUsersV2OverviewAnalytics,
} from '../../src/services/users/usersV2List.runtime'

const marker = { __bo2_offline_loopback: '1' }
const routeSource = fs.readFileSync(
  path.resolve(__dirname, '../../src/routes/users.routes.ts'),
  'utf8',
)

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'users-v2-routes-id',
    logError: () => undefined,
  })
  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/users', usersRouter)
  app.use(errors.handler)
  return app
}

beforeEach(() => {
  jest.clearAllMocks()
})

test.each([
  {
    path: '/api/users/v2',
    source: 'legacy-runtime',
    handler: getUsersV2Legacy,
  },
  {
    path: '/api/users/v2/enrollments',
    source: 'enrollment-runtime',
    handler: getUsersV2Enrollments,
  },
  {
    path: '/api/users/v2/analytics',
    source: 'overview-runtime',
    handler: getUsersV2OverviewAnalytics,
  },
  {
    path: '/api/users/v2/stats',
    source: 'stats-runtime',
    handler: getUsersV2Stats,
  },
  {
    path: '/api/users/v2/engagement/comparison',
    source: 'comparison-runtime',
    handler: getUsersV2Comparison,
  },
])('$path reaches its validated runtime handler', async ({
  path: routePath,
  source,
  handler,
}) => {
  const response = await request(buildApp())
    .get(routePath)
    .query(marker)
    .expect(200)

  expect(response.body).toEqual({ source })
  expect(handler).toHaveBeenCalledTimes(1)
})

test.each([
  {
    path: '/api/users/v2/enrollments',
    handler: getUsersV2Enrollments,
  },
  {
    path: '/api/users/v2/analytics',
    handler: getUsersV2OverviewAnalytics,
  },
  {
    path: '/api/users/v2/stats',
    handler: getUsersV2Stats,
  },
  {
    path: '/api/users/v2/engagement/comparison',
    handler: getUsersV2Comparison,
  },
])('$path rejects unknown query before runtime', async ({
  path: routePath,
  handler,
}) => {
  await request(buildApp())
    .get(routePath)
    .query({ ...marker, extra: 'unsafe' })
    .expect(400)

  expect(handler).not.toHaveBeenCalled()
})

test('legacy accepts benign unknown query through its compatibility translator', async () => {
  await request(buildApp())
    .get('/api/users/v2')
    .query({ ...marker, ignored: 'legacy' })
    .expect(200, { source: 'legacy-runtime' })

  expect(getUsersV2Legacy).toHaveBeenCalledTimes(1)
})

test('registers explicit static resources before neighboring parameter routes', () => {
  const legacy = routeSource.indexOf("  '/v2',")
  const enrollments = routeSource.indexOf("'/v2/enrollments'")
  const analytics = routeSource.indexOf("'/v2/analytics'")
  const stats = routeSource.indexOf("'/v2/stats'")

  expect(legacy).toBeGreaterThanOrEqual(0)
  expect(enrollments).toBeGreaterThan(legacy)
  expect(analytics).toBeGreaterThan(enrollments)
  expect(stats).toBeGreaterThan(analytics)
  expect(routeSource).toContain(
    "router.get('/v2/engagement/heatmap', async (req, res) => {",
  )
})

test('contains no inline stats or comparison handlers', () => {
  expect(routeSource).not.toMatch(
    /router\.get\('\/v2\/stats', async|router\.get\('\/v2\/engagement\/comparison', async/,
  )
})
