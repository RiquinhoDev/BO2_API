import { executeCanonicalCoreRefresh } from '../services/clareza/core/coreRefresh.runtime'
import type { CoreRefreshExecutionResult } from '../services/clareza/core/coreRefreshExecution'
import { refreshClarezaEarningsData } from '../services/clareza/clarezaEarningsService'
import { assertClarezaRefreshEnabled, getFmpApiKey } from '../services/requestDrivenRuntimeConfig'
import logger, { type AppLogger } from '../utils/logger'

interface ClarezaRefreshResult {
  readonly total: number
  readonly errors: number
}

type ClarezaRefresh = () => Promise<ClarezaRefreshResult>

export interface NamedClarezaRefresh {
  readonly name: string
  readonly refresh: ClarezaRefresh
}

export interface ClarezaJobDependencies {
  readonly assertRefreshEnabled: () => void
  readonly refreshCore: () => Promise<CoreRefreshExecutionResult>
  readonly companions: readonly NamedClarezaRefresh[]
  readonly top10?: NamedClarezaRefresh
  readonly logger: Pick<AppLogger, 'info' | 'error'>
}

async function refreshBestEffort(
  target: NamedClarezaRefresh,
  loggerPort: Pick<AppLogger, 'info' | 'error'>,
): Promise<number> {
  try {
    const result = await target.refresh()
    loggerPort.info(`Clareza ${target.name} refresh completed`, {
      total: result.total,
      errors: result.errors,
    })
    return result.errors
  } catch {
    loggerPort.error(`Clareza ${target.name} refresh failed`, { total: 0, errors: 1 })
    return 1
  }
}

export function createClarezaJob(dependencies: ClarezaJobDependencies) {
  return {
    async run(): Promise<{ success: boolean; total: number; errors: number }> {
      try {
        dependencies.assertRefreshEnabled()
        const core = await dependencies.refreshCore()
        const coreErrors = core.missingAssets + core.failedAssets
        if (core.status !== 'published') {
          const errors = Math.max(1, coreErrors)
          dependencies.logger.error('Clareza canonical core refresh not published', {
            total: core.collectedAssets,
            errors,
          })
          return { success: false, total: core.collectedAssets, errors }
        }

        const companionErrors = await Promise.all(
          dependencies.companions.map(target => refreshBestEffort(target, dependencies.logger)),
        )
        const top10Errors = dependencies.top10
          ? await refreshBestEffort(dependencies.top10, dependencies.logger)
          : 0
        return {
          success: true,
          total: core.collectedAssets,
          errors: coreErrors + companionErrors.reduce((sum, value) => sum + value, 0) + top10Errors,
        }
      } catch {
        dependencies.logger.error('Clareza canonical daily refresh failed', { total: 0, errors: 1 })
        return { success: false, total: 0, errors: 1 }
      }
    },
  }
}

const clarezaJob = createClarezaJob({
  assertRefreshEnabled: () => {
    assertClarezaRefreshEnabled()
    getFmpApiKey()
  },
  refreshCore: executeCanonicalCoreRefresh,
  companions: [
    { name: 'Earnings', refresh: refreshClarezaEarningsData },
  ],
  logger,
})

export default clarezaJob
