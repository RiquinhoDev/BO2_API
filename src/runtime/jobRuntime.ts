import type { JobDisposer, JobStarter } from '../bootstrap'

export interface JobRuntimeDependencies {
  initializeScheduler: () => Promise<void>
  ensureCronSeeds: () => Promise<void>
  startSystemMonitor: () => void
  startWarmups: () => void | Promise<void>
  registerShutdownHandlers: (warmupPromise: Promise<void>) => JobDisposer | void
  logError: (message: string, error: unknown) => void
}

const startWarmupLifecycle = (
  dependencies: JobRuntimeDependencies,
): Promise<void> => {
  try {
    return Promise.resolve(dependencies.startWarmups()).catch(error => {
      dependencies.logError('Erro no warm-up', error)
    })
  } catch (error) {
    dependencies.logError('Erro no warm-up', error)
    return Promise.resolve()
  }
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

    const warmupPromise = startWarmupLifecycle(dependencies)
    return dependencies.registerShutdownHandlers(warmupPromise)
  }
}
