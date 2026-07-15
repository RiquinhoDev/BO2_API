import { configureServerTimeouts } from '../../src/runtime/listen'

test('configura apenas headers e keep-alive sem reduzir requestTimeout', () => {
  const server = {
    headersTimeout: 60_000,
    keepAliveTimeout: 5_000,
    requestTimeout: 1_381_000,
  }

  configureServerTimeouts(server)

  expect(server.headersTimeout).toBe(15_000)
  expect(server.keepAliveTimeout).toBe(5_000)
  expect(server.requestTimeout).toBe(1_381_000)
})
