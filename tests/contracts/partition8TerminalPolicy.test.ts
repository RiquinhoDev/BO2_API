import fs from 'node:fs'
import path from 'node:path'
import type { NextFunction, Request, Response } from 'express'
import User from '../../src/models/user'
import GuruWebhook from '../../src/models/GuruWebhook'
import { emailOpened, linkClicked } from '../../src/controllers/webhooks.controller'
import { handleGuruWebhook } from '../../src/controllers/guru.webhook.controller'
import { RESPONSE_FAMILIES } from '../../src/contracts/responseContract'

jest.mock('../../src/services/requestDrivenRuntimeConfig', () => ({
  getGuruAccountToken: jest.fn(() => 'offline-guru-token'),
}))
jest.mock('../../src/models/user', () => ({ __esModule: true, default: { findOne: jest.fn() } }))
jest.mock('../../src/models/GuruWebhook', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}))
jest.mock('../../src/models/UserProduct', () => ({ __esModule: true, default: {} }))
jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}))

const source = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')

function response(): Response {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response
}

test('declares health/info as reviewed public documents and provider callbacks as webhook ACKs', () => {
  expect(RESPONSE_FAMILIES).toContain('webhook-ack')
  const generator = source('scripts/generate-response-contract-catalog.mjs')
  for (const identity of ['GET /api/health', 'GET /api/info']) {
    expect(generator).toContain(`'${identity}'`)
  }
  for (const identity of [
    'POST /api/guru/webhook',
    'POST /api/webhooks/ac/email-opened',
    'POST /api/webhooks/ac/link-clicked',
  ]) {
    expect(generator).toContain(`'${identity}'`)
  }
})

test('health and info retain their public status and document fields', () => {
  const routes = source('src/routes/index.ts')
  expect(routes).toMatch(/router\.get\(["']\/health["'][\s\S]*?status\(200\)\.json\(\{[\s\S]*?status:[ "']+OK["']/)
  expect(routes).toMatch(/router\.get\(["']\/info["'][\s\S]*?status\(200\)\.json\(\{[\s\S]*?name:[\s\S]*?version:[\s\S]*?features:[\s\S]*?endpoints:/)
})

test('Guru token debug route and its production helpers are absent', () => {
  expect(source('src/routes/guru.routes.ts')).not.toMatch(/debug\/token|debugToken|localDebugOnly/)
  expect(source('src/controllers/guru.webhook.controller.ts')).not.toMatch(/\bdebugToken\b/)
  expect(source('src/controllers/guruWebhookAdmin.controller.ts')).not.toMatch(/\bdebugToken\b|guruTokenDebugStatus|getGuruAccountToken/)
  expect(source('src/security/debugRoutes.ts')).not.toMatch(/guruTokenDebugStatus/)
})

test('ActiveCampaign provider ACK bodies and statuses stay exact', async () => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.mocked(User.findOne).mockResolvedValueOnce({ _id: 'user-1' } as never)
  const opened = response()
  await emailOpened({ body: { contact: { email: 'a@example.test' }, date_time: 'now' } } as Request, opened, jest.fn())
  expect(opened.status).not.toHaveBeenCalled()
  expect(opened.json).toHaveBeenCalledWith({ success: true, message: 'Email opened registered' })

  const clicked = response()
  await linkClicked({ body: { contact: { email: 'a@example.test' }, link: 'https://example.test' } } as Request, clicked, jest.fn())
  expect(clicked.status).not.toHaveBeenCalled()
  expect(clicked.json).toHaveBeenCalledWith({ success: true, message: 'Link click registered' })
})

test('Guru duplicate ACK keeps provider-facing status and body exact', async () => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.mocked(GuruWebhook.findOne).mockResolvedValueOnce({ _id: 'existing' } as never)
  const res = response()
  await handleGuruWebhook({
    headers: { 'x-request-id': 'duplicate-id' },
    body: { api_token: 'offline-guru-token' },
  } as never, res, jest.fn() as NextFunction)
  expect(res.status).toHaveBeenCalledWith(200)
  expect(res.json).toHaveBeenCalledWith({
    success: true,
    message: 'Webhook j\u00e1 processado',
    duplicate: true,
    requestId: 'duplicate-id',
  })
})
