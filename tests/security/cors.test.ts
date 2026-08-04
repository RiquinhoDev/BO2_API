import request from 'supertest'
import { createApp } from '../../src/app'
import { buildAllowedOrigins, isOriginAllowed } from '../../src/security/cors'

const marker = { __bo2_offline_loopback: '1' }
const FORMER_PRODUCTION_ORIGINS = [
  'https://www.backoffice.serriquinho.com',
  'https://backoffice.serriquinho.com',
  'https://lp.serriquinho.com',
  'https://osriquinhos.serriquinho.com',
  'https://www.osriquinhos.serriquinho.com',
  'https://comunidadelogin-production.up.railway.app',
]

test('ALLOWED_ORIGINS junta e normaliza origens locais sem apagar defaults loopback', () => {
  const origins = buildAllowedOrigins(
    ' https://EXAMPLE.com/app/ , https://extra.example:443/path , https://example.com ',
    'test',
  )

  expect(origins).toContain('https://example.com')
  expect(origins).toContain('https://extra.example')
  expect(origins).toContain('http://localhost:3000')
  expect(origins.filter((origin) => origin === 'https://example.com')).toHaveLength(1)
})

test('produção exige ALLOWED_ORIGINS explícita e não aceita lista vazia', () => {
  for (const value of [undefined, '', '   ', ',']) {
    expect(() => buildAllowedOrigins(value, 'production')).toThrow('ALLOWED_ORIGINS')
  }
})

test('produção usa apenas origens explicitamente configuradas e normalizadas', () => {
  expect(buildAllowedOrigins('https://EXAMPLE.com/app', 'production')).toEqual([
    'https://example.com',
  ])

  const origins = buildAllowedOrigins(
    'https://front.example/app, https://front.example/',
    'production',
  )
  expect(origins).toEqual(['https://front.example'])
  expect(origins).not.toContain('http://localhost:3000')
  expect(origins).not.toContain('http://localhost:5173')
  expect(origins).not.toContain('http://127.0.0.1:3000')
  expect(origins).not.toContain('http://127.0.0.1:5173')
  for (const origin of FORMER_PRODUCTION_ORIGINS) expect(origins).not.toContain(origin)
})

test('ambientes locais preservam apenas defaults loopback', () => {
  const origins = buildAllowedOrigins(undefined, 'test')

  expect(origins).toEqual(
    expect.arrayContaining([
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ]),
  )
  for (const origin of FORMER_PRODUCTION_ORIGINS) expect(origins).not.toContain(origin)
})

test('origem configurada e permitida', () => {
  const origins = buildAllowedOrigins('https://front.example', 'test')

  expect(isOriginAllowed('https://front.example/', origins)).toBe(true)
})

test('origem desconhecida falha fechada', () => {
  expect(
    isOriginAllowed('https://unknown.example', buildAllowedOrigins(undefined, 'test')),
  ).toBe(false)
})

test('pedido sem Origin e permitido', () => {
  expect(isOriginAllowed(undefined, buildAllowedOrigins(undefined, 'test'))).toBe(true)
})

test('origem configurada invalida aborta claramente', () => {
  expect(() => buildAllowedOrigins('not-an-origin', 'test')).toThrow('ALLOWED_ORIGINS')
})

test('createApp sem allowlist injetada rejeita origem browser e permite pedido sem Origin', async () => {
  const app = createApp({
    authEnforce: false,
    registerRoutes: (target) => {
      target.get('/probe', (_req, res) => res.sendStatus(204))
    },
  })

  await request(app)
    .get('/probe')
    .set('Origin', 'https://browser.example')
    .query(marker)
    .expect(500)
  await request(app)
    .get('/probe')
    .set('Origin', 'https://backoffice.serriquinho.com')
    .query(marker)
    .expect(500)
  await request(app).get('/probe').query(marker).expect(204)
})
