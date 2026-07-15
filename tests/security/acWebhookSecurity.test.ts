import { createHmac } from 'node:crypto'
import type { Application } from 'express'
import request from 'supertest'
import { createApp } from '../../src/app'

const SECRET = 'test-only-ac-webhook-secret-at-least-32-characters'
const HEADER = 'X-ActiveCampaign-Signature'

function signature(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex')
}

function createProbe() {
  const fingerprints = new Set<string>()
  const effects: string[] = []
  const replayStore = {
    claim: jest.fn(async (fingerprint: string) => {
      if (fingerprints.has(fingerprint)) return false
      fingerprints.add(fingerprint)
      return true
    }),
    complete: jest.fn(async () => undefined),
    release: jest.fn(async (fingerprint: string) => {
      fingerprints.delete(fingerprint)
    }),
  }
  const app = createApp({
    acWebhookSecret: SECRET,
    acWebhookReplayStore: replayStore,
    registerRoutes: (target: Application) => {
      target.post('/api/webhooks/ac/email-opened', (req, res) => {
        effects.push(req.body.contact.email)
        res.json({ success: true })
      })
    },
  })
  return { app, effects, replayStore }
}

test('aceita HMAC valido e rejeita assinatura invalida ou ausente', async () => {
  const body = JSON.stringify({ contact: { email: 'alice@example.test' } })
  const { app, effects } = createProbe()

  await request(app)
    .post('/api/webhooks/ac/email-opened?__bo2_offline_loopback=1')
    .set('Content-Type', 'application/json')
    .set(HEADER, signature(body))
    .send(body)
    .expect(200)

  await request(app)
    .post('/api/webhooks/ac/email-opened?__bo2_offline_loopback=1')
    .set('Content-Type', 'application/json')
    .set(HEADER, '00'.repeat(32))
    .send(body)
    .expect(401)

  await request(app)
    .post('/api/webhooks/ac/email-opened?__bo2_offline_loopback=1')
    .set('Content-Type', 'application/json')
    .send(body)
    .expect(401)

  expect(effects).toEqual(['alice@example.test'])
})

test('aceita payload urlencoded assinado sobre os bytes exatos', async () => {
  const body = 'contact%5Bemail%5D=alice%40example.test'
  const { app, effects } = createProbe()

  await request(app)
    .post('/api/webhooks/ac/email-opened?__bo2_offline_loopback=1')
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .set(HEADER, signature(body))
    .send(body)
    .expect(200)

  expect(effects).toEqual(['alice@example.test'])
})

test('verifica a assinatura antes de tentar fazer parse do JSON', async () => {
  const malformed = '{'
  const { app } = createProbe()

  await request(app)
    .post('/api/webhooks/ac/email-opened?__bo2_offline_loopback=1')
    .set('Content-Type', 'application/json')
    .set(HEADER, '00'.repeat(32))
    .send(malformed)
    .expect(401)

  await request(app)
    .post('/api/webhooks/ac/email-opened?__bo2_offline_loopback=1')
    .set('Content-Type', 'application/json')
    .set(HEADER, signature(malformed))
    .send(malformed)
    .expect(400)
})

test('replay do mesmo evento nao repete o efeito', async () => {
  const body = JSON.stringify({ contact: { email: 'alice@example.test' } })
  const { app, effects, replayStore } = createProbe()
  const send = () =>
    request(app)
      .post('/api/webhooks/ac/email-opened?__bo2_offline_loopback=1')
      .set('Content-Type', 'application/json')
      .set(HEADER, signature(body))
      .send(body)

  await send().expect(200)
  const replay = await send().expect(200)

  expect(replay.body).toEqual(expect.objectContaining({ duplicate: true }))
  expect(effects).toEqual(['alice@example.test'])
  expect(replayStore.claim).toHaveBeenCalledTimes(2)
})

test('limita o body do webhook antes do controller', async () => {
  const body = JSON.stringify({ contact: { email: 'alice@example.test' }, padding: 'x'.repeat(40_000) })
  const { app, effects } = createProbe()

  await request(app)
    .post('/api/webhooks/ac/email-opened?__bo2_offline_loopback=1')
    .set('Content-Type', 'application/json')
    .set(HEADER, signature(body))
    .send(body)
    .expect(413)

  expect(effects).toEqual([])
})