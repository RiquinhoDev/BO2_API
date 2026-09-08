import type { CoreRefreshExecutionResult } from '../services/clareza/core/coreRefreshExecution'
import { executeCanonicalCoreRefresh } from '../services/clareza/core/coreRefresh.runtime'
import { refreshCoreEarningsCompanion } from '../services/clareza/core/coreEarningsCompanion.runtime'
import { refreshCoreRaioxCompanion } from '../services/clareza/core/coreRaioxCompanion.runtime'
import { refreshCoreTop10Companion } from '../services/clareza/core/coreTop10Companion.runtime'
import type { CoreRetentionReport } from '../services/clareza/core/coreRetention'
import { runCoreRetention } from '../services/clareza/core/coreRetention.runtime'
import { warmPublishedReadsCache } from '../services/clareza/core/coreCacheWarmup.runtime'
import { hasCanonicalExecution, withCanonicalExecution } from '../services/clareza/core/canonicalExecutionContext'
import { runClarezaRefreshWithReceipt } from '../services/clareza/clarezaRefreshExecution.service'
import { randomUUID } from 'node:crypto'
import {
  assertClarezaRefreshEnabled,
  getCanonicalFmpApiKey,
} from '../services/clareza/canonicalSettings'
import { cacheService } from '../services/cache.service'
import { RefreshJobCoordinator } from '../services/clareza/operations/refreshJobCoordinator'
import { RedisRefreshJobStore } from '../services/clareza/operations/redisRefreshJobStore'
import type { CronExecutionPhaseHooks } from '../services/cron/scheduler/executionPhases'
import logger, { type AppLogger } from '../utils/logger'

interface ClarezaRefreshResult {
  readonly total: number
  readonly errors: number
}

interface ClarezaCanonicalResult extends ClarezaRefreshResult {
  readonly success: boolean
}

type ClarezaRefresh = (generationId: string) => Promise<ClarezaRefreshResult>

export interface NamedClarezaRefresh {
  readonly name: string
  readonly refresh: ClarezaRefresh
}

export interface ClarezaCanonicalPipelineDependencies {
  readonly assertRefreshEnabled: () => void
  readonly refreshCore: (startedAt: string) => Promise<CoreRefreshExecutionResult>
  readonly companions: readonly NamedClarezaRefresh[]
  readonly retention?: () => Promise<CoreRetentionReport>
  readonly warmCache?: () => Promise<void>
  readonly logger: Pick<AppLogger, 'info' | 'error'>
}

async function optionalStep(
  name: string,
  run: () => Promise<unknown>,
  log: Pick<AppLogger, 'info' | 'error'>,
): Promise<void> {
  try {
    await run()
    log.info(`Clareza ${name} completed`)
  } catch (error: unknown) {
    log.error(`Clareza ${name} failed`, error)
  }
}

export function createClarezaCanonicalPipeline(
  dependencies: ClarezaCanonicalPipelineDependencies,
) {
  return {
    async run(startedAt: string): Promise<ClarezaCanonicalResult> {
      dependencies.assertRefreshEnabled()
      const core = await dependencies.refreshCore(startedAt)
      if (core.status !== 'published') {
        throw new Error(`Clareza canonical core not published: ${core.status}`)
      }
      const coreErrors = core.missingAssets + core.failedAssets
      if (coreErrors > 0) {
        throw new Error(`Clareza canonical core incomplete: ${coreErrors}`)
      }

      if (dependencies.retention) {
        await optionalStep('retention', dependencies.retention, dependencies.logger)
      }

      const companionResults = await Promise.all(dependencies.companions.map(async companion => {
        try {
          const result = await companion.refresh(core.generationId)
          dependencies.logger.info(`Clareza ${companion.name} refresh completed`, result)
          return result.errors
        } catch (error: unknown) {
          dependencies.logger.error(`Clareza ${companion.name} refresh failed`, error)
          return 1
        }
      }))
      const companionErrors = companionResults.reduce((sum, errors) => sum + errors, 0)
      if (companionErrors > 0) {
        throw new Error(`Clareza canonical companions incomplete: ${companionErrors}`)
      }

      if (dependencies.warmCache) {
        await optionalStep('cache warmup', dependencies.warmCache, dependencies.logger)
      }

      return {
        success: true,
        total: core.collectedAssets,
        errors: 0,
      }
    },
  }
}

export interface ClarezaCanonicalJobDependencies {
  readonly assertRefreshEnabled: () => void
  readonly execute: () => Promise<ClarezaCanonicalResult>
  readonly protect?: (run: (hooks: CronExecutionPhaseHooks) => Promise<ClarezaCanonicalResult>) => Promise<ClarezaCanonicalResult>
}

export function createClarezaCanonicalJob(dependencies: ClarezaCanonicalJobDependencies) {
  return {
    run(hooks?: CronExecutionPhaseHooks): Promise<ClarezaCanonicalResult> {
      const execute = async () => {
        dependencies.assertRefreshEnabled()
        const result = await dependencies.execute()
        if (!result.success || result.errors > 0) {
          throw new Error(`Clareza canonical execution incomplete: ${result.errors}`)
        }
        return result
      }
      if (hooks) return withCanonicalExecution(hooks, execute)
      return (async () => {
        dependencies.assertRefreshEnabled()
        if (hasCanonicalExecution() || !dependencies.protect) return execute()
        return dependencies.protect(receiptHooks => withCanonicalExecution(receiptHooks, execute))
      })()
    },
  }
}

const pipeline = createClarezaCanonicalPipeline({
  assertRefreshEnabled: () => {
    assertClarezaRefreshEnabled()
    getCanonicalFmpApiKey()
  },
  refreshCore: executeCanonicalCoreRefresh,
  companions: [
    { name: 'Raio-X', refresh: refreshCoreRaioxCompanion },
    { name: 'Earnings', refresh: refreshCoreEarningsCompanion },
    { name: 'Top 10', refresh: refreshCoreTop10Companion },
  ],
  retention: runCoreRetention,
  warmCache: warmPublishedReadsCache,
  logger,
})

const coordinator = new RefreshJobCoordinator<ClarezaCanonicalResult>(
  context => pipeline.run(context.startedAt),
  error => logger.error('Clareza canonical coordinator failed', error),
  new RedisRefreshJobStore<ClarezaCanonicalResult>(
    cacheService.getRefreshJobCommandPort(),
    'clareza:jobs:canonical-daily-refresh',
  ),
  { leaseMs: 15 * 60 * 1_000, heartbeatMs: 60 * 1_000 },
)

const clarezaCanonicalJob = createClarezaCanonicalJob({
  assertRefreshEnabled: () => {
    assertClarezaRefreshEnabled()
    getCanonicalFmpApiKey()
  },
  execute: () => coordinator.execute(),
  protect: refresh => runClarezaRefreshWithReceipt({
    operation: 'market', identity: 'canonical-core', fingerprint: 'system:cron:canonical-refresh',
    requestId: `cron:clareza:${randomUUID()}`, refresh,
  }),
})

export default clarezaCanonicalJob
