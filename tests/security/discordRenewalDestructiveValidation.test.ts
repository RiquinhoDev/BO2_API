import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'
installTestRuntimeConfigHooks()


jest.mock('../../src/services/renewal/discordRolesSync.service', () => ({
  approveRoleChanges: jest.fn(async () => 0),
  ensureDefaultTemplates: jest.fn(async () => undefined),
  executeDiscordRolesPlan: jest.fn(async () => ({
    attempted: 0,
    applied: 0,
    notInGuild: 0,
    failed: 0,
    leftForNextRun: 0,
    masterEnabled: true,
  })),
  generateDiscordRolesPlan: jest.fn(async () => ({ anomalyAborted: false })),
  getDiscordRenewalStatus: jest.fn(async () => ({})),
  renderMessage: jest.fn(() => ''),
  sendDiscordMessage: jest.fn(async () => ({
    success: true,
    message: 'sent offline',
  })),
}))

jest.mock('../../src/services/renewal/discordScheduledMessages.service', () => ({
  getScheduledStatus: jest.fn(async () => ({})),
  previewScheduledRule: jest.fn(async () => ({ success: true })),
  runScheduledMessagesJob: jest.fn(async () => ({
    masterEnabled: true,
    today: 1,
    targetRole: 'R.JAN',
    checked: 0,
    sent: 0,
    skipped: [],
  })),
  setScheduledRuleEnabled: jest.fn(async () => ({})),
  testScheduledRule: jest.fn(async () => ({
    success: true,
    message: 'sent offline',
  })),
}))

const mockCronFindOne = jest.fn()
jest.mock('../../src/models/SyncModels/CronJobConfig', () => ({
  __esModule: true,
  default: { findOne: mockCronFindOne },
}))

import {
  executeDiscordRolesPlan,
  sendDiscordMessage,
} from '../../src/services/renewal/discordRolesSync.service'
import {
  runScheduledMessagesJob,
  testScheduledRule,
} from '../../src/services/renewal/discordScheduledMessages.service'
import discordRenewalRouter from '../../src/routes/discordRenewal.routes'

const marker = { __bo2_offline_loopback: '1' }

function cronQuery(result: unknown) {
  return {
    select: () => ({
      lean: () => ({
        exec: jest.fn().mockResolvedValue(result),
      }),
    }),
  }
}

type DestructiveRoute = {
  name: string
  path: string
  body: Record<string, unknown>
}

const routes: DestructiveRoute[] = [
  {
    name: 'execute approved role changes',
    path: '/api/discord-renewal/execute',
    body: {
      batchId: 'batch-2026-07',
      includePlanned: true,
      limit: 10,
    },
  },
  {
    name: 'send a renewal message',
    path: '/api/discord-renewal/messages/send',
    body: {
      content: 'Renova antes de {dataFim}',
      mentionRoleIds: [],
      dataFim: '2026-07-31',
      channelId: 'renewals',
      templateKey: 'renewal-last-day',
      mentionEveryone: false,
    },
  },
  {
    name: 'test a scheduled message',
    path: '/api/discord-renewal/scheduled/renewal-last-day/test',
    body: { actor: 'reviewer@example.test' },
  },
  {
    name: 'run scheduled messages',
    path: '/api/discord-renewal/scheduled/run',
    body: {},
  },
]

function buildApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'discord-renewal-validation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.use('/api/discord-renewal', discordRenewalRouter)
  app.use(errors.handler)
  return app
}

function callRoute(route: DestructiveRoute, body: Record<string, unknown>) {
  const pending = request(buildApp()).post(route.path).query(marker)
  return Object.keys(body).length > 0 ? pending.send(body) : pending
}

beforeEach(() => {
  mockCronFindOne.mockReturnValue(cronQuery({
    _id: { toString: () => 'discord-job-id' },
    name: 'DiscordRolesSync',
    syncType: 'discord',
  }))
})

test.each(routes)('$name accepts its explicit DTO and real path params', async (route) => {
  await callRoute(route, route.body).expect(200)
})

test.each(routes)('$name rejects an extra role field', async (route) => {
  await callRoute(route, {
    ...route.body,
    role: 'SUPER_ADMIN',
  }).expect(400)
})

