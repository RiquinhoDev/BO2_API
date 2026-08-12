import logger from '../../../utils/logger'
import { getRuntimeConfig } from '../../../config/runtimeConfig'

/**
 * Logs only when the runtime observability logLevel is 'debug'.
 * Shared by the universal-sync orchestration and the processSyncItem use case.
 */
export function debugLog(...args: unknown[]): void {
  if (getRuntimeConfig().observability.logLevel === 'debug') {
    const [message, ...metadata] = args
    logger.info(typeof message === 'string' ? message : String(message), ...metadata)
  }
}
