import type { CompositeExecutionOperation } from '../../../models/CompositeExecutionReceipt'

export type CronManualCapabilityStatus = 'implemented' | 'blocked'

export interface CronManualProtectionDecision {
  status: 'verified' | 'required' | 'not-applicable'
  reason: string
  limit?: number
}

export interface CronManualCapability {
  id: string
  status: CronManualCapabilityStatus
  operation: CompositeExecutionOperation
  identity(job: CronManualCapabilityJob): string
  cap: CronManualProtectionDecision
  idempotency: CronManualProtectionDecision
  killSwitch: CronManualProtectionDecision
  dryRun: CronManualProtectionDecision
  blockedReason?: string
}

export interface CronManualExecutionView {
  capability: string
  status: CronManualCapabilityStatus
  cap: CronManualProtectionDecision
  dryRunSupported: boolean
  mutableEnabled: boolean
  blockedReason?: string
}

export interface CronManualCapabilityJob {
  _id: { toString(): string }
  name: string
  syncType: string
  syncConfig?: unknown
  tagRules?: unknown
  tagRuleOptions?: unknown
  __v?: unknown
}

const jobIdentity = (job: CronManualCapabilityJob): string => `cron-job:${job._id.toString()}`

const implemented = (
  id: string,
  operation: CompositeExecutionOperation,
  cap: CronManualProtectionDecision,
  killSwitch: CronManualProtectionDecision,
  identity: (job: CronManualCapabilityJob) => string = jobIdentity,
): CronManualCapability => ({
  id,
  status: 'implemented',
  operation,
  identity,
  cap,
  idempotency: {
    status: 'verified',
    reason: 'composite-execution-durable-receipt-and-owner-fence',
  },
  killSwitch,
  dryRun: {
    status: 'verified',
    reason: 'dry-run-no-provider-or-local-mutation',
  },
})

const blocked = (id: string, reason: string): CronManualCapability => ({
  id,
  status: 'blocked',
  operation: 'cron-job',
  identity: jobIdentity,
  cap: { status: 'required', reason: `${reason}-cap` },
  idempotency: { status: 'required', reason: `${reason}-idempotency` },
  killSwitch: { status: 'required', reason: `${reason}-kill-switch` },
  dryRun: { status: 'required', reason: `${reason}-dry-run` },
  blockedReason: `Capability manual ${id} bloqueada: faltam proteções OPS-02 reais`,
})

const capabilityEntries: readonly {
  matches(job: CronManualCapabilityJob): boolean
  capability: CronManualCapability
}[] = [
  {
    matches: job => job.name.includes('DiscordScheduledMessages'),
    capability: implemented(
      'discord-scheduled-messages',
      'cron-job',
      { status: 'verified', reason: 'discord-scheduled-messages-max-rules', limit: 50 },
      { status: 'verified', reason: 'DISCORD_SCHEDULED_MESSAGES_ENABLED+DISCORD_MESSAGES_ENABLED' },
    ),
  },
  {
    matches: job => job.syncType === 'pipeline',
    capability: implemented(
      'daily-pipeline',
      'sync-pipeline',
      { status: 'verified', reason: 'daily-pipeline-preflight-max-items', limit: 20_000 },
      { status: 'verified', reason: 'SYNC_MUTABLE_EXECUTION_ENABLED' },
      () => 'daily-pipeline',
    ),
  },
]

const unsupported = blocked('unsupported', 'cron-unsupported')

export function getCronManualCapability(job: CronManualCapabilityJob): CronManualCapability {
  return capabilityEntries.find(entry => entry.matches(job))?.capability ?? unsupported
}

export function cronManualFingerprintPayload(job: CronManualCapabilityJob): Record<string, unknown> {
  const capability = getCronManualCapability(job)
  const version = typeof job.__v === 'number' ? job.__v : null
  return {
    entryPoint: 'cron-job-trigger',
    resultContract: 'cron-execution',
    capability: capability.id,
    jobId: job._id.toString(),
    jobName: job.name,
    syncType: job.syncType,
    version,
    syncConfig: job.syncConfig ?? null,
    tagRules: job.tagRules ?? null,
    tagRuleOptions: job.tagRuleOptions ?? null,
  }
}

export function cronManualExecutionView(
  job: CronManualCapabilityJob,
  mutableEnabled: boolean,
): CronManualExecutionView {
  const capability = getCronManualCapability(job)
  return {
    capability: capability.id,
    status: capability.status,
    cap: capability.cap,
    dryRunSupported: capability.dryRun.status === 'verified',
    mutableEnabled: capability.status === 'implemented' && mutableEnabled,
    ...(capability.status === 'blocked' && capability.blockedReason
      ? { blockedReason: capability.blockedReason }
      : {}),
  }
}

export const cronManualCapabilities = capabilityEntries
