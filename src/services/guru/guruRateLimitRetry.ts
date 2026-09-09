import axios from 'axios'
import logger from '../../utils/logger'

export async function withGuruRateLimitRetry<T>(request: () => Promise<T>, beforeRequest?: () => void): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    beforeRequest?.()
    try {
      return await request()
    } catch (error: unknown) {
      if (!axios.isAxiosError(error) || error.response?.status !== 429 || attempt >= 5) throw error
      const header = error.response.headers?.['retry-after']
      const seconds = Number(header)
      const date = typeof header === 'string' ? Date.parse(header) : NaN
      const delay = Number.isFinite(seconds) && seconds > 0
        ? seconds * 1000
        : Number.isFinite(date) && date > Date.now()
          ? date - Date.now()
          : 60_000 * (attempt + 1)
      // Never shorten the provider's cooldown and retry before it expires.
      logger.warn('Guru rate limit cooldown', { attempt: attempt + 1, delayMs: delay })
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}
