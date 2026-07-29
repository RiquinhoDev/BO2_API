import analyticsCacheService from '../services/analytics/analyticsCache.service'
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

const registerShutdownHandlers = createShutdownRegistrar({
  signals: {
    once: (signal, handler) => {
      process.once(signal, handler)
    },
  },
  stopSystemMonitor: () => systemMonitor.stop(),
  stopScheduler: () => syncSchedulerService.stopScheduler(),
  exit: code => process.exit(code),
  logError,
})

function startWarmups(): void {
  void import('../services/clareza/clarezaTop10Service')
    .then(({ getClarezaTop10Json }) => getClarezaTop10Json())
    .catch(error => logError('Falha a aquecer cache Clareza Top10', error))

  void warmUpCache()
    .then(() => buildDashboardStats())
    .catch(error => logError('Erro no warm-up', error))

  void analyticsCacheService
    .warmUpCache()
    .catch(error => logError('Erro ao aquecer cache de analytics', error))
}

export const startJobs = createJobStarter({
  initializeScheduler: () => syncSchedulerService.initializeScheduler(),
  ensureCronSeeds,
  startSystemMonitor: () => systemMonitor.start(),
  startWarmups,
  registerShutdownHandlers,
  logError,
})
