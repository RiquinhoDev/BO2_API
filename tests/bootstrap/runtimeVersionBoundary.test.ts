import { loadConfig } from '../../src/config/appConfig'

const BASE_ENV = {
  NODE_ENV: 'test',
  MONGO_URI: 'mongodb://database.internal/bo2',
  JWT_SECRET: 'test-only-jwt-secret-with-at-least-32-characters',
  OLD_API_JWT_SECRET: 'test-only-old-api-jwt-secret-at-least-32-characters',
  STUDENT_ACCESS_JWT_SECRET: 'test-only-student-access-jwt-secret-at-least-32-characters',
  AC_WEBHOOK_SECRET: 'test-only-ac-webhook-secret-at-least-32-characters',
}

test('loadConfig carries npm-injected server version into typed core config', () => {
  const config = loadConfig({
    ...BASE_ENV,
    npm_package_version: 'typed-version-3.2.1',
  })

  expect((config.core as Record<string, unknown>).serverVersion).toBe('typed-version-3.2.1')
})

test('loadConfig leaves server version undefined when npm metadata is absent', () => {
  const config = loadConfig(BASE_ENV)

  expect((config.core as Record<string, unknown>).serverVersion).toBeUndefined()
})
