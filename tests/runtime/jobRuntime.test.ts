import type { AppConfig } from '../../src/config/appConfig'
import {
  createJobStarter,
  type JobRuntimeDependencies,
} from '../../src/runtime/jobRuntime'

const config = (nodeEnv: AppConfig['nodeEnv']): AppConfig => ({
  nodeEnv,
  mongoUri: 'mongodb://127.0.0.1:27017/bo2_test',
  jwtSecret: 'j'.repeat(64),
  acWebhookSecret: 'a'.repeat(64),
  authEnforce: true,
  enableDebugRoutes: false,
  allowedOrigins: [],
  port: 3001,
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
