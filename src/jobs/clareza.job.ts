import { executeCanonicalCoreRefresh } from '../services/clareza/core/coreRefresh.runtime'
import type { CoreRefreshExecutionResult } from '../services/clareza/core/coreRefreshExecution'
import { refreshCoreEarningsCompanion } from '../services/clareza/core/coreEarningsCompanion.runtime'
import { refreshCoreRaioxCompanion } from '../services/clareza/core/coreRaioxCompanion.runtime'
import { refreshCoreTop10Companion } from '../services/clareza/core/coreTop10Companion.runtime'
import { assertClarezaRefreshEnabled, getFmpApiKey } from '../services/requestDrivenRuntimeConfig'
import { cacheService } from '../services/cache.service'
import { RefreshJobCoordinator } from '../services/clareza/operations/refreshJobCoordinator'
import { RedisRefreshJobStore } from '../services/clareza/operations/redisRefreshJobStore'
import logger, { type AppLogger } from '../utils/logger'

interface ClarezaRefreshResult {
  readonly total: number
  readonly errors: number
}

interface ClarezaDailyResult extends ClarezaRefreshResult {
  readonly success: boolean
}

type ClarezaRefresh = (generationId: string) => Promise<ClarezaRefreshResult>

export interface NamedClarezaRefresh {
  readonly name: string
  readonly refresh: ClarezaRefresh
}

export interface ClarezaJobDependencies {
  readonly assertRefreshEnabled: () => void
  readonly refreshCore: (startedAt: string) => Promise<CoreRefreshExecutionResult>
  readonly companions: readonly NamedClarezaRefresh[]
  readonly top10?: NamedClarezaRefresh
  readonly logger: Pick<AppLogger, 'info' | 'error'>
}

async function refreshBestEffort(
  target: NamedClarezaRefresh,
  generationId: string,
  loggerPort: Pick<AppLogger, 'info' | 'error'>,
): Promise<number> {
  try {
    const result = await target.refresh(generationId)
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
    async run(startedAt = new Date().toISOString()): Promise<{ success: boolean; total: number; errors: number }> {
      try {
        dependencies.assertRefreshEnabled()
        const core = await dependencies.refreshCore(startedAt)
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
          dependencies.companions.map(target => refreshBestEffort(
            target, core.generationId, dependencies.logger,
          )),
        )
        const top10Errors = dependencies.top10
          ? await refreshBestEffort(dependencies.top10, core.generationId, dependencies.logger)
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

const pipeline = createClarezaJob({
  assertRefreshEnabled: () => {
    assertClarezaRefreshEnabled()
    getFmpApiKey()
  },
  refreshCore: executeCanonicalCoreRefresh,
  companions: [
    { name: 'Raio-X', refresh: refreshCoreRaioxCompanion },
    { name: 'Earnings', refresh: refreshCoreEarningsCompanion },
  ],
  top10: { name: 'Top 10', refresh: refreshCoreTop10Companion },
  logger,
})

const coordinator = new RefreshJobCoordinator<ClarezaDailyResult>(
  async context => {
    const result = await pipeline.run(context.startedAt)
    if (!result.success) throw new Error('Clareza canonical daily refresh failed')
    return result
  },
  () => undefined,
  new RedisRefreshJobStore<ClarezaDailyResult>(
    cacheService.getRefreshJobCommandPort(),
    'clareza:jobs:canonical-daily-refresh',
  ),
  { leaseMs: 15 * 60 * 1_000, heartbeatMs: 60 * 1_000 },
)

export default {
  async run(): Promise<{ success: boolean; total: number; errors: number }> {
    try {
      return await coordinator.execute()
    } catch {
      return { success: false, total: 0, errors: 1 }
    }
  },
}
