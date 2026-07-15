import { buildAllowedOrigins, isOriginAllowed } from '../../src/security/cors'

test('ALLOWED_ORIGINS junta e normaliza origens sem apagar defaults', () => {
  const origins = buildAllowedOrigins(
    ' https://EXAMPLE.com/app/ , https://extra.example:443/path , https://example.com ',
  )

  expect(origins).toContain('https://example.com')
  expect(origins).toContain('https://extra.example')
  expect(origins).toContain('http://localhost:3000')
  expect(origins.filter((origin) => origin === 'https://example.com')).toHaveLength(1)
})

test('origem configurada e permitida', () => {
  const origins = buildAllowedOrigins('https://front.example')

  expect(isOriginAllowed('https://front.example/', origins)).toBe(true)
})

test('origem desconhecida falha fechada', () => {
  expect(isOriginAllowed('https://unknown.example', buildAllowedOrigins())).toBe(false)
})

test('pedido sem Origin e permitido', () => {
  expect(isOriginAllowed(undefined, buildAllowedOrigins())).toBe(true)
})

test('origem configurada invalida aborta claramente', () => {
  expect(() => buildAllowedOrigins('not-an-origin')).toThrow('ALLOWED_ORIGINS')
})
