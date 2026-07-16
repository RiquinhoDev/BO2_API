import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

jest.mock('../../src/controllers/users.controller', () => {
  const names = [
    'listUsers',
    'getIdsDiferentes',
    'syncDiscordAndHotmart',
    'mergeDiscordId',
    'getUnmatchedUsers',
    'deleteUnmatchedUser',
    'deleteIdsDiferentes',
    'getUserStats',
    'listUsersSimple',
    'bulkMergeIds',
    'bulkDeleteIds',
    'bulkDeleteUnmatchedUsers',
    'manualMatch',
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
    'getUsers',
    'getUsersStats',
    'searchStudent',
  ]

  return {
    __esModule: true,
    ...Object.fromEntries(names.map((name) => [
      name,
      jest.fn((_input, res) => res.status(204).end()),
    ])),
  }
})

jest.mock(
  '../../src/controllers/syncUtilizadoresControllers/curseduca.controller',
  () => ({
    __esModule: true,
    getUserByEmail: jest.fn((_input, res) => res.status(204).end()),
  }),
)

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
