import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'
installTestRuntimeConfigHooks()


jest.mock('../../src/services/users/studentMutations.runtime', () => ({
  __esModule: true,
  editStudent: jest.fn((_req, res) => res.status(204).end()),
  syncSpecificStudent: jest.fn((_req, res) => res.status(204).end()),
  deleteStudent: jest.fn((_input, res) => res.status(204).end()),
}))

jest.mock('../../src/controllers/userIdentityReconciliation.controller', () => {
  const names = [
    'mergeDiscordId',
    'manualMatch',
    'bulkMergeIds',
    'bulkDeleteIds',
    'bulkDeleteUnmatchedUsers',
    'deleteUnmatchedUser',
    'deleteIdsDiferentes',
  ]

  return {
    __esModule: true,
    ...Object.fromEntries(names.map((name) => [
      name,
      jest.fn((_input, _req, res) => res.status(204).end()),
    ])),
  }
})

jest.mock('../../src/controllers/usersReviewLists.controller', () => ({
  __esModule: true,
  getIdsDiferentes: jest.fn((_input, res) => res.status(204).end()),
  getUnmatchedUsers: jest.fn((_input, res) => res.status(204).end()),
}))

jest.mock(
  '../../src/controllers/syncUtilizadoresControllers/curseduca.controller',
  () => ({
    __esModule: true,
    getUserByEmail: jest.fn((_input, res) => res.status(204).end()),
  }),
)

jest.mock('../../src/services/users/usersV2Analytics.runtime', () => ({
  __esModule: true,
  getUsersV2Stats: jest.fn(),
  getUsersV2Comparison: jest.fn(),
}))

jest.mock('../../src/services/users/usersV2List.runtime', () => ({
  __esModule: true,
  getUsersV2Legacy: jest.fn(),
  getUsersV2Enrollments: jest.fn(),
  getUsersV2OverviewAnalytics: jest.fn(),
}))

import usersRouter from '../../src/routes/users.routes'

const marker = { __bo2_offline_loopback: '1' }

type DestructiveRoute = {
  name: string
  method: 'post' | 'delete'
  path: string
  body: Record<string, unknown>
  query?: Record<string, string>
}

const routes: DestructiveRoute[] = [
  {
    name: 'merge Discord identity',
    method: 'post',
    path: '/api/users/mergeDiscordId',
    body: {
      email: 'student@example.test',
      newDiscordId: '123456789012345678',
    },
  },
  {
    name: 'bulk merge Discord identities',
    method: 'post',
    path: '/api/users/bulkMerge',
    body: { ids: ['507f1f77bcf86cd799439011'] },
  },
  {
    name: 'manually match Discord identity',
    method: 'post',
    path: '/api/users/manualMatch',
    body: {
      discordId: '123456789012345678',
      email: 'student@example.test',
    },
  },
  {
    name: 'bulk delete ids',
    method: 'post',
    path: '/api/users/bulkDelete',
    body: { ids: ['507f1f77bcf86cd799439011'] },
  },
  {
    name: 'bulk delete unmatched users',
    method: 'post',
    path: '/api/users/bulkDeleteUnmatched',
    body: { ids: ['507f1f77bcf86cd799439011'] },
  },
  {
    name: 'delete unmatched user',
    method: 'delete',
    path: '/api/users/unmatchedUsers/507f1f77bcf86cd799439011',
    body: {},
  },
  {
    name: 'delete different id',
    method: 'delete',
    path: '/api/users/idsDiferentes/507f1f77bcf86cd799439011',
    body: {},
  },
  {
    name: 'delete user',
    method: 'delete',
    path: '/api/users/507f1f77bcf86cd799439011',
    body: {},
    query: { permanent: 'true' },
  },
  {
    name: 'delete student alias',
    method: 'delete',
    path: '/api/users/student/507f1f77bcf86cd799439011',
    body: {},
  },
]

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'users-validation-id',
    logError: () => undefined,
  })
  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/users', usersRouter)
  app.use(errors.handler)
  return app
}

function callRoute(
  app: ReturnType<typeof buildApp>,
  route: DestructiveRoute,
  body: Record<string, unknown>,
) {
  const pending = request(app)[route.method](route.path)
    .query({ ...marker, ...route.query })

  return Object.keys(body).length > 0 ? pending.send(body) : pending
}

test.each(routes)('$name accepts its explicit DTO', async (route) => {
  await callRoute(buildApp(), route, route.body).expect(204)
})

test.each(routes)('$name rejects an extra role field', async (route) => {
  await callRoute(buildApp(), route, {
    ...route.body,
    role: 'SUPER_ADMIN',
  }).expect(400)
})

test.each(routes)('$name rejects a nested Mongo operator', async (route) => {
  await callRoute(buildApp(), route, {
    ...route.body,
    filter: { $where: 'unsafe' },
  }).expect(400)
})
