import type { CronExecutionPhaseHooks } from '../../src/services/cron/scheduler/executionPhases'
import {
  createClarezaCanonicalJob,
  createClarezaCanonicalPipeline,
} from '../../src/jobs/clarezaCanonical.job'

const hooks = (): CronExecutionPhaseHooks => ({
  assertOwnership: jest.fn(),
  providerStarted: jest.fn(),
  providerSucceeded: jest.fn(),
  localMutationStarted: jest.fn(),
})

test('scheduled canonical execution claims a receipt when scheduler supplies no hooks', async () => {
  const executionHooks = hooks()
  const protect = jest.fn(async (run: (value: CronExecutionPhaseHooks) => Promise<{ success: boolean; total: number; errors: number }>) => run(executionHooks))
  const job = createClarezaCanonicalJob({ assertRefreshEnabled: () => undefined, protect, execute: async () => {
    const { beforeCanonicalMutation } = await import('../../src/services/clareza/core/canonicalExecutionContext')
    beforeCanonicalMutation()
    return { success: true, total: 1, errors: 0 }
  } })
  await job.run()
  expect(protect).toHaveBeenCalledTimes(1)
  expect(executionHooks.localMutationStarted).toHaveBeenCalledTimes(1)
})

test('HTTP operations reuse the active receipt instead of claiming a conflicting nested receipt', async () => {
  const protect = jest.fn()
  const job = createClarezaCanonicalJob({ assertRefreshEnabled: () => undefined, protect, execute: async () => ({ success: true, total: 1, errors: 0 }) })
  const { withCanonicalExecution } = await import('../../src/services/clareza/core/canonicalExecutionContext')
  await withCanonicalExecution(hooks(), () => job.run())
  expect(protect).not.toHaveBeenCalled()
})

test('disabled canonical refresh fails before claiming the inner Redis job', async () => {
  const execute = jest.fn()
  const job = createClarezaCanonicalJob({
    assertRefreshEnabled: () => { throw new Error('clareza disabled') },
    execute,
  })

  await expect(job.run(hooks())).rejects.toThrow('clareza disabled')
  expect(execute).not.toHaveBeenCalled()
})

test('canonical job keeps receipt hooks active inside coordinated execution', async () => {
  const executionHooks = hooks()
  const job = createClarezaCanonicalJob({
    assertRefreshEnabled: () => undefined,
    execute: async () => {
      const { beforeCanonicalMutation } = await import(
        '../../src/services/clareza/core/canonicalExecutionContext'
      )
      beforeCanonicalMutation()
      return { success: true, total: 2, errors: 0 }
    },
  })

  await expect(job.run(executionHooks)).resolves.toEqual({ success: true, total: 2, errors: 0 })
  expect(executionHooks.localMutationStarted).toHaveBeenCalledTimes(1)
})

test('companion errors reject canonical pipeline after core publication', async () => {
  const pipeline = createClarezaCanonicalPipeline({
    assertRefreshEnabled: () => undefined,
    refreshCore: async () => ({
      status: 'published', generationId: 'generation-a', collectedAssets: 2,
      missingAssets: 0, failedAssets: 0, reasonCodes: [],
    }),
    companions: [{ name: 'Raio-X', refresh: async () => ({ total: 2, errors: 1 }) }],
    logger: { info: jest.fn(), error: jest.fn() },
  })

  await expect(pipeline.run('2026-09-08T10:00:00.000Z')).rejects.toThrow(
    'Clareza canonical companions incomplete',
  )
})

test.each([
  { missingAssets: 1, failedAssets: 0 },
  { missingAssets: 0, failedAssets: 1 },
])('published core with incomplete assets rejects before receipt completion: %p', async counts => {
  const pipeline = createClarezaCanonicalPipeline({
    assertRefreshEnabled: () => undefined,
    refreshCore: async () => ({
      status: 'published', generationId: 'generation-incomplete', collectedAssets: 2,
      ...counts, reasonCodes: [],
    }),
    companions: [],
    logger: { info: jest.fn(), error: jest.fn() },
  })
  await expect(pipeline.run('2026-09-08T10:00:00.000Z')).rejects.toThrow(
    'Clareza canonical core incomplete',
  )
})

test('scheduled protection rejects an incomplete replay instead of completing outer receipt', async () => {
  const protect = jest.fn(async (run: (value: CronExecutionPhaseHooks) => Promise<{ success: boolean; total: number; errors: number }>) => run(hooks()))
  const job = createClarezaCanonicalJob({
    assertRefreshEnabled: () => undefined,
    protect,
    execute: async () => ({ success: false as const, total: 2, errors: 1 }),
  })
  await expect(job.run()).rejects.toThrow('Clareza canonical execution incomplete')
  expect(protect).toHaveBeenCalledTimes(1)
})
