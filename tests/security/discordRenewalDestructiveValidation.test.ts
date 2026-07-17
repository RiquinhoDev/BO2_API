import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'

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

import { executeDiscordRolesPlan } from '../../src/services/renewal/discordRolesSync.service'
import discordRenewalRouter from '../../src/routes/discordRenewal.routes'

const marker = { __bo2_offline_loopback: '1' }

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
    .send({ actor: 'reviewer@example.test' })
    .expect(200)

  expect(execute).toHaveBeenCalledWith(expect.objectContaining({
    executedBy: 'reviewer@example.test',
  }))
})
