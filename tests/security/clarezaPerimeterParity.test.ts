import request from 'supertest'
import { createApp } from '../../src/app'

test('public suggestions are limited to twenty requests per fifteen-minute window', async () => {
  let handled = 0
  const app = createApp({ authEnforce: false, registerRoutes: app => {
    app.post('/api/clareza/suggestions', (_req, res) => { handled++; res.status(202).json({ success: true }) })
  } })
  for (let i = 0; i < 20; i++) {
    const result = await request(app).post('/api/clareza/suggestions').query({ __bo2_offline_loopback: '1' })
    expect(result.status).toBe(202)
  }
  const result = await request(app).post('/api/clareza/suggestions').query({ __bo2_offline_loopback: '1' })
  expect(result.status).toBe(429)
  expect(handled).toBe(20)
})

test('rejected CORS origin returns a controlled 403 without reflecting the origin', async () => {
  const app = createApp({ authEnforce: false, allowedOrigins: ['https://allowed.test'], registerRoutes: app => {
    app.get('/health', (_req, res) => res.json({ ok: true }))
  } })
  const result = await request(app).get('/health').query({ __bo2_offline_loopback: '1' }).set('Origin', 'https://rejected.test')
  expect(result.status).toBe(403)
  expect(result.body.code).toBe('CORS_ORIGIN_DENIED')
  expect(JSON.stringify(result.body)).not.toContain('rejected.test')
})
