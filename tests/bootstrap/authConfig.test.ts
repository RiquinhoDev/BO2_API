import { loadConfig } from '../../src/config/appConfig'

const BASE_ENV = {
  NODE_ENV: 'test',
  MONGO_URI: 'mongodb://database.internal/bo2',
  JWT_SECRET: 'f2-auth-config-jwt-secret-at-least-32-characters',
  AC_WEBHOOK_SECRET: 'f2-auth-config-ac-secret-at-least-32-characters',
}

test('AUTH_ENFORCE fica ligado por omissao e so desliga explicitamente', () => {
  expect(loadConfig(BASE_ENV).authEnforce).toBe(true)
  expect(loadConfig({ ...BASE_ENV, AUTH_ENFORCE: 'false' }).authEnforce).toBe(false)
  expect(() => loadConfig({ ...BASE_ENV, AUTH_ENFORCE: '0' })).toThrow('AUTH_ENFORCE')
})
