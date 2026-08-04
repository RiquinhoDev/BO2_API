export interface ProcessSignalPort {
  once(signal: NodeJS.Signals, handler: () => void | Promise<void>): void
}

export interface ShutdownDependencies {
  signals: ProcessSignalPort
  stopSystemMonitor: () => void
  stopScheduler: () => void
  stopCache: () => Promise<void>
  exit: (code: number) => void
  logError: (message: string, error: unknown) => void
}

export function createShutdownRegistrar(
  dependencies: ShutdownDependencies,
): () => void {
  let registered = false
  let shutdownPromise: Promise<void> | undefined

  const runShutdown = async (): Promise<void> => {
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
      await dependencies.stopCache()
    } catch (error) {
      dependencies.logError('Erro ao parar cache', error)
    }
    dependencies.exit(0)
  }

  const shutdown = (): Promise<void> => {
    shutdownPromise ??= runShutdown()
    return shutdownPromise
  }

  return () => {
    if (registered) return
    registered = true
    dependencies.signals.once('SIGTERM', shutdown)
    dependencies.signals.once('SIGINT', shutdown)
  }
}
