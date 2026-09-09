import { withGuruRateLimitRetry } from '../../../src/services/guru/guruRateLimitRetry'

describe('Guru rate limit recovery', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-01-01T00:00:00Z')) })
  afterEach(() => jest.useRealTimers())

  test.each(['75', 'Thu, 01 Jan 2026 00:01:15 GMT'])('waits for Retry-After %s before retrying', async retryAfter => {
    let calls = 0
    const run = withGuruRateLimitRetry(async () => {
      if (++calls === 1) throw { isAxiosError: true, response: { status: 429, headers: { 'retry-after': retryAfter } } }
      return 'complete'
    })
    await jest.advanceTimersByTimeAsync(74_000)
    expect(calls).toBe(1)
    await jest.advanceTimersByTimeAsync(1_000)
    await expect(run).resolves.toBe('complete')
  })

  test('checks ownership again after cooldown and does not retry a cancelled execution', async () => {
    let calls = 0
    let owned = true
    const run = withGuruRateLimitRetry(async () => {
      calls++
      throw { isAxiosError: true, response: { status: 429, headers: {} } }
    }, () => { if (!owned) throw new Error('ownership lost') })
    const rejection = expect(run).rejects.toThrow('ownership lost')
    await jest.advanceTimersByTimeAsync(1000)
    owned = false
    await jest.advanceTimersByTimeAsync(60_000)
    await rejection
    expect(calls).toBe(1)
  })

  test('does not retry non-rate-limit failures', async () => {
    const error = new Error('invalid credentials')
    await expect(withGuruRateLimitRetry(async () => { throw error })).rejects.toBe(error)
    expect(jest.getTimerCount()).toBe(0)
  })

  test('bounds retries when the provider keeps rejecting requests', async () => {
    let calls = 0
    const error = { isAxiosError: true, response: { status: 429, headers: { 'retry-after': '1' } } }
    const run = withGuruRateLimitRetry(async () => { calls++; throw error })
    const rejection = expect(run).rejects.toBe(error)
    await jest.runAllTimersAsync()
    await rejection
    expect(calls).toBe(6)
  })
})
