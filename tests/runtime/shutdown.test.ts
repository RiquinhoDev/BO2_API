import {
  createShutdownRegistrar,
  type ProcessSignalPort,
} from '../../src/runtime/shutdown'

class InMemorySignalPort implements ProcessSignalPort {
  readonly handlers = new Map<NodeJS.Signals, () => void>()

  once(signal: NodeJS.Signals, handler: () => void): void {
    this.handlers.set(signal, handler)
  }
}

test('registers shutdown once and stops runtime resources before exiting', () => {
  const signals = new InMemorySignalPort()
  const events: string[] = []
  const register = createShutdownRegistrar({
    signals,
    stopSystemMonitor: () => events.push('monitor'),
    stopScheduler: () => events.push('scheduler'),
    exit: code => events.push(`exit:${code}`),
    logError: message => events.push(`error:${message}`),
  })

  register()
  register()
  signals.handlers.get('SIGTERM')?.()

  expect([...signals.handlers.keys()]).toEqual(['SIGTERM', 'SIGINT'])
  expect(events).toEqual(['monitor', 'scheduler', 'exit:0'])
})

test('logs scheduler shutdown failure and still exits cleanly', () => {
  const signals = new InMemorySignalPort()
  const events: string[] = []
  createShutdownRegistrar({
    signals,
    stopSystemMonitor: () => events.push('monitor'),
    stopScheduler: () => {
      events.push('scheduler')
      throw new Error('stop failed')
    },
    exit: code => events.push(`exit:${code}`),
    logError: message => events.push(`error:${message}`),
  })()

  signals.handlers.get('SIGINT')?.()

  expect(events).toEqual([
    'monitor',
    'scheduler',
    'error:Erro ao parar scheduler',
    'exit:0',
  ])
})
