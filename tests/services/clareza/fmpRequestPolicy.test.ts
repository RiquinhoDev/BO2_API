import {
  executeFmpRequest,
  FmpRequestAbortedError,
  rateLimitWaitMs,
} from '../../../src/services/clareza/fmpRequestPolicy'

function httpError(status: number): unknown {
  return { response: { status } }
}

function rateLimited(headers?: Record<string, string>): unknown {
  return { response: { status: 429, ...(headers ? { headers } : {}) } }
}

/** 11:30:20.000 UTC — vinte segundos dentro do minuto. */
const MID_MINUTE = Date.UTC(2026, 8, 11, 11, 30, 20)

describe('executeFmpRequest', () => {
  it.each([
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

  // A quota da FMP e por minuto. Com os 2 segundos fixos do retry generico, as
  // tres tentativas caiam dentro do mesmo minuto que ja tinha recusado a
  // primeira, e a chamada morria com dados por ir buscar.
  it('espera pela viragem do minuto depois de um 429 sem Retry-After', async () => {
    const request = jest.fn()
      .mockRejectedValueOnce(rateLimited())
      .mockResolvedValueOnce('ok')
    const throttle = jest.fn().mockResolvedValue(undefined)
    const sleep = jest.fn().mockResolvedValue(undefined)

    await expect(
      executeFmpRequest({ request, throttle, sleep, now: () => MID_MINUTE }),
    ).resolves.toBe('ok')
    expect(sleep).toHaveBeenCalledWith(41_000)
  })

  it('prefere o Retry-After quando o fornecedor o manda', async () => {
    const request = jest.fn()
      .mockRejectedValueOnce(rateLimited({ 'retry-after': '12' }))
      .mockResolvedValueOnce('ok')
    const throttle = jest.fn().mockResolvedValue(undefined)
    const sleep = jest.fn().mockResolvedValue(undefined)

    await expect(
      executeFmpRequest({ request, throttle, sleep, now: () => MID_MINUTE }),
    ).resolves.toBe('ok')
    expect(sleep).toHaveBeenCalledWith(12_000)
  })

  it('nunca espera mais do que noventa segundos por um Retry-After absurdo', () => {
    expect(rateLimitWaitMs(rateLimited({ 'retry-after': '3600' }), MID_MINUTE)).toBe(90_000)
  })

  it('mantem o atraso fixo nos erros que nao sao de quota', async () => {
    const request = jest.fn()
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce('ok')
    const throttle = jest.fn().mockResolvedValue(undefined)
    const sleep = jest.fn().mockResolvedValue(undefined)

    await expect(
      executeFmpRequest({ request, throttle, sleep, now: () => MID_MINUTE }),
    ).resolves.toBe('ok')
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

  it('passes the cancellation signal into the throttle boundary', async () => {
    const controller = new AbortController()
    const request = jest.fn().mockResolvedValue('ok')
    const throttle = jest.fn().mockResolvedValue(undefined)

    await expect(executeFmpRequest({
      request,
      throttle,
      sleep: async () => undefined,
      signal: controller.signal,
    })).resolves.toBe('ok')
    expect(throttle).toHaveBeenCalledWith(controller.signal)
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
