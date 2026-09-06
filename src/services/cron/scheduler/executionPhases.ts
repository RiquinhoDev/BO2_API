export interface CronExecutionPhaseHooks {
  providerStarted(): void
  providerSucceeded(): void
  localMutationStarted(): void
}
