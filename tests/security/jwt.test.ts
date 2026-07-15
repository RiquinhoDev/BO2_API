import jwt from 'jsonwebtoken'
import { configureJwt, signAppToken, signOldApiToken, verifyAppToken } from '../../src/security/jwt'

const APP_SECRET = 'test-only-app-jwt-secret-with-at-least-32-characters'
const OLD_API_SECRET = 'test-only-old-api-secret-with-at-least-32-characters'
const LEGACY_SECRET = 'riquinho-secret-key-2024'

beforeEach(() => configureJwt({ jwtSecret: APP_SECRET, oldApiJwtSecret: OLD_API_SECRET }))

test('emite e verifica tokens da app pelo modulo central', () => {
  const token = signAppToken({ id: 'admin-1', role: 'admin' }, { expiresIn: '5m' })

  expect(verifyAppToken(token)).toEqual(expect.objectContaining({ id: 'admin-1', role: 'admin' }))
})

test('rejeita token assinado com o segredo hardcoded antigo', () => {
  const token = jwt.sign({ id: 'forged-admin', role: 'admin' }, LEGACY_SECRET)

  expect(() => verifyAppToken(token)).toThrow()
})

test('OLD_API_JWT_SECRET permanece explicito e separado', () => {
  const token = signOldApiToken({ role: 'admin', service: 'BO2_API' }, { expiresIn: '5m' })

  expect(jwt.verify(token, OLD_API_SECRET)).toEqual(
    expect.objectContaining({ role: 'admin', service: 'BO2_API' }),
  )
  expect(() => verifyAppToken(token)).toThrow()
})
