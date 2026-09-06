import {
  cronManualExecutionView,
  type CronManualCapabilityJob,
  type CronManualExecutionView,
} from '../cron/scheduler/manualCapabilities'

const unavailableManualExecution: CronManualExecutionView = {
  capability: 'renewal-ac-sync',
  status: 'blocked',
  cap: { status: 'required', reason: 'renewal-ac-sync-job-unavailable' },
  dryRunSupported: false,
  mutableEnabled: false,
  blockedReason: 'Job RenewalAcSync indisponível no backend',
}

export function getRenewalAcManualExecution(
  job: CronManualCapabilityJob | null,
  mutableEnabled: boolean,
): CronManualExecutionView {
  return job ? cronManualExecutionView(job, mutableEnabled) : unavailableManualExecution
}
