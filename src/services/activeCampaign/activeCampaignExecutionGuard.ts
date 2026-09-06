import { AsyncLocalStorage } from 'node:async_hooks'

export interface ActiveCampaignExecutionGuard {
  assertOwnership(): void
}

const executionGuard = new AsyncLocalStorage<ActiveCampaignExecutionGuard>()

export function runWithActiveCampaignExecutionGuard<T>(
  guard: ActiveCampaignExecutionGuard,
  work: () => Promise<T>,
): Promise<T> {
  return executionGuard.run(guard, work)
}

export function assertActiveCampaignExecutionOwnership(): void {
  executionGuard.getStore()?.assertOwnership()
}
