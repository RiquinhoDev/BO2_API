import type { AppConfig } from '../../src/config/appConfig'
import {
  createJobStarter,
  type JobRuntimeDependencies,
} from '../../src/runtime/jobRuntime'

const config = (nodeEnv: AppConfig['nodeEnv']): AppConfig => ({
  nodeEnv,
  mongoUri: 'mongodb://127.0.0.1:27017/bo2_test',
  jwtSecret: 'j'.repeat(64),
  oldApiJwtSecret: 'o'.repeat(64),
  studentAccessJwtSecret: 's'.repeat(64),
  acWebhookSecret: 'a'.repeat(64),
  authEnforce: true,
  enableDebugRoutes: false,
  allowedOrigins: [],
  port: 3001,
  core: {
    nodeEnv,
    mongoUri: 'mongodb://127.0.0.1:27017/bo2_test',
    jwtSecret: 'j'.repeat(64),
    oldApiJwtSecret: 'o'.repeat(64),
    studentAccessJwtSecret: 's'.repeat(64),
    acWebhookSecret: 'a'.repeat(64),
    authEnforce: true,
    enableDebugRoutes: false,
    allowedOrigins: [],
    port: 3001,
  },
  observability: {
    logLevel: 'info',
    metricsEnabled: false,
    logDirectory: 'logs',
  },
  integrations: {
    activeCampaign: { configured: false },
    fmp: { configured: false },
    hotmart: { configured: false },
    curseduca: { configured: false },
    guru: { configured: false },
    discord: { configured: false },
    slack: { configured: false },
    studentSummary: { configured: false },
  },
  renewal: {
    acSyncEnabled: false,
    writeDatesEnabled: false,
    writeTagsEnabled: false,
    processRefundsEnabled: false,
    autoExecute: false,
    expiryFieldId: 332,
    maxChangesPerRun: 50,
    discordRolesSyncEnabled: false,
    discordRolesAutoExecute: false,
    discordMessagesEnabled: false,
    discordScheduledMessagesEnabled: false,
    discordRolesMaxOpsPerRun: 100,
    discordMessageChannels: [],
  },
})

function dependencies(events: string[]): JobRuntimeDependencies {
  return {
    initializeScheduler: async () => {
      events.push('scheduler')
    },
    ensureCronSeeds: async () => {
      events.push('seeds')
    },
    startSystemMonitor: () => {
      events.push('monitor')
    },
    startWarmups: () => {
      events.push('warmups')
    },
    registerShutdownHandlers: () => {
      events.push('shutdown')
    },
    logError: (message) => {
      events.push(`error:${message}`)
    },
  }
}

test('starts runtime components in dependency order without production monitoring', async () => {
  const events: string[] = []

  await createJobStarter(dependencies(events))(config('test'))

  expect(events).toEqual([
    'scheduler',
    'seeds',
    'warmups',
    'shutdown',
  ])
})

test('starts monitoring only after seeds in production', async () => {
  const events: string[] = []

  await createJobStarter(dependencies(events))(config('production'))

  expect(events).toEqual([
    'scheduler',
    'seeds',
    'monitor',
    'warmups',
    'shutdown',
  ])
})

test('isolates scheduler startup failure without skipping safe runtime work', async () => {
  const events: string[] = []
  const deps = dependencies(events)
  deps.initializeScheduler = async () => {
    events.push('scheduler')
    throw new Error('scheduler failed')
  }

  await createJobStarter(deps)(config('test'))

  expect(events).toEqual([
    'scheduler',
    'error:Erro ao inicializar Sync Utilizadores',
    'seeds',
    'warmups',
    'shutdown',
  ])
})

test('propagates the exact shutdown disposer from job startup', async () => {
  const events: string[] = []
  const disposer = jest.fn(async () => undefined)
  const deps = dependencies(events)
  deps.registerShutdownHandlers = () => {
    events.push('shutdown')
    return disposer
  }

  const returned = await createJobStarter(deps)(config('production'))

  expect(returned).toBe(disposer)
  expect(events).toEqual(['scheduler', 'seeds', 'monitor', 'warmups', 'shutdown'])
})

test('passes all warmup work to shutdown registration as one wait promise', async () => {
  const events: string[] = []
  const warmups = [
    deferred<void>(),
    deferred<void>(),
    deferred<void>(),
  ]
  const disposer = jest.fn(async () => undefined)
  const registerShutdownHandlers = jest.fn(() => disposer)
  const deps = {
    ...dependencies(events),
    startWarmups: () => Promise.all(warmups.map(warmup => warmup.promise)).then(() => undefined),
    registerShutdownHandlers,
  }

  await createJobStarter(deps)(config('test'))

  expect(registerShutdownHandlers).toHaveBeenCalledWith(expect.any(Promise))
  const warmupPromise = (registerShutdownHandlers.mock.calls[0] as unknown as [Promise<void>])[0]
  let settled = false
  void warmupPromise.then(() => { settled = true })
  await Promise.resolve()
  expect(settled).toBe(false)

  warmups.forEach(warmup => warmup.resolve())
  await warmupPromise
  expect(settled).toBe(true)
})

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
