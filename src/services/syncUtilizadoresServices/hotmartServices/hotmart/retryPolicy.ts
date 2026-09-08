import axios from 'axios'
import logger from '../../../../utils/logger'
import type { CronExecutionPhaseHooks } from '../../../cron/scheduler/executionPhases'

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const getRetryDelayMs = (error: unknown, attempt: number, baseDelayMs: number) => {
  const retryAfterHeader = axios.isAxiosError(error)
    ? error.response?.headers?.['retry-after']
    : undefined
  const retryAfter = retryAfterHeader ? parseInt(String(retryAfterHeader), 10) : NaN
  if (!Number.isNaN(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000
  }

  const jitter = Math.floor(Math.random() * 250)
  return Math.min(baseDelayMs * Math.pow(2, attempt) + jitter, 10000)
}

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED',
  'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ERR_NETWORK',
])

function retryableReadError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false
  const status = error.response?.status
  if (typeof status === 'number') return status === 429 || (status >= 500 && status < 600)
  const cause = error.cause as { code?: unknown } | undefined
  const code = error.code ?? cause?.code
  return typeof code === 'string' && TRANSIENT_NETWORK_CODES.has(code)
}

export async function requestWithRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; baseDelayMs: number; phaseHooks?: CronExecutionPhaseHooks }
): Promise<T> {
  let attempt = 0

  while (true) {
    options.phaseHooks?.assertOwnership?.()
    options.phaseHooks?.providerStarted()
    try {
      const result = await fn()
      options.phaseHooks?.providerSucceeded()
      return result
    } catch (error: unknown) {
      if (!retryableReadError(error) || attempt >= options.maxRetries) {
        throw error
      }

      const delay = getRetryDelayMs(error, attempt, options.baseDelayMs)
      logger.warn(
        `[HotmartFetch] Transient read failure. Retry in ${delay}ms (attempt ${attempt + 1}/${options.maxRetries})`
      )
      await sleep(delay)
      attempt += 1
    }
  }
}
