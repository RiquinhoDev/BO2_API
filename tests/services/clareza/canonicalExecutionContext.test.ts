import type { CronExecutionPhaseHooks } from '../../../src/services/cron/scheduler/executionPhases'
import {
  beforeCanonicalMutation,
  beforeCanonicalProviderRequest,
  canonicalProviderSucceeded,
  withCanonicalExecution,
} from '../../../src/services/clareza/core/canonicalExecutionContext'

test('canonical execution refuses provider and Mongo effects after ownership loss', async () => {
  let owned = true
  const effects: string[] = []
  const hooks: CronExecutionPhaseHooks = {
    assertOwnership: () => {
      effects.push('assert')
      if (!owned) throw new Error('ownership lost')
    },
    providerStarted: () => effects.push('provider-started'),
    providerSucceeded: () => effects.push('provider-succeeded'),
    localMutationStarted: () => effects.push('local-mutation'),
  }

  await withCanonicalExecution(hooks, async () => {
    beforeCanonicalProviderRequest()
    canonicalProviderSucceeded()
    owned = false
    expect(() => beforeCanonicalProviderRequest()).toThrow('ownership lost')
    expect(() => beforeCanonicalMutation()).toThrow('ownership lost')
  })

  expect(effects).toEqual([
    'assert', 'provider-started', 'assert', 'provider-succeeded', 'assert', 'assert',
  ])
})

test('canonical execution context survives asynchronous boundaries', async () => {
  const effects: string[] = []
  const hooks: CronExecutionPhaseHooks = {
    assertOwnership: () => effects.push('assert'),
    providerStarted: () => effects.push('provider-started'),
    providerSucceeded: () => effects.push('provider-succeeded'),
    localMutationStarted: () => effects.push('local-mutation'),
  }

  await withCanonicalExecution(hooks, async () => {
    await Promise.resolve()
    beforeCanonicalMutation()
  })

  expect(effects).toEqual(['assert', 'local-mutation', 'assert'])
})
