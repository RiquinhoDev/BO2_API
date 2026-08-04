import {
  createShutdownRegistrar,
  type ProcessSignalPort,
} from '../../src/runtime/shutdown'

class InMemorySignalPort implements ProcessSignalPort {
  readonly handlers = new Map<NodeJS.Signals, () => void | Promise<void>>()

  once(signal: NodeJS.Signals, handler: () => void | Promise<void>): void {
    this.handlers.set(signal, handler)
  }

  removeListener(signal: NodeJS.Signals, handler: () => void | Promise<void>): void {
    if (this.handlers.get(signal) === handler) this.handlers.delete(signal)
  }
}

test('registers shutdown once and stops runtime resources before exiting', async () => {
  const signals = new InMemorySignalPort()
  const events: string[] = []
  const register = createShutdownRegistrar({
    signals,
    stopSystemMonitor: () => events.push('monitor'),
    stopScheduler: () => events.push('scheduler'),
    stopCache: async () => { events.push('cache') },
    exit: code => events.push(`exit:${code}`),
    logError: message => events.push(`error:${message}`),
  })

  register()
  register()
  await signals.handlers.get('SIGTERM')?.()

  expect([...signals.handlers.keys()]).toEqual(['SIGTERM', 'SIGINT'])
  expect(events).toEqual(['monitor', 'scheduler', 'cache', 'exit:0'])
})

test('logs scheduler shutdown failure and still exits cleanly', async () => {
  const signals = new InMemorySignalPort()
  const events: string[] = []
  createShutdownRegistrar({
    signals,
    stopSystemMonitor: () => events.push('monitor'),
    stopScheduler: () => {
      events.push('scheduler')
      throw new Error('stop failed')
    },
    stopCache: async () => { events.push('cache') },
    exit: code => events.push(`exit:${code}`),
    logError: message => events.push(`error:${message}`),
  })()

  await signals.handlers.get('SIGINT')?.()

  expect(events).toEqual([
    'monitor',
    'scheduler',
    'error:Erro ao parar scheduler',
    'cache',
    'exit:0',
  ])
})
test('logs cache shutdown failure and still exits cleanly', async () => {
  const signals = new InMemorySignalPort()
  const events: string[] = []
  createShutdownRegistrar({
    signals,
    stopSystemMonitor: () => events.push('monitor'),
    stopScheduler: () => events.push('scheduler'),
    stopCache: async () => {
      events.push('cache')
      throw new Error('cache stop failed')
    },
    exit: code => events.push(`exit:${code}`),
    logError: message => events.push(`error:${message}`),
  })()

  await signals.handlers.get('SIGINT')?.()

  expect(events).toEqual([
    'monitor',
    'scheduler',
    'cache',
    'error:Erro ao parar cache',
    'exit:0',
  ])
})
test('sinais concorrentes partilham uma unica promessa de shutdown', async () => {
  const signals = new InMemorySignalPort()
  const events: string[] = []
  let releaseCache: (() => void) | undefined
  const cachePending = new Promise<void>((resolve) => { releaseCache = resolve })
  createShutdownRegistrar({
    signals,
    stopSystemMonitor: () => events.push('monitor'),
    stopScheduler: () => events.push('scheduler'),
    stopCache: async () => {
      events.push('cache')
      await cachePending
    },
    exit: code => events.push(`exit:${code}`),
    logError: message => events.push(`error:${message}`),
  })()

  const first = signals.handlers.get('SIGTERM')?.()
  const second = signals.handlers.get('SIGINT')?.()
  await Promise.resolve()

  expect(events).toEqual(['monitor', 'scheduler', 'cache'])
  expect(first).toBe(second)

  releaseCache?.()
  await Promise.all([first, second])
  expect(events).toEqual(['monitor', 'scheduler', 'cache', 'exit:0'])
})

test('isola falha do system monitor e continua shutdown', async () => {
  const signals = new InMemorySignalPort()
  const events: string[] = []
  createShutdownRegistrar({
    signals,
    stopSystemMonitor: () => {
      events.push('monitor')
      throw new Error('monitor stop failed')
    },
    stopScheduler: () => events.push('scheduler'),
    stopCache: async () => { events.push('cache') },
    exit: code => events.push(`exit:${code}`),
    logError: message => events.push(`error:${message}`),
  })()

  await signals.handlers.get('SIGTERM')?.()

  expect(events).toEqual([
    'monitor',
    'error:Erro ao parar system monitor',
    'scheduler',
    'cache',
    'exit:0',
  ])
})

test('startup disposer removes signal handlers and does not exit', async () => {
  const signals = new InMemorySignalPort()
  const events: string[] = []
  const register = createShutdownRegistrar({
    signals,
    stopSystemMonitor: () => events.push('monitor'),
    stopScheduler: () => events.push('scheduler'),
    stopCache: async () => { events.push('cache') },
    exit: code => events.push('exit:' + code),
    logError: message => events.push('error:' + message),
  })

  register()
  await register.dispose()
  await register.dispose()

  expect(signals.handlers.size).toBe(0)
  expect(events).toEqual(['monitor', 'scheduler', 'cache'])
})

test('rollback disposer can leave cache to infrastructure cleanup', async () => {
  const signals = new InMemorySignalPort()
  const events: string[] = []
  const register = createShutdownRegistrar({
    signals,
    stopSystemMonitor: () => events.push('monitor'),
    stopScheduler: () => events.push('scheduler'),
    stopCache: async () => { events.push('cache') },
    exit: code => events.push('exit:' + code),
    logError: message => events.push('error:' + message),
  })

  register()
  await register.dispose({ stopCache: false })

  expect(signals.handlers.size).toBe(0)
  expect(events).toEqual(['monitor', 'scheduler'])
})
