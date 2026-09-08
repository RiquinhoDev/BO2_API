import { requestWithRetry } from '../../../src/services/syncUtilizadoresServices/hotmartServices/hotmart/transport'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

test.each([
  { isAxiosError: true, code: 'ECONNRESET' },
  { isAxiosError: true, code: 'ETIMEDOUT' },
  { isAxiosError: true, response: { status: 503 } },
  { isAxiosError: true, response: { status: 429 } },
])('retries transient Hotmart read failure %j', async error => {
  let attempts = 0
  const result = requestWithRetry(async () => {
    if (++attempts === 1) throw error
    return 'complete page'
  }, { maxRetries: 1, baseDelayMs: 1 })
  const assertion = expect(result).resolves.toBe('complete page')
  await jest.runAllTimersAsync()
  await assertion
  expect(attempts).toBe(2)
})

test('does not retry authentication failures', async () => {
  let attempts = 0
  const error = { isAxiosError: true, response: { status: 401 } }
  await expect(requestWithRetry(async () => { attempts++; throw error }, { maxRetries: 3, baseDelayMs: 1 }))
    .rejects.toBe(error)
  expect(attempts).toBe(1)
})

test('loss of ownership during retry delay prevents the next provider attempt', async () => {
  let attempts = 0
  let owned = true
  const result = requestWithRetry(async () => {
    attempts++
    owned = false
    throw { isAxiosError: true, response: { status: 503 } }
  }, { maxRetries: 2, baseDelayMs: 1, phaseHooks: {
    assertOwnership: () => { if (!owned) throw new Error('ownership lost') },
    providerStarted: () => {}, providerSucceeded: () => {}, localMutationStarted: () => {},
  } })
  const assertion = expect(result).rejects.toThrow('ownership lost')
  await jest.runAllTimersAsync()
  await assertion
  expect(attempts).toBe(1)
})
