import type { JobDisposer, JobStarter } from '../bootstrap'

export interface JobRuntimeDependencies {
  initializeScheduler: () => Promise<void>
  ensureCronSeeds: () => Promise<void>
  startSystemMonitor: () => void
  startWarmups: () => void
  registerShutdownHandlers: () => JobDisposer | void
  logError: (message: string, error: unknown) => void
}

export function createJobStarter(
  dependencies: JobRuntimeDependencies,
): JobStarter {
  return async (config) => {
    try {
      await dependencies.initializeScheduler()
    } catch (error) {
      dependencies.logError(
        'Erro ao inicializar Sync Utilizadores',
        error,
      )
    }

    await dependencies.ensureCronSeeds()

    if (config.nodeEnv === 'production') {
      dependencies.startSystemMonitor()
    }

    dependencies.startWarmups()
    return dependencies.registerShutdownHandlers()
  }
}
