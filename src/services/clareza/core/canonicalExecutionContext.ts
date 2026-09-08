import { AsyncLocalStorage } from 'node:async_hooks'

import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'

const executionContext = new AsyncLocalStorage<CronExecutionPhaseHooks>()

export function hasCanonicalExecution(): boolean {
  return executionContext.getStore() !== undefined
}

export function withCanonicalExecution<T>(
  hooks: CronExecutionPhaseHooks,
  run: () => Promise<T>,
): Promise<T> {
  return executionContext.run(hooks, run)
}

export function beforeCanonicalProviderRequest(): void {
  const hooks = executionContext.getStore()
  hooks?.assertOwnership?.()
  hooks?.providerStarted()
}

export function canonicalProviderSucceeded(): void {
  const hooks = executionContext.getStore()
  hooks?.assertOwnership?.()
  hooks?.providerSucceeded()
}

export function beforeCanonicalMutation(): void {
  const hooks = executionContext.getStore()
  hooks?.assertOwnership?.()
  hooks?.localMutationStarted()
  hooks?.assertOwnership?.()
}