test.each(routes)('$name rejects a nested Mongo operator', async (route) => {
  await callRoute(route, {
    ...route.body,
    filter: { $where: 'unsafe' },
  }).expect(400)
})

test('execute preserves actor from the body', async () => {
  const execute = jest.mocked(executeDiscordRolesPlan)
  execute.mockClear()

  await request(buildApp())
    .post('/api/discord-renewal/execute')
    .query(marker)
    .set('X-Request-ID', 'role-route-a')
    .send({ actor: 'reviewer@example.test' })
    .expect(200)

  expect(execute).toHaveBeenCalledWith(expect.objectContaining({
    executedBy: 'reviewer@example.test',
    actorId: 'reviewer@example.test',
    requestId: 'role-route-a',
  }))
})

test('status exposes backend-owned manual block reason for the exact DiscordRoles job', async () => {
  const response = await request(buildApp())
    .get('/api/discord-renewal/status')
    .query(marker)
    .expect(200)

  expect(response.body.data.manualExecution).toMatchObject({
    capability: 'discord-roles-sync',
    status: 'implemented',
    dryRunSupported: true,
    mutableEnabled: false,
    blockedReason: 'Execução manual dos cargos Discord desativada',
  })
})

test('status fails closed when the canonical DiscordRoles job is missing', async () => {
  mockCronFindOne.mockReturnValue(cronQuery(null))

  const response = await request(buildApp())
    .get('/api/discord-renewal/status')
    .query(marker)
    .expect(200)

  expect(response.body.data.manualExecution).toMatchObject({
    capability: 'discord-roles-sync',
    status: 'blocked',
    mutableEnabled: false,
    blockedReason: 'Job DiscordRolesSync não encontrado; execução manual bloqueada',
  })
})

test('message routes forward the real X-Request-ID and scheduled dry-run', async () => {
  const send = jest.mocked(sendDiscordMessage)
  const testScheduled = jest.mocked(testScheduledRule)
  const runScheduled = jest.mocked(runScheduledMessagesJob) as jest.Mock
  send.mockClear()
  testScheduled.mockClear()
  runScheduled.mockClear()

  await request(buildApp())
    .post('/api/discord-renewal/messages/send')
    .query(marker)
    .set('X-Request-ID', 'message-route-a')
    .send({ content: 'hello', mentionRoleIds: [] })
    .expect(200)
  await request(buildApp())
    .post('/api/discord-renewal/scheduled/renewal-last-day/test')
    .query(marker)
    .set('X-Request-ID', 'test-route-a')
    .send({})
    .expect(200)
  await request(buildApp())
    .post('/api/discord-renewal/scheduled/run')
    .query(marker)
    .set('X-Request-ID', 'run-route-a')
    .send({ dryRun: true })
    .expect(200)

  expect(send).toHaveBeenCalledWith(expect.objectContaining({ content: 'hello' }), 'message-route-a')
  expect(testScheduled).toHaveBeenCalledWith('renewal-last-day', 'backoffice', 'test-route-a')
  expect(runScheduled).toHaveBeenCalledWith('run-route-a', { dryRun: true })
})

test('message routes expose indeterminate and request-id reuse statuses', async () => {
  const send = jest.mocked(sendDiscordMessage)
  const runScheduled = jest.mocked(runScheduledMessagesJob) as jest.Mock
  send.mockResolvedValueOnce({
    success: false,
    kind: 'indeterminate',
    message: 'requires reconciliation',
  })
  runScheduled.mockResolvedValueOnce({ kind: 'request-id-reused' })

  await request(buildApp())
    .post('/api/discord-renewal/messages/send')
    .query(marker)
    .set('X-Request-ID', 'message-route-b')
    .send({ content: 'hello', mentionRoleIds: [] })
    .expect(503, {
      success: false,
      code: 'DISCORD_MESSAGE_INDETERMINATE',
      message: 'requires reconciliation',
      correlationId: 'message-route-b',
    })
  await request(buildApp())
    .post('/api/discord-renewal/scheduled/run')
    .query(marker)
    .set('X-Request-ID', 'run-route-b')
    .send({})
    .expect(409, {
      success: false,
      code: 'DISCORD_SCHEDULED_RUN_REQUEST_ID_REUSED',
      message: 'X-Request-ID já foi usado noutro run',
      correlationId: 'run-route-b',
    })
})
