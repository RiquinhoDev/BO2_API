import { executeCanonicalCoreRefresh } from '../services/clareza/core/coreRefresh.runtime'
import type { CoreRefreshExecutionResult } from '../services/clareza/core/coreRefreshExecution'
import { refreshCoreEarningsCompanion } from '../services/clareza/core/coreEarningsCompanion.runtime'
import { refreshCoreRaioxCompanion } from '../services/clareza/core/coreRaioxCompanion.runtime'
import { refreshCoreTop10Companion } from '../services/clareza/core/coreTop10Companion.runtime'
import type { CoreRetentionReport } from '../services/clareza/core/coreRetention'
import { runCoreRetention } from '../services/clareza/core/coreRetention.runtime'
import { warmPublishedReadsCache } from '../services/clareza/core/coreCacheWarmup.runtime'
import { assertClarezaRefreshEnabled, getFmpApiKey } from '../services/requestDrivenRuntimeConfig'
import { cacheService } from '../services/cache.service'
import { RefreshJobCoordinator } from '../services/clareza/operations/refreshJobCoordinator'
import { RedisRefreshJobStore } from '../services/clareza/operations/redisRefreshJobStore'
import logger, { type AppLogger } from '../utils/logger'

interface ClarezaRefreshResult {
  readonly total: number
  readonly errors: number
}

/**
 * O que o dia devolve.
 *
 * `errors` é o que faz a noite falhar: uma peça da cadeia que rebentou. O
 * dispatcher lê-o e faz `success && errors === 0`, portanto um único erro
 * pinta tudo de vermelho — e é por isso que só pode lá estar o que é mesmo
 * falha nossa.
 *
 * `semDados` é outra coisa: tickers para os quais o fornecedor não tem
 * dados. É uma medida de cobertura, não um erro. Quem decide se a cobertura
 * chega é a trava de publicação, que exige 90%; se não chegar, a geração não
 * é publicada e aí sim o dia falha.
 */
export interface ClarezaDiaResult {
  readonly success: boolean
  readonly total: number
  readonly errors: number
  readonly semDados: number
}

type ClarezaDailyResult = ClarezaDiaResult

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
  readonly retention?: () => Promise<CoreRetentionReport>
  readonly warmCache?: () => Promise<void>
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

// A poda corre logo a seguir à publicação e antes dos companions: nessa altura
// o ponteiro já protege a geração nova e a anterior, portanto só apaga lixo das
// antigas, e liberta o espaço de que a escrita dos companions vai precisar.
// Falhar aqui é arrumação por fazer, não um refresh falhado, logo nunca derruba
// o resultado do dia.
async function pruneBestEffort(
  retention: () => Promise<CoreRetentionReport>,
  loggerPort: Pick<AppLogger, 'info' | 'error'>,
): Promise<void> {
  try {
    const report = await retention()
    loggerPort.info('Clareza retention completed', {
      total: report.retainedGenerations,
      errors: 0,
      pruned: report.prunedCompanions,
    })
  } catch {
    loggerPort.error('Clareza retention failed', { total: 0, errors: 1 })
  }
}

// Corre por último, depois dos companions terem os dados da geração nova:
// aquecer antes disso só cachearia a geração anterior. Melhor esforço, tal
// como a poda — aquecer é otimização, não é o refresh em si, por isso
// nunca deve derrubar um dia que correu bem.
async function warmBestEffort(
  warmCache: () => Promise<void>,
  loggerPort: Pick<AppLogger, 'info' | 'error'>,
): Promise<void> {
  try {
    await warmCache()
    loggerPort.info('Clareza cache warmup completed', { total: 0, errors: 0 })
  } catch {
    loggerPort.error('Clareza cache warmup failed', { total: 0, errors: 1 })
  }
}

export function createClarezaJob(dependencies: ClarezaJobDependencies) {
  return {
    async run(startedAt = new Date().toISOString()): Promise<ClarezaDiaResult> {
      try {
        dependencies.assertRefreshEnabled()
        const core = await dependencies.refreshCore(startedAt)
        const semDados = core.missingAssets + core.failedAssets
        if (core.status !== 'published') {
          // A trava de publicação recusou. AQUI a cobertura vira erro, porque
          // foi ela que derrubou o dia — e nunca menos de um, para o dia nunca
          // passar por bom quando não há geração publicada.
          const errors = Math.max(1, semDados)
          dependencies.logger.error('Clareza canonical core refresh not published', {
            total: core.collectedAssets,
            errors,
          })
          return { success: false, total: core.collectedAssets, errors, semDados }
        }

        if (dependencies.retention) await pruneBestEffort(dependencies.retention, dependencies.logger)

        const companionErrors = await Promise.all(
          dependencies.companions.map(target => refreshBestEffort(
            target, core.generationId, dependencies.logger,
          )),
        )
        const top10Errors = dependencies.top10
          ? await refreshBestEffort(dependencies.top10, core.generationId, dependencies.logger)
          : 0

        if (dependencies.warmCache) await warmBestEffort(dependencies.warmCache, dependencies.logger)

        // Publicada: a cobertura passou na trava e fica como medida, fora da
        // conta dos erros. Quatro tickers que o fornecedor não serve — medidos
        // a 10/09/2026, sempre os mesmos — não são uma noite falhada.
        if (semDados > 0) {
          dependencies.logger.info('Clareza core sem dados do fornecedor', {
            total: core.collectedAssets,
            errors: 0,
            semDados,
          })
        }

        return {
          success: true,
          total: core.collectedAssets,
          errors: companionErrors.reduce((sum, value) => sum + value, 0) + top10Errors,
          semDados,
        }
      } catch {
        dependencies.logger.error('Clareza canonical daily refresh failed', { total: 0, errors: 1 })
        return { success: false, total: 0, errors: 1, semDados: 0 }
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
  retention: runCoreRetention,
  warmCache: warmPublishedReadsCache,
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
  async run(): Promise<ClarezaDiaResult> {
    try {
      return await coordinator.execute()
    } catch {
      return { success: false, total: 0, errors: 1, semDados: 0 }
    }
  },
}
