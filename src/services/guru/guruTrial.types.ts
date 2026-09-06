import type { CronExecutionPhaseHooks } from '../cron/scheduler/executionPhases'

export interface GuruTrialRunOptions {
  dryRun?: boolean
  phaseHooks?: CronExecutionPhaseHooks
}

export interface GuruTrialPlan {
  operation: 'guru-trial-check'
  dryRun: boolean
  candidates: number
  synced: number
  markedForInactivation: number
  converted: number
  stillInTrial: number
  plannedMutations: number
  errors: number
  limit: number
  truncated: boolean
  remaining: number
  anomaly: boolean
}

export interface GuruTrialCheckResult {
  checked: number
  markedForInactivation: number
  converted: number
  stillInTrial: number
  errors: number
  plan?: GuruTrialPlan
}
