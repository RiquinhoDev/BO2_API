export interface CronExecutionPhaseHooks {
  assertOwnership?(): void
  providerStarted(): void
  providerSucceeded(): void
  localMutationStarted(): void
  consumeMutation?(count?: number): void
}
