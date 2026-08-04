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

test('normal signal shutdown waits for warmups before stopping cache', async () => {
  const signals = new InMemorySignalPort()
  const events: string[] = []
  const warmup = deferred<void>()
  const register = createShutdownRegistrar({
    signals,
    stopSystemMonitor: () => events.push('monitor'),
    stopScheduler: () => events.push('scheduler'),
    stopCache: async () => { events.push('cache') },
    exit: code => events.push('exit:' + code),
    logError: message => events.push('error:' + message),
    waitForWarmups: () => warmup.promise,
  } as Parameters<typeof createShutdownRegistrar>[0])

  register()
  const shutdown = signals.handlers.get('SIGTERM')?.()
  await Promise.resolve()

  expect(events).toEqual(['monitor', 'scheduler'])

  warmup.resolve()
  await shutdown

  expect(events).toEqual(['monitor', 'scheduler', 'cache', 'exit:0'])
})

test('startup disposer waits for warmups before returning to infrastructure cleanup', async () => {
  const signals = new InMemorySignalPort()
  const events: string[] = []
  const warmup = deferred<void>()
  const register = createShutdownRegistrar({
    signals,
    stopSystemMonitor: () => events.push('monitor'),
    stopScheduler: () => events.push('scheduler'),
    stopCache: async () => { events.push('cache') },
    exit: code => events.push('exit:' + code),
    logError: message => events.push('error:' + message),
    waitForWarmups: () => warmup.promise,
  } as Parameters<typeof createShutdownRegistrar>[0])

  register()
  const disposal = register.dispose({ stopCache: false })
  await Promise.resolve()

  expect(events).toEqual(['monitor', 'scheduler'])

  warmup.resolve()
  await disposal

  expect(events).toEqual(['monitor', 'scheduler'])
  expect(signals.handlers.size).toBe(0)
})

test('logs warmup shutdown failure and still settles cache cleanup and exit', async () => {
  const signals = new InMemorySignalPort()
  const events: string[] = []
  const warmupError = new Error('warmup failed')
  const register = createShutdownRegistrar({
    signals,
    stopSystemMonitor: () => events.push('monitor'),
    stopScheduler: () => events.push('scheduler'),
    stopCache: async () => { events.push('cache') },
    exit: code => events.push('exit:' + code),
    logError: message => events.push('error:' + message),
    waitForWarmups: async () => { throw warmupError },
  } as Parameters<typeof createShutdownRegistrar>[0])

  register()
  await signals.handlers.get('SIGINT')?.()

  expect(events).toEqual([
    'monitor',
    'scheduler',
    'error:Erro ao aguardar warm-ups',
    'cache',
    'exit:0',
  ])
})

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
