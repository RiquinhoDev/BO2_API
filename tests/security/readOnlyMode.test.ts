import { assertReadOnlyMongoPrivileges, assertReadOnlyHttpRequest, readOnlyRequestGuard } from '../../src/security/readOnlyMode'
import request from 'supertest'
import { createApp } from '../../src/app'
import type { Request, Response } from 'express'

const status = (actions: string[]) => ({ authInfo: { authenticatedUsers: [{ user: 'reader' }], authenticatedUserPrivileges: [{ resource: { db: 'test' }, actions }] } })

test('requires authenticated, enumerated, read-only Mongo privileges', () => {
  expect(() => assertReadOnlyMongoPrivileges(status(['find', 'listIndexes']))).not.toThrow()
  for (const invalid of [undefined, {}, status([]), status(['find', 'insert']), status(['find', 'anyAction']), status(['find', 'update']), status(['find', 'remove'])]) {
    expect(() => assertReadOnlyMongoPrivileges(invalid)).toThrow('READ_ONLY_MONGO_CREDENTIALS_REQUIRED')
  }
})

test('mounted app rejects a write before the route handler and still serves health reads', async () => {
  const write = jest.fn((_req: Request, res: Response) => { res.sendStatus(204) })
  const app = createApp({ readOnlyMode: true, authEnforce: false, registerRoutes: app => {
    app.post('/api/events', write)
    app.get('/health', (_req, res) => res.json({ ok: true }))
  } })
  await request(app).post('/api/events').query({ __bo2_offline_loopback: '1' }).expect(403)
  await request(app).get('/health').query({ __bo2_offline_loopback: '1' }).expect(200)
  expect(write).not.toHaveBeenCalled()
})

test('allows audited Guru reads and rejects writes, unknown destinations and mutation-looking GETs', () => {
  expect(() => assertReadOnlyHttpRequest('GET', 'https://digitalmanager.guru/api/v2/subscriptions?per_page=50')).not.toThrow()
  for (const [method, url] of [
    ['POST', 'https://digitalmanager.guru/api/v2/subscriptions'],
    ['GET', 'https://digitalmanager.guru/api/v2/subscriptions/sync'],
    ['GET', 'https://bot.example/sync'],
    ['DELETE', 'https://example.com/users/1'],
  ]) expect(() => assertReadOnlyHttpRequest(method, url)).toThrow('READ_ONLY_EGRESS_BLOCKED')
})

test('blocks inbound writes and legacy GET mutations before handlers', () => {
  for (const [method, path] of [['POST', '/api/events'], ['DELETE', '/api/events/1'], ['GET', '/api/guru/sync/all'], ['GET', '/api/guru/analytics/fix-multi-subscriptions']]) {
    const next = jest.fn()
    const json = jest.fn()
    const res = { status: jest.fn(() => ({ json })) }
    readOnlyRequestGuard({ method, path } as never, res as never, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  }
  const next = jest.fn()
  readOnlyRequestGuard({ method: 'GET', path: '/api/events' } as never, {} as never, next)
  expect(next).toHaveBeenCalledTimes(1)
})
