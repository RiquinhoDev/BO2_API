export interface ProcessSignalPort {
  once(signal: NodeJS.Signals, handler: () => void): void
}

export interface ShutdownDependencies {
  signals: ProcessSignalPort
  stopSystemMonitor: () => void
  stopScheduler: () => void
  exit: (code: number) => void
  logError: (message: string, error: unknown) => void
}

export function createShutdownRegistrar(
  dependencies: ShutdownDependencies,
): () => void {
  let registered = false

  const shutdown = () => {
    dependencies.stopSystemMonitor()
    try {
      dependencies.stopScheduler()
    } catch (error) {
      dependencies.logError('Erro ao parar scheduler', error)
    }
    dependencies.exit(0)
  }

  return () => {
    if (registered) return
    registered = true
    dependencies.signals.once('SIGTERM', shutdown)
    dependencies.signals.once('SIGINT', shutdown)
  }
}
