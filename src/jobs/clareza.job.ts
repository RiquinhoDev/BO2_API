import { refreshClarezaData } from '../services/clareza/clarezaFmpService'
import { refreshClarezaTop10Data } from '../services/clareza/clarezaTop10Service'
import { executeRaioxRefresh } from '../services/clareza/clarezaRaioxService'
import { refreshClarezaCarteiraData } from '../services/clareza/carteira/carteira.runtime'
import { refreshClarezaEarningsData } from '../services/clareza/clarezaEarningsService'
import { refreshClarezaComparadorData } from '../services/clareza/comparador/comparador.runtime'
import logger, { type AppLogger } from '../utils/logger'

interface ClarezaRefreshResult {
  readonly total: number
  readonly errors: number
}

type ClarezaRefresh = () => Promise<ClarezaRefreshResult>

export interface ClarezaJobDependencies {
  readonly refreshClarezaData: ClarezaRefresh
  readonly refreshClarezaTop10Data: ClarezaRefresh
  readonly refreshClarezaRaioxData: ClarezaRefresh
  readonly refreshClarezaCarteiraData: ClarezaRefresh
  readonly refreshClarezaEarningsData: ClarezaRefresh
  readonly refreshClarezaComparadorData: ClarezaRefresh
  readonly logger: Pick<AppLogger, 'info' | 'error'>
}

function logCompletedRefresh(
  loggerPort: Pick<AppLogger, 'info'>,
  product: string,
  result: ClarezaRefreshResult,
): void {
  loggerPort.info(`Clareza ${product} refresh completed`, { total: result.total, errors: result.errors })
}

async function refreshBestEffort(
  refresh: ClarezaRefresh,
  product: string,
  loggerPort: Pick<AppLogger, 'info' | 'error'>,
): Promise<void> {
  try {
    logCompletedRefresh(loggerPort, product, await refresh())
  } catch {
    loggerPort.error(`Clareza ${product} refresh failed`, { total: 0, errors: 1 })
  }
}

export function createClarezaJob(dependencies: ClarezaJobDependencies) {
  return {
    async run(): Promise<{ success: boolean; total: number; errors: number }> {
      try {
        const result = await dependencies.refreshClarezaData()
        logCompletedRefresh(dependencies.logger, 'market data', result)

        await refreshBestEffort(dependencies.refreshClarezaTop10Data, 'Top10', dependencies.logger)
        await refreshBestEffort(dependencies.refreshClarezaRaioxData, 'Raio-X', dependencies.logger)
        await refreshBestEffort(dependencies.refreshClarezaCarteiraData, 'Carteira', dependencies.logger)
        await refreshBestEffort(dependencies.refreshClarezaEarningsData, 'Earnings', dependencies.logger)
        await refreshBestEffort(dependencies.refreshClarezaComparadorData, 'comparador', dependencies.logger)

        return { success: true, ...result }
      } catch {
        dependencies.logger.error('Clareza market data refresh failed', { total: 0, errors: 1 })
        return { success: false, total: 0, errors: 1 }
      }
    },
  }
}

const clarezaJob = createClarezaJob({
  refreshClarezaData,
  refreshClarezaTop10Data,
  refreshClarezaRaioxData: executeRaioxRefresh,
  refreshClarezaCarteiraData,
  refreshClarezaEarningsData,
  refreshClarezaComparadorData,
  logger,
})

export default clarezaJob
