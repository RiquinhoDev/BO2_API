import type { JobDisposeOptions } from '../bootstrap'

export interface ProcessSignalPort {
  once(signal: NodeJS.Signals, handler: () => void | Promise<void>): void
  removeListener(signal: NodeJS.Signals, handler: () => void | Promise<void>): void
}

export interface ShutdownRegistrar {
  (): void
  dispose: (options?: JobDisposeOptions) => Promise<void>
}

export interface ShutdownDependencies {
  signals: ProcessSignalPort
  stopSystemMonitor: () => void
  stopScheduler: () => void
  stopCache: () => Promise<void>
  exit: (code: number) => void
  logError: (message: string, error: unknown) => void
  waitForWarmups?: () => Promise<void>
}

export function createShutdownRegistrar(
  dependencies: ShutdownDependencies,
): ShutdownRegistrar {
  let registered = false
  let disposed = false
  let cleanupPromise: Promise<void> | undefined
  let shutdownPromise: Promise<void> | undefined

  const runCleanup = async (stopCache: boolean): Promise<void> => {
    try {
      dependencies.stopSystemMonitor()
    } catch (error) {
      dependencies.logError('Erro ao parar system monitor', error)
    }
    try {
      dependencies.stopScheduler()
    } catch (error) {
      dependencies.logError('Erro ao parar scheduler', error)
    }
    try {
      await dependencies.waitForWarmups?.()
    } catch (error) {
      dependencies.logError('Erro ao aguardar warm-ups', error)
    }
    if (stopCache) {
      try {
        await dependencies.stopCache()
      } catch (error) {
        dependencies.logError('Erro ao parar cache', error)
      }
    }
  }

  const shutdown = (): Promise<void> => {
    shutdownPromise ??= (cleanupPromise ??= runCleanup(true)).then(() => dependencies.exit(0))
    return shutdownPromise
  }

  const dispose = (options?: JobDisposeOptions): Promise<void> => {
    if (disposed) return cleanupPromise ?? Promise.resolve()
    disposed = true
    if (registered) {
      dependencies.signals.removeListener('SIGTERM', shutdown)
      dependencies.signals.removeListener('SIGINT', shutdown)
      registered = false
    }
    cleanupPromise ??= runCleanup(options?.stopCache !== false)
    return cleanupPromise
  }

  const register = (() => {
    if (registered || disposed) return
    registered = true
    dependencies.signals.once('SIGTERM', shutdown)
    dependencies.signals.once('SIGINT', shutdown)
  }) as ShutdownRegistrar
  register.dispose = dispose
  return register
}
