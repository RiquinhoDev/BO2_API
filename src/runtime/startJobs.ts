import analyticsCacheService from '../services/analytics/analyticsCache.service'
import { cacheService } from '../services/cache.service'
import syncSchedulerService from '../services/cron/scheduler'
import { buildDashboardStats } from '../services/dashboardStatsBuilder.service'
import systemMonitor from '../services/systemMonitor.service'
import { warmUpCache } from '../services/syncUtilizadoresServices/dualReadService'
import logger from '../utils/logger'
import { createCronSeedProvisioner } from './cronSeeds'
import { createJobStarter } from './jobRuntime'
import { mongooseCronSeedRepository } from './mongooseCronSeed.repository'
import { createShutdownRegistrar } from './shutdown'

const logError = (message: string, error: unknown): void => {
  logger.error(message, { error })
}

const ensureCronSeeds = createCronSeedProvisioner({
  repository: mongooseCronSeedRepository,
  initializeScheduler: () => syncSchedulerService.initializeScheduler(),
  logError,
})

const processSignals = {
  once: (signal: NodeJS.Signals, handler: () => void | Promise<void>) => {
    process.once(signal, handler)
  },
  removeListener: (signal: NodeJS.Signals, handler: () => void | Promise<void>) => {
    process.removeListener(signal, handler)
  },
}

const runWarmup = (
  work: () => Promise<unknown>,
  errorMessage: string,
): Promise<void> =>
  Promise.resolve()
    .then(work)
    .then(() => undefined)
    .catch(error => {
      logError(errorMessage, error)
    })

function startWarmups(): Promise<void> {
  const warmupPromises = [
    runWarmup(async () => {
      const { getClarezaTop10Json } = await import('../services/clareza/clarezaTop10Service')
      await getClarezaTop10Json()
    }, 'Falha a aquecer cache Clareza Top10'),
    runWarmup(async () => {
      await warmUpCache()
      await buildDashboardStats()
    }, 'Erro no warm-up'),
    runWarmup(
      () => analyticsCacheService.warmUpCache(),
      'Erro ao aquecer cache de analytics',
    ),
  ]

  return Promise.all(warmupPromises).then(() => undefined)
}

export const startJobs = createJobStarter({
  initializeScheduler: () => syncSchedulerService.initializeScheduler(),
  ensureCronSeeds,
  startSystemMonitor: () => systemMonitor.start(),
  startWarmups,
  registerShutdownHandlers: (warmupPromise) => {
    const shutdownRegistrar = createShutdownRegistrar({
      signals: processSignals,
      stopSystemMonitor: () => systemMonitor.stop(),
      stopScheduler: () => syncSchedulerService.stopScheduler(),
      stopCache: () => cacheService.disconnect(),
      waitForWarmups: () => warmupPromise,
      exit: code => process.exit(code),
      logError,
    })
    shutdownRegistrar()
    return shutdownRegistrar.dispose
  },
  logError,
})
