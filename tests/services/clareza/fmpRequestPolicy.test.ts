import {
  executeFmpRequest,
  FmpRequestAbortedError,
} from '../../../src/services/clareza/fmpRequestPolicy'

function httpError(status: number): unknown {
  return { response: { status } }
}

describe('executeFmpRequest', () => {
  it.each([
    ['rate limit', httpError(429)],
    ['HTTP timeout', httpError(408)],
    ['server failure', httpError(503)],
    ['request timeout', { code: 'ETIMEDOUT' }],
    ['axios timeout', { code: 'ECONNABORTED' }],
  ])('retries a %s through the throttle and bounded backoff', async (_label, retryableError) => {
    const request = jest.fn()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce('ok')
    const throttle = jest.fn().mockResolvedValue(undefined)
    const sleep = jest.fn().mockResolvedValue(undefined)

    await expect(executeFmpRequest({ request, throttle, sleep })).resolves.toBe('ok')
    expect(request).toHaveBeenCalledTimes(2)
    expect(throttle).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(2000)
  })

  it('does not retry a non-rate-limit 4xx response', async () => {
    const error = httpError(404)
    const request = jest.fn().mockRejectedValue(error)
    const throttle = jest.fn().mockResolvedValue(undefined)
    const sleep = jest.fn().mockResolvedValue(undefined)

    await expect(executeFmpRequest({ request, throttle, sleep })).rejects.toBe(error)
    expect(request).toHaveBeenCalledTimes(1)
    expect(throttle).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('stops after exactly three retryable failures', async () => {
    const error = httpError(500)
    const request = jest.fn().mockRejectedValue(error)
    const throttle = jest.fn().mockResolvedValue(undefined)
    const sleep = jest.fn().mockResolvedValue(undefined)

    await expect(executeFmpRequest({ request, throttle, sleep })).rejects.toBe(error)
    expect(request).toHaveBeenCalledTimes(3)
    expect(throttle).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('fails closed before throttle and HTTP when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const request = jest.fn().mockResolvedValue('unexpected')
    const throttle = jest.fn().mockResolvedValue(undefined)
    const sleep = jest.fn().mockResolvedValue(undefined)

    await expect(executeFmpRequest({
      request,
      throttle,
      sleep,
      signal: controller.signal,
    })).rejects.toBeInstanceOf(FmpRequestAbortedError)
    expect(request).not.toHaveBeenCalled()
    expect(throttle).not.toHaveBeenCalled()
    expect(sleep).not.toHaveBeenCalled()
  })

  it('cancels an outstanding retry backoff without starting another request', async () => {
    const controller = new AbortController()
    const request = jest.fn().mockRejectedValue(httpError(503))
    const throttle = jest.fn().mockResolvedValue(undefined)
    const sleep = jest.fn(() => new Promise<void>(() => undefined))

    const result = executeFmpRequest({
      request,
      throttle,
      sleep,
      signal: controller.signal,
    })
    await Promise.resolve()
    await Promise.resolve()
    controller.abort()

    await expect(result).rejects.toBeInstanceOf(FmpRequestAbortedError)
    expect(request).toHaveBeenCalledTimes(1)
    expect(throttle).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledTimes(1)
  })
})
